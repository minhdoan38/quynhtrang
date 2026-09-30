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
  assert.match(result.userMessage || '', /Thiết kế này vừa được cập nhật trên thiết bị khác/);
});
