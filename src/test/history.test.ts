import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistoryState,
  commitHistoryEntry,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
  type SelectionSnapshot,
} from '../lib/history.ts';
import { createInitialState } from '../lib/product-state.ts';

const defaultSelection: SelectionSnapshot = {
  selectedTarget: null,
  selectedElementId: null,
  selectedElementIds: [],
  selectionMode: 'default',
  activeGroupId: null,
};

test('createHistoryState initializes empty past and future with limit', () => {
  const h = createHistoryState(50);
  assert.equal(h.past.length, 0);
  assert.equal(h.future.length, 0);
  assert.equal(h.limit, 50);
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), false);
});

test('commitHistoryEntry appends entry, clears future, and enforces capacity', () => {
  let h = createHistoryState(2);
  const s0 = createInitialState('wrapping');
  const s1 = { ...s0, text: 'Hello' };
  const s2 = { ...s1, text: 'World' };
  const s3 = { ...s2, text: 'Third' };

  h = commitHistoryEntry(h, {
    type: 'edit-text',
    label: 'Sửa chữ',
    before: s0,
    after: s1,
    selectionBefore: defaultSelection,
    selectionAfter: { ...defaultSelection, selectedTarget: 'text' },
    affectedIds: ['text-1'],
  });

  assert.equal(h.past.length, 1);
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);

  h = commitHistoryEntry(h, {
    type: 'edit-text',
    label: 'Sửa chữ',
    before: s1,
    after: s2,
    selectionBefore: defaultSelection,
    selectionAfter: defaultSelection,
    affectedIds: ['text-1'],
  });
  assert.equal(h.past.length, 2);

  // Exceeds limit=2: oldest entry dropped
  h = commitHistoryEntry(h, {
    type: 'edit-text',
    label: 'Sửa chữ',
    before: s2,
    after: s3,
    selectionBefore: defaultSelection,
    selectionAfter: defaultSelection,
    affectedIds: ['text-1'],
  });
  assert.equal(h.past.length, 2);
  assert.equal(h.past[0].before.text, 'Hello');
  assert.equal(h.past[1].after.text, 'Third');
});

test('undo and redo cycle restores exact state, selection, and invalidates on new mutation', () => {
  let h = createHistoryState(50);
  const s0 = createInitialState('wrapping');
  const s1 = { ...s0, text: 'V1' };

  h = commitHistoryEntry(h, {
    type: 'edit-text',
    label: 'Sửa chữ',
    before: s0,
    after: s1,
    selectionBefore: { ...defaultSelection, selectedElementId: 'prev' },
    selectionAfter: { ...defaultSelection, selectedElementId: 'next' },
    affectedIds: ['text-1'],
  });

  // Undo
  const undoResult = undoHistory(h, s1, { ...defaultSelection, selectedElementId: 'next' });
  assert.ok(undoResult);
  assert.equal(undoResult.restoredState.text, '');
  assert.equal(undoResult.restoredSelection.selectedElementId, 'prev');
  assert.equal(undoResult.undoneEntry.label, 'Sửa chữ');
  h = undoResult.nextHistory;
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), true);

  // Redo
  const redoResult = redoHistory(h, undoResult.restoredState, undoResult.restoredSelection);
  assert.ok(redoResult);
  assert.equal(redoResult.restoredState.text, 'V1');
  assert.equal(redoResult.restoredSelection.selectedElementId, 'next');
  h = redoResult.nextHistory;
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);

  // Undo again then commit new action: future is cleared!
  const undoResult2 = undoHistory(h, redoResult.restoredState, redoResult.restoredSelection);
  assert.ok(undoResult2);
  h = undoResult2.nextHistory;
  assert.equal(canRedo(h), true);

  const s2 = { ...s0, text: 'V2-branch' };
  h = commitHistoryEntry(h, {
    type: 'edit-text',
    label: 'Sửa chữ mới',
    before: s0,
    after: s2,
    selectionBefore: defaultSelection,
    selectionAfter: defaultSelection,
    affectedIds: ['text-1'],
  });

  assert.equal(canRedo(h), false, 'New mutation clears future stack');
  assert.equal(h.future.length, 0);
  assert.equal(h.past[0].after.text, 'V2-branch');
});

test('undo on empty past returns null without throwing', () => {
  const h = createHistoryState(50);
  const s0 = createInitialState('wrapping');
  const result = undoHistory(h, s0, defaultSelection);
  assert.equal(result, null);
});

test('redo on empty future returns null without throwing', () => {
  const h = createHistoryState(50);
  const s0 = createInitialState('wrapping');
  const result = redoHistory(h, s0, defaultSelection);
  assert.equal(result, null);
});
