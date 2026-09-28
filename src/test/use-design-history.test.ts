import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesignHistoryManager,
  type DesignHistoryManager,
} from '../lib/use-design-history.ts';
import { createInitialState } from '../lib/product-state.ts';
import type { SelectionSnapshot } from '../lib/history.ts';

const dummySelection: SelectionSnapshot = {
  selectedTarget: 'text',
  selectedElementId: 't-1',
  selectedElementIds: ['t-1'],
  selectionMode: 'default',
  activeGroupId: null,
};

test('executeAction mutates document and creates single history entry', () => {
  let currentSelection = dummySelection;
  const manager = createDesignHistoryManager(
    createInitialState('wrapping'),
    () => currentSelection,
    (sel) => { currentSelection = sel; }
  );

  assert.equal(manager.canUndo(), false);
  assert.equal(manager.canRedo(), false);

  manager.executeAction(
    { type: 'SET_TEXT', value: 'Thiết kế mới' },
    { type: 'edit-text', label: 'Sửa chữ', affectedIds: ['t-1'] }
  );

  assert.equal(manager.getState().text, 'Thiết kế mới');
  assert.equal(manager.canUndo(), true);
  assert.equal(manager.canRedo(), false);

  // Undo restores initial state
  const undone = manager.undo();
  assert.ok(undone);
  assert.equal(undone.label, 'Sửa chữ');
  assert.equal(manager.getState().text, '');
  assert.equal(manager.canUndo(), false);
  assert.equal(manager.canRedo(), true);

  // Redo re-applies text
  const redone = manager.redo();
  assert.ok(redone);
  assert.equal(manager.getState().text, 'Thiết kế mới');
  assert.equal(manager.canUndo(), true);
  assert.equal(manager.canRedo(), false);
});

test('transaction session batches multiple dispatchDirect mutations and commits once', () => {
  let currentSelection = dummySelection;
  const manager = createDesignHistoryManager(
    createInitialState('wrapping'),
    () => currentSelection,
    (sel) => { currentSelection = sel; }
  );

  manager.startTransaction('change-font', 'Đổi font', ['t-1']);
  assert.ok(manager.getActiveTransaction());
  assert.equal(manager.canUndo(), true, 'Active transaction enables undo (to cancel it)');

  // User previews several fonts via dispatchDirect
  manager.dispatchDirect({
    type: 'SET_PRODUCT_OPTION',
    key: 'fontFamily',
    value: 'Lora',
  });
  manager.dispatchDirect({
    type: 'SET_PRODUCT_OPTION',
    key: 'fontFamily',
    value: 'Montserrat',
  });

  assert.equal(manager.getState().productOptions.fontFamily, 'Montserrat');
  assert.equal(manager.getHistory().past.length, 0, 'No history entries during live transaction');

  // Commit on close
  const committed = manager.commitActiveTransaction();
  assert.ok(committed);
  assert.equal(committed.label, 'Đổi font');
  assert.equal(manager.getHistory().past.length, 1);
  assert.equal(manager.getActiveTransaction(), null);

  // Undo restores pre-transaction font
  manager.undo();
  assert.equal(manager.getState().productOptions.fontFamily, undefined);
});

test('canceling active transaction rolls back state without creating history', () => {
  let currentSelection = dummySelection;
  const manager = createDesignHistoryManager(
    createInitialState('wrapping'),
    () => currentSelection,
    (sel) => { currentSelection = sel; }
  );

  manager.startTransaction('crop', 'Cắt ảnh', ['img-1']);

  // In-flight crop coordinate changes
  manager.dispatchDirect({
    type: 'SET_PRODUCT_OPTION',
    key: 'imageCrop',
    value: { scale: 2, offsetX: 10, offsetY: 20 },
  });

  assert.deepEqual(manager.getState().productOptions.imageCrop, { scale: 2, offsetX: 10, offsetY: 20 });

  // User taps Hủy (Cancel)
  manager.cancelActiveTransaction();
  assert.equal(manager.getActiveTransaction(), null);
  assert.equal(manager.getState().productOptions.imageCrop, undefined);
  assert.equal(manager.getHistory().past.length, 0);
  assert.equal(manager.canUndo(), false);
});

test('calling undo while transaction is active cancels the transaction first', () => {
  let currentSelection = dummySelection;
  const manager = createDesignHistoryManager(
    createInitialState('wrapping'),
    () => currentSelection,
    (sel) => { currentSelection = sel; }
  );

  // Pre-existing committed action
  manager.executeAction(
    { type: 'SET_TEXT', value: 'Base Text' },
    { type: 'edit-text', label: 'Sửa chữ' }
  );
  assert.equal(manager.getHistory().past.length, 1);

  // Active color transaction
  manager.startTransaction('change-color', 'Đổi màu');
  manager.dispatchDirect({ type: 'SET_COLOR', value: '#E8BCC9' });
  assert.equal(manager.getState().color, '#E8BCC9');

  // Global Undo tapped while color sheet is active
  const undone = manager.undo();
  assert.ok(undone);
  assert.equal(manager.getActiveTransaction(), null, 'Active transaction canceled');
  assert.equal(manager.getState().color, '#111827', 'Color reverted to baseline');
  assert.equal(manager.getState().text, 'Base Text', 'Prior committed state intact');
  assert.equal(manager.getHistory().past.length, 1, 'Underlying history intact');
});
