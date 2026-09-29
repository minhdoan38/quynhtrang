import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCustomerInfo,
  normalizePhoneForValidation,
  validateCustomerInfo,
} from '../lib/customer-info.ts';

const VALID_INFO = {
  fullName: 'Nguyễn Văn A',
  phone: '0912345678',
  shippingAddress: 'Số 12 ngõ 34 Phố Huế, Hàng Bài, Hoàn Kiếm, Hà Nội',
};

test('normalizes customer information without changing meaningful text', () => {
  assert.deepEqual(
    normalizeCustomerInfo({
      fullName: '  Nguyễn Văn A  ',
      phone: ' (0912) 345.678- ',
      shippingAddress: '  Số 12 ngõ 34 Phố Huế  ',
    }),
    {
      fullName: 'Nguyễn Văn A',
      phone: '0912345678',
      shippingAddress: 'Số 12 ngõ 34 Phố Huế',
    },
  );
  assert.equal(normalizeCustomerInfo({ fullName: 'Đỗ  Thị B' }).fullName, 'Đỗ  Thị B');
  assert.equal(normalizePhoneForValidation('(024) 3825 1234'), '02438251234');
});

test('normalizes missing values to empty strings', () => {
  assert.deepEqual(normalizeCustomerInfo({}), {
    fullName: '',
    phone: '',
    shippingAddress: '',
  });
});

test('rejects empty or whitespace-only customer fields with exact errors', () => {
  const result = validateCustomerInfo({ fullName: '  ', phone: ' \t', shippingAddress: '\n' });

  assert.equal(result.isValid, false);
  assert.deepEqual(result.errors, {
    fullName: 'Nhập họ và tên.',
    phone: 'Kiểm tra lại số điện thoại.',
    shippingAddress: 'Nhập địa chỉ nhận hàng đầy đủ hơn.',
  });
  assert.deepEqual(result.normalized, { fullName: '', phone: '', shippingAddress: '' });
});

test('accepts Vietnamese names and preserves accents, capitalization, and internal spaces', () => {
  const result = validateCustomerInfo({
    ...VALID_INFO,
    fullName: '  Đỗ  Thị B  ',
  });

  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.normalized.fullName, 'Đỗ  Thị B');
});

test('rejects names outside bounded length', () => {
  assert.equal(validateCustomerInfo({ ...VALID_INFO, fullName: 'A' }).errors.fullName, 'Nhập họ và tên.');
  assert.equal(
    validateCustomerInfo({ ...VALID_INFO, fullName: 'A'.repeat(101) }).errors.fullName,
    'Nhập họ và tên.',
  );
});

test('accepts valid Vietnamese phone formats after punctuation normalization', () => {
  for (const phone of ['0912345678', '+84912345678', '(024) 3825 1234']) {
    const result = validateCustomerInfo({ ...VALID_INFO, phone });
    assert.equal(result.isValid, true, phone);
    assert.equal(result.errors.phone, undefined);
  }
});

test('rejects phone values with letters or digit counts outside 8 through 15', () => {
  for (const phone of ['1234567', '1234567890123456', '09123abc678']) {
    const result = validateCustomerInfo({ ...VALID_INFO, phone });
    assert.equal(result.isValid, false, phone);
    assert.equal(result.errors.phone, 'Kiểm tra lại số điện thoại.', phone);
  }
});

test('accepts detailed addresses and rejects trivial or oversized addresses', () => {
  assert.equal(validateCustomerInfo(VALID_INFO).isValid, true);
  assert.equal(
    validateCustomerInfo({ ...VALID_INFO, shippingAddress: '1234567' }).errors.shippingAddress,
    'Nhập địa chỉ nhận hàng đầy đủ hơn.',
  );
  assert.equal(
    validateCustomerInfo({ ...VALID_INFO, shippingAddress: 'A'.repeat(301) }).errors.shippingAddress,
    'Nhập địa chỉ nhận hàng đầy đủ hơn.',
  );
});

test('reports all invalid fields while retaining normalized values', () => {
  const result = validateCustomerInfo({
    fullName: ' ',
    phone: '1234567',
    shippingAddress: 'short',
  });

  assert.equal(result.isValid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['fullName', 'phone', 'shippingAddress']);
  assert.deepEqual(result.normalized, {
    fullName: '',
    phone: '1234567',
    shippingAddress: 'short',
  });
});
