import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  getPreflight,
  type CanvasElement,
  type StickerOptions,
} from '../lib/product-state.ts';
import {
  getHistoryActionLabel,
  type HistoryActionType,
} from '../lib/history.ts';
import {
  sanitizeDesignForStorage,
} from '../lib/storage.ts';

function createShape(overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: `el-${Math.random().toString(36).slice(2, 6)}`,
    type: 'shape',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    ...overrides,
  };
}

test('getHistoryActionLabel returns correct Vietnamese labels for sticker border actions', () => {
  assert.equal(
    getHistoryActionLabel('change-sticker-border'),
    'Đổi độ dày viền sticker'
  );
  assert.equal(
    getHistoryActionLabel('toggle-sticker-border'),
    'Bật/tắt viền trắng sticker'
  );
  // Fallback check
  assert.equal(
    getHistoryActionLabel('unknown-action' as unknown as HistoryActionType),
    'Chỉnh sửa'
  );
});

test('getPreflight: empty sticker design reports error with exact Vietnamese messages', () => {
  const stickerState = createInitialState('sticker');
  stickerState.elements = [];

  const preflight = getPreflight(stickerState);
  assert.equal(preflight.level, 'error');

  const contentCheck = preflight.checks.find((c) => c.id === 'sticker-content');
  assert.ok(contentCheck, 'Expected sticker-content check');
  assert.equal(contentCheck.level, 'error');
  assert.equal(contentCheck.type, 'error');
  assert.equal(contentCheck.label, 'Chưa có nội dung sticker');
  assert.equal(
    contentCheck.description,
    'Vui lòng thêm hình ảnh hoặc chữ vào sticker.'
  );
});

test('getPreflight: disconnected artwork in sticker reports warning', () => {
  const stickerState = createInitialState('sticker');
  // Two shapes far apart that cannot merge into single island with 2px border
  stickerState.elements = [
    createShape({ id: 'el-1', x: 0, y: 0, width: 20, height: 20 }),
    createShape({ id: 'el-2', x: 300, y: 300, width: 20, height: 20 }),
  ];

  const preflight = getPreflight(stickerState);
  assert.equal(preflight.level, 'warning');

  const contourCheck = preflight.checks.find((c) => c.id === 'sticker-contour');
  assert.ok(contourCheck, 'Expected sticker-contour check');
  assert.equal(contourCheck.level, 'warning');
  assert.equal(contourCheck.type, 'warning');
  assert.equal(contourCheck.label, 'Một số chi tiết đang tách rời');
  assert.equal(
    contourCheck.description,
    'Di chuyển chúng gần nhau hơn hoặc tăng viền để tạo thành một sticker.'
  );
});

test('getPreflight: tiny details in sticker reports warning', () => {
  const stickerState = createInitialState('sticker');
  // Element smaller than 5px
  stickerState.elements = [
    createShape({ id: 'el-1', x: 0, y: 0, width: 3, height: 20 }),
  ];

  const preflight = getPreflight(stickerState);
  assert.equal(preflight.level, 'warning');

  const contourCheck = preflight.checks.find((c) => c.id === 'sticker-contour');
  assert.ok(contourCheck, 'Expected sticker-contour check');
  assert.equal(contourCheck.level, 'warning');
  assert.equal(contourCheck.type, 'warning');
  assert.equal(contourCheck.label, 'Một số chi tiết quá nhỏ để cắt đẹp');
  assert.equal(contourCheck.description, 'Tăng viền hoặc đơn giản thiết kế.');
});

test('getPreflight: valid sticker design reports pass for contour', () => {
  const stickerState = createInitialState('sticker');
  stickerState.elements = [
    createShape({ id: 'el-1', x: 0, y: 0, width: 50, height: 50 }),
  ];

  const preflight = getPreflight(stickerState);
  const contourCheck = preflight.checks.find((c) => c.id === 'sticker-contour');
  assert.ok(contourCheck, 'Expected sticker-contour check');
  assert.equal(contourCheck.level, 'pass');
  assert.equal(contourCheck.type, 'pass');
  assert.equal(contourCheck.label, 'Đường cắt sticker hợp lệ');
});

test('storage: sanitizeDesignForStorage preserves StickerOptions and strips generated contour overlays', () => {
  const stickerOptions: StickerOptions = {
    borderWidth: 4,
    minBorderWidth: 0,
    maxBorderWidth: 6,
    hasWhiteBorder: true,
    showCutline: true,
    cutLineMode: 'die-cut',
  };

  const rawElements: CanvasElement[] = [
    {
      id: 'el-user-1',
      type: 'shape',
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      rotation: 0,
      // Attached generated path fields should be stripped
      ...({
        borderSvgPath: 'M0 0 L10 10',
        cutlineSvgPath: 'M0 0 L5 5',
      } as unknown as Record<string, unknown>),
      data: {
        color: '#ff0000',
        stickerContour: { islandCount: 1 },
      },
    },
    // Synthetic element created as overlay
    {
      id: 'el-contour-overlay',
      type: 'shape',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      ...({ generated: true, isGeneratedContour: true } as Record<string, unknown>),
    },
  ];

  const state = {
    ...createInitialState('sticker'),
    productOptions: {
      ...stickerOptions,
      // Transient contour caches in productOptions should be stripped
      borderSvgPath: 'M 0 0 Z',
      contourResult: { status: 'valid' },
    },
    elements: rawElements,
  };

  const sanitized = sanitizeDesignForStorage(state);

  // StickerOptions persisted
  const sanitizedOptions = sanitized.productOptions as StickerOptions;
  assert.equal(sanitizedOptions.borderWidth, 4);
  assert.equal(sanitizedOptions.hasWhiteBorder, true);
  assert.equal(sanitizedOptions.showCutline, true);
  assert.equal(sanitizedOptions.cutLineMode, 'die-cut');

  // Generated options removed
  assert.equal(sanitized.productOptions.borderSvgPath, undefined);
  assert.equal(sanitized.productOptions.contourResult, undefined);

  // Overlay element removed, real element kept and cleaned
  assert.ok(sanitized.elements);
  assert.equal(sanitized.elements.length, 1);
  assert.equal(sanitized.elements[0].id, 'el-user-1');
  const userEl = sanitized.elements[0] as unknown as Record<string, unknown>;
  assert.equal(userEl.borderSvgPath, undefined);
  assert.equal(userEl.cutlineSvgPath, undefined);
  const data = userEl.data as Record<string, unknown>;
  assert.equal(data.color, '#ff0000');
  assert.equal(data.stickerContour, undefined);
});
