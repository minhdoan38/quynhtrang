import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupElements,
  ungroupElement,
  duplicateSelectedElements,
  deleteSelectedElements,
} from '../lib/grouping.ts';
import { createInitialState, type CanvasElement } from '../lib/product-state.ts';

test('selection mode transitions follow specification', () => {
  const base = createInitialState('wrapping');
  const elements: CanvasElement[] = [
    { id: 'img-1', type: 'image', x: 20, y: 30, width: 20, height: 20, rotation: 0 },
    { id: 'txt-1', type: 'text', x: 50, y: 50, width: 30, height: 10, rotation: 0 },
    { id: 'locked-1', type: 'shape', x: 10, y: 10, width: 10, height: 10, rotation: 0, locked: true },
  ];
  const stateWithEls = { ...base, elements };

  // 1. Enter multi-select with initial id
  let selectionMode: 'default' | 'multi-select' | 'group-edit' = 'default';
  let selectedIds: string[] = [];

  const enterMulti = (id?: string) => {
    selectionMode = 'multi-select';
    selectedIds = id ? [id] : [];
  };
  enterMulti('img-1');
  assert.equal(selectionMode, 'multi-select');
  assert.deepEqual(selectedIds, ['img-1']);

  // 2. Toggle item: add txt-1
  const toggle = (id: string) => {
    const el = stateWithEls.elements.find((e) => e.id === id);
    if (el?.locked) return false;
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((i) => i !== id);
    } else {
      selectedIds = [...selectedIds, id];
    }
    return true;
  };

  assert.equal(toggle('txt-1'), true);
  assert.deepEqual(selectedIds, ['img-1', 'txt-1']);

  // 3. Locked element cannot be added
  assert.equal(toggle('locked-1'), false);
  assert.deepEqual(selectedIds, ['img-1', 'txt-1']);

  // 4. Group elements from multi-select
  const { state: groupedState, groupId } = groupElements(stateWithEls, selectedIds);
  assert.ok(groupId);
  selectionMode = 'default';
  selectedIds = [];
  let selectedElementId: string | null = groupId;

  assert.equal(selectedElementId, groupId);
  assert.equal(selectionMode, 'default');

  // 5. Enter group edit
  let activeGroupId: string | null = null;
  const enterGroupEdit = (gId: string, childId?: string) => {
    selectionMode = 'group-edit';
    activeGroupId = gId;
    if (childId) selectedElementId = childId;
  };
  enterGroupEdit(groupId, 'img-1');
  assert.equal(selectionMode, 'group-edit');
  assert.equal(activeGroupId, groupId);
  assert.equal(selectedElementId, 'img-1');

  // 6. Exit group edit
  const exitGroupEdit = () => {
    selectionMode = 'default';
    selectedElementId = activeGroupId;
    activeGroupId = null;
  };
  exitGroupEdit();
  assert.equal(selectionMode, 'default');
  assert.equal(selectedElementId, groupId);
  assert.equal(activeGroupId, null);

  // 7. Ungroup returns former children to multi-selection
  const childIds = groupedState.elements?.filter((e) => e.parentGroupId === groupId).map((e) => e.id) || [];
  const ungroupedState = ungroupElement(groupedState, groupId);
  selectionMode = 'multi-select';
  selectedIds = childIds;
  selectedElementId = null;

  assert.deepEqual(selectedIds, ['img-1', 'txt-1']);
  assert.equal(selectionMode, 'multi-select');
  assert.ok(!ungroupedState.elements?.some((e) => e.id === groupId));
});
