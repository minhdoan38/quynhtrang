import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADD_MENU_ITEMS,
  SHAPE_DEFINITIONS,
  getProviderStatus,
  calculateCenteredPlacement,
  type AddContentType,
  type ImageSourceContext,
} from '../lib/add-content.ts';

test('defines exactly 6 primary add content categories in expected visual order', () => {
  const ids = ADD_MENU_ITEMS.map((item) => item.id);
  assert.deepEqual(ids, ['image', 'text', 'sticker', 'shape', 'qr', 'barcode']);

  const labels = ADD_MENU_ITEMS.map((item) => item.label);
  assert.deepEqual(labels, ['Ảnh', 'Chữ', 'Sticker', 'Hình dạng', 'QR', 'Mã vạch']);

  const priorities = ADD_MENU_ITEMS.map((item) => item.priority);
  assert.deepEqual(priorities, [
    'primary',
    'primary',
    'secondary',
    'secondary',
    'utility',
    'utility',
  ]);
});

test('provides clear honest status for available and unavailable providers', () => {
  assert.equal(getProviderStatus('image').available, true);
  assert.equal(getProviderStatus('text').available, true);
  assert.equal(getProviderStatus('shape').available, true);

  const stickerStatus = getProviderStatus('sticker');
  assert.equal(stickerStatus.available, false);
  assert.equal(stickerStatus.message, 'Thư viện sticker đang được chuẩn bị.');

  const qrStatus = getProviderStatus('qr');
  assert.equal(qrStatus.available, false);
  assert.equal(qrStatus.message, 'Bộ sinh mã QR đang được kết nối.');

  const barcodeStatus = getProviderStatus('barcode');
  assert.equal(barcodeStatus.available, false);
  assert.equal(barcodeStatus.message, 'Bộ sinh mã vạch đang được kết nối.');
});

test('defines minimum standard shape primitives for MVP', () => {
  const types = SHAPE_DEFINITIONS.map((s) => s.type);
  assert.deepEqual(types, [
    'square',
    'rectangle',
    'rounded-rectangle',
    'circle',
    'oval',
    'triangle',
    'line',
  ]);
});

test('calculates center-safe element placement within canvas bounds', () => {
  const pos1 = calculateCenteredPlacement(40, 40, 0);
  assert.equal(pos1.x, 50);
  assert.equal(pos1.y, 50);

  // Slight stagger offset for subsequent items
  const pos2 = calculateCenteredPlacement(40, 40, 1);
  assert.equal(pos2.x, 52);
  assert.equal(pos2.y, 52);

  // Big elements stay clamped within safe margins
  const posBig = calculateCenteredPlacement(90, 90, 10);
  assert.ok(posBig.x >= 10 && posBig.x <= 90);
  assert.ok(posBig.y >= 10 && posBig.y <= 90);
});
test('ImageSourceContext supports explicit add and replace modes', () => {
  const addCtx: ImageSourceContext = { mode: 'add' };
  const replaceCtx: ImageSourceContext = { mode: 'replace', targetElementId: 'image-1' };
  assert.equal(addCtx.mode, 'add');
  assert.equal(replaceCtx.mode, 'replace');
  assert.equal((replaceCtx as { targetElementId: string }).targetElementId, 'image-1');
});
