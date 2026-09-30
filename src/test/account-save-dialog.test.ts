import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClaimStateMessage } from '../lib/services/customer-order-claim.ts';

test('maps claim and migration states to concise Vietnamese copy', () => {
  assert.equal(parseClaimStateMessage('claiming'), 'Đang liên kết đơn hàng...');
  assert.equal(parseClaimStateMessage('migrating'), 'Đang lưu thiết kế của bạn...');
  assert.equal(parseClaimStateMessage('done'), 'Đã lưu đơn hàng và thiết kế vào tài khoản.');
});
