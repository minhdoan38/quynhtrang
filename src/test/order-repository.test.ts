import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveAttentionReasons, mapOrderInboxRow } from '../lib/domain/order.ts';
import { OrderRepository } from '../lib/repositories/order-repository.ts';
import { PaymentRepository } from '../lib/repositories/payment-repository.ts';

const rawOrder = {
  id: 'order-1', public_order_code: 'QT260930-0001', project_id: 'project-1', approved_design_version_id: 'version-1',
  product_snapshot: { id: 'card', name: 'Thiệp' }, variant_snapshot: { id: 'horizontal', name: 'Ngang', price: 29000 },
  quantity: 2, unit_price: 29000, subtotal: 58000, total: 58000, currency: 'VND',
  customer_full_name: 'Nguyễn An', customer_phone: '0901', customer_phone_normalized: '+84901', shipping_address: 'Hà Nội',
  payment_status: 'payment_reported', design_status: 'awaiting_review', fulfillment_status: 'unprocessed', idempotency_key: 'key-1',
  created_at: '2026-09-30T08:00:00Z', updated_at: '2026-09-30T09:00:00Z',
  order_payments: [{ id: 'pay-1', provider: 'vietqr', amount: 58000, currency: 'VND', reference: 'REF', qr_payload: 'QR', status: 'payment_reported', customer_reported_at: '2026-09-30T08:30:00Z', confirmed_at: null, confirmed_by: null }],
  design_versions: {
    id: 'version-1',
    version_number: 3,
    source: 'customizer',
    preflight_revision: 'pf-3',
    design_document: { text: 'Hello' },
    created_at: '2026-09-30T07:00:00Z',
  },
  order_events: [
    { id: 'event-old', event_type: 'order_created', actor_user_id: null, actor_role: 'customer', payload: {}, created_at: '2026-09-30T08:00:00Z' },
    { id: 'event-latest', event_type: 'payment_reported', actor_user_id: null, actor_role: 'customer', payload: {}, created_at: '2026-09-30T08:30:00Z' },
  ],
};

test('order inbox mapper converts joined snake_case row and selects latest event by timestamp', () => {
  const row = mapOrderInboxRow(rawOrder);
  assert.equal(row.id, 'order-1');
  assert.equal(row.publicOrderCode, 'QT260930-0001');
  assert.equal(row.latestEvent?.id, 'event-latest');
  assert.deepEqual(row.attentionReasons, ['PAYMENT_REPORTED', 'DESIGN_REVIEW']);
});

test('order inbox mapper leaves latestEvent null when order_events is empty array', () => {
  const row = mapOrderInboxRow({
    ...rawOrder,
    order_events: [],
  });
  assert.equal(row.latestEvent, null);
});

test('attention reasons cover payment, design, production, and terminal states', () => {
  assert.deepEqual(deriveAttentionReasons('payment_reported', 'approved', 'unprocessed'), ['PAYMENT_REPORTED']);
  assert.deepEqual(deriveAttentionReasons('payment_failed', 'needs_changes', 'unprocessed'), ['PAYMENT_FAILED', 'DESIGN_CHANGES']);
  assert.deepEqual(deriveAttentionReasons('paid', 'awaiting_review', 'unprocessed'), ['DESIGN_REVIEW']);
  assert.deepEqual(deriveAttentionReasons('paid', 'approved', 'ready_for_production'), ['READY_FOR_PRODUCTION']);
  assert.deepEqual(deriveAttentionReasons('paid', 'approved', 'completed'), []);
  assert.deepEqual(deriveAttentionReasons('cancelled', 'approved', 'cancelled'), []);
});

class Query {
  filters: Array<[string, string, unknown]> = [];
  rangeValue?: [number, number];
  readonly result: { data: unknown; error: unknown; count?: number };

  constructor(result: { data: unknown; error: unknown; count?: number }) {
    this.result = result;
  }

