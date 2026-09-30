import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createInitialState, type DesignState } from '../lib/product-state.ts';
import { serverOrderStore } from '../lib/server-order-store.ts';
import type { CustomerInfo } from '../lib/order-types.ts';
import { getPaymentInstructions } from '../lib/payment-qr-provider.ts';
import { GET as getPaymentRoute } from '../app/api/orders/[id]/payment/route.ts';
import { POST as postReportRoute } from '../app/api/orders/[id]/payment/report/route.ts';
import {
  createGuestOrderAccessToken,
  hashGuestOrderAccessToken,
  GUEST_ORDER_COOKIE_NAME,
} from '../lib/guest-order-access.ts';

test('Order has server-owned price, payment reference, and pending_payment status', () => {
  serverOrderStore.clear();

  const design: DesignState = {
    ...createInitialState('card'),
    variantId: 'horizontal',
    quantity: 5,
  };

  const customer: CustomerInfo = {
    fullName: 'Nguyễn Văn A',
    phone: '0987654321',
    shippingAddress: '123 Đường Hoa Lan, Quận Phú Nhuận, TP.HCM',
  };

  const order = serverOrderStore.createOrder(design, customer);

  assert.ok(order.id.startsWith('QT'), 'Order ID starts with QT');
  assert.equal(order.paymentStatus, 'pending_payment');
  assert.ok(order.payment, 'Order has payment snapshot');
  assert.equal(order.payment.orderId, order.id);
  assert.equal(order.payment.status, 'pending_payment');
  assert.equal(order.payment.currency, 'VND');
  assert.equal(order.payment.paymentReference, order.id);
  assert.equal(typeof order.payment.amount, 'number');
  assert.ok(order.payment.amount > 0);
});

test('createOrder is idempotent when given the same idempotency key', () => {
  serverOrderStore.clear();

  const design: DesignState = createInitialState('wrapping');
  const customer: CustomerInfo = {
    fullName: 'Trần Thị B',
    phone: '0901234567',
    shippingAddress: '456 Lê Lợi, Q1, TP.HCM',
  };

  const first = serverOrderStore.createOrder(design, customer, 'key-123');
  const second = serverOrderStore.createOrder(design, customer, 'key-123');

  assert.equal(first.id, second.id);
  assert.equal(serverOrderStore.getAllOrders().length, 1);
});

test('payment instructions derive from server order and keep same orderId', async () => {
  serverOrderStore.clear();

  const design = createInitialState('sticker');
  const customer: CustomerInfo = {
    fullName: 'Lê C',
    phone: '0912345678',
    shippingAddress: '789 CMT8, Tân Bình',
  };

  const order = serverOrderStore.createOrder(design, customer);
  const instructions = await getPaymentInstructions(order.id);

  assert.equal(instructions.orderId, order.id);
  assert.equal(instructions.amount, order.payment.amount);
  assert.equal(instructions.paymentReference, order.id);
  assert.ok(instructions.bankName, 'Has receiving bank');
  assert.ok(instructions.accountNumber, 'Has account number');
  assert.ok(instructions.accountName, 'Has account name');
  assert.ok(instructions.qrPayload || instructions.qrUrl, 'Has QR payload or URL');
});

test('customer reporting payment sets payment_reported, never paid', () => {
  serverOrderStore.clear();

  const design = createInitialState('notebook');
  const customer: CustomerInfo = {
    fullName: 'Phạm D',
    phone: '0933445566',
    shippingAddress: '10 Hai Bà Trưng, Q3',
  };

  const order = serverOrderStore.createOrder(design, customer);
  assert.equal(order.paymentStatus, 'pending_payment');

  const reported = serverOrderStore.reportPayment(order.id);
  assert.ok(reported);
  assert.equal(reported.paymentStatus, 'payment_reported');
  assert.equal(reported.payment.status, 'payment_reported');
  assert.ok(reported.payment.customerReportedAt);
  assert.notEqual(reported.paymentStatus, 'paid');
});

test('payment route handlers are structured correctly', () => {
  const paymentRoutePath = resolve(process.cwd(), 'src/app/api/orders/[id]/payment/route.ts');
  const reportRoutePath = resolve(process.cwd(), 'src/app/api/orders/[id]/payment/report/route.ts');

  const paymentSource = readFileSync(paymentRoutePath, 'utf8');
  const reportSource = readFileSync(reportRoutePath, 'utf8');

  assert.match(paymentSource, /export async function GET/);
  assert.match(paymentSource, /getPaymentInstructions/);
  assert.match(paymentSource, /serverOrderStore\.getOrder/);
  assert.match(paymentSource, /verifyGuestOrderAccess/);

  assert.match(reportSource, /export async function POST/);
  assert.match(reportSource, /serverOrderStore\.reportPayment/);
  assert.match(reportSource, /verifyGuestOrderAccess/);
  assert.match(reportSource, /PaymentRepository/);
  assert.match(reportSource, /PAYMENT_REPORTED/);
});

test('payment route enforces guest authorization', async () => {
  serverOrderStore.clear();
  const design = createInitialState('notebook');
  const customer: CustomerInfo = { fullName: 'User A', phone: '0900000001', shippingAddress: 'Addr' };
  const order = serverOrderStore.createOrder(design, customer);
  const rawToken = createGuestOrderAccessToken();
  serverOrderStore.createGuestAccess(
    order.id,
    hashGuestOrderAccessToken(rawToken),
    new Date(Date.now() + 3600 * 1000).toISOString()
  );

  // Unauthorized request
  const unauthRes = await getPaymentRoute(
    new Request(`http://localhost/api/orders/${order.id}/payment`),
    { params: Promise.resolve({ id: order.id }) }
  );
  assert.equal(unauthRes.status, 401);

  // Authorized request with cookie
  const authRes = await getPaymentRoute(
    new Request(`http://localhost/api/orders/${order.id}/payment`, {
      headers: { cookie: `${GUEST_ORDER_COOKIE_NAME}=${rawToken}` },
    }),
    { params: Promise.resolve({ id: order.id }) }
  );
  assert.equal(authRes.status, 200);
  const body = (await authRes.json()) as { instructions: unknown; order: unknown };
  assert.ok(body.instructions);
});

test('payment report route enforces guest authorization and sets payment_reported', async () => {
  serverOrderStore.clear();
  const design = createInitialState('notebook');
  const customer: CustomerInfo = { fullName: 'User B', phone: '0900000002', shippingAddress: 'Addr' };
  const order = serverOrderStore.createOrder(design, customer);
  const rawToken = createGuestOrderAccessToken();
  serverOrderStore.createGuestAccess(
    order.id,
    hashGuestOrderAccessToken(rawToken),
    new Date(Date.now() + 3600 * 1000).toISOString()
  );

  // Unauthorized request
  const unauthRes = await postReportRoute(
    new Request(`http://localhost/api/orders/${order.id}/payment/report`, { method: 'POST' }),
    { params: Promise.resolve({ id: order.id }) }
  );
  assert.equal(unauthRes.status, 401);

  // Authorized request
  const authRes = await postReportRoute(
    new Request(`http://localhost/api/orders/${order.id}/payment/report`, {
      method: 'POST',
      headers: { cookie: `${GUEST_ORDER_COOKIE_NAME}=${rawToken}` },
    }),
    { params: Promise.resolve({ id: order.id }) }
  );
  assert.equal(authRes.status, 200);
  const body = (await authRes.json()) as { order: { paymentStatus: string } };
  assert.equal(body.order.paymentStatus, 'payment_reported');
  assert.notEqual(body.order.paymentStatus, 'paid');
});