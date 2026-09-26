import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldSelectTextOnFocus,
  startTextEdit,
  updateComposition,
  canCommitTextEdit,
  type ActiveTextEditState,
} from '../lib/text-edit-session.ts';

test('placeholder edit starts with select-all intent', () => {
  assert.equal(shouldSelectTextOnFocus({ placeholder: true, text: 'Nhập tiêu đề' }), true);
});

test('normal template content does not force select-all', () => {
  assert.equal(shouldSelectTextOnFocus({ placeholder: false, text: 'Chúc mừng' }), false);
});

test('composition keeps edit session active until composition ends', () => {
  const session: ActiveTextEditState = startTextEdit('text-1', 'Xin chào', false);
  const composing = updateComposition(session, true);
  assert.equal(composing.isComposing, true);
  assert.equal(canCommitTextEdit(composing), false);
  assert.equal(canCommitTextEdit(updateComposition(composing, false)), true);
});
