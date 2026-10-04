import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  transitionState,
  TEMPLATES,
  getCompatibleTemplates,
  type DesignState,
} from '../lib/product-state.ts';

test('blank wrapping project with pattern mode routes correctly to pattern mode with active patternConfig', () => {
  let state: DesignState = createInitialState('wrapping');
  // Starting blank
  state = transitionState(state, { type: 'SET_TEMPLATE', value: 'blank' });
  state = transitionState(state, { type: 'SET_PRODUCT_OPTION', key: 'mode', value: 'pattern' });

  assert.equal(state.productOptions.mode, 'pattern');
  const patternConfig = state.productOptions.patternConfig as { enabled: boolean };
  assert.equal(patternConfig.enabled, true);
});

test('blank wrapping project with full-sheet mode routes correctly to full-sheet mode', () => {
  let state: DesignState = createInitialState('wrapping');
  // Starting blank
  state = transitionState(state, { type: 'SET_TEMPLATE', value: 'blank' });
  state = transitionState(state, { type: 'SET_PRODUCT_OPTION', key: 'mode', value: 'full-sheet' });

  assert.equal(state.productOptions.mode, 'full-sheet');
});

test('selecting template keeps template mode directly without requiring mode selection', () => {
  let state: DesignState = createInitialState('wrapping');

  // Template with full-sheet mode
  assert.equal(TEMPLATES.minimal.productOptions.wrapping?.mode, 'full-sheet');
  const minimalWrap = TEMPLATES.minimal.productOptions.wrapping as { patternConfig?: { enabled: boolean } };
  assert.equal(minimalWrap?.patternConfig?.enabled, false);
  state = transitionState(state, { type: 'SET_TEMPLATE', value: 'minimal' });
  assert.equal(state.templateId, 'minimal');

  // Template with pattern mode
  assert.equal(TEMPLATES.celebrate.productOptions.wrapping?.mode, 'pattern');
  const celebrateWrap = TEMPLATES.celebrate.productOptions.wrapping as { patternConfig?: { enabled: boolean } };
  assert.equal(celebrateWrap?.patternConfig?.enabled, true);
  state = transitionState(state, { type: 'SET_TEMPLATE', value: 'celebrate' });
  assert.equal(state.templateId, 'celebrate');
});

test('wrapping paper templates filter by product and variant compatibility', () => {
  const a1Templates = getCompatibleTemplates({ productId: 'wrapping', variantId: 'a1' });
  const a2Templates = getCompatibleTemplates({ productId: 'wrapping', variantId: 'a2' });

  // A1 contains a1-specific templates and generic wrapping templates
  const hasA1Cute = a1Templates.some((t) => t.id === 'wrapping-a1-cute');
  const hasA2Cute = a2Templates.some((t) => t.id === 'wrapping-a1-cute');
  assert.equal(hasA1Cute, true);
  assert.equal(hasA2Cute, false);

  // A2 contains a2-specific template
  const hasA1MinimalA2 = a1Templates.some((t) => t.id === 'wrapping-a2-minimal');
  const hasA2MinimalA2 = a2Templates.some((t) => t.id === 'wrapping-a2-minimal');
  assert.equal(hasA1MinimalA2, false);
  assert.equal(hasA2MinimalA2, true);

  // No card or sticker templates appear in wrapping
  assert.equal(a1Templates.some((t) => t.id.startsWith('card-')), false);
  assert.equal(a2Templates.some((t) => t.id.startsWith('sticker-')), false);
});
