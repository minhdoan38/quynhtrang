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
const shellSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx'),
  'utf8',
);
const customerFormSource = readFileSync(
  resolve(process.cwd(), 'src/components/checkout/customer-information-form.tsx'),
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
test('sticky Step 2 CTA submits through CustomerInformationForm validation', () => {
  assert.match(customerFormSource, /<form id="customer-info-form" onSubmit=\{handleSubmit\}/);
  assert.match(checkoutSource, /step === 2[\s\S]*?<button\s+type="submit"\s+form="customer-info-form"/);
  assert.doesNotMatch(checkoutSource, /step === 2[\s\S]*?<button[\s\S]*?onClick=\{\(\) => handleSubmitCustomerInfo/);
});


test('submission posts stable draft identity and transitions with server order', () => {
  assert.match(checkoutSource, /fetch\('\/api\/orders', \{/);
  assert.match(checkoutSource, /idempotencyKey: draft\.idempotencyKey/);
  assert.match(checkoutSource, /design,\s*customer: normalizedCustomer/);
  assert.match(checkoutSource, /setCreatedOrder\(data\.order\);/);
  assert.match(checkoutSource, /advanceToStep\(3\)/);
  assert.match(checkoutSource, /sessionStorage\.setItem\('quynhtrang\.pendingOrderId', data\.order\.id\)/);
});
test('quantity changes renew submitted draft identity and clear stale order state', () => {
  assert.match(checkoutSource, /const quantityChanged = validQty !== design\.quantity;/);
  assert.match(checkoutSource, /const shouldRenewOrder = quantityChanged \|\| Boolean\(currentDraft\.orderId\) \|\| Boolean\(createdOrder\);/);
  assert.match(checkoutSource, /idempotencyKey: shouldRenewOrder\s*\? `checkout-\$\{crypto\.randomUUID\(\)\}`\s*:\s*currentDraft\.idempotencyKey/);
  assert.match(checkoutSource, /orderId: shouldRenewOrder \? undefined : currentDraft\.orderId/);
  assert.match(checkoutSource, /if \(shouldRenewOrder\) \{[\s\S]*?setCreatedOrder\(null\);[\s\S]*?sessionStorage\.removeItem\('quynhtrang\.pendingOrderId'\)/);
});


test('stale design and preflight integrity are enforced before order creation', () => {
  assert.match(shellSource, /preflightAcknowledged:\s*true/);
  assert.match(shellSource, /designRevision:\s*revision/);
  assert.match(shellSource, /preflightRevision:\s*revision/);
  assert.match(shellSource, /idempotencyKey:\s*`checkout-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(shellSource, /orderId:\s*undefined/);
  assert.match(shellSource, /saveCheckoutDraft\(/);
  assert.match(checkoutSource, /isSameCheckoutDesign\(existingDraft\.design, nextDesign\)/);
  assert.match(checkoutSource, /JSON\.stringify\(a\.productOptions \|\| \{\}\) === JSON\.stringify\(b\.productOptions \|\| \{\}\)/);
  assert.match(checkoutSource, /if \(staleRevisionWarning\) \{[\s\S]*?return;/);
  assert.match(checkoutSource, /preflightRevision: draft\.preflightRevision \?\? 'rev-0'/);
  assert.match(checkoutSource, /preflightAcknowledged: draft\.preflightAcknowledged \?\? true/);
  assert.match(checkoutSource, /router\.push\('\/\?view=editor&mode=preflight'\)/);
  assert.match(checkoutSource, /Thiết kế đã thay đổi kể từ lần kiểm tra trước/);
  assert.match(checkoutSource, /Kiểm tra lại thiết kế/);
  assert.doesNotMatch(checkoutSource, /Cập nhật thiết kế mới/);
  assert.doesNotMatch(checkoutSource, /handleRefreshStaleDraft/);
  assert.match(shellSource, /requestedMode === 'preflight'/);
  assert.match(shellSource, /setOverlayMode\('preflight'\)/);
  assert.match(shellSource, /idempotencyKey:\s*existingDraft\.idempotencyKey/);
  assert.match(shellSource, /orderId:\s*existingDraft\.orderId/);
});

test('GSAP transition respects reduced motion and order page uses canonical customer fields', () => {
  assert.match(checkoutSource, /useGSAP\(/);
  assert.match(checkoutSource, /prefers-reduced-motion: reduce/);
  assert.match(checkoutSource, /return \(\) => mm\.revert\(\)/);
  assert.match(orderPageSource, /customer\.fullName/);
  assert.match(orderPageSource, /customer\.phone/);
  assert.match(orderPageSource, /customer\.shippingAddress/);
});
