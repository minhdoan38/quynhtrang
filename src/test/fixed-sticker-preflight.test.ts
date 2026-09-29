import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  getPreflight,
  type CanvasElement,
  type DesignState,
  type StickerOptions,
} from '../lib/product-state.ts';
import { sanitizeDesignForStorage } from '../lib/storage.ts';

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

test('fixed-shape sticker with disconnected elements passes preflight without disconnected warning', () => {
  const state: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    productOptions: {
      shape: 'circle',
      borderWidth: 2,
      hasWhiteBorder: true,
    } as StickerOptions,
    elements: [
      makeShape({ id: 'shape-left', x: 0, y: 0, width: 20, height: 20 }),
      makeShape({ id: 'shape-right', x: 120, y: 0, width: 20, height: 20 }),
    ],
  };

  const preflight = getPreflight(state);
  const contourCheck = preflight.checks.find((check) => check.id === 'sticker-contour');

  assert.equal(contourCheck, undefined);
  assert.equal(
    preflight.checks.some((check) => check.label === 'Một số chi tiết đang tách rời'),
    false
  );
  assert.notEqual(preflight.level, 'warning');
});

test('die-cut sticker with disconnected elements still triggers disconnected warning', () => {
  const state: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'die-cut',
    productOptions: {
      borderWidth: 2,
      hasWhiteBorder: true,
      cutLineMode: 'die-cut',
    } as StickerOptions,
    elements: [
      makeShape({ id: 'shape-left', x: 0, y: 0, width: 20, height: 20 }),
      makeShape({ id: 'shape-right', x: 120, y: 0, width: 20, height: 20 }),
    ],
  };

  const preflight = getPreflight(state);
  const contourCheck = preflight.checks.find((check) => check.id === 'sticker-contour');

  assert.ok(contourCheck, 'Expected sticker-contour check for die-cut variant');
  assert.equal(contourCheck.level, 'warning');
  assert.equal(contourCheck.type, 'warning');
  assert.equal(contourCheck.label, 'Một số chi tiết đang tách rời');
  assert.equal(
    contourCheck.description,
    'Di chuyển chúng gần nhau hơn hoặc tăng viền để tạo thành một sticker.'
  );
  assert.equal(preflight.level, 'warning');
});

test('empty fixed-shape sticker triggers error check', () => {
  const state: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    productOptions: {
      shape: 'rounded-rectangle',
      borderWidth: 2,
      hasWhiteBorder: true,
    } as StickerOptions,
    elements: [],
  };

  const preflight = getPreflight(state);
  const contentCheck = preflight.checks.find((check) => check.id === 'sticker-content');

  assert.ok(contentCheck, 'Expected sticker-content error check');
  assert.equal(contentCheck.level, 'error');
  assert.equal(contentCheck.type, 'error');
  assert.equal(contentCheck.label, 'Chưa có nội dung sticker');
  assert.equal(contentCheck.description, 'Vui lòng thêm hình ảnh hoặc chữ vào sticker.');
  assert.equal(preflight.level, 'error');
});

test('storage sanitization retains productOptions.shape', () => {
  const state: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    productOptions: {
      shape: 'oval',
      borderWidth: 3,
      hasWhiteBorder: false,
      borderSvgPath: 'M0 0 L10 10 Z',
      cutlineSvgPath: 'M0 0 L5 5 Z',
      contourResult: { status: 'valid' },
    } as StickerOptions,
    elements: [
      makeShape({ id: 'shape-user', x: 10, y: 10, width: 30, height: 30 }),
    ],
  };

  const sanitized = sanitizeDesignForStorage(state);
  const sanitizedOptions = sanitized.productOptions as StickerOptions;

  assert.equal(sanitizedOptions.shape, 'oval');
  assert.equal(sanitizedOptions.borderWidth, 3);
  assert.equal(sanitizedOptions.hasWhiteBorder, false);
  assert.equal((sanitizedOptions as Record<string, unknown>).borderSvgPath, undefined);
  assert.equal((sanitizedOptions as Record<string, unknown>).cutlineSvgPath, undefined);
  assert.equal((sanitizedOptions as Record<string, unknown>).contourResult, undefined);
});
