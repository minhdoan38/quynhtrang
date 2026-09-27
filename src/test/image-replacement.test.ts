import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCoverCrop, replaceImageInState } from '../lib/image-replacement.ts';
import { createInitialState, type CanvasElement } from '../lib/product-state.ts';

test('calculateCoverCrop computes centered crop for portrait image in landscape frame', () => {
  const crop = calculateCoverCrop({
    frameWidth: 200,
    frameHeight: 100, // 2:1 landscape
    imageWidth: 100,
    imageHeight: 200, // 1:2 portrait
  });
  assert.equal(crop.width, 100);
  assert.equal(crop.height, 50);
  assert.equal(crop.x, 0);
  assert.equal(crop.y, 75); // Centered vertically
});

test('calculateCoverCrop computes centered crop for landscape image in square frame', () => {
  const crop = calculateCoverCrop({
    frameWidth: 100,
    frameHeight: 100,
    imageWidth: 200,
    imageHeight: 100,
  });
  assert.equal(crop.width, 100);
  assert.equal(crop.height, 100);
  assert.equal(crop.x, 50); // Centered horizontally
  assert.equal(crop.y, 0);
});

test('replaceImageInState preserves layout, mask, rotation, and resets background removal', () => {
  const base = createInitialState('card');
  const existingElement: CanvasElement = {
    id: 'image-target',
    type: 'image',
    x: 40,
    y: 30,
    width: 120,
    height: 80,
    rotation: 25,
    locked: false,
    zIndex: 3,
    data: {
      src: 'blob:old-processed.png',
      originalSrc: 'blob:old-original.jpg',
      removedBackgroundSrc: 'blob:old-processed.png',
      name: 'old.jpg',
      opacity: 80,
      mask: 'circle',
      sourceWidth: 800,
      sourceHeight: 600,
    },
  };
  const stateWithImage = { ...base, elements: [existingElement] };

  const nextState = replaceImageInState(stateWithImage, 'image-target', {
    id: 'asset-new-1',
    src: 'blob:new-raw.jpg',
    name: 'portrait.jpg',
    width: 600,
    height: 1200,
  });

  const replacedEl = nextState.elements?.find((el) => el.id === 'image-target')!;
  assert.ok(replacedEl);
  // Preserved properties
  assert.equal(replacedEl.id, 'image-target');
  assert.equal(replacedEl.x, 40);
  assert.equal(replacedEl.y, 30);
  assert.equal(replacedEl.width, 120);
  assert.equal(replacedEl.height, 80);
  assert.equal(replacedEl.rotation, 25);
  assert.equal(replacedEl.zIndex, 3);
  assert.equal(replacedEl.data?.mask, 'circle');
  assert.equal(replacedEl.data?.opacity, 80);

  // Replaced & Reset properties
  assert.equal(replacedEl.data?.src, 'blob:new-raw.jpg');
  assert.equal(replacedEl.data?.originalSrc, 'blob:new-raw.jpg');
  assert.equal(replacedEl.data?.removedBackgroundSrc, undefined);
  assert.equal(replacedEl.data?.sourceWidth, 600);
  assert.equal(replacedEl.data?.sourceHeight, 1200);
  assert.ok(replacedEl.data?.crop);
});