  select() { return this; }
  insert() { return this; }
  update() { return this; }
  delete() { return this; }
  eq(column: string, value: unknown) { this.filters.push(['eq', column, value]); return this; }
  neq(column: string, value: unknown) { this.filters.push(['neq', column, value]); return this; }
  gt(column: string, value: unknown) { this.filters.push(['gt', column, value]); return this; }
  in(column: string, value: unknown) { this.filters.push(['in', column, value]); return this; }
  not(column: string, operator: string, value: unknown) { this.filters.push(['not', column, [operator, value]]); return this; }
  or(value: string) { this.filters.push(['or', value, null]); return this; }
  gte(column: string, value: unknown) { this.filters.push(['gte', column, value]); return this; }
  lte(column: string, value: unknown) { this.filters.push(['lte', column, value]); return this; }
  order(column: string, value: unknown) { this.filters.push(['order', column, value]); return this; }
  range(from: number, to: number) { this.rangeValue = [from, to]; return Promise.resolve(this.result); }
  maybeSingle() { return Promise.resolve(this.result); }
  single() { return Promise.resolve(this.result); }
  then(resolve: (value: unknown) => unknown) { return Promise.resolve(this.result).then(resolve); }
}

class OrderClient {
  queries: Query[] = [];
  readonly result: { data: unknown; error: unknown; count?: number };

  constructor(result: { data: unknown; error: unknown; count?: number }) {
    this.result = result;
  }

  from() {
    const query = new Query(this.result);
    this.queries.push(query);
    return query;
  }
}

test('listInbox applies attention view and terminal exclusions before pagination', async () => {
  const client = new OrderClient({ data: [rawOrder], error: null, count: 7 });
  const repository = new OrderRepository(client as never);
  const result = await repository.listInbox({ view: 'attention', search: '0901', createdFrom: '2026-09-01', createdTo: '2026-09-30', sort: 'oldest', page: 2, pageSize: 5 }, { userId: 'staff-1', role: 'editor' });
  assert.equal(result.total, 7);
  assert.equal(result.rows[0]?.publicOrderCode, 'QT260930-0001');
  assert.deepEqual(client.queries[0]?.rangeValue, [5, 9]);
  assert.ok(client.queries[0]?.filters.some((filter) => filter[0] === 'or'));
  assert.ok(client.queries[0]?.filters.some((filter) => filter[0] === 'not' && filter[1] === 'fulfillment_status'));
  assert.ok(client.queries[0]?.filters.some((filter) => filter[0] === 'neq' && filter[1] === 'payment_status' && filter[2] === 'cancelled'));
  await assert.rejects(() => repository.listInbox({}, { userId: '', role: 'editor' }), /staff identity/i);
});

test('listInbox translates attentionReason filters into database predicates before range', async () => {
  const client = new OrderClient({ data: [rawOrder], error: null, count: 12 });
  const repository = new OrderRepository(client as never);
  const result = await repository.listInbox({
    attentionReason: ['PAYMENT_REPORTED', 'DESIGN_CHANGES', 'READY_FOR_PRODUCTION'],
    page: 1,
    pageSize: 10,
  }, { userId: 'staff-1', role: 'editor' });

  assert.equal(result.total, 12);
  assert.equal(result.rows.length, 1);
  assert.ok(client.queries[0]?.filters.some((filter) =>
    filter[0] === 'or' &&
    String(filter[1]).includes('payment_status.eq.payment_reported') &&
    String(filter[1]).includes('design_status.eq.needs_changes') &&
    String(filter[1]).includes('and(payment_status.eq.paid,design_status.eq.approved,fulfillment_status.eq.ready_for_production)')
  ));
});

