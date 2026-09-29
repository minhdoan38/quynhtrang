import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const checkoutSource = readFileSync(
  resolve(process.cwd(), 'src/app/checkout/page.tsx'),
  'utf8',
);
const orderPageSource = readFileSync(
  resolve(process.cwd(), 'src/app/order/[id]/page.tsx'),
  'utf8',
);

const stepTwoStart = checkoutSource.indexOf('{/* STEP 2: Customer Information Form */}');
const stepThreeStart = checkoutSource.indexOf('{/* STEP 3: QR Payment Demo */}');
const stepTwoSource = checkoutSource.slice(stepTwoStart, stepThreeStart);

test('Step 2 renders customer information form with exact header and progress copy', () => {
  assert.match(checkoutSource, /import \{ CustomerInformationForm \} from ['"]@\/components\/checkout\/customer-information-form['"]/);
  assert.match(checkoutSource, /step === 2 \? 'Thông tin nhận hàng'/);
  assert.match(checkoutSource, /`Bước \$\{step\} \/ 3`/);
  assert.match(stepTwoSource, /<CustomerInformationForm/);
});

test('back stays in checkout from Step 2 and returns to editor from Step 1', () => {
  assert.match(checkoutSource, /if \(step === 2\) \{\s*setStep\(1\);\s*return;\s*\}/);
  assert.match(checkoutSource, /router\.push\('\/\?view=editor'\);/);
});

test('customer draft rehydrates and survives Step 2 navigation', () => {
  assert.match(checkoutSource, /loadCheckoutDraft\(\)/);
  assert.match(checkoutSource, /saveCheckoutDraft\(/);
  assert.match(stepTwoSource, /initialValues=\{customer\}/);
  assert.match(stepTwoSource, /onChange=\{handleCustomerChange\}/);
});

test('Step 2 exposes exact submit, pending, and recoverable error copy', () => {
  assert.match(stepTwoSource, /isSubmitting=\{isPending\}/);
  assert.match(stepTwoSource, /submitError=\{formError\}/);
  assert.match(stepTwoSource, /onRetry=\{handleRetryCustomerInfo\}/);
  assert.match(checkoutSource, /'Đang chuẩn bị đơn hàng\.\.\.'/);
  assert.match(checkoutSource, /'Chưa thể chuẩn bị đơn hàng\.'/);
  assert.match(checkoutSource, /'Kiểm tra kết nối và thử lại\.'/);
  assert.match(checkoutSource, /'Thử lại'/);
});

test('submission posts stable draft identity and transitions with server order', () => {
  assert.match(checkoutSource, /fetch\('\/api\/orders', \{/);
  assert.match(checkoutSource, /idempotencyKey: draft\.idempotencyKey/);
  assert.match(checkoutSource, /design,\s*customer: normalizedCustomer/);
  assert.match(checkoutSource, /setCreatedOrder\(data\.order\);/);
  assert.match(checkoutSource, /advanceToStep\(3\)/);
  assert.match(checkoutSource, /sessionStorage\.setItem\('quynhtrang\.pendingOrderId', data\.order\.id\)/);
});

test('stale design revision is detected before continuing checkout', () => {
  assert.match(checkoutSource, /isSameCheckoutDesign\(existingDraft\.design, nextDesign\)/);
  assert.match(checkoutSource, /Thiết kế đã thay đổi kể từ lần kiểm tra trước/);
  assert.match(checkoutSource, /Kiểm tra lại thiết kế/);
});

test('GSAP transition respects reduced motion and order page uses canonical customer fields', () => {
  assert.match(checkoutSource, /useGSAP\(/);
  assert.match(checkoutSource, /prefers-reduced-motion: reduce/);
  assert.match(checkoutSource, /return \(\) => mm\.revert\(\)/);
  assert.match(orderPageSource, /customer\.fullName/);
  assert.match(orderPageSource, /customer\.phone/);
  assert.match(orderPageSource, /customer\.shippingAddress/);
});
