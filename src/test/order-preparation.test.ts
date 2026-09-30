import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CreatePendingOrderInput } from '../lib/domain/order.ts';
import type { PendingOrder } from '../lib/order-types.ts';
import { createInitialState, type DesignState } from '../lib/product-state.ts';
import { OrderPreparationError, prepareOrderFromGuestCheckout } from '../lib/services/prepare-order-from-guest-checkout.ts';

const customer = {
  fullName: 'Nguyễn An',
  phone: '0901234567',
  shippingAddress: '12 Nguyễn Huệ, Quận 1, TP.HCM',
};

function createDependencies() {
  const projects: unknown[] = [];
  const assets: Array<Record<string, unknown>> = [];
  const versions: Array<Record<string, unknown>> = [];
  const orders: PendingOrder[] = [];
  const payments: Array<Record<string, unknown>> = [];
  const guestAccess: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const projectRepo = {
    async createProject(input: Record<string, unknown>) {
      const record = { id: `project-${projects.length + 1}`, ...structuredClone(input) };
      projects.push(record);
      return record;
    },
  };
  const assetRepo = {
    async promoteAsset(input: Record<string, unknown>) {
      const record = {
        id: `asset-${assets.length + 1}`,
        createdAt: '2026-09-30T00:00:00.000Z',
        ...structuredClone(input),
      };
      assets.push(record);
      return record;
    },
  };
  const designVersionRepo = {
    async createVersion(input: Record<string, unknown>) {
      const record = {
        id: `version-${versions.length + 1}`,
        createdAt: '2026-09-30T00:00:00.000Z',
        ...structuredClone(input),
      };
      versions.push(record);
      return record;
    },
  };
  const orderRepo = {
    async getByIdempotencyKey(key: string) {
      return orders.find((order) => order.idempotencyKey === key) ?? null;
    },
    async createPendingOrder(input: CreatePendingOrderInput) {
      const id = `order-${orders.length + 1}`;
      const order: PendingOrder = {
        id,
        idempotencyKey: input.idempotencyKey,
        status: 'pending',
        paymentStatus: 'pending_payment',
        customer: structuredClone(input.customer),
        product: {
          productId: input.productId,
          variantId: input.variantId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          subtotal: input.subtotal,
        },
        approvedDesignVersionId: input.approvedDesignVersionId,
        preflightRevision: input.preflightRevision ?? '',
        createdAt: '2026-09-30T00:00:00.000Z',
        snapshot: structuredClone(input.designSnapshot),
        payment: { ...structuredClone(input.payment), orderId: id },
      };
      orders.push(order);
      return structuredClone(order);
    },
    async createGuestAccess(input: Record<string, unknown>) {
      guestAccess.push(structuredClone(input));
    },
  };
  const paymentRepo = {
    async create(input: Record<string, unknown>) {
      const record = {
        id: `payment-${payments.length + 1}`,
        createdAt: '2026-09-30T00:00:00.000Z',
        updatedAt: '2026-09-30T00:00:00.000Z',
        ...structuredClone(input),
      };
      payments.push(record);
      return record;
    },
    async getByOrderId(orderId: string) {
      return payments.find((payment) => payment.orderId === orderId) ?? null;
    },
  };
  const orderEventRepo = {
    async append(input: Record<string, unknown>) {
      events.push(structuredClone(input));
      return { id: `event-${events.length}`, createdAt: '2026-09-30T00:00:00.000Z', ...input };
    },
  };

  return {
    options: { projectRepo, assetRepo, designVersionRepo, orderRepo, paymentRepo, orderEventRepo } as never,
    records: { projects, assets, versions, orders, payments, guestAccess, events },
  };
}

function validInput(design?: DesignState) {
  return {
    idempotencyKey: 'checkout-1',
    design: design ?? { ...createInitialState('card'), quantity: 2 },
    customer,
    designRevision: 'revision-7',
    preflightRevision: 'revision-7',
    preflightAcknowledged: true,
    preflightSnapshot: { warnings: [], approved: true },
  };
}

