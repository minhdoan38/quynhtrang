import test from 'node:test';
import assert from 'node:assert/strict';
import { formatProjectUpdatedDate } from '../lib/services/customer-auth.ts';

test('formats relative update time in Vietnamese', () => {
  const now = new Date('2026-09-30T12:00:00Z').getTime();
  const past = new Date('2026-09-30T10:00:00Z').getTime();
  assert.match(formatProjectUpdatedDate(past, now), /2 giờ trước|hôm nay/i);
});
