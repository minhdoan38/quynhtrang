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
