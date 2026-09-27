import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupElements,
  ungroupElement,
  duplicateSelectedElements,
  deleteSelectedElements,
} from '../lib/grouping.ts';
import { createInitialState, transitionState, type CanvasElement } from '../lib/product-state.ts';

test('groupElements creates persistent group container and assigns parentGroupId to children', () => {
  const base = createInitialState('wrapping');
  const elements: CanvasElement[] = [
    { id: 'el-1', type: 'image', x: 20, y: 30, width: 20, height: 20, rotation: 0, zIndex: 1 },
    { id: 'el-2', type: 'text', x: 50, y: 50, width: 30, height: 10, rotation: 0, zIndex: 2 },
  ];
  const stateWithEls = { ...base, elements };
  const { state: groupedState, groupId } = groupElements(stateWithEls, ['el-1', 'el-2']);

  const groupEl = groupedState.elements?.find((e) => e.id === groupId);
  assert.ok(groupEl);
  assert.equal(groupEl.type, 'group');
  assert.equal(groupEl.name, 'Nhóm');

  const child1 = groupedState.elements?.find((e) => e.id === 'el-1');
  const child2 = groupedState.elements?.find((e) => e.id === 'el-2');
  assert.equal(child1?.parentGroupId, groupId);
  assert.equal(child2?.parentGroupId, groupId);
});

test('groupElements requires at least 2 compatible elements on the same surface', () => {
  const base = createInitialState('wrapping');
  const elements: CanvasElement[] = [
    { id: 'el-1', type: 'image', x: 20, y: 30, width: 20, height: 20, rotation: 0, surface: 'front' },
    { id: 'el-2', type: 'text', x: 50, y: 50, width: 30, height: 10, rotation: 0, surface: 'inside' },
  ];
  const stateWithEls = { ...base, elements };
  const { state: groupedState, groupId } = groupElements(stateWithEls, ['el-1', 'el-2']);

  assert.equal(groupId, '');
  assert.deepEqual(groupedState.elements, elements);
});

test('ungroupElement removes group container and clears parentGroupId while preserving positions', () => {
  const base = createInitialState('wrapping');
  const elements: CanvasElement[] = [
    { id: 'grp-1', type: 'group', x: 35, y: 40, width: 60, height: 40, rotation: 0, zIndex: 2 },
    { id: 'el-1', type: 'image', parentGroupId: 'grp-1', x: 20, y: 30, width: 20, height: 20, rotation: 0, zIndex: 1 },
    { id: 'el-2', type: 'text', parentGroupId: 'grp-1', x: 50, y: 50, width: 30, height: 10, rotation: 0, zIndex: 2 },
  ];
  const stateWithGrp = { ...base, elements };
  const ungrouped = ungroupElement(stateWithGrp, 'grp-1');

  assert.ok(!ungrouped.elements?.some((e) => e.id === 'grp-1'));
  const child1 = ungrouped.elements?.find((e) => e.id === 'el-1');
  const child2 = ungrouped.elements?.find((e) => e.id === 'el-2');
  assert.equal(child1?.parentGroupId, undefined);
  assert.equal(child2?.parentGroupId, undefined);
  assert.equal(child1?.x, 20);
  assert.equal(child2?.x, 50);
});

test('duplicateSelectedElements duplicates all selected elements and creates new IDs with offset', () => {
  const base = createInitialState('wrapping');
  const elements: CanvasElement[] = [
    { id: 'el-1', type: 'image', x: 20, y: 30, width: 20, height: 20, rotation: 0 },
    { id: 'el-2', type: 'text', x: 50, y: 50, width: 30, height: 10, rotation: 0 },
  ];
  const stateWithEls = { ...base, elements };
  const { state: duplicatedState, newIds } = duplicateSelectedElements(stateWithEls, ['el-1', 'el-2']);

  assert.equal(duplicatedState.elements?.length, 4);
  assert.equal(newIds.length, 2);
  const dup1 = duplicatedState.elements?.find((e) => e.id === newIds[0]);
  assert.ok(dup1);
  assert.equal(dup1.x, 24); // 20 + 4
  assert.equal(dup1.y, 34); // 30 + 4
});

test('deleteSelectedElements deletes all target elements in one step and cascadingly removes group children', () => {
  const base = createInitialState('wrapping');
  const elements: CanvasElement[] = [
    { id: 'grp-1', type: 'group', x: 35, y: 40, width: 60, height: 40, rotation: 0 },
    { id: 'el-1', type: 'image', parentGroupId: 'grp-1', x: 20, y: 30, width: 20, height: 20, rotation: 0 },
    { id: 'el-2', type: 'text', parentGroupId: 'grp-1', x: 50, y: 50, width: 30, height: 10, rotation: 0 },
    { id: 'other', type: 'sticker', x: 10, y: 10, width: 10, height: 10, rotation: 0 },
  ];
  const stateWithGrp = { ...base, elements };
  const afterDelete = deleteSelectedElements(stateWithGrp, ['grp-1']);

  assert.equal(afterDelete.elements?.length, 1);
  assert.equal(afterDelete.elements?.[0]?.id, 'other');
});

test('transitionState supports GROUP_ELEMENTS, UNGROUP_ELEMENT, DUPLICATE_ELEMENTS, DELETE_ELEMENTS', () => {
  const base = createInitialState('wrapping');
  const elements: CanvasElement[] = [
    { id: 'e1', type: 'image', x: 10, y: 10, width: 10, height: 10, rotation: 0 },
    { id: 'e2', type: 'text', x: 30, y: 30, width: 10, height: 10, rotation: 0 },
  ];
  const s1 = transitionState({ ...base, elements }, {
    type: 'GROUP_ELEMENTS',
    ids: ['e1', 'e2'],
  });
  const group = s1.elements?.find((e) => e.type === 'group');
  assert.ok(group);

  const s2 = transitionState(s1, {
    type: 'UNGROUP_ELEMENT',
    groupId: group.id,
  });
  assert.ok(!s2.elements?.some((e) => e.type === 'group'));
});
