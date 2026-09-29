import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { POST } from '../app/api/orders/route.ts';
import { GET } from '../app/api/orders/[id]/route.ts';
import { createInitialState } from '../lib/product-state.ts';
import { serverOrderStore } from '../lib/server-order-store.ts';
import type { PendingOrder } from '../lib/order-types.ts';

interface OrderResponse {
  order: PendingOrder;
  paymentData: {
    orderId: string;
    amount: number;
    description: string;
    accountName: string;
    bankName: string;
  };
}

const validCustomer = {
  fullName: '  Nguyễn Văn An  ',
  phone: '(090) 123-4567',
  shippingAddress: '  123 Đường Hoa Lan, Quận 1, TP.HCM  ',
};

function postOrder(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  serverOrderStore.clear();
});

test('POST creates a server-priced order, promotes design assets, and returns payment data', async () => {
  const design = {
    ...createInitialState('card'),
    quantity: 2,
    image: {
      src: 'blob:api-order-artwork',
      name: 'artwork.png',
      type: 'image/png',
      size: 4,
      width: 100,
      height: 80,
      data: 'dGVzdA==',
    },
  };

  const response = await postOrder({
    idempotencyKey: 'orders-api-success',
    design,
    customer: validCustomer,
    preflightRevision: 'rev-api-1',
    preflightAcknowledged: true,
  });
  const body = await response.json() as OrderResponse;

  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(body).sort(), ['order', 'paymentData']);
  assert.equal(body.order.idempotencyKey, 'orders-api-success');
  assert.deepEqual(body.order.customer, {
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    shippingAddress: '123 Đường Hoa Lan, Quận 1, TP.HCM',
  });
  assert.equal(body.order.product.quantity, 2);
  assert.equal(body.order.product.subtotal, 58000);
  assert.match(body.order.snapshot.design.image?.src ?? '', /^\/api\/assets\/asset-/);
  assert.equal(body.order.snapshot.design.image?.src.includes('blob:'), false);
  assert.deepEqual(body.paymentData, {
    orderId: body.order.id,
    amount: 58000,
    description: `Thanh toán đơn hàng ${body.order.id}`,
    accountName: 'TIEM IN QUYNH TRANG',
    bankName: 'MB Bank (Ngân hàng Quân Đội)',
  });
});

test('POST rejects the first invalid customer field with its exact Vietnamese message', async () => {
  const design = createInitialState('card');
  const cases = [
    {
      customer: { ...validCustomer, fullName: ' ' },
      error: 'Nhập họ và tên.',
    },
    {
      customer: { ...validCustomer, phone: '1234567' },
      error: 'Kiểm tra lại số điện thoại.',
    },
    {
      customer: { ...validCustomer, shippingAddress: 'ngắn' },
      error: 'Nhập địa chỉ nhận hàng đầy đủ hơn.',
    },
    {
      customer: { fullName: '', phone: '', shippingAddress: '' },
      error: 'Nhập họ và tên.',
    },
  ];

  for (const [index, example] of cases.entries()) {
    const response = await postOrder({
      idempotencyKey: `orders-api-invalid-${index}`,
      design,
      customer: example.customer,
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: example.error });
  }

  assert.equal(serverOrderStore.getAllOrders().length, 0);
});

test('POST is idempotent for repeated idempotency keys', async () => {
  const request = {
    idempotencyKey: 'orders-api-duplicate',
    design: createInitialState('notebook'),
    customer: validCustomer,
  };

  const firstResponse = await postOrder(request);
  const secondResponse = await postOrder({
    ...request,
    design: { ...request.design, quantity: 9 },
  });
  const first = await firstResponse.json() as OrderResponse;
  const second = await secondResponse.json() as OrderResponse;

  assert.equal(firstResponse.status, 201);
  assert.ok(secondResponse.status === 200 || secondResponse.status === 201);
  assert.equal(second.order.id, first.order.id);
  assert.equal(second.paymentData.orderId, first.paymentData.orderId);
  assert.equal(serverOrderStore.getAllOrders().length, 1);
});

test('GET returns the stored order with normalized customer and sanitized snapshot', async () => {
  const createResponse = await postOrder({
    idempotencyKey: 'orders-api-get',
    design: {
      ...createInitialState('sticker'),
      image: {
        src: 'blob:get-order-artwork',
        name: 'sticker.png',
        type: 'image/png',
        size: 4,
        data: 'dGVzdA==',
      },
    },
    customer: validCustomer,
  });
  const created = await createResponse.json() as OrderResponse;

  const response = await GET(
    new Request(`http://localhost/api/orders/${created.order.id}`),
    { params: Promise.resolve({ id: created.order.id }) },
  );
  const body = await response.json() as { order: PendingOrder };

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body), ['order']);
  assert.equal(body.order.id, created.order.id);
  assert.deepEqual(body.order.customer, created.order.customer);
  assert.equal(body.order.approvedDesignVersionId, created.order.approvedDesignVersionId);
  assert.match(body.order.snapshot.design.image?.src ?? '', /^\/api\/assets\/asset-/);
  assert.doesNotMatch(JSON.stringify(body.order.snapshot), /blob:/);
});
