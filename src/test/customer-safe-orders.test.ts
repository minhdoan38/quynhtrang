import test from 'node:test';
import assert from 'node:assert/strict';
import { getCustomerFacingStatusText } from '../lib/domain/order.ts';

test('maps internal fulfillment states to customer-safe copy', () => {
  assert.equal(getCustomerFacingStatusText('waiting_payment'), 'Chờ xác nhận thanh toán');
  assert.equal(getCustomerFacingStatusText('design_review'), 'Đang kiểm tra thiết kế');
  assert.equal(getCustomerFacingStatusText('preparing_production'), 'Đang chuẩn bị sản xuất');
  assert.equal(getCustomerFacingStatusText('in_production'), 'Đang sản xuất');
  assert.equal(getCustomerFacingStatusText('production_completed'), 'Sản xuất hoàn tất');
  assert.equal(getCustomerFacingStatusText('cancelled'), 'Đã hủy');
});
