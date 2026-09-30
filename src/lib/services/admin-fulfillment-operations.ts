import type { SupabaseClient } from '@supabase/supabase-js';
import { requireCurrentStaff } from '../admin/authorization.ts';
import { createServerSupabaseClient } from '../supabase/server.ts';
import { validateRevisionReason } from '../domain/design-revision.ts';

export type FulfillmentErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_LOCKED'
  | 'STATE_CONFLICT'
  | 'PAYMENT_REQUIRED'
  | 'DESIGN_NOT_APPROVED'
  | 'DESIGN_VERSION_MISSING'
  | 'ORDER_HELD'
  | 'ACTIVE_DRAFT_EXISTS'
  | 'ORDER_NOT_IN_PRODUCTION'
  | 'ORDER_COMPLETED'
  | 'INVALID_REASON';

export type FulfillmentResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: FulfillmentErrorCode; message: string };

export async function startProductionInternal(
  params: {
    orderId: string;
    expectedFulfillmentStatus?: string;
    requestId: string;
  },
  client: SupabaseClient
): Promise<FulfillmentResult<{ orderId: string; fulfillmentStatus: 'in_production' }>> {
  const { data, error } = await client.rpc('start_order_production', {
    p_order_id: params.orderId,
    p_expected_fulfillment_status: params.expectedFulfillmentStatus ?? null,
    p_request_id: params.requestId,
  });

  if (error) {
    return { ok: false, code: 'FORBIDDEN', message: error.message };
  }

  return data as FulfillmentResult<{ orderId: string; fulfillmentStatus: 'in_production' }>;
}

export async function completeProductionInternal(
  params: {
    orderId: string;
    expectedFulfillmentStatus?: string;
    requestId: string;
  },
  client: SupabaseClient
): Promise<FulfillmentResult<{ orderId: string; fulfillmentStatus: 'completed' }>> {
  const { data, error } = await client.rpc('complete_order_production', {
    p_order_id: params.orderId,
    p_expected_fulfillment_status: params.expectedFulfillmentStatus ?? null,
    p_request_id: params.requestId,
  });

  if (error) {
    return { ok: false, code: 'FORBIDDEN', message: error.message };
  }

  return data as FulfillmentResult<{ orderId: string; fulfillmentStatus: 'completed' }>;
}

export async function cancelOrderInternal(
  params: {
    orderId: string;
    reason: string;
    requestId: string;
  },
  client: SupabaseClient
): Promise<FulfillmentResult<{ orderId: string; fulfillmentStatus: 'cancelled' }>> {
  const validation = validateRevisionReason(params.reason);
  if (!validation.valid) {
    return { ok: false, code: 'INVALID_REASON', message: validation.reason || 'Lý do hủy không hợp lệ' };
  }

  const { data, error } = await client.rpc('cancel_order', {
    p_order_id: params.orderId,
    p_reason: params.reason,
    p_request_id: params.requestId,
  });

  if (error) {
    return { ok: false, code: 'FORBIDDEN', message: error.message };
  }

  return data as FulfillmentResult<{ orderId: string; fulfillmentStatus: 'cancelled' }>;
}

export async function startOrderProduction(params: {
  orderId: string;
  expectedFulfillmentStatus?: string;
  requestId: string;
}): Promise<FulfillmentResult<{ orderId: string; fulfillmentStatus: 'in_production' }>> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  return startProductionInternal(params, supabase);
}

export async function completeOrderProduction(params: {
  orderId: string;
  expectedFulfillmentStatus?: string;
  requestId: string;
}): Promise<FulfillmentResult<{ orderId: string; fulfillmentStatus: 'completed' }>> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  return completeProductionInternal(params, supabase);
}

export async function cancelOrder(params: {
  orderId: string;
  reason: string;
  requestId: string;
}): Promise<FulfillmentResult<{ orderId: string; fulfillmentStatus: 'cancelled' }>> {
  await requireCurrentStaff('admin');
  const supabase = await createServerSupabaseClient();
  return cancelOrderInternal(params, supabase);
}
