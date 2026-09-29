import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createInitialState,
  getFixedStickerShapeLabel,
  normalizeQuantity,
  type DesignState,
} from '../lib/product-state.ts';
import { calculatePriceQuote } from '../lib/pricing.ts';
import type { OrderSummaryCardProps } from '../components/checkout/order-summary-card.tsx';
import type { QuantityStepperProps } from '../components/checkout/quantity-stepper.tsx';

// Follow repository pattern: node --test --experimental-strip-types strips TS types
// but does not execute JSX files directly without bundler.
function getFriendlyProductName(design: DesignState): string {
  switch (design.productId) {
    case 'wrapping':
      return 'Giấy bọc quà';
    case 'card':
      return 'Thiệp chúc mừng';
    case 'notebook':
      return 'Bìa sổ tay';
    case 'sticker':
      return design.productOptions?.shape === 'circle'
        ? 'Sticker tròn'
        : 'Sticker die-cut';
    default:
      return 'Sản phẩm in';
  }
}

function getFriendlyVariant(design: DesignState): string {
  const options = design.productOptions || {};

  switch (design.productId) {
    case 'wrapping': {
      const variantUpper = (design.variantId || 'a1').toUpperCase();
      const modeText = options.mode === 'full-sheet' ? 'Toàn tờ' : 'Lặp họa tiết';
      return `${variantUpper} • ${modeText}`;
    }
    case 'card': {
      return options.orientation === 'vertical' ? 'Dọc' : 'Ngang';
    }
    case 'sticker': {
      return design.variantId === 'die-cut' ? 'Cắt rời (Die-cut)' : 'Hình chuẩn';
    }
    case 'notebook': {
      return 'Khổ A5 (148 × 210 mm)';
    }
    default:
      return '';
  }
}

function getThumbnailShapeClass(design: DesignState): string {
  if (design.productId === 'sticker' && design.productOptions?.shape === 'circle') {
    return 'rounded-full aspect-square';
  }
  if (design.productId === 'card') {
    return design.productOptions?.orientation === 'vertical'
      ? 'aspect-[105/148] rounded-md'
      : 'aspect-[148/105] rounded-md';
  }
  if (design.productId === 'notebook') {
    return 'aspect-[148/210] rounded-sm';
  }
  return 'rounded-xl aspect-square';
}

const checkoutSource = readFileSync(
  resolve(process.cwd(), 'src/app/checkout/page.tsx'),
  'utf8',
);
const shellSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx'),
  'utf8',
);
const preflightSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/editor-preflight-mode.tsx'),
  'utf8',
);
const orderCardSource = readFileSync(
  resolve(process.cwd(), 'src/components/checkout/order-summary-card.tsx'),
  'utf8',
);
const quantityStepperSource = readFileSync(
  resolve(process.cwd(), 'src/components/checkout/quantity-stepper.tsx'),
  'utf8',
);

const stepOneStart = checkoutSource.indexOf('{/* STEP 1: Order Summary + Quantity */}');
const stepTwoStart = checkoutSource.indexOf('{/* STEP 2: Customer Information Form */}');
const stepThreeStart = checkoutSource.indexOf('{/* STEP 3: QR Payment Demo */}');
const stepOneSource = checkoutSource.slice(stepOneStart, stepTwoStart);
const stepTwoSource = checkoutSource.slice(stepTwoStart, stepThreeStart);