test('prepares project, private assets, immutable approved version, order, payment, access, and event', async () => {
  const deps = createDependencies();
  const png = Buffer.from('real-png-bytes');
  const design: DesignState = {
    ...createInitialState('card'),
    quantity: 2,
    image: {
      name: 'art.png',
      type: 'image/png',
      size: png.byteLength,
      src: 'blob:artwork',
      width: 1200,
      height: 800,
      data: png.toString('base64'),
    },
  };

  const result = await prepareOrderFromGuestCheckout(validInput(design), deps.options);

  assert.equal(result.order.product.unitPrice, 29000);
  assert.equal(result.order.product.subtotal, 58000);
  assert.equal(result.paymentData.amount, 58000);
  assert.equal(deps.records.projects.length, 1);
  assert.equal(deps.records.assets.length, 1);
  assert.equal(deps.records.assets[0]?.storageBucket, 'customer-assets');
  assert.deepEqual(deps.records.assets[0]?.bytes, new Uint8Array(png));
  assert.equal((deps.records.versions[0]?.designDocument as DesignState).image?.src, '/api/assets/asset-1');
  assert.equal(deps.records.versions[0]?.versionNumber, 1);
  assert.equal(deps.records.versions[0]?.source, 'customer_approved');
  assert.deepEqual(deps.records.versions[0]?.preflightSnapshot, { warnings: [], approved: true });
  assert.equal(deps.records.payments.length, 1);
  assert.equal(deps.records.guestAccess.length, 1);
  assert.match(String(deps.records.guestAccess[0]?.tokenHash), /^[a-f0-9]{64}$/);
  assert.equal(deps.records.events[0]?.eventType, 'ORDER_CREATED');
  assert.ok(result.guestAccessToken.length >= 32);

  design.image!.src = 'blob:changed-after-submit';
  assert.equal((deps.records.versions[0]?.designDocument as DesignState).image?.src, '/api/assets/asset-1');
});

test('same idempotency key returns original order and payment instructions without duplicate writes', async () => {
  const deps = createDependencies();
  const first = await prepareOrderFromGuestCheckout(validInput(), deps.options);
  const second = await prepareOrderFromGuestCheckout(
    validInput({ ...createInitialState('card'), quantity: 99, text: 'changed retry' }),
    deps.options,
  );

  assert.equal(second.order.id, first.order.id);
  assert.equal(second.paymentData.paymentReference, first.paymentData.paymentReference);
  assert.equal(second.guestAccessToken, first.guestAccessToken);
  assert.deepEqual(
    Object.fromEntries(Object.entries(deps.records).map(([key, records]) => [key, records.length])),
    { projects: 1, assets: 0, versions: 1, orders: 1, payments: 1, guestAccess: 1, events: 1 },
  );
});

test('rejects missing preflight acknowledgment or revision with status 400 before writes', async () => {
  for (const patch of [
    { preflightAcknowledged: false },
    { preflightRevision: '   ' },
  ]) {
    const deps = createDependencies();
    await assert.rejects(
      () => prepareOrderFromGuestCheckout({ ...validInput(), ...patch }, deps.options),
      (error: unknown) => error instanceof OrderPreparationError && error.status === 400,
    );
    assert.equal(deps.records.projects.length, 0);
  }
});

test('rejects design and preflight revision mismatch with status 400', async () => {
  const deps = createDependencies();
  await assert.rejects(
    () => prepareOrderFromGuestCheckout({ ...validInput(), preflightRevision: 'revision-8' }, deps.options),
    (error: unknown) => error instanceof OrderPreparationError && error.status === 400,
  );
  assert.equal(deps.records.orders.length, 0);
});

test('deletes a newly created order when a required post-order record fails', async () => {
  const deps = createDependencies();
  const options = deps.options as unknown as {
    orderRepo: { deleteById(id: string): Promise<void> };
    orderEventRepo: { append(input: Record<string, unknown>): Promise<unknown> };
  } & Record<string, unknown>;
  const deleted: string[] = [];
  options.orderRepo.deleteById = async (id: string) => {
    deleted.push(id);
    const index = deps.records.orders.findIndex((order) => order.id === id);
    if (index >= 0) deps.records.orders.splice(index, 1);
  };
  options.orderEventRepo.append = async () => {
    throw new Error('event insert failed');
  };

  await assert.rejects(
    () => prepareOrderFromGuestCheckout(validInput(), options as never),
    /event insert failed/,
  );
  assert.deepEqual(deleted, ['order-1']);
  assert.equal(deps.records.orders.length, 0);
});
