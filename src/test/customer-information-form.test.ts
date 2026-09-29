import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CUSTOMER_INFO_ERROR_MESSAGES,
  type CustomerInfo,
  validateCustomerInfo,
} from '../lib/customer-info.ts';
import type {
  CustomerInformationFormProps,
  CustomerOrderSummarySnippet,
} from '../components/checkout/customer-information-form.tsx';

const componentPath = resolve(process.cwd(), 'src/components/checkout/customer-information-form.tsx');
const componentExists = existsSync(componentPath);

test('component file must exist', () => {
  assert.equal(componentExists, true, 'src/components/checkout/customer-information-form.tsx must exist');
});

test('CustomerInformationFormProps interface compiles strictly', () => {
  const info: CustomerInfo = {
    fullName: 'Nguyễn Văn A',
    phone: '0912 345 678',
    shippingAddress: '12 Đường Hoa Lan, Phường 2, Phú Nhuận, TP.HCM',
  };
  const summary: CustomerOrderSummarySnippet = {
    product: 'Giấy bọc quà',
    quantity: 5,
    subtotal: '245.000đ',
  };

  let changed = false;
  let submitted = false;
  let retried = false;

  const props: CustomerInformationFormProps = {
    initialValues: info,
    isSubmitting: false,
    submitError: null,
    onRetry: () => {
      retried = true;
    },
    onChange: (_values) => {
      changed = true;
    },
    onSubmit: (_values) => {
      submitted = true;
    },
    summary,
  };

  props.onChange(info);
  props.onSubmit(info);
  props.onRetry?.();

  assert.equal(changed, true);
  assert.equal(submitted, true);
  assert.equal(retried, true);
});

test('component source meets all UI and accessibility contracts', () => {
  const source = readFileSync(componentPath, 'utf8');

  // Exact 3 fields
  assert.match(source, /id=\{fullNameId\}|id="fullName"/);
  assert.match(source, /id=\{phoneId\}|id="phone"/);
  assert.match(source, /id=\{shippingAddressId\}|id="shippingAddress"/);
  assert.match(source, /name="fullName"/);
  assert.match(source, /name="phone"/);
  assert.match(source, /name="shippingAddress"/);
  assert.match(source, /<input[^>]*type="tel"/);
  assert.match(source, /<textarea/);

  // Exact Vietnamese labels
  assert.match(source, /Họ và tên/);
  assert.match(source, /Số điện thoại/);
  assert.match(source, /Địa chỉ nhận hàng/);

  // Exact Vietnamese placeholders
  assert.match(source, /placeholder="Nguyễn Văn A"/);
  assert.match(source, /placeholder="09xx xxx xxx"/);
  assert.match(source, /placeholder="Số nhà, đường, phường\/xã, quận\/huyện, tỉnh\/thành"/);

  // Exact helper copy
  assert.match(source, /Dùng để liên hệ về đơn hàng khi cần\./);
  assert.match(source, /Thông tin này được dùng để xử lý và giao đơn hàng\./);

  // Input attributes
  assert.match(source, /autoComplete="name"/);
  assert.match(source, /autoComplete="tel"/);
  assert.match(source, /autoComplete="street-address"/);
  assert.match(source, /inputMode="tel"/);

  // 44px touch targets, including the retry action
  assert.ok(source.includes('h-11') || source.includes('min-h-[44px]'));
  assert.match(
    source,
    /<button[\s\S]*?className="[^"]*(?:h-11|min-h-\[44px\])[^"]*"[\s\S]*?>[\s\S]*?Thử lại[\s\S]*?<\/button>/,
  );

  // Accessibility wiring
  assert.match(source, /aria-invalid=/);
  assert.match(source, /aria-describedby=/);
  assert.match(source, /id=\{fullNameErrorId\}|id="fullName-error"/);
  assert.match(source, /id=\{phoneErrorId\}|id="phone-error"/);
  assert.match(source, /id=\{shippingAddressErrorId\}|id="shippingAddress-error"/);

  // Native and explicit ARIA required semantics on every customer field
  for (const name of ['fullName', 'phone', 'shippingAddress']) {
    assert.match(
      source,
      new RegExp(`<(?:input|textarea)[\\s\\S]*?name="${name}"[\\s\\S]*?required[\\s\\S]*?aria-required="true"[\\s\\S]*?>`),
    );
  }

  // Exact error banner copy
  assert.match(source, /Chưa thể chuẩn bị đơn hàng\./);
  assert.match(source, /Kiểm tra kết nối và thử lại\./);
  assert.match(source, /Thử lại/);

  // Vietnamese IME composition handling
  assert.match(source, /onCompositionStart/);
  assert.match(source, /onCompositionEnd/);

  // Secondary summary snippet
  assert.match(source, /Sản phẩm:/);
  assert.match(source, /Số lượng:/);
  assert.match(source, /Tạm tính:/);

  // Console protection: never log customer values
  assert.doesNotMatch(source, /console\.(log|info|warn|error)\([^)]*(values|customer|fullName|phone|shippingAddress)/);
});

test('validation messages match global constants', () => {
  assert.equal(CUSTOMER_INFO_ERROR_MESSAGES.fullName, 'Nhập họ và tên.');
  assert.equal(CUSTOMER_INFO_ERROR_MESSAGES.phone, 'Kiểm tra lại số điện thoại.');
  assert.equal(CUSTOMER_INFO_ERROR_MESSAGES.shippingAddress, 'Nhập địa chỉ nhận hàng đầy đủ hơn.');
});

test('validates customer values through domain validator', () => {
  const valid: CustomerInfo = {
    fullName: 'Nguyễn Văn A',
    phone: '0912 345 678',
    shippingAddress: '12 Đường Hoa Lan, Phường 2, Phú Nhuận, TP.HCM',
  };
  const res = validateCustomerInfo(valid);
  assert.equal(res.isValid, true);
  assert.deepEqual(res.errors, {});
});
