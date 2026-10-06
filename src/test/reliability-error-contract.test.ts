import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRetry,
  toSafeOperationError,
} from '../lib/reliability/error-contract.ts';
import {
  createOperationId,
  createSupportCode,
} from '../lib/reliability/operation-id.ts';

test('classifyRetry separates retry, refetch, unknown, and terminal outcomes', () => {
  assert.equal(classifyRetry('NETWORK_ERROR'), 'retryable');
  assert.equal(classifyRetry('RETRYABLE_SERVER_ERROR'), 'retryable');
  assert.equal(classifyRetry('STALE_REVISION'), 'refetchFirst');
  assert.equal(classifyRetry('REVISION_CONFLICT'), 'refetchFirst');
  assert.equal(classifyRetry('LEASE_EXPIRED'), 'refetchFirst');
  assert.equal(classifyRetry('UNKNOWN_OUTCOME'), 'unknownOutcome');
  assert.equal(classifyRetry('PAYMENT_REQUIRED'), 'nonRetryable');
  assert.equal(classifyRetry('NOT_FOUND'), 'nonRetryable');
});

test('toSafeOperationError preserves stable domain codes and retry guidance', () => {
  const result = toSafeOperationError(
    { code: 'STALE_REVISION', current_revision: 8, message: 'raw database detail' },
    { operation: 'projectAutosave', operationId: 'op_known' },
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'STALE_REVISION',
    safeMessageKey: 'reliability.stale_revision',
    userMessage: 'Thiết kế đã được cập nhật ở nơi khác. Hãy tải phiên bản mới nhất.',
    retryable: false,
    retryPolicy: 'refetchFirst',
    operationId: 'op_known',
    currentState: { revision: 8 },
  });
});

test('toSafeOperationError never returns SQL, PostgREST, stack, storage, token, or PII details', () => {
  const hostile = {
    code: '42P01',
    message: 'syntax error at or near "SELECT"; relation "orders" does not exist; bearer secret-token; minh@example.com; 0901234567',
    details: 'PostgREST customer-assets/private/user-42/art.png',
    hint: 'Use service_role token eyJhbGciOiJIUzI1NiJ9.payload.signature',
    stack: 'Error: database failure\n    at saveOrder (C:\\app\\route.ts:12:3)',
  };

  const result = toSafeOperationError(hostile, {
    operationId: 'op_sql',
    defaultMessage: hostile.message,
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.code, 'UNEXPECTED_ERROR');
  assert.equal(result.operationId, 'op_sql');
  assert.equal(result.retryPolicy, 'nonRetryable');
  assert.match(result.userMessage, /Không thể hoàn tất thao tác/);
  for (const secret of ['syntax error', 'orders', 'PostgREST', 'customer-assets', 'secret-token', 'eyJ', 'minh@example.com', '0901234567', 'route.ts']) {
    assert.doesNotMatch(serialized, new RegExp(secret, 'i'));
  }
});

test('toSafeOperationError maps network drops to safe retryable copy', () => {
  const result = toSafeOperationError(new TypeError('fetch failed: socket hang up'), {
    operation: 'loadQuote',
    operationId: 'op_network',
  });

  assert.equal(result.code, 'NETWORK_ERROR');
  assert.equal(result.retryable, true);
  assert.equal(result.retryPolicy, 'retryable');
  assert.equal(result.safeMessageKey, 'reliability.network_error');
  assert.equal(result.userMessage, 'Mất kết nối. Hãy kiểm tra mạng và thử lại.');
  assert.doesNotMatch(JSON.stringify(result), /fetch failed|socket hang up/i);
});

test('operation IDs are opaque URL-safe values and support codes are short and stable', () => {
  const first = createOperationId();
  const second = createOperationId('save');

  assert.match(first, /^op_[A-Za-z0-9_-]{20,}$/);
  assert.match(second, /^save_[A-Za-z0-9_-]{20,}$/);
  assert.notEqual(first, second);

  const supportCode = createSupportCode(first);
  assert.match(supportCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(createSupportCode(first), supportCode);
  assert.notEqual(createSupportCode(second), supportCode);
});
