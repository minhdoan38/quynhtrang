import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MASK_PRESETS,
  getMaskPreset,
  getMaskStyle,
} from '../lib/image-mask.ts';

test('MASK_PRESETS contains standard 6 presets including heart and none', () => {
  const ids = MASK_PRESETS.map((p) => p.id);
  assert.ok(ids.includes('none'));
  assert.ok(ids.includes('rectangle'));
  assert.ok(ids.includes('circle'));
  assert.ok(ids.includes('oval'));
  assert.ok(ids.includes('rounded'));
  assert.ok(ids.includes('heart'));
  assert.equal(MASK_PRESETS.length, 6);
});

test('getMaskPreset falls back to none for undefined or invalid mask', () => {
  assert.equal(getMaskPreset(undefined).id, 'none');
  assert.equal(getMaskPreset(null).id, 'none');
  assert.equal(getMaskPreset('invalid-mask').id, 'none');
  assert.equal(getMaskPreset('circle').id, 'circle');
});

test('getMaskStyle returns correct CSS clipPath and borderRadius', () => {
  const noneStyle = getMaskStyle('none');
  assert.deepEqual(noneStyle, {});

  const circleStyle = getMaskStyle('circle');
  assert.equal(circleStyle.clipPath, 'circle(50% at 50% 50%)');
  assert.equal(circleStyle.borderRadius, '9999px');

  const heartStyle = getMaskStyle('heart');
  assert.equal(heartStyle.clipPath, 'url(#mask-heart)');

  const roundedStyle = getMaskStyle('rounded');
  assert.equal(roundedStyle.borderRadius, '16px');
});
