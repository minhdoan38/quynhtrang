import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recordReliabilityMetric,
  reportUnexpectedError,
} from './report.ts';

test('reportUnexpectedError keeps only allowlisted safe metadata', () => {
  const record = reportUnexpectedError({
    operation: 'createOrder',
    operationId: 'order_known-correlation',
    route: '/api/orders',
    role: 'customer',
    productType: 'card',
    status: 500,
    durationMs: 42,
    errorCode: 'UNEXPECTED_ERROR',
    release: '2026.10.07',
    customerName: 'Nguyễn Văn A',
    arbitrary: 'must not survive',
  });

  assert.deepEqual(record, {
    operation: 'createOrder',
    operationId: 'order_known-correlation',
    route: '/api/orders',
    role: 'customer',
    productType: 'card',
    status: 500,
    durationMs: 42,
    errorCode: 'UNEXPECTED_ERROR',
    release: '2026.10.07',
  });
});

test('reportUnexpectedError strips phone, address, token, signed URL, and SQL sentinels', () => {
  const record = reportUnexpectedError({
    operation: 'publishTemplate',
    operationId: 'publish_safe-id',
    route: '/admin/templates?token=secret-token',
    role: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
    productType: 'Giao tới 12 Nguyễn Trãi, Hà Nội; gọi 0901234567',
    errorCode: 'SELECT * FROM customer_orders WHERE phone = 0901234567',
    release: 'https://storage.example/object.png?X-Amz-Signature=secret&token=secret-token',
    error: new Error('syntax error near INSERT INTO orders; address 12 Nguyễn Trãi'),
    phone: '0901234567',
    address: '12 Nguyễn Trãi, Hà Nội',
    otp: '123456',
    accessToken: 'secret-token',
    signedUrl: 'https://storage.example/private.png?sig=secret',
    sql: 'DELETE FROM orders',
  });

  const serialized = JSON.stringify(record);
  assert.equal(record.operationId, 'publish_safe-id');
  assert.equal(record.route, '/admin/templates');
  for (const secret of [
    'Nguyễn Trãi',
    '0901234567',
    '123456',
    'secret-token',
    'X-Amz-Signature',
    'eyJhbGci',
    'SELECT',
    'INSERT INTO',
    'DELETE FROM',
    'syntax error',
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret, 'i'));
  }
});

test('reportUnexpectedError reduces a DesignDocument to structural stats and preserves operationId', () => {
  const doc = {
    productId: 'card',
    variantId: 'horizontal',
    documentSchemaVersion: 3,
    customerName: 'Private Customer',
    image: { src: 'data:image/png;base64,PRIVATE_IMAGE_BYTES' },
    elements: [
      { id: 'one', type: 'text', text: 'private copy' },
      { id: 'two', type: 'image', src: 'https://private.example/signed?token=abc' },
    ],
  };
  const record = reportUnexpectedError({
    operation: 'renderDesign',
    operationId: 'render_stats-id',
    document: doc,
  });

  assert.equal(record.operationId, 'render_stats-id');
  assert.equal(record.documentStats?.elementCount, 2);
  assert.equal(record.documentStats?.schemaVersion, 3);
  assert.equal(record.documentStats?.approximateSize, JSON.stringify(doc).length);
  const serialized = JSON.stringify(record);
  for (const secret of ['Private Customer', 'PRIVATE_IMAGE_BYTES', 'private copy', 'private.example']) {
    assert.doesNotMatch(serialized, new RegExp(secret, 'i'));
  }
});

test('recordReliabilityMetric bounds metric names, tag keys, and values', () => {
  const metric = recordReliabilityMetric('order_creation_failure', {
    role: 'customer',
    status: 500,
    operationId: 'must-not-be-a-tag',
    route: '/api/orders/customer-123',
    errorCode: 'UNEXPECTED_ERROR',
    customerName: 'Private Customer',
  });

  assert.deepEqual(metric, {
    metricName: 'order_creation_failure',
    tags: {
      role: 'customer',
      status: '5xx',
      errorCode: 'UNEXPECTED_ERROR',
    },
  });
  assert.deepEqual(recordReliabilityMetric('customer_0901234567', { role: 'customer' }), {
    metricName: 'unexpected_error',
    tags: { role: 'customer' },
  });
});
