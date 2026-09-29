import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { createInitialState } from '../lib/product-state.ts';
import { calculatePriceQuote } from '../lib/pricing.ts';

const checkoutSource = readFileSync(
  resolve(process.cwd(), 'src/app/checkout/page.tsx'),
  'utf8',
);

test('Step 1 renders summary card, quantity stepper, and current price quote', () => {
  assert.match(checkoutSource, /import \{ OrderSummaryCard \} from ['"]@\/components\/checkout\/order-summary-card['"]/);
  assert.match(checkoutSource, /import \{ QuantityStepper \} from ['"]@\/components\/checkout\/quantity-stepper['"]/);
  assert.match(checkoutSource, /import \{ calculatePriceQuote \} from ['"]@\/lib\/pricing['"]/);
  assert.match(checkoutSource, /const priceQuote = calculatePriceQuote\(\{[\s\S]*?productId: design\.productId,[\s\S]*?variantId: design\.variantId,[\s\S]*?quantity: design\.quantity,[\s\S]*?productOptions: design\.productOptions,[\s\S]*?\}\);/);
  assert.match(checkoutSource, /<OrderSummaryCard[\s\S]*?design=\{design\}/);
  assert.match(checkoutSource, /<QuantityStepper quantity=\{design\.quantity\} onChange=\{handleUpdateQuantity\}/);
  assert.match(checkoutSource, /priceQuote\.formattedSubtotal/);
  assert.match(checkoutSource, /priceQuote\.formattedUnitPrice/);
});

test('updating quantity recalculates subtotal from current design quantity', () => {
  const design = { ...createInitialState('wrapping'), quantity: 1 };
  const firstQuote = calculatePriceQuote({
    productId: design.productId,
    variantId: design.variantId,
    quantity: design.quantity,
    productOptions: design.productOptions,
  });
  const updatedDesign = { ...design, quantity: 3 };
  const updatedQuote = calculatePriceQuote({
    productId: updatedDesign.productId,
    variantId: updatedDesign.variantId,
    quantity: updatedDesign.quantity,
    productOptions: updatedDesign.productOptions,
  });

  assert.notEqual(firstQuote.formattedSubtotal, updatedQuote.formattedSubtotal);
  assert.match(checkoutSource, /const nextDesign = \{ \.\.\.design, quantity: validQty \};/);
  assert.match(checkoutSource, /setDesign\(nextDesign\);/);
  assert.match(checkoutSource, /quantity: design\.quantity,[\s\S]*?\}\);/);
  assert.match(checkoutSource, /Tạm tính \(\{design\.quantity\} bản\):[\s\S]*?priceQuote\.formattedSubtotal/);
});

test('Step 1 continue action advances to Step 2', () => {
  assert.match(checkoutSource, /onClick=\{\(\) => advanceToStep\(2\)\}/);
  assert.match(checkoutSource, /<span>Tiếp tục<\/span>/);
});

test('Step 1 header back button uses Đơn hàng copy', () => {
  assert.match(checkoutSource, /step === 1 \? 'Đơn hàng' : 'Quay lại'/);
});
