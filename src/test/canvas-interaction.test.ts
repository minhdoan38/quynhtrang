import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTapGesture,
  resolveTopMostElement,
  computeAspectResize,
  computeRotationAngle,
  isDoubleTap,
  type ElementBounds,
  type TransformHandle,
} from '../lib/canvas-interaction.ts';

test('isTapGesture returns true when movement is below threshold', () => {
  assert.equal(isTapGesture(100, 100, 103, 104, 6), true);
  assert.equal(isTapGesture(100, 100, 107, 100, 6), false);
  assert.equal(isTapGesture(100, 100, 100, 108, 6), false);
});

test('resolveTopMostElement picks highest zIndex element containing pointer', () => {
  const elements = [
    { id: 'bg', zIndex: 0, x: 0, y: 0, width: 200, height: 200 },
    { id: 'img-1', zIndex: 1, x: 50, y: 50, width: 100, height: 100 },
    { id: 'txt-1', zIndex: 2, x: 80, y: 80, width: 60, height: 40 },
  ];

  // At (90, 90), all 3 elements overlap; highest zIndex txt-1 (zIndex 2) must win
  const hit = resolveTopMostElement(90, 90, elements);
  assert.equal(hit?.id, 'txt-1');

  // At (60, 60), only bg and img-1 overlap; img-1 (zIndex 1) must win
  const hitImg = resolveTopMostElement(60, 60, elements);
  assert.equal(hitImg?.id, 'img-1');

  // At (250, 250), outside all elements
  const hitNone = resolveTopMostElement(250, 250, elements);
  assert.equal(hitNone, null);
});

test('computeAspectResize preserves original aspect ratio for corner handles', () => {
  const initial: ElementBounds = {
    x: 100,
    y: 100,
    width: 100,
    height: 100, // 1:1 aspect ratio
  };

  // Drag southeast handle outward by dx=50, dy=20
  // With aspect ratio locked, new dimensions must remain square
  const resizedSE = computeAspectResize(initial, 'se', 50, 20, true);
  assert.equal(resizedSE.width, resizedSE.height);
  assert.ok(resizedSE.width > 100);

  // Drag northwest handle inward
  const resizedNW = computeAspectResize(initial, 'nw', 30, 30, true);
  assert.equal(resizedNW.width, resizedNW.height);
  assert.ok(resizedNW.width < 100);
});

test('computeRotationAngle calculates angle in degrees', () => {
  const center = { x: 100, y: 100 };
  // Handle directly above center (0 deg or 90 deg reference)
  // At (100, 50), dx=0, dy=-50 -> -90 deg -> 0 or 270 standard
  const angleRight = computeRotationAngle(center.x, center.y, 150, 100);
  assert.equal(angleRight, 90);

  const angleDown = computeRotationAngle(center.x, center.y, 100, 150);
  assert.equal(angleDown, 180);

  const angleLeft = computeRotationAngle(center.x, center.y, 50, 100);
  assert.equal(angleLeft, 270);
});

test('isDoubleTap returns true when consecutive taps are within time and distance', () => {
  const firstTap = { time: 1000, x: 50, y: 50 };
  const quickTap = { time: 1200, x: 52, y: 53 };
  assert.equal(isDoubleTap(firstTap, quickTap, 300, 10), true);

  // Slow tap (> 300ms)
  const slowTap = { time: 1400, x: 52, y: 53 };
  assert.equal(isDoubleTap(firstTap, slowTap, 300, 10), false);

  // Far tap (> 10px)
  const farTap = { time: 1150, x: 90, y: 90 };
  assert.equal(isDoubleTap(firstTap, farTap, 300, 10), false);
});
