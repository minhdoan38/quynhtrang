import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCTS,
  TEMPLATES,
  createInitialState,
  normalizeWrappingOptions,
  transitionState,
  type CanvasElement,
  type PatternConfig,
} from '../lib/product-state.ts';

const DEFAULT_PATTERN: PatternConfig = {
  enabled: true,
  repeatMode: 'basic',
  scale: 100,
  spacingX: 0,
  spacingY: 0,
  rotation: 0,
  backgroundColor: '#ffffff',
};

test('wrapping state starts at A1 in pattern mode with valid pattern config', () => {
  const state = createInitialState('wrapping');

  assert.equal(state.variantId, 'a1');
  assert.equal(PRODUCTS.wrapping.defaultVariant, 'a1');
  assert.deepEqual(state.productOptions.mode, 'pattern');
  assert.deepEqual(state.productOptions.patternConfig, DEFAULT_PATTERN);
  assert.equal(PRODUCTS.wrapping.variants.find((variant) => variant.id === 'a1')?.price, 69000);
  assert.equal(PRODUCTS.wrapping.variants.find((variant) => variant.id === 'a2')?.price, 49000);
});

test('wrapping variant selection supports A1 and A2 without changing source elements', () => {
  const source: CanvasElement = { id: 'source-1', type: 'image', x: 10, y: 10, width: 20, height: 20, rotation: 0 };
  const initial = transitionState(createInitialState('wrapping'), { type: 'SET_ELEMENTS', value: [source] });
  const a2 = transitionState(initial, { type: 'SET_VARIANT', value: 'a2' });
  const a1 = transitionState(a2, { type: 'SET_VARIANT', value: 'a1' });

  assert.equal(a2.variantId, 'a2');
  assert.equal(a1.variantId, 'a1');
  assert.deepEqual(a2.elements, [source]);
  assert.deepEqual(a1.elements, [source]);
});

test('wrapping template applies canonical mode and pattern config without generating clones', () => {
  assert.equal(TEMPLATES.celebrate.productOptions.wrapping?.mode, 'pattern');
  const source: CanvasElement = { id: 'source-1', type: 'image', x: 10, y: 10, width: 20, height: 20, rotation: 0 };
  const initial = transitionState(createInitialState('wrapping'), { type: 'SET_ELEMENTS', value: [source] });
  const applied = transitionState(initial, { type: 'SET_TEMPLATE', value: 'celebrate' });

  assert.equal(applied.productOptions.mode, 'pattern');
  assert.deepEqual(applied.productOptions.patternConfig, {
    ...DEFAULT_PATTERN,
    repeatMode: 'half-brick',
    scale: 125,
  });
  assert.deepEqual(applied.elements, [source]);
});

test('mode and pattern config transitions stay immutable and do not create repeated elements', () => {
  const source: CanvasElement = { id: 'source-1', type: 'image', x: 10, y: 10, width: 20, height: 20, rotation: 0 };
  const initial = transitionState(createInitialState('wrapping'), { type: 'SET_ELEMENTS', value: [source] });
  const fullSheet = transitionState(initial, { type: 'SET_PRODUCT_OPTION', key: 'mode', value: 'full-sheet' });
  const updated = transitionState(fullSheet, {
    type: 'SET_PRODUCT_OPTION',
    key: 'patternConfig',
    value: { repeatMode: 'mirror', scale: 140 },
  });

  assert.equal(fullSheet.productOptions.mode, 'full-sheet');
  assert.equal(updated.productOptions.mode, 'full-sheet');
  assert.deepEqual(updated.productOptions.patternConfig, {
    ...DEFAULT_PATTERN,
    repeatMode: 'mirror',
    scale: 140,
  });
  assert.deepEqual(updated.elements, [source]);
  assert.notStrictEqual(updated.productOptions, initial.productOptions);
});

test('legacy wrapping options normalize into canonical pattern config while retaining legacy fields', () => {
  const legacy = normalizeWrappingOptions({
    mode: 'repeat',
    repeatStyle: 'brick',
    patternScale: 85,
    spacingX: 4,
    spacingY: 6,
    rotation: 12,
  });

  assert.equal(legacy.mode, 'pattern');
  assert.equal(legacy.patternConfig.repeatMode, 'half-brick');
  assert.equal(legacy.patternConfig.scale, 85);
  assert.equal(legacy.patternConfig.spacingX, 4);
  assert.equal(legacy.patternConfig.spacingY, 6);
  assert.equal(legacy.patternConfig.rotation, 12);
  assert.equal(legacy.repeatStyle, 'brick');
  assert.equal(legacy.patternScale, 85);
});
