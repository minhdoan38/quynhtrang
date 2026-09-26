import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFitScale,
  clampZoom,
  canOneFingerPan,
  applyPan,
  applyPinchZoom,
  resetToFit,
  type ViewportState,
} from '../lib/canvas-viewport.ts';

test('computeFitScale fits canvas comfortably within workspace with padding', () => {
  const workspace = { width: 400, height: 800 };
  const canvas = { width: 300, height: 600 };
  const scale = computeFitScale(workspace, canvas, 40);

  // Available width: 320, available height: 720.
  // 320 / 300 = 1.066, 720 / 600 = 1.2
  // scale should be clamped to min(scaleX, scaleY)
  assert.ok(scale > 0.9 && scale <= 1.1);
});

test('clampZoom respects minimum 0.6 and maximum 3.0 limits', () => {
  assert.equal(clampZoom(0.2), 0.6);
  assert.equal(clampZoom(5.0), 3.0);
  assert.equal(clampZoom(1.5), 1.5);
});

test('canOneFingerPan returns false when canvas fits viewport and zoom is 1.0', () => {
  const viewport: ViewportState = { zoom: 1.0, panX: 0, panY: 0, isFit: true };
  const workspace = { width: 400, height: 600 };
  const canvas = { width: 320, height: 480 };

  assert.equal(canOneFingerPan(viewport, workspace, canvas), false);
});

test('canOneFingerPan returns true when canvas is zoomed in beyond viewport', () => {
  const viewport: ViewportState = { zoom: 2.0, panX: 0, panY: 0, isFit: false };
  const workspace = { width: 400, height: 600 };
  const canvas = { width: 320, height: 480 };

  // 320 * 2 = 640 > 400
  assert.equal(canOneFingerPan(viewport, workspace, canvas), true);
});

test('applyPan does not pan when canOneFingerPan is false', () => {
  const initial: ViewportState = { zoom: 1.0, panX: 0, panY: 0, isFit: true };
  const next = applyPan(initial, 50, 50, false);
  assert.deepEqual(next, initial);
});

test('applyPan updates pan offset when canPan is true', () => {
  const initial: ViewportState = { zoom: 2.0, panX: 0, panY: 0, isFit: false };
  const next = applyPan(initial, 25, -10, true);
  assert.equal(next.panX, 25);
  assert.equal(next.panY, -10);
  assert.equal(next.isFit, false);
});

test('applyPinchZoom zooms around pinch distance ratio and clamps', () => {
  const initial: ViewportState = { zoom: 1.0, panX: 0, panY: 0, isFit: true };
  // Distance doubled: 100 -> 200
  const next = applyPinchZoom(initial, 100, 200, 10, 5);
  assert.equal(next.zoom, 2.0);
  assert.equal(next.panX, 10);
  assert.equal(next.panY, 5);
  assert.equal(next.isFit, false);
});

test('resetToFit restores clean initial fit state', () => {
  const fit = resetToFit();
  assert.equal(fit.zoom, 1.0);
  assert.equal(fit.panX, 0);
  assert.equal(fit.panY, 0);
  assert.equal(fit.isFit, true);
});
