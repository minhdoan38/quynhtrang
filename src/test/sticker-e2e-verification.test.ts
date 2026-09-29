import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialState,
  getPreflight,
  transitionState,
  type CanvasElement,
  type StickerOptions,
} from '../lib/product-state.ts';
import { computeStickerContour } from '../lib/sticker-contour.ts';
import { loadState, sanitizeDesignForStorage, saveState } from '../lib/storage.ts';

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

const stickerOptions = (patch: Partial<StickerOptions> = {}): StickerOptions => ({
  borderWidth: 2,
  minBorderWidth: 0,
  maxBorderWidth: 6,
  hasWhiteBorder: true,
  showCutline: false,
  cutLineMode: 'die-cut',
  ...patch,
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

test('default sticker project starts with production border options', () => {
  const state = createInitialState('sticker');
  const options = state.productOptions as StickerOptions;

  assert.equal(options.borderWidth, 2);
  assert.equal(options.hasWhiteBorder, true);
  assert.equal(options.showCutline, false);
});

test('single element generates a valid contour and white-border SVG path', () => {
  const options = stickerOptions();
  const result = computeStickerContour([makeShape()], options);

  assert.equal(options.hasWhiteBorder, true);
  assert.equal(result.status, 'valid');
  assert.equal(result.islandCount, 1);
  assert.match(result.borderSvgPath, /^M.+Z$/);
});

test('disconnected elements report the required warning', () => {
  const result = computeStickerContour(
    [makeShape({ id: 'left' }), makeShape({ id: 'right', x: 40 })],
    stickerOptions()
  );

  assert.equal(result.status, 'disconnected');
  assert.equal(result.islandCount, 2);
  assert.equal(result.warningMessage, 'Một số chi tiết đang tách rời.');
});

test('increasing border thickness joins islands and clears the warning', () => {
  const elements = [makeShape({ id: 'left' }), makeShape({ id: 'right', x: 40 })];
  const thin = computeStickerContour(elements, stickerOptions({ borderWidth: 2 }));
  const thick = computeStickerContour(elements, stickerOptions({ borderWidth: 3 }));

  assert.equal(thin.status, 'disconnected');
  assert.equal(thin.warningMessage, 'Một số chi tiết đang tách rời.');
  assert.equal(thick.status, 'valid');
  assert.equal(thick.islandCount, 1);
  assert.equal(thick.warningMessage, undefined);
});

test('image with unremoved background shows subject-cutout guidance', () => {
  const image = makeShape({
    id: 'photo',
    type: 'image',
    data: { src: '/photo.png' },
  });
  const result = computeStickerContour([image], stickerOptions());

  assert.equal(result.hasUnremovedBackground, true);
  assert.equal(result.guidanceMessage, 'Muốn sticker cắt theo chủ thể? Hãy xóa nền ảnh trước.');
});

test('cutline preview generates a path without adding layer or stored elements', () => {
  const initial = {
    ...createInitialState('sticker'),
    elements: [makeShape()],
  };
  const originalElements = structuredClone(initial.elements);
  const previewState = transitionState(initial, {
    type: 'SET_PRODUCT_OPTION',
    key: 'showCutline',
    value: true,
  });
  const contour = computeStickerContour(
    previewState.elements,
    previewState.productOptions as StickerOptions
  );
  const stored = sanitizeDesignForStorage(previewState);

  assert.equal((previewState.productOptions as StickerOptions).showCutline, true);
  assert.match(contour.cutlineSvgPath, /^M.+Z$/);
  assert.deepEqual(previewState.elements, originalElements);
  assert.deepEqual(stored.elements, originalElements);
  assert.equal(stored.elements?.length, 1);
});

test('sticker preflight rejects empty and disconnected projects and passes a valid project', () => {
  const empty = { ...createInitialState('sticker'), elements: [] };
  const disconnected = {
    ...createInitialState('sticker'),
    elements: [makeShape({ id: 'left' }), makeShape({ id: 'right', x: 40 })],
  };
  const valid = {
    ...createInitialState('sticker'),
    elements: [makeShape()],
  };

  const emptyPreflight = getPreflight(empty);
  const disconnectedPreflight = getPreflight(disconnected);
  const validPreflight = getPreflight(valid);

  assert.equal(emptyPreflight.level, 'error');
  assert.equal(
    emptyPreflight.checks.find((check) => check.id === 'sticker-content')?.label,
    'Chưa có nội dung sticker'
  );
  assert.equal(disconnectedPreflight.level, 'warning');
  assert.equal(
    disconnectedPreflight.checks.find((check) => check.id === 'sticker-contour')?.label,
    'Một số chi tiết đang tách rời'
  );
  assert.equal(validPreflight.level, 'pass');
  assert.equal(
    validPreflight.checks.find((check) => check.id === 'sticker-contour')?.level,
    'pass'
  );
});

test('saved sticker draft round-trips clean StickerOptions', () => {
  installSessionStorage();
  const expected = stickerOptions({ borderWidth: 4, showCutline: true });
  const state = {
    ...createInitialState('sticker'),
    productOptions: {
      ...expected,
      borderSvgPath: 'generated-border',
      cutlineSvgPath: 'generated-cutline',
      contourResult: { status: 'valid' },
    },
    elements: [makeShape()],
  };

  assert.equal(saveState(state), true);
  const loaded = loadState();

  assert.ok(loaded);
  assert.deepEqual(loaded.productOptions, expected);
  assert.deepEqual(loaded.elements, state.elements);
});
