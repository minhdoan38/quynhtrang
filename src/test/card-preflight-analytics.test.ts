import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createInitialState,
  getPreflight,
  isElementCrossingCardFold,
  type CanvasElement,
} from '../lib/product-state.ts';

test('isElementCrossingCardFold: returns false if element is not on inside surface', () => {
  const frontElement: CanvasElement = {
    id: 'front-1',
    type: 'text',
    x: 140,
    y: 10,
    width: 20,
    height: 10,
    rotation: 0,
    surface: 'front',
  };
  const backElement: CanvasElement = {
    id: 'back-1',
    type: 'text',
    x: 140,
    y: 10,
    width: 20,
    height: 10,
    rotation: 0,
    surface: 'back',
  };
  const undefinedSurfaceElement: CanvasElement = {
    id: 'unset-1',
    type: 'text',
    x: 140,
    y: 10,
    width: 20,
    height: 10,
    rotation: 0,
  };

  assert.equal(isElementCrossingCardFold(frontElement, 'horizontal'), false);
  assert.equal(isElementCrossingCardFold(backElement, 'horizontal'), false);
  assert.equal(isElementCrossingCardFold(undefinedSurfaceElement, 'horizontal'), false);
});

test('isElementCrossingCardFold: horizontal orientation fold at x=148', () => {
  // Spanning across fold: starts < 148, ends > 148
  const spanning: CanvasElement = {
    id: 'span-h',
    type: 'text',
    x: 140,
    y: 20,
    width: 20, // 140 + 20 = 160 > 148
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(spanning, 'horizontal'), true);
  // Default orientation should be horizontal
  assert.equal(isElementCrossingCardFold(spanning), true);

  // Entirely on left side: x + width <= 148
  const leftSide: CanvasElement = {
    id: 'left-h',
    type: 'text',
    x: 20,
    y: 20,
    width: 120, // 20 + 120 = 140 <= 148
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(leftSide, 'horizontal'), false);

  // Touching fold from left: x + width === 148
  const touchingLeft: CanvasElement = {
    id: 'touch-left-h',
    type: 'text',
    x: 48,
    y: 20,
    width: 100, // 48 + 100 = 148
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(touchingLeft, 'horizontal'), false);

  // Touching fold from right: x === 148
  const touchingRight: CanvasElement = {
    id: 'touch-right-h',
    type: 'text',
    x: 148,
    y: 20,
    width: 50,
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(touchingRight, 'horizontal'), false);

  // Entirely on right side: x > 148
  const rightSide: CanvasElement = {
    id: 'right-h',
    type: 'text',
    x: 160,
    y: 20,
    width: 50,
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(rightSide, 'horizontal'), false);
});

test('isElementCrossingCardFold: vertical orientation fold at x=105', () => {
  // Spanning across fold: starts < 105, ends > 105
  const spanning: CanvasElement = {
    id: 'span-v',
    type: 'text',
    x: 95,
    y: 20,
    width: 20, // 95 + 20 = 115 > 105
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(spanning, 'vertical'), true);

  // Entirely on left side: x + width <= 105
  const leftSide: CanvasElement = {
    id: 'left-v',
    type: 'text',
    x: 10,
    y: 20,
    width: 90, // 10 + 90 = 100 <= 105
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(leftSide, 'vertical'), false);

  // Touching fold from left: x + width === 105
  const touchingLeft: CanvasElement = {
    id: 'touch-left-v',
    type: 'text',
    x: 5,
    y: 20,
    width: 100, // 5 + 100 = 105
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(touchingLeft, 'vertical'), false);

  // Touching fold from right: x === 105
  const touchingRight: CanvasElement = {
    id: 'touch-right-v',
    type: 'text',
    x: 105,
    y: 20,
    width: 40,
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(touchingRight, 'vertical'), false);

  // Entirely on right side: x > 105
  const rightSide: CanvasElement = {
    id: 'right-v',
    type: 'text',
    x: 110,
    y: 20,
    width: 40,
    height: 10,
    rotation: 0,
    surface: 'inside',
  };
  assert.equal(isElementCrossingCardFold(rightSide, 'vertical'), false);
});

test('getPreflight: card product with blank inside and back is valid without errors', () => {
  const cardState = createInitialState('card');
  const preflight = getPreflight(cardState);

  assert.notEqual(preflight.level, 'error');
  const errorChecks = preflight.checks.filter((check) => check.level === 'error');
  assert.equal(errorChecks.length, 0);
  assert.equal(
    preflight.checks.some((check) => check.id.includes('inside') || check.id.includes('back')),
    false
  );
});

test('CustomizerShell: triggers card_surface_changed event when surface changes', () => {
  const shellPath = resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx');
  const source = readFileSync(shellPath, 'utf8');

  assert.match(
    source,
    /card_surface_changed/,
    'CustomizerShell must dispatch card_surface_changed event'
  );
  assert.match(
    source,
    /detail:\s*\{\s*surface:\s*newSurface\s*\}/,
    'CustomizerShell must include surface in event detail'
  );
});
