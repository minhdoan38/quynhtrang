import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginTransaction,
  commitTransaction,
  cancelTransaction,
  hasActiveTransaction,
  type TransactionSession,
} from '../lib/history-transaction.ts';
import { createHistoryState } from '../lib/history.ts';
import { createInitialState } from '../lib/product-state.ts';

const defaultSelection = {
  selectedTarget: null,
  selectedElementId: null,
  selectedElementIds: [],
  selectionMode: 'default' as const,
  activeGroupId: null,
};

test('beginTransaction captures baseline without mutating history', () => {
  const s0 = createInitialState('wrapping');
  const tx = beginTransaction(s0, defaultSelection, 'change-font', 'Đổi font', ['text-1']);

  assert.equal(tx.type, 'change-font');
  assert.equal(tx.label, 'Đổi font');
  assert.deepEqual(tx.baselineState, s0);
  assert.deepEqual(tx.baselineSelection, defaultSelection);
  assert.deepEqual(tx.affectedIds, ['text-1']);
  assert.ok(hasActiveTransaction(tx));
  assert.equal(hasActiveTransaction(null), false);
});

test('commitTransaction commits single entry if state changed, or zero if unchanged', () => {
  const h0 = createHistoryState(50);
  const s0 = createInitialState('wrapping');
  const tx = beginTransaction(s0, defaultSelection, 'change-color', 'Đổi màu');

  // Case 1: Unchanged state
  const unchangeResult = commitTransaction(h0, tx, s0, defaultSelection);
  assert.equal(unchangeResult.committedEntry, null);
  assert.equal(unchangeResult.nextHistory.past.length, 0);

  // Case 2: Changed state
  const s1 = { ...s0, color: '#E8BCC9' };
  const changeResult = commitTransaction(h0, tx, s1, defaultSelection);
  assert.ok(changeResult.committedEntry);
  assert.equal(changeResult.nextHistory.past.length, 1);
  assert.equal(changeResult.nextHistory.past[0].before.color, s0.color);
  assert.equal(changeResult.nextHistory.past[0].after.color, '#E8BCC9');
  assert.equal(changeResult.nextHistory.past[0].label, 'Đổi màu');
});

test('cancelTransaction restores exact baseline state and selection', () => {
  const s0 = createInitialState('wrapping');
  const sel0 = {
    selectedTarget: 'text' as const,
    selectedElementId: 't-1',
    selectedElementIds: ['t-1'],
    selectionMode: 'default' as const,
    activeGroupId: null,
  };
  const tx = beginTransaction(s0, sel0, 'crop', 'Cắt ảnh', ['img-1']);

  const canceled = cancelTransaction(tx);
  assert.deepEqual(canceled.restoredState, s0);
  assert.deepEqual(canceled.restoredSelection, sel0);
});

test('batching multiple preview operations commits exactly 1 history entry', () => {
  let h = createHistoryState(50);
  const s0 = createInitialState('wrapping');
  const tx = beginTransaction(s0, defaultSelection, 'change-font', 'Đổi font', ['text-1']);

  // Simulate user tapping 4 different fonts in font browser
  let liveState = s0;
  const fontSequence = ['Lora', 'Montserrat', 'Inter', 'Playfair Display'];
  for (const font of fontSequence) {
    liveState = {
      ...liveState,
      productOptions: { ...liveState.productOptions, fontFamily: font },
    };
    // In-flight history remains 0!
    assert.equal(h.past.length, 0);
  }

  const result = commitTransaction(h, tx, liveState, defaultSelection);
  assert.ok(result.committedEntry);
  assert.equal(result.nextHistory.past.length, 1);
  assert.equal(result.nextHistory.past[0].before.productOptions.fontFamily, s0.productOptions.fontFamily);
  assert.equal(result.nextHistory.past[0].after.productOptions.fontFamily, 'Playfair Display');
});
