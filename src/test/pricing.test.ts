import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculatePriceQuote,
  formatCurrencyVND,
  type PriceQuote,
} from '../lib/pricing.ts';

test('formatCurrencyVND formats numbers with dot separator and đ suffix', () => {
  assert.equal(formatCurrencyVND(0), '0đ');
  assert.equal(formatCurrencyVND(49000), '49.000đ');
  assert.equal(formatCurrencyVND(120000), '120.000đ');
  assert.equal(formatCurrencyVND(1000000), '1.000.000đ');
  assert.equal(formatCurrencyVND(200000), '200.000đ');
  assert.equal(formatCurrencyVND(1500000), '1.500.000đ');
});

test('calculatePriceQuote computes quote for each product type with defaults', () => {
  const products = [
    { productId: 'wrapping', expectedUnit: 49000 },
    { productId: 'card', expectedUnit: 29000 },
    { productId: 'sticker', expectedUnit: 19000 },
    { productId: 'notebook', expectedUnit: 49000 },
  ];

  for (const { productId, expectedUnit } of products) {
    const quote = calculatePriceQuote({ productId, quantity: 2 });
    assert.equal(quote.productId, productId);
    assert.equal(quote.quantity, 2);
    assert.equal(quote.unitPrice, expectedUnit);
    assert.equal(quote.subtotal, expectedUnit * 2);
    assert.equal(quote.formattedUnitPrice, formatCurrencyVND(expectedUnit));
    assert.equal(quote.formattedSubtotal, formatCurrencyVND(expectedUnit * 2));
  }
});

test('calculatePriceQuote resolves matched variant price', () => {
  const quote = calculatePriceQuote({
    productId: 'wrapping',
    variantId: 'a1',
    quantity: 3,
  });

  assert.equal(quote.variantId, 'a1');
  assert.equal(quote.unitPrice, 69000);
  assert.equal(quote.subtotal, 207000);
  assert.equal(quote.formattedUnitPrice, '69.000đ');
  assert.equal(quote.formattedSubtotal, '207.000đ');
});

test('calculatePriceQuote clamps quantity within [1, 999] and handles invalid inputs', () => {
  const zeroQuote = calculatePriceQuote({ productId: 'card', quantity: 0 });
  assert.equal(zeroQuote.quantity, 1);

  const negativeQuote = calculatePriceQuote({ productId: 'card', quantity: -5 });
  assert.equal(negativeQuote.quantity, 1);

  const overflowQuote = calculatePriceQuote({ productId: 'card', quantity: 1500 });
  assert.equal(overflowQuote.quantity, 999);

  const nanQuote = calculatePriceQuote({ productId: 'card', quantity: Number.NaN });
  assert.equal(nanQuote.quantity, 1);

  const floatQuote = calculatePriceQuote({ productId: 'card', quantity: 4.8 });
  assert.equal(floatQuote.quantity, 4);
});

test('calculatePriceQuote preserves subtotal invariant and fallback for unknown product', () => {
  const unknownQuote: PriceQuote = calculatePriceQuote({
    productId: 'custom-gift',
    quantity: 5,
  });

  assert.equal(unknownQuote.unitPrice, 29000);
  assert.equal(unknownQuote.subtotal, 145000);
  assert.equal(unknownQuote.formattedSubtotal, '145.000đ');
  assert.equal(unknownQuote.subtotal, unknownQuote.unitPrice * unknownQuote.quantity);
});
