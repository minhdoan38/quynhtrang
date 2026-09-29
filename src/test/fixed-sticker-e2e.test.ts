import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  FIXED_STICKER_SHAPES,
  TEMPLATES,
  createInitialState,
  getCompatibleTemplates,
  getFixedStickerDimensions,
  getPreflight,
  transitionState,
  type CanvasElement,
  type DesignState,
  type FixedStickerShape,
  type StickerOptions,
} from '../lib/product-state.ts';
import { loadState, sanitizeDesignForStorage, saveState } from '../lib/storage.ts';

const canvasSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/design-canvas.tsx'),
  'utf8'
);
const shellSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx'),
  'utf8'
);
const setupSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/product-setup.tsx'),
  'utf8'
);
const toolbarSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/bottom-navigation.tsx'),
  'utf8'
);

const makeShape = (overrides: Partial<CanvasElement> = {}): CanvasElement => ({
  id: 'shape-1',
  type: 'shape',
  x: 0,
  y: 0,
  width: 20,
  height: 20,
  rotation: 0,
  ...overrides,
});

function installSessionStorage(): void {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: storage,
    writable: true,
  });
}

test('fixed sticker supports five shapes and setup initializes physical geometry', () => {
  assert.deepEqual(FIXED_STICKER_SHAPES, [
    'circle',
    'square',
    'rectangle',
    'oval',
    'rounded-rectangle',
  ]);

  const expected: Record<FixedStickerShape, { aspectRatio: number; borderRadiusCss: string }> = {
    circle: { aspectRatio: 1, borderRadiusCss: '9999px' },
    square: { aspectRatio: 1, borderRadiusCss: '0px' },
    rectangle: { aspectRatio: 1.4, borderRadiusCss: '0px' },
    oval: { aspectRatio: 1.4, borderRadiusCss: '50%' },
    'rounded-rectangle': { aspectRatio: 1.4, borderRadiusCss: '16px' },
  };

  for (const shape of FIXED_STICKER_SHAPES) {
    const dimensions = getFixedStickerDimensions(shape);
    assert.equal(dimensions.aspectRatio, expected[shape].aspectRatio, `${shape} aspect ratio`);
    assert.equal(dimensions.borderRadiusCss, expected[shape].borderRadiusCss, `${shape} radius`);
  }

  assert.match(setupSource, /data-shape=\{choice\.shape\}/);
  assert.match(setupSource, /onStartBlank\(choice\.shape\)/);
  assert.match(shellSource, /state\.productId === 'sticker' && modeOrShape/);
  assert.match(shellSource, /key: 'shape', value: modeOrShape/);
});

test('fixed sticker canvas clips design to shape and uses background color', () => {
  assert.match(canvasSource, /const isFixedShapeSticker =\s*productId === 'sticker'[\s\S]*?variantId === 'fixed-shape' \|\| Boolean\(productOptions\.shape\)/);
  assert.match(canvasSource, /backgroundCss =\s*isFixedShapeSticker\s*\?[\s\S]*?productOptions\.backgroundColor/);
  assert.match(canvasSource, /aspectRatio: `\$\{fixedStickerDims\.aspectRatio\}`/);
  assert.match(canvasSource, /borderRadius: fixedStickerDims\.borderRadiusCss/);
  assert.match(canvasSource, /classes\.push\('overflow-hidden'/);
  assert.match(canvasSource, /className="w-full h-full relative overflow-hidden"/);
});

test('fixed sticker skips contour extraction, white border SVG, and cutline overlay', () => {
  assert.match(
    shellSource,
    /state\.productId === 'sticker' && state\.variantId !== 'fixed-shape' && !state\.productOptions\.shape\s*\?\s*computeStickerContour/
  );
  assert.match(
    shellSource,
    /stickerContour=\{state\.productId === 'sticker' && state\.variantId !== 'fixed-shape' && !state\.productOptions\.shape \? contourResult : undefined\}/
  );
  assert.match(
    canvasSource,
    /Boolean\(productOptions\.hasWhiteBorder\) && !isFixedShapeSticker/
  );
  assert.match(
    canvasSource,
    /Boolean\(productOptions\.showCutline\) && !isFixedShapeSticker/
  );

  const state: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    productOptions: {
      shape: 'circle',
      borderWidth: 2,
      hasWhiteBorder: true,
      showCutline: true,
    } as StickerOptions,
    elements: [
      makeShape({ id: 'left', x: 0 }),
      makeShape({ id: 'right', x: 120 }),
    ],
  };
  assert.equal(getPreflight(state).checks.some((check) => check.id === 'sticker-contour'), false);
});

