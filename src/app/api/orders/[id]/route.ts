import type { PendingOrder } from '../../../../lib/order-types.ts';
import {
  getGuestOrderAccessTokenFromRequest,
  hashGuestOrderAccessToken,
  verifyGuestOrderAccess,
  verifyStaffAccess,
} from '../../../../lib/guest-order-access.ts';
import { OrderRepository } from '../../../../lib/repositories/order-repository.ts';
import { serverOrderStore } from '../../../../lib/server-order-store.ts';
import { createPrivilegedSupabaseClient } from '../../../../lib/supabase/admin.ts';
import { getSupabaseSecretKey } from '../../../../lib/supabase/config.ts';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    if (!id) {
      return Response.json(
        { error: 'Thiếu mã đơn hàng.' },
        { status: 400 }
      );
    }

    const isGuestAuthorized = await verifyGuestOrderAccess(request, id);
    const staff = !isGuestAuthorized ? await verifyStaffAccess(request) : null;

    if (!isGuestAuthorized && !staff) {
      return Response.json(
        { error: 'Không có quyền truy cập đơn hàng.' },
        { status: 401 }
      );
    }

    let order: PendingOrder | null = null;
    const hasSupabaseEnvironment = Boolean(
      getSupabaseSecretKey() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      process.env.SUPABASE_URL?.trim()
    );

    if (hasSupabaseEnvironment) {
      try {
        const client = createPrivilegedSupabaseClient();
        const orderRepo = new OrderRepository(client);
        if (staff) {
          order = await orderRepo.getById(id, { kind: 'staff', staff });
        } else {
          const token = getGuestOrderAccessTokenFromRequest(request, id);
          if (token) {
            order = await orderRepo.getById(id, {
              kind: 'guest',
              tokenHash: hashGuestOrderAccessToken(token),
            });
          }
        }
      } catch (err) {
        console.error('Lỗi truy vấn đơn hàng từ Supabase:', err);
      }
    }

    if (!order) {
      order = serverOrderStore.getOrder(id);
    }

    if (!order) {
      return Response.json(
        { error: 'Không tìm thấy đơn hàng.' },
        { status: 404 }
      );
    }

    return Response.json({ order });
  } catch (err) {
    console.error('Lỗi truy vấn đơn hàng:', err);
    return Response.json(
      { error: 'Lỗi máy chủ.' },
      { status: 500 }
    );
  }
}