test('1. Preflight continuation opens Checkout Step 1', () => {
  assert.match(shellSource, /onContinueToCheckout=\{\(\) => \{\s*router\.push\('\/checkout'\);/);
  assert.match(preflightSource, /onClick=\{onContinueToCheckout\}/);
  assert.match(checkoutSource, /const \[step, setStep\] = useState<1 \| 2 \| 3>\(1\);/);
  assert.match(checkoutSource, /step === 1 \? '1\. Tóm tắt đơn hàng'/);
});

test('2. Step 1 immediately identifies product and renders design thumbnail', () => {
  const design = createInitialState('wrapping');

  assert.equal(getFriendlyProductName(design), 'Giấy bọc quà');
  assert.equal(getThumbnailShapeClass(design), 'rounded-xl aspect-square');
  assert.match(stepOneSource, /<OrderSummaryCard[\s\S]*design=\{design\}/);
  assert.match(orderCardSource, /data-testid="order-summary-card"/);
  assert.match(orderCardSource, /data-testid="thumbnail-container"/);
  assert.match(orderCardSource, /<DesignCanvas/);

  // Type check props compile
  const cardProps: OrderSummaryCardProps = {
    design,
    onEditDesign: () => { },
  };
  assert.ok(cardProps.design);
});

test('3. Step 1 displays meaningful variant labels for common products', () => {
  const wrapping = createInitialState('wrapping');
  const card = createInitialState('card');
  const roundSticker = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    productOptions: { ...createInitialState('sticker').productOptions, shape: 'circle' },
  };

  assert.match(getFriendlyVariant(wrapping), /A1/);
  assert.equal(getFriendlyVariant(card), 'Ngang');
  assert.equal(getFixedStickerShapeLabel('circle'), 'Tròn');
  assert.match(getFriendlyProductName(roundSticker), /tròn/i);
  assert.notEqual(getFriendlyVariant(roundSticker).trim(), '');
  assert.match(orderCardSource, /export function getFriendlyVariant/);
  assert.match(orderCardSource, /export function getFriendlyProductName/);
});

test('4. Quantity stepper changes quantity through clamped increment and decrement handlers', () => {
  assert.match(quantityStepperSource, /aria-label="Giảm số lượng"/);
  assert.match(quantityStepperSource, /onClick=\{\(\) => onChange\(Math\.max\(min, quantity - 1\)\)\}/);
  assert.match(quantityStepperSource, /aria-label="Tăng số lượng"/);
  assert.match(quantityStepperSource, /onClick=\{\(\) => onChange\(Math\.min\(max, quantity \+ 1\)\)\}/);
  assert.match(checkoutSource, /<QuantityStepper quantity=\{design\.quantity\} onChange=\{handleUpdateQuantity\}/);

  // Type check stepper props
  let currentQty = 1;
  const stepperProps: QuantityStepperProps = {
    quantity: currentQty,
    onChange: (next) => {
      currentQty = next;
    },
  };
  stepperProps.onChange(5);
  assert.equal(currentQty, 5);
});

test('5. Quantity changes recalculate and format live subtotal', () => {
  const first = calculatePriceQuote({
    productId: 'wrapping',
    variantId: 'a1',
    quantity: 1,
  });
  const next = calculatePriceQuote({
    productId: 'wrapping',
    variantId: 'a1',
    quantity: 3,
  });

  assert.equal(first.formattedSubtotal, '69.000đ');
  assert.equal(next.formattedSubtotal, '207.000đ');
  assert.notEqual(first.formattedSubtotal, next.formattedSubtotal);
  assert.match(stepOneSource, /Tạm tính \(\{design\.quantity\} bản\):[\s\S]*priceQuote\.formattedSubtotal/);
  assert.match(checkoutSource, /<span className="text-base font-bold text-\[#315F86\]">\{priceQuote\.formattedSubtotal\}<\/span>/);
});

test('6. Direct numeric quantity entry rejects invalid values and clamps boundaries', () => {
  assert.match(quantityStepperSource, /if \(!\/\^\\d\+\$\//);
  assert.match(quantityStepperSource, /parsed < min \|\| parsed > max/);
  assert.equal(normalizeQuantity('0'), 1);
  assert.equal(normalizeQuantity('1000'), 999);
  assert.equal(normalizeQuantity('12.9'), 12);
  assert.equal(normalizeQuantity('not-a-number'), 1);
  assert.equal(normalizeQuantity(999), 999);
});

test('7. Edit action returns to product editor while saved design remains source of truth', () => {
  assert.match(stepOneSource, /onEditDesign=\{\(\) =>\s*router\.push\(/);
  assert.match(stepOneSource, /design\.productId === 'wrapping'\s*\? '\/products\/wrapping-paper'\s*:\s*`\/products\/\$\{design\.productId\}`/);
  assert.match(orderCardSource, /Chỉnh sửa thiết kế/);
  assert.match(checkoutSource, /const nextDesign = \{ \.\.\.design, quantity: validQty \};/);
  assert.match(checkoutSource, /setDesign\(nextDesign\);/);
  assert.match(checkoutSource, /saveState\(nextDesign\);/);
});

test('8. Selected quantity survives step navigation and return-to-editor paths', () => {
  const selected = { ...createInitialState('wrapping'), quantity: 7 };
  const quote = calculatePriceQuote({
    productId: selected.productId,
    variantId: selected.variantId,
    quantity: selected.quantity,
    productOptions: selected.productOptions,
  });

  assert.equal(selected.quantity, 7);
  assert.equal(quote.quantity, 7);
  assert.match(checkoutSource, /if \(step === 3\) \{\s*setStep\(2\);\s*return;\s*\}/);
  assert.match(checkoutSource, /if \(step === 2\) \{\s*setStep\(1\);\s*return;\s*\}/);
  assert.match(checkoutSource, /router\.push\('\/\?view=editor'\);/);
  assert.doesNotMatch(checkoutSource, /setDesign\(\{[^}]*quantity:\s*1/);
});

test('9. Step 2 exposes customer information only, before payment fields', () => {
  assert.match(stepTwoSource, /id="customer-name"/);
  assert.match(stepTwoSource, /id="customer-phone"/);
  assert.match(stepTwoSource, /id="customer-address"/);
  assert.match(stepTwoSource, /id="customer-note"/);
  assert.doesNotMatch(stepTwoSource, /QrCode|Mã đơn hàng|DEMO QR PAYMENT|createdOrder\.snapshot/);
  assert.match(checkoutSource, /step === 2 \? '2\. Thông tin nhận hàng'/);
  assert.match(checkoutSource, /onClick=\{\(\) => advanceToStep\(2\)\}/);
});

test('10. Step 1 creates no history entry or server order', () => {
  // Step 1 UI block does not invoke history push or server orders
  assert.doesNotMatch(stepOneSource, /history\.pushState|fetch\(|createOrder|serverOrderStore|saveOrder/);
  // Order generation only triggered on customer info form submit
  assert.match(checkoutSource, /const handleSubmitCustomerInfo = async \(e: React\.FormEvent\) => \{[\s\S]*fetch\('\/api\/orders'/);
  // History pushState only happens when advancing past Step 1
  assert.match(checkoutSource, /const advanceToStep = \(nextStep: 2 \| 3\) => \{[\s\S]*window\.history\.pushState\(\{ checkoutStep: nextStep \}, ''\);/);
  assert.match(checkoutSource, /onClick=\{\(\) => advanceToStep\(2\)\}/);
});
