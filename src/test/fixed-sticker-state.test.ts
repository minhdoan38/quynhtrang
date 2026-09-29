import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXED_STICKER_SHAPES,
  getFixedStickerShapeLabel,
  getFixedStickerDimensions,
  type FixedStickerShape,
  type StickerOptions,
} from '../lib/product-state.ts';

test('FIXED_STICKER_SHAPES contains exactly five supported shapes in order', () => {
  assert.equal(FIXED_STICKER_SHAPES.length, 5);
  assert.deepEqual(FIXED_STICKER_SHAPES, [
    'circle',
    'square',
    'rectangle',
    'oval',
    'rounded-rectangle',
  ]);
});

test('getFixedStickerShapeLabel returns exact Vietnamese labels for all shapes', () => {
  const expectedLabels: Record<FixedStickerShape, string> = {
    circle: 'Tròn',
    square: 'Vuông',
    rectangle: 'Chữ nhật',
    oval: 'Oval',
    'rounded-rectangle': 'Bo góc',
  };

  for (const shape of FIXED_STICKER_SHAPES) {
    assert.equal(getFixedStickerShapeLabel(shape), expectedLabels[shape]);
  }
});

test('getFixedStickerDimensions returns exact physical geometry for all shapes', () => {
  assert.deepEqual(getFixedStickerDimensions('circle'), {
    width: 50,
    height: 50,
    aspectRatio: 1,
    borderRadiusCss: '9999px',
  });

  assert.deepEqual(getFixedStickerDimensions('square'), {
    width: 50,
    height: 50,
    aspectRatio: 1,
    borderRadiusCss: '0px',
  });

  assert.deepEqual(getFixedStickerDimensions('rectangle'), {
    width: 70,
    height: 50,
    aspectRatio: 1.4,
    borderRadiusCss: '0px',
  });

  assert.deepEqual(getFixedStickerDimensions('oval'), {
    width: 70,
    height: 50,
    aspectRatio: 1.4,
    borderRadiusCss: '50%',
    isEllipse: true,
  });

  assert.deepEqual(getFixedStickerDimensions('rounded-rectangle'), {
    width: 70,
    height: 50,
    aspectRatio: 1.4,
    borderRadiusCss: '16px',
  });
});

test('StickerOptions supports optional shape assignment', () => {
  const options: StickerOptions = {
    borderWidth: 2,
    hasWhiteBorder: true,
    shape: 'rounded-rectangle',
  };

  assert.equal(options.shape, 'rounded-rectangle');
});
