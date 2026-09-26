import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCTS,
  createInitialState,
  getDesignSummary,
  getPreflight,
  getCompatibleTemplates,
  transitionState,
  type DesignState,
  type DesignAction,
} from '../lib/product-state.ts';

test('creates the default wrapping-paper design', () => {
  const state: DesignState = createInitialState();

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

test('filters templates compatible with selected product and variant', () => {
  // Card horizontal should get horizontal templates and generic templates, but NOT vertical templates or wrapping templates
  const cardHorizontal = getCompatibleTemplates({
    productId: 'card',
    variantId: 'horizontal',
  });
  const ids = cardHorizontal.map((t) => t.id);
  assert.ok(ids.includes('card-h-birthday'));
  assert.ok(ids.includes('card-h-cute'));
  assert.ok(ids.includes('card-h-love'));
  assert.ok(ids.includes('blank'));
  assert.ok(ids.includes('minimal'));
  assert.ok(!ids.includes('card-v-floral'));
  assert.ok(!ids.includes('wrapping-a1-cute'));

  // Category filter
  const cuteOnly = getCompatibleTemplates({
    productId: 'card',
    variantId: 'horizontal',
    category: 'cute',
  });
  assert.ok(cuteOnly.every((t) => t.template.category === 'cute'));

  // Search query filter
  const searched = getCompatibleTemplates({
    productId: 'card',
    variantId: 'horizontal',
    searchQuery: 'gấu',
  });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, 'card-h-cute');
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
      type: 'image/jpeg',
      size: 1024,
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

test('moves an unlocked element and ignores move on locked element', () => {
  const initial = createInitialState('wrapping');
  const withElements = transitionState(initial, {
    type: 'SET_ELEMENTS',
    value: [
      { id: 'img-1', type: 'image', x: 50, y: 50, width: 40, height: 40, rotation: 0, locked: false },
      { id: 'txt-1', type: 'text', x: 50, y: 80, width: 60, height: 20, rotation: 0, locked: true },
    ],
  });

  const moved = transitionState(withElements, {
    type: 'MOVE_ELEMENT',
    id: 'img-1',
    x: 65,
    y: 70,
  });
  assert.equal(moved.elements?.find((el) => el.id === 'img-1')?.x, 65);
  assert.equal(moved.elements?.find((el) => el.id === 'img-1')?.y, 70);

  // Locked element must not move
  const movedLocked = transitionState(moved, {
    type: 'MOVE_ELEMENT',
    id: 'txt-1',
    x: 99,
    y: 99,
  });
  assert.equal(movedLocked.elements?.find((el) => el.id === 'txt-1')?.x, 50);
});

test('resizes and rotates an element', () => {
  const initial = createInitialState('wrapping');
  const withElements = transitionState(initial, {
    type: 'SET_ELEMENTS',
    value: [
      { id: 'img-1', type: 'image', x: 50, y: 50, width: 40, height: 40, rotation: 0, locked: false },
    ],
  });

  const resized = transitionState(withElements, {
    type: 'RESIZE_ELEMENT',
    id: 'img-1',
    width: 60,
    height: 60,
    x: 55,
    y: 55,
  });
  assert.equal(resized.elements?.[0].width, 60);
  assert.equal(resized.elements?.[0].x, 55);

  const rotated = transitionState(resized, {
    type: 'ROTATE_ELEMENT',
    id: 'img-1',
    rotation: 45,
  });
  assert.equal(rotated.elements?.[0].rotation, 45);
});

test('adds and removes canvas elements with proper z-index', () => {
  const initial = createInitialState('card');
  const addedText = transitionState(initial, {
    type: 'ADD_CANVAS_ELEMENT',
    element: {
      id: 'text-node-1',
      type: 'text',
      x: 50,
      y: 50,
      width: 60,
      height: 20,
      rotation: 0,
      data: { text: 'Tiêu đề mới', color: '#315F86' },
    },
  });

  assert.equal(addedText.elements?.length, 1);
  assert.equal(addedText.elements?.[0].id, 'text-node-1');
  assert.equal(addedText.elements?.[0].zIndex, 1);
  assert.equal(addedText.text, 'Tiêu đề mới');

  const addedShape = transitionState(addedText, {
    type: 'ADD_CANVAS_ELEMENT',
    element: {
      id: 'shape-circle-1',
      type: 'shape',
      x: 52,
      y: 52,
      width: 40,
      height: 40,
      rotation: 0,
      data: { shapeType: 'circle', fill: '#DCEBF4' },
    },
  });

  assert.equal(addedShape.elements?.length, 2);
  assert.equal(addedShape.elements?.[1].zIndex, 2);

  const removed = transitionState(addedShape, {
    type: 'REMOVE_CANVAS_ELEMENT',
    id: 'text-node-1',
  });

  assert.equal(removed.elements?.length, 1);
  assert.equal(removed.elements?.[0].id, 'shape-circle-1');
});
