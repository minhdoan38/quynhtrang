import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  transitionState,
  getDefaultElements,
  type CanvasElement,
} from '../lib/product-state.ts';
import {
  getLayerDisplayName,
  getLayerTypeIcon,
  getSurfaceLayers,
  reorderLayerIds,
  buildLayerHierarchy,
  type LayerRowState,
} from '../lib/layers.ts';

test('Layers Data Model: getDefaultElements returns visual stacking order (front-to-back)', () => {
  const state = createInitialState('wrapping');
  state.text = 'Chúc mừng sinh nhật';
  state.image = { name: 'photo.jpg', src: 'blob:test' };
  state.productOptions = { isLocked: false };

  const elements = getDefaultElements(state);
  assert.equal(elements.length, 2);
  // Text is rendered above image (front)
  const textEl = elements.find((e) => e.type === 'text');
  const imgEl = elements.find((e) => e.type === 'image');
  assert.ok(textEl && imgEl);
  assert.ok((textEl.zIndex ?? 2) > (imgEl.zIndex ?? 1));
});

test('Layers Reducer: REORDER_ELEMENTS updates stacking order in 1 history action', () => {
  const initial = createInitialState('card');
  const el1: CanvasElement = { id: 'el-bg', type: 'shape', x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 1 };
  const el2: CanvasElement = { id: 'el-photo', type: 'image', x: 10, y: 10, width: 50, height: 50, rotation: 0, zIndex: 2 };
  const el3: CanvasElement = { id: 'el-text', type: 'text', x: 20, y: 20, width: 40, height: 10, rotation: 0, zIndex: 3 };

  const state = {
    ...initial,
    elements: [el1, el2, el3],
  };

  // Reorder so el-bg is on top (front): el-bg, el-text, el-photo
  const reordered = transitionState(state, {
    type: 'REORDER_ELEMENTS',
    orderedIds: ['el-bg', 'el-text', 'el-photo'], // front-to-back
  });

  assert.equal(reordered.elements?.length, 3);
  const bg = reordered.elements?.find((e) => e.id === 'el-bg');
  const photo = reordered.elements?.find((e) => e.id === 'el-photo');
  assert.ok((bg?.zIndex ?? 0) > (photo?.zIndex ?? 0));
});

test('Layers Reducer: DUPLICATE_ELEMENT clones object and places it above original', () => {
  const initial = createInitialState('card');
  const el1: CanvasElement = { id: 'text-orig', type: 'text', x: 20, y: 20, width: 40, height: 10, rotation: 0, zIndex: 2, data: { text: 'Hello' } };
  const state = { ...initial, elements: [el1] };

  const next = transitionState(state, {
    type: 'DUPLICATE_ELEMENT',
    id: 'text-orig',
  });

  assert.equal(next.elements?.length, 2);
  const dup = next.elements?.find((e) => e.id !== 'text-orig');
  assert.ok(dup);
  assert.equal(dup.type, 'text');
  assert.equal(dup.data?.text, 'Hello');
  assert.ok((dup.zIndex ?? 0) > (el1.zIndex ?? 0));
});

test('Layers Reducer: DELETE_ELEMENT removes object and synchronizes legacy fields', () => {
  const initial = createInitialState('wrapping');
  const elImg: CanvasElement = { id: 'img-1', type: 'image', x: 0, y: 0, width: 50, height: 50, rotation: 0, zIndex: 1 };
  const elText: CanvasElement = { id: 'text-1', type: 'text', x: 0, y: 0, width: 50, height: 50, rotation: 0, zIndex: 2 };
  const state = {
    ...initial,
    image: { name: 'test.jpg', src: 'blob:test' },
    text: 'Lời chúc',
    elements: [elImg, elText],
  };

  const next = transitionState(state, {
    type: 'DELETE_ELEMENT',
    id: 'img-1',
  });

  assert.equal(next.elements?.length, 1);
  assert.equal(next.elements?.[0]?.id, 'text-1');
  assert.equal(next.image, null); // synchronized
  assert.equal(next.text, 'Lời chúc'); // preserved
});

test('Layers Reducer: Locked element refuses deletion', () => {
  const initial = createInitialState('wrapping');
  const elLocked: CanvasElement = { id: 'locked-1', type: 'shape', x: 0, y: 0, width: 50, height: 50, rotation: 0, locked: true };
  const state = { ...initial, elements: [elLocked] };

  const next = transitionState(state, {
    type: 'DELETE_ELEMENT',
    id: 'locked-1',
  });

  assert.equal(next.elements?.length, 1);
});

test('Layers Helper: getLayerDisplayName formats readable names and truncates long text', () => {
  assert.equal(getLayerDisplayName({ id: '1', type: 'image', x: 0, y: 0, width: 1, height: 1, rotation: 0 }), 'Ảnh');
  assert.equal(getLayerDisplayName({ id: '2', type: 'text', x: 0, y: 0, width: 1, height: 1, rotation: 0, data: { text: 'Chúc mừng sinh nhật bạn thân yêu' } }), 'Chúc mừng sinh nhật...');
  assert.equal(getLayerDisplayName({ id: '3', type: 'sticker', x: 0, y: 0, width: 1, height: 1, rotation: 0 }), 'Sticker');
  assert.equal(getLayerDisplayName({ id: '4', type: 'group', name: 'Nhóm chữ & ảnh', x: 0, y: 0, width: 1, height: 1, rotation: 0 }), 'Nhóm chữ & ảnh');
});

test('Layers Helper: getSurfaceLayers filters layers by active surface (e.g. Card front/inside)', () => {
  const layers: CanvasElement[] = [
    { id: '1', type: 'text', surface: 'front', x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    { id: '2', type: 'text', surface: 'inside', x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    { id: '3', type: 'image', x: 0, y: 0, width: 1, height: 1, rotation: 0 }, // default front
  ];

  const frontLayers = getSurfaceLayers(layers, 'front');
  assert.equal(frontLayers.length, 2);
  assert.deepEqual(frontLayers.map((l) => l.id), ['1', '3']);

  const insideLayers = getSurfaceLayers(layers, 'inside');
  assert.equal(insideLayers.length, 1);
  assert.equal(insideLayers[0]?.id, '2');
});

test('Layers Helper: reorderLayerIds correctly moves item fromIndex to toIndex', () => {
  const ids = ['A', 'B', 'C', 'D'];
  // Move 'D' to top (index 0)
  const moved = reorderLayerIds(ids, 3, 0);
  assert.deepEqual(moved, ['D', 'A', 'B', 'C']);

  // Move 'A' to index 2
  const moved2 = reorderLayerIds(ids, 0, 2);
  assert.deepEqual(moved2, ['B', 'C', 'A', 'D']);
});

test('Layers Helper: buildLayerHierarchy nests children under parent groups', () => {
  const elements: CanvasElement[] = [
    { id: 'grp-1', type: 'group', name: 'Group 1', x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 3 },
    { id: 'child-1', type: 'text', parentGroupId: 'grp-1', x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 2 },
    { id: 'child-2', type: 'image', parentGroupId: 'grp-1', x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1 },
    { id: 'bg-1', type: 'shape', x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0 },
  ];

  const tree = buildLayerHierarchy(elements);
  assert.equal(tree.length, 2); // 1 group + 1 top-level shape
  assert.equal(tree[0]?.element.id, 'grp-1');
  assert.equal(tree[0]?.children.length, 2);
  assert.equal(tree[1]?.element.id, 'bg-1');
});
