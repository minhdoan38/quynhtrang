import { NextResponse } from 'next/server.js';
import type { PendingOrder } from '../../../../../../lib/order-types.ts';
import {
  getAllGuestTokensFromRequest,
  hashGuestOrderAccessToken,
  verifyGuestOrderAccess,
  verifyStaffAccess,
} from '../../../../../../lib/guest-order-access.ts';
import { OrderEventRepository } from '../../../../../../lib/repositories/order-event-repository.ts';
import { OrderRepository } from '../../../../../../lib/repositories/order-repository.ts';
import { PaymentRepository } from '../../../../../../lib/repositories/payment-repository.ts';
import { serverOrderStore } from '../../../../../../lib/server-order-store.ts';
import { createPrivilegedSupabaseClient } from '../../../../../../lib/supabase/admin.ts';
import { getSupabaseSecretKey } from '../../../../../../lib/supabase/config.ts';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    if (!id) {
      return NextResponse.json({ error: 'Thiếu mã đơn hàng.' }, { status: 400 });
    }

    const isGuestAuthorized = await verifyGuestOrderAccess(request, id);
    const staff = !isGuestAuthorized ? await verifyStaffAccess(request) : null;

    if (!isGuestAuthorized && !staff) {
      return NextResponse.json(
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
        const paymentRepo = new PaymentRepository(client);
        const orderEventRepo = new OrderEventRepository(client);
        const orderRepo = new OrderRepository(client);

        await paymentRepo.markCustomerReported(id);
        await orderEventRepo.append({
          orderId: id,
          eventType: 'PAYMENT_REPORTED',
          actorRole: 'customer',
          payload: {
            reportedAt: new Date().toISOString(),
          },
        });

        if (staff) {
          order = await orderRepo.getById(id, { kind: 'staff', staff });
        } else {
          const tokens = getAllGuestTokensFromRequest(request, id);
          for (const token of tokens) {
            const tokenHash = hashGuestOrderAccessToken(token);
            order = await orderRepo.getById(id, {
              kind: 'guest',
              tokenHash,
            });
            if (order) break;
          }
        }
      } catch (err) {
        console.error('Lỗi cập nhật thanh toán Supabase:', err);
      }
    }

    if (!order) {
      order = serverOrderStore.reportPayment(id);
    } else {
      serverOrderStore.reportPayment(id);
    }

    if (!order) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (err) {
    console.error('Lỗi ghi nhận chuyển khoản:', err);
    return NextResponse.json(
      { error: 'Có lỗi xảy ra khi ghi nhận thanh toán.' },
      { status: 500 }
    );
  }
}
