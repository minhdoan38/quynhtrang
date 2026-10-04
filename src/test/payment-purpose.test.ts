import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentPurpose, PaymentStatus, OrderPayment } from '../lib/order-types.ts';
import { PaymentRepository, type PaymentRecord } from '../lib/repositories/payment-repository.ts';
import { confirmOrderPayment } from '../lib/services/admin-order-operations.ts';
import { getPaymentInstructions } from '../lib/payment-qr-provider.ts';
import { prepareOrderFromGuestCheckout } from '../lib/services/prepare-order-from-guest-checkout.ts';
import { createInitialState } from '../lib/product-state.ts';
import type { CustomerInfo, PendingOrder } from '../lib/order-types.ts';

// Fake Supabase Table Client for testing PaymentRepository
class FakeTableClient {
  private tables: Record<string, { data?: unknown; error?: Error | null }>;
  public lastUpdates: Record<string, Record<string, unknown>> = {};
  public lastFilters: Record<string, Record<string, unknown>> = {};

  constructor(tables: Record<string, { data?: unknown; error?: Error | null }>) {
    this.tables = tables;
  }

  from(table: string) {
    const config = this.tables[table] ?? { data: null, error: null };
    const self = this;
    const filters: Record<string, unknown> = {};
    let updatePayload: Record<string, unknown> | null = null;
    let insertPayload: Record<string, unknown> | null = null;

    const builder = {
      insert(payload: Record<string, unknown>) {
        insertPayload = payload;
        self.lastUpdates[table] = payload;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        updatePayload = payload;
        self.lastUpdates[table] = payload;
        return builder;
      },
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        self.lastFilters[table] = filters;
        return builder;
      },
      order() {
        return builder;
      },
      async single() {
        if (config.error) {
          return { data: null, error: config.error };
        }
        if (insertPayload) {
          return {
            data: {
              id: 'new-id',
              ...insertPayload,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            error: null,
          };
        }
        if (updatePayload && config.data && typeof config.data === 'object') {
          return {
            data: {
              ...(config.data as Record<string, unknown>),
              ...updatePayload,
              ...filters,
            },
            error: null,
          };
        }
        return { data: config.data, error: null };
      },
      async maybeSingle() {
        if (config.error) {
          return { data: null, error: config.error };
        }
        return { data: config.data, error: null };
      },
    };
    return builder;
  }
}

test('PaymentPurpose and PaymentStatus types reflect deposit and full-payment semantics', () => {
  const depositPurpose: PaymentPurpose = 'checkout_deposit';
  const fullPurpose: PaymentPurpose = 'full_order_payment';
  assert.equal(depositPurpose, 'checkout_deposit');
  assert.equal(fullPurpose, 'full_order_payment');

  const depositConfirmed: PaymentStatus = 'deposit_confirmed';
  assert.equal(depositConfirmed, 'deposit_confirmed');

  const payment: OrderPayment = {
    orderId: 'order-1',
    provider: 'vietqr-demo',
    amount: 100000,
    currency: 'VND',
    paymentReference: 'QT-REF',
    status: 'pending_payment',
    purpose: 'checkout_deposit',
  };
  assert.equal(payment.purpose, 'checkout_deposit');
});

test('PaymentRepository creates records with explicit purpose', async () => {
  const fakeClient = new FakeTableClient({
    order_payments: { data: null, error: null },
  });
  const repo = new PaymentRepository(fakeClient as unknown as SupabaseClient);

  const depositRecord = await repo.create({
    orderId: 'order-101',
    provider: 'vietqr-demo',
    amount: 50000,
    reference: 'REF-DEP',
    purpose: 'checkout_deposit',
  });

  assert.equal(depositRecord.purpose, 'checkout_deposit');
  assert.equal(fakeClient.lastUpdates.order_payments.purpose, 'checkout_deposit');

  const fullRecord = await repo.create({
    orderId: 'order-102',
    provider: 'vietqr-demo',
    amount: 200000,
    reference: 'REF-FULL',
  });
  assert.equal(fullRecord.purpose, 'full_order_payment');
  assert.equal(fakeClient.lastUpdates.order_payments.purpose, 'full_order_payment');
});

