import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffIdentity } from '../domain/order.ts';

export type AdminOrderMutationErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'state_conflict'
  | 'already_paid'
  | 'cancelled'
  | 'unavailable';

export type AdminOrderMutationResult =
  | { ok: true; code: 'confirmed' | 'held' | 'released'; orderId: string }
  | { ok: false; code: AdminOrderMutationErrorCode; message: string };

export interface AdminOrderOperationDeps {
  supabase: SupabaseClient;
  staff: StaffIdentity;
}

export async function confirmOrderPayment(
  deps: AdminOrderOperationDeps,
  input: { orderId: string; expectedState: 'pending_payment' | 'payment_reported' }
): Promise<AdminOrderMutationResult> {
  if (deps.staff.role !== 'admin') {
    return {
      ok: false,
      code: 'forbidden',
      message: 'Bạn không có quyền thực hiện thao tác này.',
    };
  }

  if (!input.orderId) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Mã đơn hàng không hợp lệ.',
    };
  }

  try {
    const { data, error } = await deps.supabase.rpc('confirm_order_payment', {
      p_order_id: input.orderId,
      p_expected_state: input.expectedState,
    });

    if (error) {
      return {
        ok: false,
        code: 'unavailable',
        message: 'Chưa thể cập nhật đơn hàng.',
      };
    }

    const res = data as Record<string, unknown> | null;
    const code = String(res?.code ?? '');

    if (code === 'confirmed') {
      return {
        ok: true,
        code: 'confirmed',
        orderId: input.orderId,
      };
    }

    if (code === 'forbidden') {
      return {
        ok: false,
        code: 'forbidden',
        message: 'Bạn không có quyền thực hiện thao tác này.',
      };
    }

    if (code === 'state_conflict' || code === 'already_paid') {
      return {
        ok: false,
        code: code as AdminOrderMutationErrorCode,
        message: 'Đơn này vừa được cập nhật.',
      };
    }

    if (code === 'cancelled') {
      return {
        ok: false,
        code: 'cancelled',
        message: 'Không thể cập nhật đơn đã hủy.',
      };
    }

    if (code === 'not_found') {
      return {
        ok: false,
        code: 'not_found',
        message: 'Không tìm thấy đơn hàng.',
      };
    }

    return {
      ok: false,
      code: 'unavailable',
      message: 'Chưa thể cập nhật đơn hàng.',
    };
  } catch {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Chưa thể cập nhật đơn hàng.',
    };
  }
}

export async function placeOrderHold(
  deps: AdminOrderOperationDeps,
  input: { orderId: string; reason: string }
): Promise<AdminOrderMutationResult> {
  if (deps.staff.role !== 'admin') {
    return {
      ok: false,
      code: 'forbidden',
      message: 'Bạn không có quyền thực hiện thao tác này.',
    };
  }

  const trimmedReason = (input.reason ?? '').trim();
  if (trimmedReason.length < 3 || trimmedReason.length > 500) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Lý do tạm giữ phải từ 3 đến 500 ký tự.',
    };
  }

  try {
    const { data, error } = await deps.supabase.rpc('hold_order', {
      p_order_id: input.orderId,
      p_reason: trimmedReason,
    });

    if (error) {
      return {
        ok: false,
        code: 'unavailable',
        message: 'Chưa thể cập nhật đơn hàng.',
      };
    }

    const res = data as Record<string, unknown> | null;
    const code = String(res?.code ?? '');

    if (code === 'held') {
      return {
        ok: true,
        code: 'held',
        orderId: input.orderId,
      };
    }

    if (code === 'forbidden') {
      return {
        ok: false,
        code: 'forbidden',
        message: 'Bạn không có quyền thực hiện thao tác này.',
      };
    }

    if (code === 'state_conflict') {
      return {
        ok: false,
        code: 'state_conflict',
        message: 'Đơn này vừa được cập nhật.',
      };
    }

    if (code === 'cancelled') {
      return {
        ok: false,
        code: 'cancelled',
        message: 'Không thể cập nhật đơn đã hủy.',
      };
    }

    if (code === 'validation_error') {
      return {
        ok: false,
        code: 'validation_error',
        message: 'Lý do tạm giữ phải từ 3 đến 500 ký tự.',
      };
    }

    if (code === 'not_found') {
      return {
        ok: false,
        code: 'not_found',
        message: 'Không tìm thấy đơn hàng.',
      };
    }

    return {
      ok: false,
      code: 'unavailable',
      message: 'Chưa thể cập nhật đơn hàng.',
    };
  } catch {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Chưa thể cập nhật đơn hàng.',
    };
  }
}

export async function releaseOrderHold(
  deps: AdminOrderOperationDeps,
  input: { orderId: string; expectedHoldId: string }
): Promise<AdminOrderMutationResult> {
  if (deps.staff.role !== 'admin') {
    return {
      ok: false,
      code: 'forbidden',
      message: 'Bạn không có quyền thực hiện thao tác này.',
    };
  }

  if (!input.orderId || !input.expectedHoldId) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Thông tin tạm giữ không hợp lệ.',
    };
  }

  try {
    const { data, error } = await deps.supabase.rpc('release_order_hold', {
      p_order_id: input.orderId,
      p_expected_hold_id: input.expectedHoldId,
    });

    if (error) {
      return {
        ok: false,
        code: 'unavailable',
        message: 'Chưa thể cập nhật đơn hàng.',
      };
    }

    const res = data as Record<string, unknown> | null;
    const code = String(res?.code ?? '');

    if (code === 'released') {
      return {
        ok: true,
        code: 'released',
        orderId: input.orderId,
      };
    }

    if (code === 'forbidden') {
      return {
        ok: false,
        code: 'forbidden',
        message: 'Bạn không có quyền thực hiện thao tác này.',
      };
    }

    if (code === 'state_conflict') {
      return {
        ok: false,
        code: 'state_conflict',
        message: 'Đơn này vừa được cập nhật.',
      };
    }

    if (code === 'not_found') {
      return {
        ok: false,
        code: 'not_found',
        message: 'Không tìm thấy đơn hàng.',
      };
    }

    return {
      ok: false,
      code: 'unavailable',
      message: 'Chưa thể cập nhật đơn hàng.',
    };
  } catch {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Chưa thể cập nhật đơn hàng.',
    };
  }
}
