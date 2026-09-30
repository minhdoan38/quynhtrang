'use server';

import { revalidatePath } from 'next/cache.js';
import { requireCurrentStaff } from '../../../../lib/admin/authorization.ts';
import {
  confirmOrderPayment,
  placeOrderHold,
  releaseOrderHold,
  type AdminOrderMutationResult,
} from '../../../../lib/services/admin-order-operations.ts';
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
