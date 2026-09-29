import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createInitialState } from '../lib/product-state.ts';

function resolveToolbarAction(params: {
  productId?: string;
  selectedId?: string | null;
  variantId?: string;
  productOptions?: Record<string, unknown>;
  isWrappingPatternMode?: boolean;
}): {
  backgroundColorAction: boolean;
  stickerBorderAction: boolean;
  patternAction: boolean;
} {
  const {
    productId,
    selectedId,
    variantId,
    productOptions,
    isWrappingPatternMode = false,
  } = params;

  if (Boolean(selectedId)) {
    return {
      backgroundColorAction: false,
      stickerBorderAction: false,
      patternAction: false,
    };
  }

  const isFixedShapeSticker =
    productId === 'sticker' &&
    (variantId === 'fixed-shape' || Boolean(productOptions?.shape));

  const showBackgroundColorAction =
    isFixedShapeSticker || productId === 'notebook';

  const showStickerBorderAction =
    productId === 'sticker' && !isFixedShapeSticker;

  return {
    backgroundColorAction: showBackgroundColorAction,
    stickerBorderAction: showStickerBorderAction,
    patternAction: Boolean(isWrappingPatternMode),
  };
}

test('notebook initial state sets productId to notebook', () => {
  const state = createInitialState('notebook');
  assert.equal(state.productId, 'notebook');
  assert.equal(state.variantId, 'standard');
});

test('toolbar logic displays background color action for notebook when unselected', () => {
  const actions = resolveToolbarAction({
    productId: 'notebook',
    selectedId: null,
  });

  assert.equal(actions.backgroundColorAction, true);
  assert.equal(actions.stickerBorderAction, false);
  assert.equal(actions.patternAction, false);
});

test('toolbar logic suppresses background color action for notebook when element is selected', () => {
  const actions = resolveToolbarAction({
    productId: 'notebook',
    selectedId: 'image-1',
  });

  assert.equal(actions.backgroundColorAction, false);
  assert.equal(actions.stickerBorderAction, false);
  assert.equal(actions.patternAction, false);
});

test('BottomNavigation source renders Màu nền button for notebook without surface switcher or pattern controls', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/customizer/bottom-navigation.tsx'),
    'utf8'
  );

  assert.match(
    source,
    /productId === 'notebook'/,
    'BottomNavigation must explicitly include notebook in background color action predicate'
  );

  assert.match(
    source,
    /<Palette className="w-4 h-4 text-\[#315F86\]" \/>/,
    'Must display Palette icon for Màu nền action'
  );

  assert.match(
    source,
    /<span className="text-\[11px\] font-medium mt-0\.5">Màu nền<\/span>/,
    'Must display Màu nền label'
  );

  assert.doesNotMatch(
    source,
    /CardSurfaceSwitcher/,
    'BottomNavigation must not render CardSurfaceSwitcher'
  );
});

test('CustomizerShell source opens color sheet with surface background target on background-color action', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx'),
    'utf8'
  );

  assert.match(
    source,
    /case 'background-color':/,
    'handleToolbarAction must handle background-color'
  );

  assert.match(
    source,
    /setColorPickerTarget\(\{\s*kind:\s*'surface',\s*surfaceId:\s*'front',\s*property:\s*'background'\s*\}\);/,
    'handleToolbarAction must set surface front background color target'
  );

  assert.match(
    source,
    /setActiveSheet\('color'\);/,
    'handleToolbarAction must open color sheet'
  );

  assert.match(
    source,
    /state\.productId === 'card' && \(\s*<div[^>]*>\s*<CardSurfaceSwitcher/,
    'Surface switcher must only render for card product in CustomizerShell'
  );
});

test('ProductSetup directs notebook directly on Tự thiết kế without opening modal pickers', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/customizer/product-setup.tsx'),
    'utf8'
  );

  assert.match(
    source,
    /if \(productId === 'wrapping'\) \{\s*setShowModePicker\(true\);\s*return;\s*\}\s*if \(productId === 'sticker' && variantId === 'fixed-shape'\) \{\s*setShowStickerShapePicker\(true\);\s*return;\s*\}\s*onStartBlank\(\);/,
    'ProductSetup must bypass wrapping mode picker and sticker shape picker for notebook to call onStartBlank directly'
  );
});
