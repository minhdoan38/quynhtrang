import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAutosaveResponse } from '../lib/services/cloud-project-autosave.ts';

test('detects stale revision conflict and signals user', () => {
  const result = handleAutosaveResponse({
    success: false,
    error: 'STALE_REVISION',
    current_revision: 5,
  });

  assert.equal(result.conflict, true);
  assert.equal(result.serverRevision, 5);
  assert.equal(result.code, 'STALE_REVISION');
  assert.equal(result.safeMessageKey, 'reliability.stale_revision');
  assert.equal(result.retryPolicy, 'refetchFirst');
  assert.equal(result.retryable, false);
  assert.match(result.operationId || '', /^autosave_[A-Za-z0-9_-]{20,}$/);
  assert.match(result.userMessage || '', /Thiết kế này vừa được cập nhật trên thiết bị khác/);
});

test('aligns successful autosave with safe operation identifier', () => {
  const result = handleAutosaveResponse(
    { success: true, new_revision: 6 },
    { operationId: 'op_custom_save' },
  );

  assert.equal(result.conflict, false);
  assert.equal(result.newRevision, 6);
  assert.equal(result.operationId, 'op_custom_save');
});
