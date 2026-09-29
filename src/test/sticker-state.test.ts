import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCTS,
  createInitialState,
  type StickerOptions,
} from '../lib/product-state.ts';

test("createInitialState('sticker') initializes sticker defaults", () => {
  const state = createInitialState('sticker');
  const options = state.productOptions as StickerOptions;

  assert.equal(state.productId, 'sticker');
  assert.equal(state.variantId, 'die-cut');
  assert.equal(options.borderWidth, 2);
  assert.equal(options.hasWhiteBorder, true);
  assert.equal(options.showCutline, false);
});

test('PRODUCTS.sticker.defaultOptions contains physical limits and defaults', () => {
  const defaults = PRODUCTS.sticker.defaultOptions as StickerOptions;

  assert.equal(defaults.borderWidth, 2);
  assert.equal(defaults.minBorderWidth, 0);
  assert.equal(defaults.maxBorderWidth, 6);
  assert.equal(defaults.hasWhiteBorder, true);
  assert.equal(defaults.showCutline, false);
});
