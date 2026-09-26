import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCTS,
  createInitialState,
  getDesignSummary,
  getPreflight,
  transitionState,
} from './product-state.js';

test('creates the default wrapping-paper design', () => {
  const state = createInitialState();

  assert.equal(state.productId, 'wrapping');
  assert.equal(state.variantId, 'a1');
  assert.equal(state.templateId, null);
  assert.deepEqual(state.productOptions, {
    mode: 'repeat',
    repeatStyle: 'regular',
    patternScale: 100,
    spacingX: 0,
    spacingY: 0,
    rotation: 0,
  });
  assert.equal(PRODUCTS.wrapping.name, 'Giấy gói quà');
  assert.doesNotThrow(() => JSON.stringify(state));
});

test('switches products without mutating the previous design', () => {
  const wrapping = transitionState(createInitialState(), {
    type: 'SET_TEXT',
    value: 'Chúc mừng sinh nhật',
  });
  const card = transitionState(wrapping, {
    type: 'SET_PRODUCT',
    value: 'card',
  });

  assert.notStrictEqual(card, wrapping);
  assert.equal(wrapping.productId, 'wrapping');
  assert.equal(card.productId, 'card');
  assert.equal(card.variantId, 'horizontal');
  assert.equal(card.text, 'Chúc mừng sinh nhật');
  assert.deepEqual(card.productOptions, { surface: 'front' });
});

test('updates wrapping pattern controls immutably', () => {
  const original = createInitialState();
  const updated = transitionState(original, {
    type: 'SET_PRODUCT_OPTION',
    key: 'repeatStyle',
    value: 'brick',
  });

  assert.notStrictEqual(updated, original);
  assert.notStrictEqual(updated.productOptions, original.productOptions);
  assert.equal(updated.productOptions.repeatStyle, 'brick');
  assert.equal(original.productOptions.repeatStyle, 'regular');
});

test('derives a Vietnamese order summary and price estimate', () => {
  const state = transitionState(createInitialState('notebook'), {
    type: 'SET_QUANTITY',
    value: 3,
  });

  assert.deepEqual(getDesignSummary(state), {
    product: 'Bìa sổ tay',
    variant: 'Tiêu chuẩn',
    quantity: 3,
    unitPrice: 49000,
    totalPrice: 147000,
    priceLabel: '147.000 ₫',
  });
});

test('warns when an uploaded image may print blurry', () => {
  const state = transitionState(createInitialState(), {
    type: 'SET_IMAGE',
    value: {
      name: 'anh-nho.jpg',
      src: 'blob:anh-nho',
      width: 640,
      height: 480,
    },
  });
  const preflight = getPreflight(state);

  assert.equal(preflight.level, 'warning');
  assert.deepEqual(
    preflight.checks.find((check) => check.id === 'image-quality'),
    {
      id: 'image-quality',
      level: 'warning',
      label: 'Ảnh có thể hơi mờ khi in',
    },
  );
});
