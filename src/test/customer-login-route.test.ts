import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRedirectUrl } from '../lib/services/customer-auth.ts';

test('only allows internal relative paths for redirect', () => {
  assert.equal(sanitizeRedirectUrl('/my-designs'), '/my-designs');
  assert.equal(sanitizeRedirectUrl('/my-orders'), '/my-orders');
  assert.equal(sanitizeRedirectUrl('https://malicious.com'), '/my-designs');
  assert.equal(sanitizeRedirectUrl('//malicious.com'), '/my-designs');
});
