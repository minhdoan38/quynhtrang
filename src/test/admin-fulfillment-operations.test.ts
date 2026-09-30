import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startProductionInternal,
  completeProductionInternal,
  cancelOrderInternal,
} from '../lib/services/admin-fulfillment-operations.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

function createMockSupabase(rpcHandler: (fn: string, params: Record<string, unknown>) => unknown): SupabaseClient {
  return {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      const data = await rpcHandler(fn, params);
      return { data, error: null };
    },
  } as unknown as SupabaseClient;
}

test('startProductionInternal dispatches start_order_production RPC', async () => {
  let calledFn = '';
  let calledParams: Record<string, unknown> = {};

  const mockClient = createMockSupabase((fn, params) => {
    calledFn = fn;
    calledParams = params;
    return {
      ok: true,
      value: { orderId: params.p_order_id, fulfillmentStatus: 'in_production' },
    };
  });

  const res = await startProductionInternal(
    {
      orderId: 'ord-123',
      expectedFulfillmentStatus: 'ready_for_production',
      requestId: 'req-1',
    },
    mockClient
  );

  assert.equal(calledFn, 'start_order_production');
  assert.equal(calledParams.p_order_id, 'ord-123');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.fulfillmentStatus, 'in_production');
  }
});

test('completeProductionInternal dispatches complete_order_production RPC', async () => {
  let calledFn = '';
  const mockClient = createMockSupabase((fn, params) => {
    calledFn = fn;
    return {
      ok: true,
      value: { orderId: params.p_order_id, fulfillmentStatus: 'completed' },
    };
  });

  const res = await completeProductionInternal(
    {
      orderId: 'ord-123',
      expectedFulfillmentStatus: 'in_production',
      requestId: 'req-2',
    },
    mockClient
  );

  assert.equal(calledFn, 'complete_order_production');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.fulfillmentStatus, 'completed');
  }
});

test('cancelOrderInternal rejects short reason and dispatches cancel_order RPC', async () => {
  let calledFn = '';
  const mockClient = createMockSupabase((fn, params) => {
    calledFn = fn;
    return {
      ok: true,
      value: { orderId: params.p_order_id, fulfillmentStatus: 'cancelled' },
    };
  });

  // Short reason rejected before RPC
  const invalidRes = await cancelOrderInternal(
    {
      orderId: 'ord-123',
      reason: 'No',
      requestId: 'req-3',
    },
    mockClient
  );
  assert.equal(invalidRes.ok, false);
  if (!invalidRes.ok) {
    assert.equal(invalidRes.code, 'INVALID_REASON');
  }

  // Valid reason dispatched
  const validRes = await cancelOrderInternal(
    {
      orderId: 'ord-123',
      reason: 'Khách hàng yêu cầu hủy đơn',
      requestId: 'req-4',
    },
    mockClient
  );

  assert.equal(calledFn, 'cancel_order');
  assert.equal(validRes.ok, true);
  if (validRes.ok) {
    assert.equal(validRes.value.fulfillmentStatus, 'cancelled');
  }
});
