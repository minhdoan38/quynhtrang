import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function resolveStickerToolbarAction(params: {
  productId?: string;
  selectedId?: string | null;
  variantId?: string;
  productOptions?: Record<string, unknown>;
}): 'background-color' | 'sticker-border' | null {
  const { productId, selectedId, variantId, productOptions } = params;
  if (productId !== 'sticker' || Boolean(selectedId)) {
    return null;
  }
  const isFixedShapeSticker =
    variantId === 'fixed-shape' || Boolean(productOptions?.shape);
  return isFixedShapeSticker ? 'background-color' : 'sticker-border';
}

test('toolbar action logic routes fixed-shape sticker to background-color', () => {
  assert.equal(
    resolveStickerToolbarAction({
      productId: 'sticker',
      selectedId: null,
      variantId: 'fixed-shape',
    }),
    'background-color'
  );

  assert.equal(
    resolveStickerToolbarAction({
      productId: 'sticker',
      selectedId: null,
      productOptions: { shape: 'circle' },
    }),
    'background-color'
  );
});

test('toolbar action logic routes die-cut sticker to sticker-border', () => {
  assert.equal(
    resolveStickerToolbarAction({
      productId: 'sticker',
      selectedId: null,
      variantId: 'die-cut',
    }),
    'sticker-border'
  );

  assert.equal(
    resolveStickerToolbarAction({
      productId: 'sticker',
      selectedId: null,
      productOptions: {},
    }),
    'sticker-border'
  );
});

test('toolbar action logic suppresses sticker actions when element is selected', () => {
  assert.equal(
    resolveStickerToolbarAction({
      productId: 'sticker',
      selectedId: 'image-1',
      variantId: 'fixed-shape',
      productOptions: { shape: 'rounded-rectangle' },
    }),
    null
  );
});

test('BottomNavigation source implements fixed-shape sticker background-color button and die-cut sticker-border button', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/customizer/bottom-navigation.tsx'),
    'utf8'
  );

  assert.match(
    source,
    /variantId\?: string;/,
    'BottomNavigationProps must include variantId'
  );
  assert.match(
    source,
    /productOptions\?: Record<string, unknown>;/,
    'BottomNavigationProps must include productOptions'
  );
  assert.match(
    source,
    /productId === 'sticker' && !selectedId/,
    'Must branch only when productId is sticker and no selected element'
  );
  assert.match(
    source,
    /variantId === 'fixed-shape' \|\| Boolean\(productOptions\?\.shape\)/,
    'Must check fixed-shape variantId or productOptions.shape'
  );
  assert.match(
    source,
    /onClick=\{\(\) => onAction\('background-color'\)\}/,
    'Fixed shape must trigger background-color action'
  );
  assert.match(
    source,
    /<Palette className="w-4 h-4 text-\[#315F86\]" \/>/,
    'Fixed shape button must display Palette icon'
  );
  assert.match(
    source,
    /<span className="text-\[11px\] font-medium mt-0\.5">Màu nền<\/span>/,
    'Fixed shape button must have Vietnamese label Màu nền'
  );
  assert.match(
    source,
    /onClick=\{\(\) => onAction\('sticker-border'\)\}/,
    'Die-cut must retain sticker-border action'
  );
  assert.match(
    source,
    /<span className="text-\[11px\] font-medium mt-0\.5">Viền sticker<\/span>/,
    'Die-cut must retain Vietnamese label Viền sticker'
  );
});

test('CustomizerShell source wires background-color action to surface background target and color sheet', () => {
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
    'handleToolbarAction must set color picker target to surface background'
  );
  assert.match(
    source,
    /setActiveSheet\('color'\);/,
    'handleToolbarAction must open color sheet'
  );
  assert.match(
    source,
    /<BottomNavigation[\s\S]*?variantId=\{state\.variantId\}[\s\S]*?productOptions=\{state\.productOptions\}/,
    'CustomizerShell must pass variantId and productOptions to BottomNavigation'
  );
});
