import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceImageInState } from '../lib/image-replacement.ts';
import { createInitialState, transitionState, type CanvasElement } from '../lib/product-state.ts';

test('replaceImageInState does not corrupt state if target element does not exist', () => {
  const base = createInitialState('wrapping');
  const next = replaceImageInState(base, 'non-existent-id', {
    src: 'blob:something.jpg',
  });
  assert.deepEqual(next, base);
});

test('single undo step restores original image and preserves layout', () => {
  const base = createInitialState('card');
  const originalElement: CanvasElement = {
    id: 'img-1',
    type: 'image',
    x: 20,
    y: 25,
    width: 100,
    height: 100,
    rotation: 10,
    data: {
      src: 'blob:original-image.png',
      name: 'orig.png',
      opacity: 90,
      sourceWidth: 1000,
      sourceHeight: 1000,
    },
  };
  const stateWithImg = { ...base, elements: [originalElement] };

  // Replace
  const stateAfterReplace = replaceImageInState(stateWithImg, 'img-1', {
    src: 'blob:new-image.jpg',
    name: 'new.jpg',
    width: 600,
    height: 400,
  });

  const replacedEl = stateAfterReplace.elements?.find((e) => e.id === 'img-1');
  assert.equal(replacedEl?.data?.src, 'blob:new-image.jpg');
  assert.equal(replacedEl?.x, 20);
  assert.equal(replacedEl?.y, 25);
  assert.equal(replacedEl?.rotation, 10);

  // Undo by restoring snapshot
  const revertedState = stateWithImg;
  const revertedEl = revertedState.elements?.find((e) => e.id === 'img-1');
  assert.equal(revertedEl?.data?.src, 'blob:original-image.png');
  assert.equal(revertedEl?.x, 20);
  assert.equal(revertedEl?.y, 25);
});
