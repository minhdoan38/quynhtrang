import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEMPLATES,
  getCompatibleTemplates,
  transitionState,
  createInitialState,
  type FixedStickerShape,
  type StickerOptions,
} from '../lib/product-state.ts';

test('fixed-shape sticker templates declare their shape in productOptions', () => {
  const cutePack = TEMPLATES['sticker-cute-pack'];
  assert.ok(cutePack);
  const cutePackOptions = cutePack.productOptions.sticker as StickerOptions | undefined;
  assert.equal(cutePackOptions?.shape, 'circle');

  const cozyCoffee = TEMPLATES['sticker-cozy-coffee'];
  assert.ok(cozyCoffee);
  const cozyCoffeeOptions = cozyCoffee.productOptions.sticker as StickerOptions | undefined;
  assert.equal(cozyCoffeeOptions?.shape, 'rounded-rectangle');

  const coffeeCozy = TEMPLATES['sticker-coffee-cozy'];
  assert.ok(coffeeCozy);
  const coffeeCozyOptions = coffeeCozy.productOptions.sticker as StickerOptions | undefined;
  assert.equal(coffeeCozyOptions?.shape, 'rounded-rectangle');
});

test('getCompatibleTemplates returns fixed-shape sticker templates with declared shapes', () => {
  const templates = getCompatibleTemplates({
    productId: 'sticker',
    variantId: 'fixed-shape',
  });

  const ids = templates.map((item) => item.id);
  assert.ok(ids.includes('sticker-cute-pack'));
  assert.ok(ids.includes('sticker-cozy-coffee') || ids.includes('sticker-coffee-cozy'));

  const cute = templates.find((item) => item.id === 'sticker-cute-pack');
  const cuteOpts = cute?.template.productOptions.sticker as StickerOptions | undefined;
  assert.equal(cuteOpts?.shape, 'circle');
});

test('selecting template applies declared shape directly without losing options', () => {
  const initialState = createInitialState('sticker');
  assert.equal(initialState.productId, 'sticker');

  const withTemplate = transitionState(initialState, {
    type: 'SET_TEMPLATE',
    value: 'sticker-cute-pack',
  });

  assert.equal(withTemplate.templateId, 'sticker-cute-pack');
  const stickerOpts = withTemplate.productOptions as StickerOptions;
  assert.equal(stickerOpts.shape, 'circle');
  assert.equal(stickerOpts.hasWhiteBorder, true);
});

test('starting blank with shape sets shape in sticker productOptions', () => {
  const initialState = createInitialState('sticker');
  const blankState = transitionState(initialState, {
    type: 'SET_TEMPLATE',
    value: 'blank',
  });

  const shapes: FixedStickerShape[] = [
    'circle',
    'square',
    'rectangle',
    'oval',
    'rounded-rectangle',
  ];

  for (const shape of shapes) {
    const updated = transitionState(blankState, {
      type: 'SET_PRODUCT_OPTION',
      key: 'shape',
      value: shape,
    });

    const opts = updated.productOptions as StickerOptions;
    assert.equal(opts.shape, shape);
  }
});
