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

test('applies template content and product-specific options', () => {
  const initial = createInitialState('wrapping');
  const celebrated = transitionState(initial, {
    type: 'SET_TEMPLATE',
    value: 'celebrate',
  });

  assert.equal(celebrated.templateId, 'celebrate');
  assert.equal(celebrated.text, 'Chúc mừng!');
  assert.equal(celebrated.color, '#7c2d12');
  assert.equal(celebrated.backgroundColor, '#fef3c7');
  assert.equal(celebrated.productOptions.repeatStyle, 'brick');
  assert.equal(celebrated.productOptions.patternScale, 125);

  const blank = transitionState(celebrated, {
    type: 'SET_TEMPLATE',
    value: 'blank',
  });
  assert.equal(blank.templateId, 'blank');
  assert.equal(blank.text, '');
  assert.equal(blank.backgroundColor, '#ffffff');
  assert.equal(blank.productOptions.repeatStyle, 'regular');
});

test('clamps quantity within bounds 1-999 and ignores invalid input', () => {
  const state = createInitialState();
  const clampedHigh = transitionState(state, { type: 'SET_QUANTITY', value: 5000 });
  assert.equal(clampedHigh.quantity, 999);

  const clampedLow = transitionState(state, { type: 'SET_QUANTITY', value: -4 });
  assert.equal(clampedLow.quantity, 1);

  const clampedZero = transitionState(state, { type: 'SET_QUANTITY', value: 0 });
  assert.equal(clampedZero.quantity, 1);

  const clampedString = transitionState(state, { type: 'SET_QUANTITY', value: '42' });
  assert.equal(clampedString.quantity, 42);

  const unchangedInvalid = transitionState(clampedString, { type: 'SET_QUANTITY', value: 'invalid' });
  assert.equal(unchangedInvalid.quantity, 42);
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
