import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { POST } from '../app/api/orders/route.ts';
import { GET } from '../app/api/orders/[id]/route.ts';
import { createInitialState } from '../lib/product-state.ts';
import { serverOrderStore } from '../lib/server-order-store.ts';
import { storeAsset } from '../lib/asset-store.ts';
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

function postOrder(body: Record<string, unknown>, options?: { omitPreflightDefaults?: boolean }) {
  const payload = options?.omitPreflightDefaults
    ? body
    : {
      preflightRevision: 'rev-default',
      preflightAcknowledged: true,
      ...body,
    };
  return POST(new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
    phone: '(090) 123-4567',
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

  const cookieHeader = createResponse.headers.get('set-cookie') ?? '';
  const response = await GET(
    new Request(`http://localhost/api/orders/${created.order.id}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    }),
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

test('GET rejects request without guest access cookie or token with 401', async () => {
  const createResponse = await postOrder({
    idempotencyKey: 'unauth-order-key',
    design: createInitialState('sticker'),
    customer: validCustomer,
  });
  const created = (await createResponse.json()) as OrderResponse;

  const unauthorizedResponse = await GET(
    new Request(`http://localhost/api/orders/${created.order.id}`),
    { params: Promise.resolve({ id: created.order.id }) },
  );
  assert.equal(unauthorizedResponse.status, 401);
});

test('GET rejects request with invalid guest token with 401', async () => {
  const createResponse = await postOrder({
    idempotencyKey: 'wrong-token-order-key',
    design: createInitialState('sticker'),
    customer: validCustomer,
  });
  const created = (await createResponse.json()) as OrderResponse;

  const wrongTokenResponse = await GET(
    new Request(`http://localhost/api/orders/${created.order.id}`, {
      headers: {
        'x-guest-token': 'completely-wrong-token',
      },
    }),
    { params: Promise.resolve({ id: created.order.id }) },
  );
  assert.equal(wrongTokenResponse.status, 401);
});

test('GET allows access for verified staff member with 200', async () => {
  const createResponse = await postOrder({
    idempotencyKey: 'staff-access-order-key',
    design: createInitialState('sticker'),
    customer: validCustomer,
  });
  const created = (await createResponse.json()) as OrderResponse;

  const staffResponse = await GET(
    new Request(`http://localhost/api/orders/${created.order.id}`, {
      headers: {
        'x-staff-user-id': 'staff-editor-99',
        'x-staff-role': 'editor',
      },
    }),
    { params: Promise.resolve({ id: created.order.id }) },
  );
  assert.equal(staffResponse.status, 200);
  const body = (await staffResponse.json()) as { order: PendingOrder };
  assert.equal(body.order.id, created.order.id);
});

test('POST rejects submission when preflight is unacknowledged, missing, or has empty revision', async () => {
  const design = createInitialState('card');

  const testCases: Array<{ body: Record<string, unknown>; omitDefaults?: boolean }> = [
    { body: { idempotencyKey: 'preflight-false', design, customer: validCustomer, preflightRevision: 'rev-1', preflightAcknowledged: false } },
    { body: { idempotencyKey: 'preflight-missing-ack', design, customer: validCustomer, preflightRevision: 'rev-1' }, omitDefaults: true },
    { body: { idempotencyKey: 'preflight-missing-rev', design, customer: validCustomer, preflightAcknowledged: true }, omitDefaults: true },
    { body: { idempotencyKey: 'preflight-empty-rev', design, customer: validCustomer, preflightRevision: '   ', preflightAcknowledged: true } },
  ];

  for (const { body, omitDefaults } of testCases) {
    const response = await postOrder(body, { omitPreflightDefaults: omitDefaults });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Thiết kế cần được xác nhận kiểm tra in trước khi đặt hàng.',
    });
  }
  assert.equal(serverOrderStore.getAllOrders().length, 0);
});

test('POST rejects submission when design revision mismatches acknowledged preflight revision', async () => {
  const design = createInitialState('card');
  const response = await postOrder({
    idempotencyKey: 'orders-api-rev-mismatch',
    design,
    customer: validCustomer,
    designRevision: 'rev-new',
    preflightRevision: 'rev-old',
    preflightAcknowledged: true,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Thiết kế đã có thay đổi so với bản kiểm tra in. Vui lòng kiểm tra lại thiết kế.',
  });
  assert.equal(serverOrderStore.getAllOrders().length, 0);
});

