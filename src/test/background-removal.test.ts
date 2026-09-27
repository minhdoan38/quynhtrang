import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRefineSessionState,
  addBrushStroke,
  undoLastStroke,
  createNewStroke,
  appendPointToStroke,
} from '../lib/background-removal/mask-editor.ts';
import { BrowserBackgroundRemovalProvider } from '../lib/background-removal/provider.ts';
import {
  createInitialState,
  transitionState,
  getImageData,
} from '../lib/product-state.ts';

test('mask-editor: initial session state has correct defaults', () => {
  const session = createRefineSessionState(30);
  assert.equal(session.brushSize, 30);
  assert.equal(session.currentMode, 'erase');
  assert.equal(session.showOriginal, false);
  assert.equal(session.canUndo, false);
  assert.equal(session.strokes.length, 0);
});

test('mask-editor: addStroke and undoLastStroke manage stroke history immutably', () => {
  const session0 = createRefineSessionState();
  const stroke1 = createNewStroke('erase', 20, { x: 10, y: 10 });
  const stroke2 = createNewStroke('restore', 25, { x: 30, y: 40 });

  const session1 = addBrushStroke(session0, stroke1);
  assert.equal(session1.strokes.length, 1);
  assert.equal(session1.canUndo, true);

  const session2 = addBrushStroke(session1, stroke2);
  assert.equal(session2.strokes.length, 2);

  const sessionUndo1 = undoLastStroke(session2);
  assert.equal(sessionUndo1.strokes.length, 1);
  assert.equal(sessionUndo1.strokes[0].id, stroke1.id);
  assert.equal(sessionUndo1.canUndo, true);

  const sessionUndo2 = undoLastStroke(sessionUndo1);
  assert.equal(sessionUndo2.strokes.length, 0);
  assert.equal(sessionUndo2.canUndo, false);
});

test('mask-editor: stroke creation clamps brush size within 4-80 range', () => {
  const tinyStroke = createNewStroke('erase', 1, { x: 0, y: 0 });
  assert.equal(tinyStroke.size, 4);

  const hugeStroke = createNewStroke('restore', 150, { x: 0, y: 0 });
  assert.equal(hugeStroke.size, 80);

  const appended = appendPointToStroke(tinyStroke, { x: 5, y: 5 });
  assert.equal(appended.points.length, 2);
});

test('provider: BrowserBackgroundRemovalProvider fallback returns derived structure in test env', async () => {
  const provider = new BrowserBackgroundRemovalProvider();
  const result = await provider.removeBackground('data:image/png;base64,mock');
  assert.ok(result.derivedSrc);
  assert.ok(result.sourceDimensions);
  assert.equal(result.width, 800);
});

test('product-state: background removal lifecycle preserves layout, supports restore and refine', () => {
  const base = createInitialState('wrapping');
  const withImage = transitionState(base, {
    type: 'SET_IMAGE',
    value: { src: 'blob:sample.jpg', name: 'sample.jpg', width: 1000, height: 800 },
  });

  // Apply remove background
  const removed = transitionState(withImage, {
    type: 'APPLY_REMOVE_BACKGROUND',
    id: 'image-1',
    derivedSrc: 'data:image/png;base64,transparent_v1',
  });

  const removedEl = removed.elements?.find((el) => el.id === 'image-1');
  assert.ok(removedEl);
  assert.equal(getImageData(removedEl)?.src, 'data:image/png;base64,transparent_v1');
  assert.equal(getImageData(removedEl)?.originalSrc, 'blob:sample.jpg');
  assert.equal(getImageData(removedEl)?.removedBackgroundSrc, 'data:image/png;base64,transparent_v1');

  // Restore original image
  const restored = transitionState(removed, {
    type: 'RESTORE_ORIGINAL_IMAGE',
    id: 'image-1',
  });
  const restoredEl = restored.elements?.find((el) => el.id === 'image-1');
  assert.ok(restoredEl);
  assert.equal(getImageData(restoredEl)?.src, 'blob:sample.jpg');
  // originalSrc and removedBackgroundSrc preserved for future re-toggle
  assert.equal(getImageData(restoredEl)?.originalSrc, 'blob:sample.jpg');
  assert.equal(getImageData(restoredEl)?.removedBackgroundSrc, 'data:image/png;base64,transparent_v1');

  // Commit refined mask
  const refined = transitionState(removed, {
    type: 'COMMIT_REFINE_MASK',
    id: 'image-1',
    refinedSrc: 'data:image/png;base64,transparent_refined_v2',
    maskData: 'mask-data-string',
  });
  const refinedEl = refined.elements?.find((el) => el.id === 'image-1');
  assert.ok(refinedEl);
  assert.equal(getImageData(refinedEl)?.src, 'data:image/png;base64,transparent_refined_v2');
  assert.equal(getImageData(refinedEl)?.originalSrc, 'blob:sample.jpg');
  assert.equal(getImageData(refinedEl)?.refineMaskData, 'mask-data-string');
});
