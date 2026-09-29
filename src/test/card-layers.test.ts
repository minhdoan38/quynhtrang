import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  transitionState,
  type CanvasElement,
} from '../lib/product-state.ts';

test('Card Layers: adding text element tags it with activeCardSurface', () => {
  const cardState = createInitialState('card');
  assert.equal(cardState.productId, 'card');

  // Add text with explicit surface
  const stateInside = transitionState(cardState, {
    type: 'ADD_TEXT_ELEMENT',
    preset: 'heading',
    id: 'text-inside',
    text: 'Lời chúc bên trong',
    surface: 'inside',
  });

  const insideEl = stateInside.elements?.find((e) => e.id === 'text-inside');
  assert.ok(insideEl);
  assert.equal(insideEl.surface, 'inside');

  // Add text without explicit surface falls back to productOptions.surface
  const stateFront = transitionState(cardState, {
    type: 'ADD_TEXT_ELEMENT',
    preset: 'body',
    id: 'text-front',
    text: 'Mặt trước',
  });

  const frontEl = stateFront.elements?.find((e) => e.id === 'text-front');
  assert.ok(frontEl);
  assert.equal(frontEl.surface, 'front');

  // Non-card product does not get card surface assigned by default
  const wrappingState = createInitialState('wrapping');
  const stateWrapping = transitionState(wrappingState, {
    type: 'ADD_TEXT_ELEMENT',
    preset: 'body',
    id: 'text-wrapping',
    text: 'Wrapping text',
  });

  const wrappingEl = stateWrapping.elements?.find((e) => e.id === 'text-wrapping');
  assert.ok(wrappingEl);
  assert.equal(wrappingEl.surface, undefined);
});

test('Card Layers: grouping prevents cross-surface grouping', () => {
  const initialState = createInitialState('card');
  const elements: CanvasElement[] = [
    {
      id: 'front-1',
      type: 'text',
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      rotation: 0,
      surface: 'front',
    },
    {
      id: 'inside-1',
      type: 'text',
      x: 20,
      y: 20,
      width: 40,
      height: 20,
      rotation: 0,
      surface: 'inside',
    },
  ];

  const stateWithElements = {
    ...initialState,
    elements,
  };

  // Attempting to group front-1 and inside-1 should fail and leave state unchanged
  const groupAttempt = transitionState(stateWithElements, {
    type: 'GROUP_ELEMENTS',
    ids: ['front-1', 'inside-1'],
  });

  assert.deepEqual(groupAttempt.elements, stateWithElements.elements);
  assert.equal(groupAttempt.elements?.some((e) => e.type === 'group'), false);
});

test('Card Layers: grouping valid same-surface elements succeeds and tags group with surface', () => {
  const initialState = createInitialState('card');
  const elements: CanvasElement[] = [
    {
      id: 'inside-1',
      type: 'text',
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      rotation: 0,
      surface: 'inside',
    },
    {
      id: 'inside-2',
      type: 'shape',
      x: 20,
      y: 20,
      width: 30,
      height: 30,
      rotation: 0,
      surface: 'inside',
    },
  ];

  const stateWithElements = {
    ...initialState,
    elements,
  };

  const groupedState = transitionState(stateWithElements, {
    type: 'GROUP_ELEMENTS',
    ids: ['inside-1', 'inside-2'],
  });

  const groupEl = groupedState.elements?.find((e) => e.type === 'group');
  assert.ok(groupEl);
  assert.equal(groupEl.surface, 'inside');
});

test('Card Layers: layer reordering on active surface preserves other surface elements intact', () => {
  // Simulate the reordering algorithm used in EditorSheets for card surfaces
  const elements: CanvasElement[] = [
    { id: 'front-1', type: 'text', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'front', zIndex: 1 },
    { id: 'inside-1', type: 'text', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'inside', zIndex: 2 },
    { id: 'front-2', type: 'shape', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'front', zIndex: 3 },
    { id: 'back-1', type: 'text', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'back', zIndex: 4 },
    { id: 'front-3', type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'front', zIndex: 5 },
  ];

  const activeSurfaceKey = 'front';
  const orderedSurfaceIds = ['front-3', 'front-1', 'front-2'];

  const activeSet = new Set(orderedSurfaceIds);
  const activeMap = new Map(orderedSurfaceIds.map((id, index) => [id, index]));
  const activeOriginalElements = elements.filter((e) => activeSet.has(e.id));
  activeOriginalElements.sort((a, b) => (activeMap.get(a.id) ?? 0) - (activeMap.get(b.id) ?? 0));

  let activePointer = 0;
  const mergedIds = elements.map((el) => {
    const elSurface = el.surface ?? 'front';
    if (elSurface === activeSurfaceKey && activePointer < activeOriginalElements.length) {
      const nextEl = activeOriginalElements[activePointer++];
      return nextEl.id;
    }
    return el.id;
  });

  // Verify positions:
  // slot 0 (was front-1) -> front-3
  // slot 1 (was inside-1) -> inside-1 (untouched)
  // slot 2 (was front-2) -> front-1
  // slot 3 (was back-1) -> back-1 (untouched)
  // slot 4 (was front-3) -> front-2
  assert.deepEqual(mergedIds, [
    'front-3',
    'inside-1',
    'front-1',
    'back-1',
    'front-2',
  ]);
});
