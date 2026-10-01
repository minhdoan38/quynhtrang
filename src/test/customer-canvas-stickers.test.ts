import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  createStickerElement,
  filterElementsBySurface,
  getStickerData,
  transitionState,
} from '../lib/product-state.ts';
import { createDesignHistoryManager } from '../lib/use-design-history.ts';
import type { SelectionSnapshot } from '../lib/history.ts';

const sticker = createStickerElement({
  id: 'sticker-flower',
  stickerId: 'flower',
  storagePath: 'stickers/flower/sha.svg',
  src: '/api/library/sticker/flower',
  title: 'Hoa vintage',
  checksum: 'sha',
  x: 50,
  y: 52,
  width: 24,
  height: 24,
  surface: 'inside',
});

test('createStickerElement retains stable asset identity and canvas geometry', () => {
  assert.deepEqual(
    { id: sticker.id, type: sticker.type, x: sticker.x, y: sticker.y, width: sticker.width, height: sticker.height, rotation: sticker.rotation, surface: sticker.surface },
    { id: 'sticker-flower', type: 'sticker', x: 50, y: 52, width: 24, height: 24, rotation: 0, surface: 'inside' },
  );
  assert.deepEqual(getStickerData(sticker), {
    libraryAssetId: 'flower',
    assetChecksum: 'sha',
    src: '/api/library/sticker/flower',
    title: 'Hoa vintage',
    storagePath: 'stickers/flower/sha.svg',
    width: 24,
    height: 24,
  });
});

test('sticker supports add, select, move, resize, rotate, group, and delete reducer behavior', () => {
  let state = transitionState(createInitialState('card'), { type: 'ADD_CANVAS_ELEMENT', element: sticker });
  assert.equal(state.elements?.find((element) => element.id === sticker.id)?.type, 'sticker');

  const selectedId = state.elements?.find((element) => element.id === sticker.id)?.id;
  assert.equal(selectedId, 'sticker-flower');

  state = transitionState(state, { type: 'MOVE_ELEMENT', id: sticker.id, x: 60, y: 63 });
  state = transitionState(state, { type: 'RESIZE_ELEMENT', id: sticker.id, width: 30, height: 32 });
  state = transitionState(state, { type: 'ROTATE_ELEMENT', id: sticker.id, rotation: 405 });
  const transformed = state.elements?.find((element) => element.id === sticker.id);
  assert.deepEqual(
    { x: transformed?.x, y: transformed?.y, width: transformed?.width, height: transformed?.height, rotation: transformed?.rotation },
    { x: 60, y: 63, width: 30, height: 32, rotation: 45 },
  );

  const peer = createStickerElement({ id: 'sticker-peer', stickerId: 'peer', storagePath: 'stickers/peer.svg', src: '/api/library/sticker/peer', title: 'Peer', surface: 'inside' });
  state = transitionState(state, { type: 'ADD_CANVAS_ELEMENT', element: peer });
  state = transitionState(state, { type: 'GROUP_ELEMENTS', ids: [sticker.id, peer.id] });
  const group = state.elements?.find((element) => element.type === 'group');
  assert.ok(group);
  assert.equal(state.elements?.find((element) => element.id === sticker.id)?.parentGroupId, group.id);

  state = transitionState(state, { type: 'DELETE_ELEMENT', id: sticker.id });
  assert.equal(state.elements?.some((element) => element.id === sticker.id), false);
});

test('card sticker elements render only on their assigned surface', () => {
  const front = createStickerElement({ id: 'front', stickerId: 'front', storagePath: 'stickers/front.svg', src: '/api/library/sticker/front', title: 'Front', surface: 'front' });
  const inside = createStickerElement({ id: 'inside', stickerId: 'inside', storagePath: 'stickers/inside.svg', src: '/api/library/sticker/inside', title: 'Inside', surface: 'inside' });
  assert.deepEqual(filterElementsBySurface([front, inside], 'front').map((element) => element.id), ['front']);
  assert.deepEqual(filterElementsBySurface([front, inside], 'inside').map((element) => element.id), ['inside']);
  assert.deepEqual(filterElementsBySurface([front, inside], 'back'), []);
});

test('undo and redo preserve sticker additions and transforms', () => {
  let selection: SelectionSnapshot = { selectedTarget: null, selectedElementId: null, selectedElementIds: [], selectionMode: 'default', activeGroupId: null };
  const manager = createDesignHistoryManager(createInitialState('card'), () => selection, (restored) => { selection = restored; });

  selection = { ...selection, selectedTarget: 'group', selectedElementId: sticker.id };
  manager.executeAction({ type: 'ADD_CANVAS_ELEMENT', element: sticker }, { type: 'add', label: 'Thêm sticker', affectedIds: [sticker.id] });
  manager.executeAction({ type: 'MOVE_ELEMENT', id: sticker.id, x: 70, y: 72 }, { type: 'move', label: 'Di chuyển sticker', affectedIds: [sticker.id] });
  manager.executeAction({ type: 'ROTATE_ELEMENT', id: sticker.id, rotation: 30 }, { type: 'rotate', label: 'Xoay sticker', affectedIds: [sticker.id] });
  assert.deepEqual(manager.getState().elements?.find((element) => element.id === sticker.id) && {
    x: manager.getState().elements?.find((element) => element.id === sticker.id)?.x,
    y: manager.getState().elements?.find((element) => element.id === sticker.id)?.y,
    rotation: manager.getState().elements?.find((element) => element.id === sticker.id)?.rotation,
  }, { x: 70, y: 72, rotation: 30 });

  manager.undo();
  manager.undo();
  assert.deepEqual(manager.getState().elements?.find((element) => element.id === sticker.id) && {
    x: manager.getState().elements?.find((element) => element.id === sticker.id)?.x,
    y: manager.getState().elements?.find((element) => element.id === sticker.id)?.y,
    rotation: manager.getState().elements?.find((element) => element.id === sticker.id)?.rotation,
  }, { x: 50, y: 52, rotation: 0 });
  manager.undo();
  assert.equal(Boolean(manager.getState().elements?.some((element) => element.id === sticker.id)), false);

  manager.redo();
  manager.redo();
  manager.redo();
  assert.equal(manager.getState().elements?.find((element) => element.id === sticker.id)?.rotation, 30);
});
