import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCombinedBounds,
  moveElements,
  scaleElementsUniform,
  rotateElementsAroundCenter,
  filterEditableSelection,
} from '../lib/multi-selection.ts';
import type { CanvasElement } from '../lib/product-state.ts';

test('computeCombinedBounds calculates correct bounding box for multiple elements', () => {
  const elements: CanvasElement[] = [
    { id: '1', type: 'image', x: 20, y: 30, width: 20, height: 20, rotation: 0 },
    { id: '2', type: 'text', x: 60, y: 70, width: 30, height: 10, rotation: 0 },
  ];
  const bounds = computeCombinedBounds(elements);
  assert.ok(bounds);
  assert.equal(bounds.minX, 10);
  assert.equal(bounds.minY, 20);
  assert.equal(bounds.maxX, 75);
  assert.equal(bounds.maxY, 75);
  assert.equal(bounds.width, 65);
  assert.equal(bounds.height, 55);
  assert.equal(bounds.centerX, 42.5);
  assert.equal(bounds.centerY, 47.5);
});

test('moveElements translates selected elements by delta', () => {
  const elements: CanvasElement[] = [
    { id: '1', type: 'image', x: 20, y: 30, width: 20, height: 20, rotation: 0 },
    { id: '2', type: 'text', x: 60, y: 70, width: 30, height: 10, rotation: 0 },
    { id: '3', type: 'sticker', x: 10, y: 10, width: 10, height: 10, rotation: 0 },
  ];
  const moved = moveElements(elements, ['1', '2'], 5, -10);
  assert.equal(moved.find((e) => e.id === '1')?.x, 25);
  assert.equal(moved.find((e) => e.id === '1')?.y, 20);
  assert.equal(moved.find((e) => e.id === '2')?.x, 65);
  assert.equal(moved.find((e) => e.id === '2')?.y, 60);
  assert.equal(moved.find((e) => e.id === '3')?.x, 10);
});

test('scaleElementsUniform scales element sizes and relative offsets from center', () => {
  const elements: CanvasElement[] = [
    { id: '1', type: 'image', x: 40, y: 50, width: 20, height: 20, rotation: 0 },
    { id: '2', type: 'image', x: 60, y: 50, width: 20, height: 20, rotation: 0 },
  ];
  const initialBounds = computeCombinedBounds(elements);
  assert.ok(initialBounds);
  // Center is (50, 50), span is 40 wide.
  const scaled = scaleElementsUniform(elements, ['1', '2'], initialBounds, 1.5);
  const el1 = scaled.find((e) => e.id === '1');
  const el2 = scaled.find((e) => e.id === '2');

  assert.equal(el1?.width, 30);
  assert.equal(el1?.height, 30);
  assert.equal(el1?.x, 35); // 50 + (40-50)*1.5 = 35

  assert.equal(el2?.width, 30);
  assert.equal(el2?.height, 30);
  assert.equal(el2?.x, 65); // 50 + (60-50)*1.5 = 65
});

test('rotateElementsAroundCenter orbits child centers around selection center and increments rotation', () => {
  const elements: CanvasElement[] = [
    { id: '1', type: 'image', x: 50, y: 40, width: 10, height: 10, rotation: 10 },
  ];
  // Center is at (50, 50), el1 is at (50, 40) (10 units up, angle -90 deg)
  // Rotating 90 deg clockwise should move el1 to (60, 50) and rotation to 100 deg
  const rotated = rotateElementsAroundCenter(elements, ['1'], { x: 50, y: 50 }, 90);
  const el1 = rotated.find((e) => e.id === '1');
  assert.ok(el1);
  assert.equal(Math.round(el1.x), 60);
  assert.equal(Math.round(el1.y), 50);
  assert.equal(Math.round(el1.rotation), 100);
});

test('filterEditableSelection filters out locked elements and non-matching surface', () => {
  const elements: CanvasElement[] = [
    { id: '1', type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'front' },
    { id: '2', type: 'text', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'front', locked: true },
    { id: '3', type: 'sticker', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'inside' },
  ];
  const valid = filterEditableSelection(elements, ['1', '2', '3'], 'front');
  assert.deepEqual(valid, ['1']);
});