test('POST creates order successfully when preflight is acknowledged and design revision matches', async () => {
  const design = createInitialState('card');
  const response = await postOrder({
    idempotencyKey: 'orders-api-preflight-ack',
    design,
    customer: validCustomer,
    designRevision: 'rev-matching',
    preflightRevision: 'rev-matching',
    preflightAcknowledged: true,
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as OrderResponse;
  assert.equal(body.order.preflightRevision, 'rev-matching');
  const version = serverOrderStore.getApprovedDesignVersion(body.order.approvedDesignVersionId);
  assert.ok(version);
  assert.equal(version.preflightAcknowledged, true);
  assert.equal(version.preflightRevision, 'rev-matching');
});

test('POST generates collision-free UUID idempotency keys when idempotencyKey is omitted', async () => {
  const design = createInitialState('notebook');

  const res1 = await postOrder({ design, customer: validCustomer });
  const res2 = await postOrder({ design, customer: validCustomer });

  assert.equal(res1.status, 201);
  assert.equal(res2.status, 201);

  const body1 = (await res1.json()) as OrderResponse;
  const body2 = (await res2.json()) as OrderResponse;

  assert.notEqual(body1.order.id, body2.order.id);
  assert.notEqual(body1.order.idempotencyKey, body2.order.idempotencyKey);
  assert.match(body1.order.idempotencyKey, /^order-key-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.match(body2.order.idempotencyKey, /^order-key-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(serverOrderStore.getAllOrders().length, 2);
});

test('POST rejects incomplete asset promotion or unresolved blob without server backing with 400', async () => {
  const unresolvedDesign = {
    ...createInitialState('card'),
    image: {
      src: 'blob:unresolved-client-image',
      name: 'unresolved.png',
    },
  };

  const response = await postOrder({
    idempotencyKey: 'orders-api-unresolved-blob',
    design: unresolvedDesign,
    customer: validCustomer,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Chưa thể chuẩn bị tệp in từ thiết kế. Vui lòng tải lại ảnh và thử lại.',
  });
  assert.equal(serverOrderStore.getAllOrders().length, 0);
});

test('POST rejects blob image with invalid or unsupported metadata with 400', async () => {
  const invalidMetaDesign = {
    ...createInitialState('card'),
    image: {
      src: 'blob:invalid-exe-file',
      name: 'malicious.exe',
      type: 'application/x-msdownload',
      size: 1024,
      width: 100,
      height: 100,
    },
  };

  const response = await postOrder({
    idempotencyKey: 'orders-api-invalid-meta',
    design: invalidMetaDesign,
    customer: validCustomer,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Chưa thể chuẩn bị tệp in từ thiết kế. Vui lòng tải lại ảnh và thử lại.',
  });
  assert.equal(serverOrderStore.getAllOrders().length, 0);
});

test('POST rejects promoted assets that have metadata but no actual content', async () => {
  const response = await postOrder({
    idempotencyKey: 'orders-api-contentless-asset',
    design: {
      ...createInitialState('card'),
      image: {
        src: 'blob:metadata-only-image',
        name: 'metadata-only.png',
        type: 'image/png',
        size: 2048,
        width: 640,
        height: 480,
      },
    },
    customer: validCustomer,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Chưa thể chuẩn bị tệp in từ thiết kế. Vui lòng tải lại ảnh và thử lại.',
  });
  assert.equal(serverOrderStore.getAllOrders().length, 0);
});

test('POST allows ordinary design text containing the literal blob prefix', async () => {
  const response = await postOrder({
    idempotencyKey: 'orders-api-blob-text',
    design: {
      ...createInitialState('card'),
      text: 'Nội dung tham chiếu blob: nhưng không phải URL tài nguyên',
      elements: [{
        id: 'text-blob-literal',
        type: 'text',
        x: 10,
        y: 10,
        width: 60,
        height: 20,
        rotation: 0,
        data: { text: 'blob: chỉ là nội dung văn bản' },
      }],
    },
    customer: validCustomer,
  });

  assert.equal(response.status, 201);
  const body = await response.json() as OrderResponse;
  assert.equal(body.order.snapshot.design.text, 'Nội dung tham chiếu blob: nhưng không phải URL tài nguyên');
  assert.equal(body.order.snapshot.design.elements?.[0].data?.text, 'blob: chỉ là nội dung văn bản');
});

test('POST rejects unresolved blob references in element asset URL fields', async () => {
  const response = await postOrder({
    idempotencyKey: 'orders-api-element-url-blob',
    design: {
      ...createInitialState('card'),
      elements: [{
        id: 'texture-blob',
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        data: { url: 'blob:unresolved-texture' },
      }],
    },
    customer: validCustomer,
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Chưa thể chuẩn bị tệp in từ thiết kế. Vui lòng tải lại ảnh và thử lại.',
  });
  assert.equal(serverOrderStore.getAllOrders().length, 0);
});

test('POST accepts valid stored data-only assets with content in data field', async () => {
  storeAsset({
    id: '/api/assets/asset-data-only',
    sourceKey: 'blob:data-only-source',
    originalUrl: '/api/assets/asset-data-only',
    mimeType: 'image/png',
    byteSize: 4,
    data: 'dGVzdA==',
  });

  const response = await postOrder({
    idempotencyKey: 'orders-api-data-only-asset',
    design: {
      ...createInitialState('card'),
      image: {
        src: '/api/assets/asset-data-only',
        name: 'photo.png',
        type: 'image/png',
        size: 4,
      },
    },
    customer: validCustomer,
  });

  assert.equal(response.status, 201);
  const body = await response.json() as OrderResponse;
  assert.equal(body.order.snapshot.design.image?.src, '/api/assets/asset-data-only');
  assert.equal(serverOrderStore.getAllOrders().length, 1);
});
