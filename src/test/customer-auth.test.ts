import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomerEmail, validateOtpFormat } from '../lib/services/customer-auth.ts';

test('normalizes customer email correctly', () => {
  assert.equal(normalizeCustomerEmail('  User@Example.Com '), 'user@example.com');
  assert.equal(normalizeCustomerEmail('test+alias@domain.vn'), 'test+alias@domain.vn');
});

test('validates 6-digit OTP format', () => {
  assert.equal(validateOtpFormat('123456'), true);
  assert.equal(validateOtpFormat(' 123456 '), true);
  assert.equal(validateOtpFormat('12345'), false);
  assert.equal(validateOtpFormat('1234567'), false);
  assert.equal(validateOtpFormat('12a456'), false);
});
