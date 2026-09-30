import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checkoutPath = resolve(process.cwd(), 'src/app/checkout/page.tsx');
const qrPanelPath = resolve(process.cwd(), 'src/components/checkout/payment-qr-panel.tsx');
const confirmationPanelPath = resolve(process.cwd(), 'src/components/checkout/order-confirmation-panel.tsx');
const confirmationRoutePath = resolve(process.cwd(), 'src/app/order/[id]/page.tsx');

const checkoutSource = readFileSync(checkoutPath, 'utf8');
const qrPanelSource = readFileSync(qrPanelPath, 'utf8');
const confirmationPanelSource = readFileSync(confirmationPanelPath, 'utf8');
const confirmationRouteSource = readFileSync(confirmationRoutePath, 'utf8');

test('Step 3 supports QR Payment and Order Confirmation under State 36', () => {
  // QR Panel elements
  assert.match(qrPanelSource, /Quét mã để thanh toán/);
  assert.match(qrPanelSource, /Tôi đã chuyển khoản/);
  assert.match(qrPanelSource, /Tôi muốn thanh toán sau/);
  assert.match(qrPanelSource, /Nội dung chuyển khoản/);
  assert.match(qrPanelSource, /Sao chép/);
  assert.match(qrPanelSource, /Không quét được trên điện thoại này\? Xem thông tin chuyển khoản/);

  // Integration into checkout page
  assert.match(checkoutSource, /PaymentQrPanel/);
  assert.match(checkoutSource, /OrderConfirmationPanel/);
});

test('Customer payment report sets payment_reported and moves to confirmation', () => {
  assert.match(qrPanelSource, /\/api\/orders\/\$\{order\.id\}\/payment\/report/);
  assert.match(qrPanelSource, /Chờ xác nhận thanh toán/);
  assert.doesNotMatch(qrPanelSource, /Đã thanh toán(?!\s*sau)/);
});

test('Order Confirmation shows recorded headline and unverified status', () => {
  // Must use Đã ghi nhận đơn hàng, never Thanh toán thành công
  assert.match(confirmationPanelSource, /Đã ghi nhận đơn hàng/);
  assert.doesNotMatch(confirmationPanelSource, /Thanh toán thành công/);
  assert.match(confirmationPanelSource, /Chờ xác nhận/);
});

test('Confirmation allows reopening payment instructions for the same order', () => {
  assert.match(confirmationPanelSource, /Xem lại mã thanh toán/);
  assert.match(confirmationPanelSource, /Thiết kế sản phẩm khác/);
  assert.match(checkoutSource, /onReopenPayment=\{\(\) => setState36Mode\('payment'\)\}/);
});

test('Session persistence protects order recovery across page refresh', () => {
  assert.match(checkoutSource, /sessionStorage/);
  assert.match(checkoutSource, /quynhtrang\.pendingOrderId/);
});
