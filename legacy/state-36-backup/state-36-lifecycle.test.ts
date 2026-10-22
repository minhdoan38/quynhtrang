import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checkoutPath = resolve(process.cwd(), 'src/app/checkout/page.tsx');
const confirmationPath = resolve(process.cwd(), 'src/app/order/[id]/page.tsx');

const checkoutSource = readFileSync(checkoutPath, 'utf8');
const confirmationSource = readFileSync(confirmationPath, 'utf8');

test('Step 3 supports QR Payment and Order Confirmation under State 36', () => {
  // Must support both payment instruction view and order confirmation view in checkout or order flow
  assert.match(checkoutSource, /Quét mã để thanh toán/);
  assert.match(checkoutSource, /Tôi đã chuyển khoản/);
  assert.match(checkoutSource, /Tôi muốn thanh toán sau|Thanh toán sau/);
  assert.match(checkoutSource, /Nội dung chuyển khoản/);
  assert.match(checkoutSource, /Sao chép/);
});

test('Customer payment report sets payment_reported and moves to confirmation', () => {
  assert.match(checkoutSource, /\/api\/orders\/\$\{.*?\}\/payment\/report/);
  assert.match(checkoutSource, /Chờ xác nhận/);
  assert.doesNotMatch(checkoutSource, /Đã thanh toán(?!\s*sau)/);
});

test('Order Confirmation shows recorded headline and unverified status', () => {
  // Must use Đã ghi nhận đơn hàng, never Thanh toán thành công
  assert.match(checkoutSource + confirmationSource, /Đã ghi nhận đơn hàng/);
  assert.doesNotMatch(checkoutSource + confirmationSource, /Thanh toán thành công/);
  assert.match(checkoutSource + confirmationSource, /Chờ xác nhận/);
});

test('Confirmation allows reopening payment instructions for the same order', () => {
  assert.match(checkoutSource + confirmationSource, /Xem lại mã thanh toán|Thanh toán ngay/);
  assert.match(checkoutSource + confirmationSource, /Thiết kế sản phẩm khác/);
});

test('Session persistence protects order recovery across page refresh', () => {
  assert.match(checkoutSource, /sessionStorage/);
  assert.match(checkoutSource, /quynhtrang\.pendingOrderId|pendingOrderId/);
});
