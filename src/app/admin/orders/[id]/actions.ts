'use server';

import { revalidatePath } from 'next/cache.js';
import { requireCurrentStaff } from '../../../../lib/admin/authorization.ts';
import {
  confirmOrderPayment,
  placeOrderHold,
  releaseOrderHold,
  type AdminOrderMutationResult,
} from '../../../../lib/services/admin-order-operations.ts';
import {
  startOrderProduction,
  completeOrderProduction,
  cancelOrder,
  type FulfillmentResult,
} from '../../../../lib/services/admin-fulfillment-operations.ts';
import { createServerSupabaseClient } from '../../../../lib/supabase/server.ts';

export async function confirmPaymentAction(input: {
  orderId: string;
  expectedState: 'pending_payment' | 'payment_reported';
}): Promise<AdminOrderMutationResult> {
  try {
    const staff = await requireCurrentStaff('admin');
    const supabase = await createServerSupabaseClient();
    const result = await confirmOrderPayment({ supabase, staff }, input);

    if (result.ok) {
      revalidatePath('/admin/orders');
      revalidatePath(`/admin/orders/${input.orderId}`);
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      code: 'forbidden',
      message: error instanceof Error ? error.message : 'Bạn không có quyền thực hiện thao tác này.',
    };
  }
}

export async function holdOrderAction(input: {
  orderId: string;
  reason: string;
}): Promise<AdminOrderMutationResult> {
  try {
    const staff = await requireCurrentStaff('admin');
    const supabase = await createServerSupabaseClient();
    const result = await placeOrderHold({ supabase, staff }, input);

    if (result.ok) {
      revalidatePath('/admin/orders');
      revalidatePath(`/admin/orders/${input.orderId}`);
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      code: 'forbidden',
      message: error instanceof Error ? error.message : 'Bạn không có quyền thực hiện thao tác này.',
    };
  }
}

export async function releaseHoldAction(input: {
  orderId: string;
  expectedHoldId: string;
}): Promise<AdminOrderMutationResult> {
  try {
    const staff = await requireCurrentStaff('admin');
    const supabase = await createServerSupabaseClient();
    const result = await releaseOrderHold({ supabase, staff }, input);

    if (result.ok) {
      revalidatePath('/admin/orders');
      revalidatePath(`/admin/orders/${input.orderId}`);
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      code: 'forbidden',
      message: error instanceof Error ? error.message : 'Bạn không có quyền thực hiện thao tác này.',
    };
  }
}

export async function startProductionAction(input: {
  orderId: string;
  expectedFulfillmentStatus?: string;
}): Promise<FulfillmentResult<{ orderId: string; fulfillmentStatus: 'in_production' }>> {
  const result = await startOrderProduction({
    orderId: input.orderId,
    expectedFulfillmentStatus: input.expectedFulfillmentStatus,
    requestId: `start-prod-${Date.now()}-${crypto.randomUUID()}`,
  });

  if (result.ok) {
    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${input.orderId}`);
  }

  return result;
}

export async function completeProductionAction(input: {
  orderId: string;
  expectedFulfillmentStatus?: string;
}): Promise<FulfillmentResult<{ orderId: string; fulfillmentStatus: 'completed' }>> {
  const result = await completeOrderProduction({
    orderId: input.orderId,
    expectedFulfillmentStatus: input.expectedFulfillmentStatus,
    requestId: `comp-prod-${Date.now()}-${crypto.randomUUID()}`,
  });

  if (result.ok) {
    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${input.orderId}`);
  }

  return result;
}

export async function cancelOrderAction(input: {
  orderId: string;
  reason: string;
}): Promise<FulfillmentResult<{ orderId: string; fulfillmentStatus: 'cancelled' }>> {
  const result = await cancelOrder({
    orderId: input.orderId,
    reason: input.reason,
    requestId: `cancel-ord-${Date.now()}-${crypto.randomUUID()}`,
  });

  if (result.ok) {
    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${input.orderId}`);
  }

  return result;
}
