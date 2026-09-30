import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmOrderPayment,
  placeOrderHold,
  releaseOrderHold,
} from '../lib/services/admin-order-operations.ts';
import type { StaffIdentity } from '../lib/domain/order.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('admin-order-operations service', () => {
  const adminStaff: StaffIdentity = {
    userId: 'staff-admin-1',
    role: 'admin',
  };

  const editorStaff: StaffIdentity = {
    userId: 'staff-editor-2',
    role: 'editor',
  };

  describe('confirmOrderPayment', () => {
    it('rejects Editor before calling RPC', async () => {
      let rpcCalled = false;
      const fakeClient = {
        rpc() {
          rpcCalled = true;
          return Promise.resolve({ data: {}, error: null });
        },
      } as unknown as SupabaseClient;

      const result = await confirmOrderPayment(
        { supabase: fakeClient, staff: editorStaff },
        { orderId: 'order-1', expectedState: 'payment_reported' }
      );

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, 'forbidden');
        assert.equal(result.message, 'Bạn không có quyền thực hiện thao tác này.');
      }
      assert.equal(rpcCalled, false);
    });

    it('returns confirmed result on admin success', async () => {
      const fakeClient = {
        rpc(name: string, params: Record<string, unknown>) {
          assert.equal(name, 'confirm_order_payment');
          assert.equal(params.p_order_id, 'order-1');
          assert.equal(params.p_expected_state, 'payment_reported');
          return Promise.resolve({
            data: { code: 'confirmed', order_id: 'order-1', payment_status: 'paid' },
            error: null,
          });
        },
      } as unknown as SupabaseClient;

      const result = await confirmOrderPayment(
        { supabase: fakeClient, staff: adminStaff },
        { orderId: 'order-1', expectedState: 'payment_reported' }
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.code, 'confirmed');
        assert.equal(result.orderId, 'order-1');
      }
    });

    it('maps state_conflict and already_paid to safe message', async () => {
      const fakeConflictClient = {
        rpc() {
          return Promise.resolve({
            data: { code: 'state_conflict' },
            error: null,
          });
        },
      } as unknown as SupabaseClient;

      const conflictResult = await confirmOrderPayment(
        { supabase: fakeConflictClient, staff: adminStaff },
        { orderId: 'order-1', expectedState: 'payment_reported' }
      );

      assert.equal(conflictResult.ok, false);
      if (!conflictResult.ok) {
        assert.equal(conflictResult.code, 'state_conflict');
        assert.equal(conflictResult.message, 'Đơn này vừa được cập nhật.');
      }

      const fakeAlreadyPaidClient = {
        rpc() {
          return Promise.resolve({
            data: { code: 'already_paid' },
            error: null,
          });
        },
      } as unknown as SupabaseClient;

      const paidResult = await confirmOrderPayment(
        { supabase: fakeAlreadyPaidClient, staff: adminStaff },
        { orderId: 'order-1', expectedState: 'payment_reported' }
      );

      assert.equal(paidResult.ok, false);
      if (!paidResult.ok) {
        assert.equal(paidResult.code, 'already_paid');
        assert.equal(paidResult.message, 'Đơn này vừa được cập nhật.');
      }
    });

    it('maps cancelled and RPC error correctly', async () => {
      const fakeCancelledClient = {
        rpc() {
          return Promise.resolve({
            data: { code: 'cancelled' },
            error: null,
          });
        },
      } as unknown as SupabaseClient;

      const cancelledResult = await confirmOrderPayment(
        { supabase: fakeCancelledClient, staff: adminStaff },
        { orderId: 'order-1', expectedState: 'payment_reported' }
      );

      assert.equal(cancelledResult.ok, false);
      if (!cancelledResult.ok) {
        assert.equal(cancelledResult.code, 'cancelled');
        assert.equal(cancelledResult.message, 'Không thể cập nhật đơn đã hủy.');
      }

      const fakeErrorClient = {
        rpc() {
          return Promise.resolve({
            data: null,
            error: { message: 'Database connection failed' },
          });
        },
      } as unknown as SupabaseClient;

      const errorResult = await confirmOrderPayment(
        { supabase: fakeErrorClient, staff: adminStaff },
        { orderId: 'order-1', expectedState: 'payment_reported' }
      );

      assert.equal(errorResult.ok, false);
      if (!errorResult.ok) {
        assert.equal(errorResult.code, 'unavailable');
        assert.equal(errorResult.message, 'Chưa thể cập nhật đơn hàng.');
      }
    });
  });

  describe('placeOrderHold', () => {
    it('validates reason length before calling RPC', async () => {
      let rpcCalled = false;
      const fakeClient = {
        rpc() {
          rpcCalled = true;
          return Promise.resolve({ data: {}, error: null });
        },
      } as unknown as SupabaseClient;

      const shortResult = await placeOrderHold(
        { supabase: fakeClient, staff: adminStaff },
        { orderId: 'order-1', reason: '  a ' }
      );

      assert.equal(shortResult.ok, false);
      if (!shortResult.ok) {
        assert.equal(shortResult.code, 'validation_error');
      }
      assert.equal(rpcCalled, false);

      const longResult = await placeOrderHold(
        { supabase: fakeClient, staff: adminStaff },
        { orderId: 'order-1', reason: 'a'.repeat(501) }
      );

      assert.equal(longResult.ok, false);
      if (!longResult.ok) {
        assert.equal(longResult.code, 'validation_error');
      }
      assert.equal(rpcCalled, false);
    });

    it('returns held result on admin success with trimmed reason', async () => {
      const fakeClient = {
        rpc(name: string, params: Record<string, unknown>) {
          assert.equal(name, 'hold_order');
          assert.equal(params.p_order_id, 'order-1');
          assert.equal(params.p_reason, 'Lý do chính đáng');
          return Promise.resolve({
            data: { code: 'held', hold_id: 'hold-123' },
            error: null,
          });
        },
      } as unknown as SupabaseClient;

      const result = await placeOrderHold(
        { supabase: fakeClient, staff: adminStaff },
        { orderId: 'order-1', reason: '  Lý do chính đáng  ' }
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.code, 'held');
        assert.equal(result.orderId, 'order-1');
      }
    });
  });

  describe('releaseOrderHold', () => {
    it('rejects Editor before calling RPC', async () => {
      let rpcCalled = false;
      const fakeClient = {
        rpc() {
          rpcCalled = true;
          return Promise.resolve({ data: {}, error: null });
        },
      } as unknown as SupabaseClient;

      const result = await releaseOrderHold(
        { supabase: fakeClient, staff: editorStaff },
        { orderId: 'order-1', expectedHoldId: 'hold-1' }
      );

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, 'forbidden');
      }
      assert.equal(rpcCalled, false);
    });

    it('returns released result on admin success', async () => {
      const fakeClient = {
        rpc(name: string, params: Record<string, unknown>) {
          assert.equal(name, 'release_order_hold');
          assert.equal(params.p_order_id, 'order-1');
          assert.equal(params.p_expected_hold_id, 'hold-1');
          return Promise.resolve({
            data: { code: 'released', hold_id: 'hold-1' },
            error: null,
          });
        },
      } as unknown as SupabaseClient;

      const result = await releaseOrderHold(
        { supabase: fakeClient, staff: adminStaff },
        { orderId: 'order-1', expectedHoldId: 'hold-1' }
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.code, 'released');
        assert.equal(result.orderId, 'order-1');
      }
    });
  });
});
