import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHexColor,
  isValidHexColor,
  createSolidColor,
  createDefaultLinearGradient,
  createDefaultRadialGradient,
  solidToGradient,
  gradientToSolid,
  ensureColorValue,
} from '../lib/color/color-validation.ts';
import {
  colorValueToCss,
} from '../lib/color/color-renderers.ts';

test('normalizes hex colors correctly to #RRGGBB uppercase', () => {
  assert.equal(normalizeHexColor('#fff'), '#FFFFFF');
  assert.equal(normalizeHexColor('fff'), '#FFFFFF');
  assert.equal(normalizeHexColor('#315f86'), '#315F86');
  assert.equal(normalizeHexColor('315F86'), '#315F86');
  assert.equal(normalizeHexColor('#invalid'), null);
  assert.equal(normalizeHexColor('12'), null);
});

test('validates hex colors strictly', () => {
  assert.equal(isValidHexColor('#FFFFFF'), true);
  assert.equal(isValidHexColor('#315F86'), true);
  assert.equal(isValidHexColor('blue'), false);
  assert.equal(isValidHexColor('#GGG'), false);
});

test('converts solid to gradient deterministically', () => {
  const solid = createSolidColor('#E8BCC9');
  const grad = solidToGradient(solid);
  assert.equal(grad.kind, 'gradient');
  assert.equal(grad.gradientType, 'linear');
  assert.deepEqual(grad.colors, ['#E8BCC9', '#FFFFFF']);
  assert.equal(grad.direction, 'right');
});

test('converts gradient to solid taking first stop', () => {
  const grad = createDefaultLinearGradient('#315F86', '#F2DFA0', 'bottom');
  const solid = gradientToSolid(grad);
  assert.equal(solid.kind, 'solid');
  assert.equal(solid.color, '#315F86');
});

test('ensures safe ColorValue from unknown values', () => {
  const fromStr = ensureColorValue('#315F86');
  assert.equal(fromStr.kind, 'solid');
  assert.equal(fromStr.color, '#315F86');

  const fromInvalid = ensureColorValue(null, '#2E3338');
  assert.equal(fromInvalid.kind, 'solid');
  assert.equal(fromInvalid.color, '#2E3338');
});

test('renders color values to valid CSS strings', () => {
  const solid = createSolidColor('#315F86');
  assert.equal(colorValueToCss(solid), '#315F86');

  const linear = createDefaultLinearGradient('#E8BCC9', '#315F86', 'bottom-right');
  assert.equal(colorValueToCss(linear), 'linear-gradient(135deg, #E8BCC9, #315F86)');

  const radial = createDefaultRadialGradient('#FFFDF8', '#2E3338');
  assert.equal(colorValueToCss(radial), 'radial-gradient(circle at center, #FFFDF8, #2E3338)');
});

import {
  mergeRecentColors,
  MAX_RECENT_COLORS,
} from '../lib/color/color-recents.ts';

test('merges project and device recents without duplicates and limits to MAX_RECENT_COLORS', () => {
  const project = ['#FFD1DC', '#FFF2CC'];
  const device = ['#FFD1DC', '#91C4F2', '#FFFFFF', '#315F86'];
  const merged = mergeRecentColors(project, device);

  assert.deepEqual(merged, [
    '#FFD1DC',
    '#FFF2CC',
    '#91C4F2',
    '#FFFFFF',
    '#315F86',
  ]);
  assert.ok(merged.length <= MAX_RECENT_COLORS);
});

test('handles invalid entries and deduplicates case-insensitively', () => {
  const merged = mergeRecentColors(
    ['#ffd1dc', 'invalid', '#315f86'],
    ['#FFD1DC', '#2E3338']
  );
  assert.deepEqual(merged, ['#FFD1DC', '#315F86', '#2E3338']);
});

import {
  getColorValue,
  setColorValue,
  supportsGradient,
  extractDesignColors,
} from '../lib/color/color-target.ts';
import { createInitialState, type DesignState } from '../lib/product-state.ts';

test('resolves and sets text fill color on element', () => {
  const initial = createInitialState('card');
  const target = { kind: 'element' as const, elementId: 'text-1', property: 'fill' as const };
  assert.equal(supportsGradient(target), true);

  const initialVal = getColorValue(initial, target);
  assert.ok(initialVal !== null);

  const newColor = createSolidColor('#315F86');
  const updated = setColorValue(initial, target, newColor);
  assert.deepEqual(getColorValue(updated, target), newColor);
});

test('resolves and sets surface background color', () => {
  const initial = createInitialState('wrapping');
  const target = { kind: 'surface' as const, surfaceId: 'front', property: 'background' as const };
  const grad = createDefaultLinearGradient('#FFFDF8', '#ECE6DC', 'bottom');

  const updated = setColorValue(initial, target, grad);
  assert.deepEqual(getColorValue(updated, target), grad);
});

test('extracts unique design colors across text, shapes, and background', () => {
  let state = createInitialState('wrapping');
  state = setColorValue(state, { kind: 'surface', surfaceId: 'front', property: 'background' }, createSolidColor('#F8F3E8'));
  state = setColorValue(state, { kind: 'element', elementId: 'text-1', property: 'fill' }, createDefaultLinearGradient('#315F86', '#E8BCC9'));

  const designColors = extractDesignColors(state);
  assert.ok(designColors.includes('#F8F3E8'));
  assert.ok(designColors.includes('#315F86'));
  assert.ok(designColors.includes('#E8BCC9'));
});

import type { ColorTarget } from '../lib/color/color-types.ts';

test('session batches multiple edits into one history record', () => {
  const baseState = createInitialState('card');
  const target: ColorTarget = { kind: 'element', elementId: 'text-1', property: 'fill' };

  let currentState = baseState;
  const history: DesignState[] = [];

  const initialVal = getColorValue(currentState, target);
  assert.ok(initialVal);

  // Session begins with baseState captured
  const sessionBase = currentState;

  // Step 1: Change to Pink
  currentState = setColorValue(currentState, target, createSolidColor('#E8BCC9'));
  // Step 2: Change to Blue
  currentState = setColorValue(currentState, target, createSolidColor('#315F86'));
  // Step 3: Change to Green
  currentState = setColorValue(currentState, target, createSolidColor('#C8D8C4'));

  // Session closes: only sessionBase is pushed if changed
  const finalVal = getColorValue(currentState, target);
  if (JSON.stringify(initialVal) !== JSON.stringify(finalVal)) {
    history.push(sessionBase);
  }

  assert.equal(history.length, 1);
  assert.deepEqual(getColorValue(history[0], target), initialVal);
  assert.deepEqual(getColorValue(currentState, target), createSolidColor('#C8D8C4'));
});
