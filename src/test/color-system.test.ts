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
