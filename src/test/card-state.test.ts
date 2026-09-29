import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CARD_SURFACES,
  createInitialState,
  filterElementsBySurface,
  getCardSpreadDimensions,
  getCardSurfaceLabel,
  type CanvasElement,
  type CardOptions,
} from '../lib/product-state.ts';

test('CARD_SURFACES and getCardSurfaceLabel map correctly', () => {
  assert.deepEqual(CARD_SURFACES, ['front', 'inside', 'back']);
  assert.equal(getCardSurfaceLabel('front'), 'Mặt trước');
  assert.equal(getCardSurfaceLabel('inside'), 'Bên trong');
  assert.equal(getCardSurfaceLabel('back'), 'Mặt sau');
});

test('getCardSpreadDimensions computes horizontal card spread dimensions', () => {
  assert.deepEqual(getCardSpreadDimensions('horizontal', 'front'), {
    width: 148,
    height: 105,
    foldPosition: 0,
  });
  assert.deepEqual(getCardSpreadDimensions('horizontal', 'inside'), {
    width: 296,
    height: 105,
    foldPosition: 148,
  });
  assert.deepEqual(getCardSpreadDimensions('horizontal', 'back'), {
    width: 148,
    height: 105,
    foldPosition: 0,
  });
});

test('getCardSpreadDimensions computes vertical card spread dimensions', () => {
  assert.deepEqual(getCardSpreadDimensions('vertical', 'front'), {
    width: 105,
    height: 148,
    foldPosition: 0,
  });
  assert.deepEqual(getCardSpreadDimensions('vertical', 'inside'), {
    width: 210,
    height: 148,
    foldPosition: 105,
  });
  assert.deepEqual(getCardSpreadDimensions('vertical', 'back'), {
    width: 105,
    height: 148,
    foldPosition: 0,
  });
});

test('filterElementsBySurface filters by explicit surface and defaults unset to front', () => {
  const elements: CanvasElement[] = [
    { id: '1', type: 'text', x: 0, y: 0, width: 10, height: 10, rotation: 0 },
    { id: '2', type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'front' },
    { id: '3', type: 'text', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'inside' },
    { id: '4', type: 'shape', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'back' },
  ];

  assert.deepEqual(filterElementsBySurface(undefined, 'front'), []);
  assert.deepEqual(
    filterElementsBySurface(elements, 'front').map((el) => el.id),
    ['1', '2']
  );
  assert.deepEqual(
    filterElementsBySurface(elements, 'inside').map((el) => el.id),
    ['3']
  );
  assert.deepEqual(
    filterElementsBySurface(elements, 'back').map((el) => el.id),
    ['4']
  );
});

test('createInitialState creates valid card defaults', () => {
  const state = createInitialState('card');

  assert.equal(state.productId, 'card');
  assert.equal(state.variantId, 'horizontal');
  const cardOptions = state.productOptions as CardOptions;
  assert.equal(cardOptions.surface, 'front');
});
