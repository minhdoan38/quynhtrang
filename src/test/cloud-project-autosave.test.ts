import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAutosaveResponse, saveCustomerProjectRevision } from '../lib/services/cloud-project-autosave.ts';
import { createInitialState } from '../lib/product-state.ts';

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

test('handleAutosaveResponse applies stale message and conflict flag ONLY for STALE_REVISION', () => {
  const nonStaleResult = handleAutosaveResponse({
    success: false,
    error: 'NOT_FOUND',
  });

  assert.equal(nonStaleResult.conflict, false);
  assert.equal(nonStaleResult.code, 'NOT_FOUND');
  assert.equal(nonStaleResult.userMessage, 'Không tìm thấy dữ liệu yêu cầu.');
  assert.doesNotMatch(nonStaleResult.userMessage || '', /cập nhật trên thiết bị khác/);
});

test('saveCustomerProjectRevision redacts database errors and does not leak Postgres messages', async () => {
  const mockSupabase = {
    rpc: async () => ({
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint "customer_projects_pkey"',
        code: '23505',
      },
    }),
  };

  const result = await saveCustomerProjectRevision(
    'project_123',
    1,
    createInitialState('card'),
    mockSupabase as never,
  );

  assert.equal(result.conflict, false);
  assert.equal(result.code, 'UNEXPECTED_ERROR');
  assert.equal(result.userMessage, 'Lỗi lưu trữ đám mây');
  assert.doesNotMatch(JSON.stringify(result), /duplicate key|unique constraint|customer_projects_pkey/i);
});
