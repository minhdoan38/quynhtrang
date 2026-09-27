import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultCrop,
  calculateCoverDimensions,
  clampCropOffsets,
  applyCropPan,
  applyCropPinch,
  getCropTransformStyle,
} from '../lib/image-crop.ts';

test('createDefaultCrop returns fresh default crop with scale 1 and zero offsets', () => {
  const crop = createDefaultCrop();
  assert.equal(crop.scale, 1);
  assert.equal(crop.offsetX, 0);
  assert.equal(crop.offsetY, 0);
  assert.equal(crop.rotation, 0);
});

test('calculateCoverDimensions scales image to cover frame without gaps', () => {
  // Wide image inside square frame
  const wide = calculateCoverDimensions(200, 200, 400, 200);
  assert.equal(wide.width, 400);
  assert.equal(wide.height, 200);
  assert.equal(wide.baseScale, 1);

  // Tall image inside square frame
  const tall = calculateCoverDimensions(200, 200, 200, 400);
  assert.equal(tall.width, 200);
  assert.equal(tall.height, 400);
  assert.equal(tall.baseScale, 1);
});

test('clampCropOffsets restricts pan inside excess bounds', () => {
  // Frame 200x200, image 400x200 (excess width is 200, max pan is 100)
  const clamped = clampCropOffsets(
    { scale: 1, offsetX: 300, offsetY: 50 },
    200,
    200,
    400,
    200
  );
  assert.equal(clamped.offsetX, 100);
  assert.equal(clamped.offsetY, 0);
});

test('applyCropPan updates offset and clamps', () => {
  const initial = { scale: 2, offsetX: 0, offsetY: 0 };
  const panned = applyCropPan(initial, 30, -20, 200, 200, 200, 200);
  assert.equal(panned.offsetX, 30);
  assert.equal(panned.offsetY, -20);
});

test('applyCropPinch scales image and keeps scale within sensible bounds', () => {
  const initial = { scale: 1.5, offsetX: 0, offsetY: 0 };
  const zoomed = applyCropPinch(initial, 1.2, 200, 200, 200, 200);
  assert.ok((zoomed.scale ?? 0) > 1.7 && (zoomed.scale ?? 0) < 1.9);
  // Clamped at 5 max
  const maxZoomed = applyCropPinch({ scale: 4, offsetX: 0, offsetY: 0 }, 2, 200, 200, 200, 200);
  assert.equal(maxZoomed.scale, 5);

  // Clamped at 1 min
  const minZoomed = applyCropPinch({ scale: 1.1, offsetX: 0, offsetY: 0 }, 0.5, 200, 200, 200, 200);
  assert.equal(minZoomed.scale, 1);
});

test('getCropTransformStyle formats CSS transform string accurately', () => {
  const nullStyle = getCropTransformStyle(null);
  assert.equal(nullStyle.transform, 'translate3d(0px, 0px, 0px) scale(1)');

  const style = getCropTransformStyle({ scale: 1.5, offsetX: 20, offsetY: -10, rotation: 15 });
  assert.equal(style.transform, 'translate3d(20px, -10px, 0px) scale(1.5) rotate(15deg)');
  assert.equal(style.transformOrigin, 'center center');
});
