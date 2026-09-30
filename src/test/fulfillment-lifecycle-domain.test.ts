import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertProductionStartEligible,
  assertProductionCompleteEligible,
  assertOrderCancelEligible,
  type OrderOperationalState,
} from '../lib/domain/order.ts';
import { resolveOrderNextAction } from '../lib/admin/order-next-action.ts';

test('assertProductionStartEligible passes only when paid, approved, no hold, and ready', () => {
  const validOrder = {
    paymentStatus: 'paid' as const,
    designStatus: 'approved' as const,
    fulfillmentStatus: 'ready_for_production' as const,
    activeHold: null,
    productionDesignVersionId: 'ver-2',
  };

  assert.doesNotThrow(() => assertProductionStartEligible(validOrder));

  // Reject unpaid
  assert.throws(
    () => assertProductionStartEligible({ ...validOrder, paymentStatus: 'pending_payment' }),
    /chưa thanh toán/i
  );

  // Reject unapproved design
  assert.throws(
    () => assertProductionStartEligible({ ...validOrder, designStatus: 'awaiting_review' }),
    /chưa được duyệt/i
  );

  // Reject active hold
  assert.throws(
    () =>
      assertProductionStartEligible({
        ...validOrder,
        activeHold: {
          id: 'h1',
          reason: 'Hold',
          heldAt: '',
          heldBy: { userId: 'u1', displayName: 'Staff', role: 'admin' },
        },
      }),
    /đang tạm giữ/i
  );

  // Reject missing production design version
  assert.throws(
    () => assertProductionStartEligible({ ...validOrder, productionDesignVersionId: null }),
    /thiếu phiên bản thiết kế sản xuất/i
  );

  // Reject already in production or completed
  assert.throws(
    () => assertProductionStartEligible({ ...validOrder, fulfillmentStatus: 'in_production' }),
    /không hợp lệ/i
  );
});

test('assertProductionCompleteEligible requires in_production and no active hold', () => {
  const validOrder = {
    paymentStatus: 'paid' as const,
    designStatus: 'approved' as const,
    fulfillmentStatus: 'in_production' as const,
    activeHold: null,
  };

  assert.doesNotThrow(() => assertProductionCompleteEligible(validOrder));

  // Reject if not in_production
  assert.throws(
    () => assertProductionCompleteEligible({ ...validOrder, fulfillmentStatus: 'ready_for_production' }),
    /chưa ở trạng thái đang sản xuất/i
  );

  // Reject active hold
  assert.throws(
    () =>
      assertProductionCompleteEligible({
        ...validOrder,
        activeHold: {
          id: 'h1',
          reason: 'Hold',
          heldAt: '',
          heldBy: { userId: 'u1', displayName: 'Staff', role: 'admin' },
        },
      }),
    /đang tạm giữ/i
  );
});

test('assertOrderCancelEligible rejects already completed or cancelled orders', () => {
  const openOrder: OrderOperationalState = {
    paymentStatus: 'pending_payment',
    designStatus: 'awaiting_review',
    fulfillmentStatus: 'unprocessed',
    activeHold: null,
  };

  assert.doesNotThrow(() => assertOrderCancelEligible(openOrder));

  assert.throws(
    () => assertOrderCancelEligible({ ...openOrder, fulfillmentStatus: 'completed' }),
    /đã hoàn tất/i
  );

  assert.throws(
    () => assertOrderCancelEligible({ ...openOrder, fulfillmentStatus: 'cancelled' }),
    /đã hủy/i
  );
});

test('resolveOrderNextAction provides actionable CTAs for production transitions', () => {
  const readyOrder: OrderOperationalState = {
    paymentStatus: 'paid',
    designStatus: 'approved',
    fulfillmentStatus: 'ready_for_production',
    activeHold: null,
  };

  const readyAction = resolveOrderNextAction(readyOrder);
  assert.equal(readyAction.kind, 'ready_for_production');
  assert.equal(readyAction.cta?.type, 'start_production');
  assert.equal(readyAction.cta?.label, 'Bắt đầu sản xuất');

  const inProdOrder: OrderOperationalState = {
    paymentStatus: 'paid',
    designStatus: 'approved',
    fulfillmentStatus: 'in_production',
    activeHold: null,
  };

  const inProdAction = resolveOrderNextAction(inProdOrder);
  assert.equal(inProdAction.kind, 'production_in_progress');
  assert.equal(inProdAction.cta?.type, 'complete_production');
  assert.equal(inProdAction.cta?.label, 'Hoàn tất sản xuất');
});
