import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getFixedStickerDimensions,
  type FixedStickerShape,
} from '../lib/product-state.ts';

const shapes: readonly FixedStickerShape[] = [
  'circle',
  'square',
  'rectangle',
  'oval',
  'rounded-rectangle',
];

test('getFixedStickerDimensions maps every supported shape to exact canvas geometry', () => {
  const expected: Record<FixedStickerShape, { aspectRatio: number; borderRadiusCss: string }> = {
    circle: { aspectRatio: 1, borderRadiusCss: '9999px' },
    square: { aspectRatio: 1, borderRadiusCss: '0px' },
    rectangle: { aspectRatio: 1.4, borderRadiusCss: '0px' },
    oval: { aspectRatio: 1.4, borderRadiusCss: '50%' },
    'rounded-rectangle': { aspectRatio: 1.4, borderRadiusCss: '16px' },
  };

  for (const shape of shapes) {
    const dimensions = getFixedStickerDimensions(shape);
    assert.equal(dimensions.aspectRatio, expected[shape].aspectRatio, `${shape} aspect ratio`);
    assert.equal(dimensions.borderRadiusCss, expected[shape].borderRadiusCss, `${shape} border radius`);
  }
});

test('fixed-shape canvas suppresses contour generation and die-cut overlays', () => {
  const canvasSource = readFileSync(
    resolve(process.cwd(), 'src/components/customizer/design-canvas.tsx'),
    'utf8'
  );
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx'),
    'utf8'
  );

  assert.ok(
    canvasSource.includes("const isFixedShapeSticker =\r\n    productId === 'sticker' &&\r\n    (variantId === 'fixed-shape' || Boolean(productOptions.shape));") ||
    canvasSource.includes("const isFixedShapeSticker =\n    productId === 'sticker' &&\n    (variantId === 'fixed-shape' || Boolean(productOptions.shape));")
  );
  assert.ok(
    canvasSource.includes("Boolean(productOptions.hasWhiteBorder) && !isFixedShapeSticker")
  );
  assert.ok(
    canvasSource.includes("Boolean(productOptions.showCutline) && !isFixedShapeSticker")
  );
  assert.ok(
    shellSource.includes("state.productId === 'sticker' && state.variantId !== 'fixed-shape' && !state.productOptions.shape")
  );
});