test('PaymentRepository query and customer report target specified purpose', async () => {
  const fakeClient = new FakeTableClient({
    order_payments: {
      data: {
        id: 'pay-dep-1',
        order_id: 'order-201',
        provider: 'vietqr-demo',
        amount: 80000,
        currency: 'VND',
        reference: 'REF-201',
        status: 'pending_payment',
        purpose: 'checkout_deposit',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    },
    orders: { data: null, error: null },
  });
  const repo = new PaymentRepository(fakeClient as unknown as SupabaseClient);

  const queried = await repo.getByOrderId('order-201', 'checkout_deposit');
  assert.ok(queried);
  assert.equal(queried.purpose, 'checkout_deposit');
  assert.equal(fakeClient.lastFilters.order_payments.purpose, 'checkout_deposit');

  const reported = await repo.markCustomerReported('order-201', new Date().toISOString(), 'checkout_deposit');
  assert.equal(reported.status, 'payment_reported');
  assert.equal(fakeClient.lastFilters.order_payments.purpose, 'checkout_deposit');
  assert.equal(fakeClient.lastUpdates.orders.payment_status, 'payment_reported');
});

test('PaymentRepository confirmPayment requires explicit purpose or id and projects deposit_confirmed for deposit', async () => {
  const fakeClient = new FakeTableClient({
    order_payments: {
      data: {
        id: 'pay-dep-2',
        order_id: 'order-301',
        provider: 'vietqr-demo',
        amount: 80000,
        currency: 'VND',
        reference: 'REF-301',
        status: 'payment_reported',
        purpose: 'checkout_deposit',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    },
    orders: { data: null, error: null },
  });
  const repo = new PaymentRepository(fakeClient as unknown as SupabaseClient);

  // Reject generic confirmation without purpose or paymentId
  await assert.rejects(
    () => repo.confirmPayment({ orderId: 'order-301' }),
    /explicit purpose or payment ID/
  );

  // Confirming checkout_deposit projects deposit_confirmed onto orders table
  const confirmedDeposit = await repo.confirmPayment({
    orderId: 'order-301',
    purpose: 'checkout_deposit',
    confirmedByUserId: 'admin-1',
  });

  assert.equal(confirmedDeposit.status, 'paid');
  assert.equal(fakeClient.lastUpdates.orders.payment_status, 'deposit_confirmed');

  // Confirming full_order_payment projects paid onto orders table
  const fakeFullClient = new FakeTableClient({
    order_payments: {
      data: {
        id: 'pay-full-2',
        order_id: 'order-302',
        provider: 'vietqr-demo',
        amount: 250000,
        currency: 'VND',
        reference: 'REF-302',
        status: 'payment_reported',
        purpose: 'full_order_payment',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    },
    orders: { data: null, error: null },
  });
  const fullRepo = new PaymentRepository(fakeFullClient as unknown as SupabaseClient);

  const confirmedFull = await fullRepo.confirmPayment({
    orderId: 'order-302',
    purpose: 'full_order_payment',
    confirmedByUserId: 'admin-1',
  });
  assert.equal(confirmedFull.status, 'paid');
  assert.equal(fakeFullClient.lastUpdates.orders.payment_status, 'paid');
});

test('confirmOrderPayment admin service forwards purpose and paymentId to RPC', async () => {
  let capturedParams: Record<string, unknown> | null = null;
  const fakeClient = {
    rpc(name: string, params: Record<string, unknown>) {
      assert.equal(name, 'confirm_order_payment');
      capturedParams = params;
      return Promise.resolve({
        data: {
          code: 'confirmed',
          order_id: params.p_order_id,
          payment_id: params.p_payment_id ?? 'pay-1',
          purpose: params.p_purpose ?? 'checkout_deposit',
          payment_status: params.p_purpose === 'checkout_deposit' ? 'deposit_confirmed' : 'paid',
        },
        error: null,
      });
    },
  } as unknown as SupabaseClient;
  const result = await confirmOrderPayment(
    { supabase: fakeClient, staff: { userId: 'admin-1', role: 'admin' } },
    {
      orderId: 'order-401',
      expectedState: 'payment_reported',
      purpose: 'checkout_deposit',
      paymentId: 'pay-dep-401',
    }
  );

  assert.equal(result.ok, true);
  assert.ok(capturedParams);
  assert.equal((capturedParams as Record<string, unknown>).p_order_id, 'order-401');
  assert.equal((capturedParams as Record<string, unknown>).p_expected_state, 'payment_reported');
  assert.equal((capturedParams as Record<string, unknown>).p_purpose, 'checkout_deposit');
  assert.equal((capturedParams as Record<string, unknown>).p_payment_id, 'pay-dep-401');
});

test('getPaymentInstructions encodes amountDueNow and includes purpose and breakdown', async () => {
  const depositOrder: PendingOrder = {
    id: 'QT-DEP-1',
    idempotencyKey: 'idemp-1',
    status: 'pending',
    paymentStatus: 'pending_payment',
    customer: { fullName: 'Test User', phone: '0901234567', shippingAddress: 'Test Addr' },
    approvedDesignVersionId: 'adv-1',
    preflightRevision: 'rev-1',
    product: { productId: 'card', variantId: 'standard', quantity: 1, unitPrice: 300000, subtotal: 300000 },
    commercialSnapshot: {
      productId: 'card',
      productName: 'Card',
      variantId: 'standard',
      variantName: 'Standard',
      definitionKey: 'card_portrait',
      commercialConfigVersionId: 'ver-1',
      tierMinimumQuantity: 1,
      quantity: 1,
      unitPrice: 300000,
      subtotal: 300000,
      total: 300000,
      currency: 'VND',
      paymentPolicy: { kind: 'fixed_deposit', depositAmount: 100000 },
      depositAmount: 100000,
      amountDueNow: 100000,
      remainingAmount: 200000,
    },
    depositAmount: 100000,
    amountDueNow: 100000,
    remainingAmount: 200000,
    paymentPolicy: { kind: 'fixed_deposit', depositAmount: 100000 },
    createdAt: new Date().toISOString(),
    snapshot: {} as never,
    payment: {
      orderId: 'QT-DEP-1',
      provider: 'vietqr-demo',
      amount: 100000,
      currency: 'VND',
      paymentReference: 'QT-DEP-1',
      status: 'pending_payment',
      purpose: 'checkout_deposit',
    },
  };

  const instructions = await getPaymentInstructions(depositOrder);

  // Must encode amountDueNow (100,000) not total (300,000)
  assert.equal(instructions.amount, 100000);
  assert.equal(instructions.amountDueNow, 100000);
  assert.equal(instructions.totalAmount, 300000);
  assert.equal(instructions.remainingAmount, 200000);
  assert.equal(instructions.purpose, 'checkout_deposit');
  assert.ok(instructions.qrUrl?.includes('amount=100000'));
});

test('prepareOrderFromGuestCheckout sets purpose checkout_deposit for deposit products', async () => {
  const createdPayments: Record<string, unknown>[] = [];
  const createdOrders: Record<string, unknown>[] = [];

  const fakeDeps = {
    projectRepo: {
      createProject: async () => ({ id: 'proj-1' }),
    },
    assetRepo: {
      promoteAsset: async () => ({ id: 'asset-1' }),
    },
    designVersionRepo: {
      createVersion: async () => ({ id: 'v1', createdAt: new Date().toISOString() }),
    },
    orderRepo: {
      getByIdempotencyKey: async () => null,
      createPendingOrder: async (input: Record<string, unknown>) => {
        createdOrders.push(input);
        return {
          id: 'QT-ORD-DEP',
          idempotencyKey: input.idempotencyKey,
          status: 'pending',
          paymentStatus: 'pending_payment',
          customer: input.customer,
          product: { productId: 'card', quantity: 1, unitPrice: 300000, subtotal: 300000 },
          total: 300000,
          currency: 'VND',
          commercialSnapshot: input.commercialSnapshot,
          paymentPolicy: input.paymentPolicy,
          depositAmount: input.depositAmount,
          amountDueNow: input.amountDueNow,
          remainingAmount: input.remainingAmount,
          payment: input.payment,
          createdAt: new Date().toISOString(),
          snapshot: input.designSnapshot,
        } as unknown as PendingOrder;
      },
      createGuestAccess: async () => { },
      deleteById: async () => { },
    },
    paymentRepo: {
      create: async (input: Record<string, unknown>) => {
        createdPayments.push(input);
        return { id: 'pay-1', ...input } as unknown as PaymentRecord;
      },
    },
    orderEventRepo: {
      append: async () => { },
    },
    catalogRepo: {
      getProduct: () => ({ id: 'card', status: 'active' }) as never,
      getProductById: async () => ({ id: 'card', status: 'active' }) as never,
      getVariant: () => ({ id: 'standard', productId: 'card', status: 'active' }) as never,
      getCommercialVersion: async () => null,
      getPriceQuote: async () => ({
        id: 'quote-dep-1',
        productId: 'card',
        variantId: 'standard',
        quantity: 1,
        checkoutKeyHash: createHash('sha256').update('idemp-test-dep-9').digest('hex'),
        calculation: {
          unitPrice: 300000,
          subtotal: 300000,
          totalAmount: 300000,
          isDeposit: true,
          paymentPolicy: { kind: 'fixed_deposit', depositAmount: 120000 },
          amountDueNow: 120000,
          remainingAmount: 180000,
        },
        commercialConfigVersionId: 'ver-1',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
      consumeQuote: async () => true,
    },
  };
  const design = { ...createInitialState('card'), variantId: 'standard' };
  const customer: CustomerInfo = {
    fullName: 'Lê Cọc',
    phone: '0901234567',
    shippingAddress: '123 Đào Duy Anh',
  };

  const result = await prepareOrderFromGuestCheckout(
    {
      design,
      customer,
      idempotencyKey: 'idemp-test-dep-9',
      designRevision: 'rev-1',
      preflightAcknowledged: true,
      preflightRevision: 'rev-1',
      priceQuoteId: 'quote-dep-1',
    },
    fakeDeps as never
  );

  assert.equal(result.order.commercialSnapshot.amountDueNow, 120000);
  assert.equal(result.order.commercialSnapshot.remainingAmount, 180000);
  assert.equal(result.order.payment.purpose, 'checkout_deposit');
  assert.equal(result.order.payment.amount, 120000);
  assert.equal(createdPayments[0]?.purpose, 'checkout_deposit');
  assert.equal(createdPayments[0]?.amount, 120000);
});

test('UI panels render distinct deposit copy and prevent false full-payment claims', () => {
  const qrPanelPath = resolve(process.cwd(), 'src/components/checkout/payment-qr-panel.tsx');
  const confirmationPanelPath = resolve(process.cwd(), 'src/components/checkout/order-confirmation-panel.tsx');

  const qrSource = readFileSync(qrPanelPath, 'utf8');
  const confirmationSource = readFileSync(confirmationPanelPath, 'utf8');

  // Deposit QR specific copy
  assert.match(qrSource, /Quét mã để thanh toán tiền cọc/);
  assert.match(qrSource, /Tiền cọc:/);
  assert.match(qrSource, /Tổng đơn:/);
  assert.match(qrSource, /Còn lại:/);

  // Full payment QR copy retained
  assert.match(qrSource, /Quét mã để thanh toán/);

  // Confirmation panel must never claim full payment for deposit orders
  assert.doesNotMatch(confirmationSource, /Thanh toán thành công/);
  assert.doesNotMatch(confirmationSource, />Đã thanh toán<\/strong>/);
  assert.match(confirmationSource, /Đã ghi nhận đơn hàng/);
});
