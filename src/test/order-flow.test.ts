import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, type DesignState } from '../lib/product-state.ts';
import { serverOrderStore } from '../lib/server-order-store.ts';
import type { CustomerInfo } from '../lib/order-types.ts';

test('creates a pending order and immutable snapshot', () => {
  serverOrderStore.clear();

  const originalDesign: DesignState = {
    ...createInitialState('card'),
    text: 'Chúc mừng đám cưới',
    quantity: 5,
  };

  const customer: CustomerInfo = {
    fullName: 'Nguyễn Văn A',
    phone: '0987654321',
    shippingAddress: '123 Đường Hoa Lan, Quận Phú Nhuận, TP.HCM',
  };

  const order = serverOrderStore.createOrder(originalDesign, customer);

  assert.ok(order.id.startsWith('QT'));
  assert.equal(order.status, 'pending');
  assert.equal(order.paymentStatus, 'pending_payment');
  assert.equal(order.customer.fullName, 'Nguyễn Văn A');
  assert.equal(order.snapshot.design.text, 'Chúc mừng đám cưới');
  assert.equal(order.snapshot.summary.quantity, 5);

  // Test snapshot immutability
  originalDesign.text = 'Đã bị sửa sau khi submit';
  originalDesign.quantity = 999;

  const storedOrder = serverOrderStore.getOrder(order.id);
  assert.ok(storedOrder);
  assert.equal(storedOrder.snapshot.design.text, 'Chúc mừng đám cưới');
  assert.equal(storedOrder.snapshot.summary.quantity, 5);
});

test('creates order via CreateOrderParams, recalculates price quote, and stores approved version', () => {
  serverOrderStore.clear();

  const originalDesign: DesignState = {
    ...createInitialState('card'),
    text: 'Thiệp cảm ơn',
    quantity: 3,
  };

  const customer: CustomerInfo = {
    fullName: 'Trần Thị B',
    phone: '0912345678',
    shippingAddress: '456 Lê Lợi, Quận 1, TP.HCM',
  };

  const order = serverOrderStore.createOrder({
    idempotencyKey: 'flow-key-1',
    design: originalDesign,
    customer,
    preflightRevision: 'rev-flow-1',
    preflightAcknowledged: true,
  });

  assert.ok(order.id.startsWith('QT'));
  assert.equal(order.idempotencyKey, 'flow-key-1');
  assert.equal(order.product.quantity, 3);
  assert.equal(order.product.unitPrice, 29000);
  assert.equal(order.product.subtotal, 87000);
  assert.equal(order.payment.amount, 87000);

  // Verify approved design version is stored and immutable
  const version = serverOrderStore.getApprovedDesignVersion(order.approvedDesignVersionId);
  assert.ok(version);
  assert.equal(version.revision, 'rev-flow-1');
  assert.equal(version.preflightAcknowledged, true);
  assert.equal(version.design.text, 'Thiệp cảm ơn');

  // Mutating original design does not mutate approved version
  originalDesign.text = 'Sửa sau submit';
  const storedVersion = serverOrderStore.getApprovedDesignVersion(order.approvedDesignVersionId);
  assert.equal(storedVersion?.design.text, 'Thiệp cảm ơn');

  // Idempotency check: repeated call with same key returns identical order
  const repeated = serverOrderStore.createOrder({
    idempotencyKey: 'flow-key-1',
    design: { ...originalDesign, text: 'Nội dung khác' },
    customer,
  });
  assert.equal(repeated.id, order.id);
  assert.equal(serverOrderStore.getOrderByKey('flow-key-1')?.id, order.id);
});