test('fixed sticker bottom toolbar shows Màu nền instead of Viền sticker', () => {
  assert.match(toolbarSource, /variantId === 'fixed-shape' \|\| Boolean\(productOptions\?\.shape\)/);
  assert.match(toolbarSource, /onAction\('background-color'\)/);
  assert.match(toolbarSource, />Màu nền<\/span>/);
  assert.match(toolbarSource, /onAction\('sticker-border'\)/);
  assert.match(toolbarSource, />Viền sticker<\/span>/);
});

test('fixed sticker preflight allows disconnected artwork without warnings', () => {
  const state: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    productOptions: {
      shape: 'oval',
      borderWidth: 2,
      hasWhiteBorder: true,
    } as StickerOptions,
    elements: [
      makeShape({ id: 'left', x: 0 }),
      makeShape({ id: 'right', x: 120 }),
    ],
  };

  const preflight = getPreflight(state);
  assert.equal(preflight.checks.some((check) => check.id === 'sticker-contour'), false);
  assert.equal(preflight.checks.some((check) => check.label === 'Một số chi tiết đang tách rời'), false);
  assert.notEqual(preflight.level, 'warning');
});

test('fixed sticker storage preserves shape and background options', () => {
  installSessionStorage();
  const state: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    backgroundColor: '#FDF7EE',
    productOptions: {
      shape: 'rounded-rectangle',
      backgroundColor: '#FDF7EE',
      borderWidth: 4,
      hasWhiteBorder: false,
      borderSvgPath: 'generated-border',
      cutlineSvgPath: 'generated-cutline',
      contourResult: { status: 'valid' },
    } as StickerOptions,
    elements: [makeShape()],
  };

  const sanitized = sanitizeDesignForStorage(state);
  assert.equal((sanitized.productOptions as StickerOptions).shape, 'rounded-rectangle');
  assert.equal((sanitized.productOptions as Record<string, unknown>).backgroundColor, '#FDF7EE');
  assert.equal(sanitized.backgroundColor, '#FDF7EE');
  assert.equal(saveState(state), true);

  const loaded = loadState();
  assert.ok(loaded);
  assert.equal((loaded.productOptions as StickerOptions).shape, 'rounded-rectangle');
  assert.equal((loaded.productOptions as Record<string, unknown>).backgroundColor, '#FDF7EE');
  assert.equal(loaded.backgroundColor, '#FDF7EE');
  assert.equal((loaded.productOptions as Record<string, unknown>).borderSvgPath, undefined);
  assert.equal((loaded.productOptions as Record<string, unknown>).contourResult, undefined);
});

test('fixed-shape sticker templates declare and apply shape directly', () => {
  const fixedTemplates = getCompatibleTemplates({
    productId: 'sticker',
    variantId: 'fixed-shape',
  }).filter(({ template }) => Boolean((template.productOptions.sticker as StickerOptions | undefined)?.shape));

  assert.ok(fixedTemplates.length > 0);
  const ids = fixedTemplates.map(({ id }) => id);
  assert.ok(ids.includes('sticker-cute-pack'));
  assert.ok(ids.includes('sticker-cozy-coffee') || ids.includes('sticker-coffee-cozy'));

  for (const { template } of fixedTemplates) {
    const options = template.productOptions.sticker as StickerOptions | undefined;
    assert.ok(options?.shape, `${template.name} must declare shape`);
    assert.ok(FIXED_STICKER_SHAPES.includes(options.shape));
  }
  const initialState = createInitialState('sticker');
  for (const templateId of ['sticker-cute-pack', 'sticker-cozy-coffee']) {
    const applied = transitionState(initialState, { type: 'SET_TEMPLATE', value: templateId });
    const templateOptions = TEMPLATES[templateId].productOptions.sticker as StickerOptions;
    const appliedOptions = applied.productOptions as StickerOptions;
    assert.equal(appliedOptions.shape, templateOptions.shape);
    assert.equal(applied.backgroundColor, TEMPLATES[templateId].backgroundColor);
  }
});
