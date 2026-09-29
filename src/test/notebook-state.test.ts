import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NOTEBOOK_COVER_DEFINITION,
  createInitialState,
  isElementInNotebookBindingZone,
  type NotebookOptions,
} from '../lib/product-state.ts';

test('NOTEBOOK_COVER_DEFINITION matches standard A5 dimensions and binding margin', () => {
  assert.equal(NOTEBOOK_COVER_DEFINITION.widthMm, 148);
  assert.equal(NOTEBOOK_COVER_DEFINITION.heightMm, 210);
  assert.equal(NOTEBOOK_COVER_DEFINITION.aspectRatio, 148 / 210);
  assert.equal(NOTEBOOK_COVER_DEFINITION.bindingMarginMm, 18);
  assert.equal(NOTEBOOK_COVER_DEFINITION.bindingMarginPct, 12);
  assert.ok(Object.isFrozen(NOTEBOOK_COVER_DEFINITION));
});

test('isElementInNotebookBindingZone flags elements within left 12% binding margin', () => {
  assert.equal(isElementInNotebookBindingZone({ x: 0 }), true);
  assert.equal(isElementInNotebookBindingZone({ x: 11.99 }), true);
  assert.equal(isElementInNotebookBindingZone({ x: 12 }), false);
  assert.equal(isElementInNotebookBindingZone({ x: 15, width: 20 }), false);

  assert.equal(isElementInNotebookBindingZone({ x: 23 }, 200), true);
  assert.equal(isElementInNotebookBindingZone({ x: 24 }, 200), false);
  assert.equal(isElementInNotebookBindingZone({ x: 25, width: 50 }, 200), false);
});

test('createInitialState initializes standard notebook product state', () => {
  const state = createInitialState('notebook');

  assert.equal(state.productId, 'notebook');
  assert.equal(state.variantId, 'standard');

  const options = state.productOptions as NotebookOptions;
  assert.equal(options.finish, 'matte');
  assert.equal(options.backgroundColor, undefined);
});