test('countViews performs parallel count queries with terminal-state exclusions', async () => {
  const client = new OrderClient({ data: null, error: null, count: 3 });
  const repository = new OrderRepository(client as never);
  const counts = await repository.countViews({ userId: 'staff-1', role: 'admin' });
  assert.deepEqual(counts, {
    all: 3,
    needsAttention: 3,
    paymentReported: 3,
    designReview: 3,
    readyForProduction: 3,
  });

  const attentionQuery = client.queries[1];
  assert.ok(attentionQuery?.filters.some((filter) => filter[0] === 'not' && filter[1] === 'fulfillment_status'));
  assert.ok(attentionQuery?.filters.some((filter) => filter[0] === 'neq' && filter[1] === 'payment_status' && filter[2] === 'cancelled'));

  const paymentQuery = client.queries[2];
  assert.ok(paymentQuery?.filters.some((filter) => filter[0] === 'not' && filter[1] === 'fulfillment_status'));
  assert.ok(paymentQuery?.filters.some((filter) => filter[0] === 'neq' && filter[1] === 'payment_status' && filter[2] === 'cancelled'));

  const designReviewQuery = client.queries[3];
  assert.ok(designReviewQuery?.filters.some((filter) => filter[0] === 'not' && filter[1] === 'fulfillment_status'));
  assert.ok(designReviewQuery?.filters.some((filter) => filter[0] === 'neq' && filter[1] === 'payment_status' && filter[2] === 'cancelled'));
});

test('order reads enforce inner joins and reject wrong or expired tokens', async () => {
  const guestClient = new OrderClient({ data: rawOrder, error: null });
  const order = await new OrderRepository(guestClient as never).getById('order-1', { kind: 'guest', tokenHash: 'valid-token' });
  assert.ok(order);
  assert.ok(guestClient.queries[0]?.filters.some((filter) => filter[0] === 'eq' && filter[1] === 'guest_order_access.token_hash' && filter[2] === 'valid-token'));
  assert.ok(guestClient.queries[0]?.filters.some((filter) => filter[0] === 'gt' && filter[1] === 'guest_order_access.expires_at'));

  const expiredGuestClient = new OrderClient({ data: null, error: null });
  const expiredOrder = await new OrderRepository(expiredGuestClient as never).getById('order-1', { kind: 'guest', tokenHash: 'expired-token' });
  assert.equal(expiredOrder, null);
});

test('getById rebuilds snapshot design and summary from joined design versions and product snapshots', async () => {
  const client = new OrderClient({ data: rawOrder, error: null });
  const repository = new OrderRepository(client as never);
  const order = await repository.getById('order-1', { kind: 'staff', staff: { userId: 'staff-1', role: 'admin' } });
  assert.ok(order);
  assert.deepEqual(order.snapshot.design, { text: 'Hello' });
  assert.equal(order.snapshot.summary.product, 'Thiệp');
  assert.equal(order.snapshot.summary.variant, 'Ngang');
  assert.equal(order.preflightRevision, 'pf-3');
});

class TableClient {
  readonly responses: Record<string, { data: unknown; error: unknown }>;
  constructor(responses: Record<string, { data: unknown; error: unknown }>) {
    this.responses = responses;
  }
  from(table: string) {
    const res = this.responses[table] ?? { data: null, error: null };
    const query = new Query(res);
    return query;
  }
}

test('payment repository rejects when order status synchronization fails', async () => {
  const failingClient = new TableClient({
    order_payments: {
      data: {
        id: 'pay-1',
        order_id: 'order-1',
        provider: 'vietqr',
        amount: 29000,
        currency: 'VND',
        reference: 'REF',
        status: 'payment_reported',
        created_at: '2026-09-30T00:00:00Z',
        updated_at: '2026-09-30T00:00:00Z',
      },
      error: null,
    },
    orders: { data: null, error: new Error('orders update rejected') },
  });

  const paymentRepo = new PaymentRepository(failingClient as never);
  await assert.rejects(() => paymentRepo.markCustomerReported('order-1'), /orders update rejected/);
  await assert.rejects(() => paymentRepo.confirmPayment('order-1', 'staff-1'), /orders update rejected/);
});
