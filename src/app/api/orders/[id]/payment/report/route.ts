import { NextResponse } from 'next/server.js';
import { reportUnexpectedError, recordReliabilityMetric } from '../../../../../../lib/observability/report.ts';
import type { PendingOrder } from '../../../../../../lib/order-types.ts';
import {
  getAllGuestTokensFromRequest,
  hashGuestOrderAccessToken,
  verifyGuestOrderAccess,
  verifyStaffAccess,
} from '../../../../../../lib/guest-order-access.ts';
import { OrderRepository } from '../../../../../../lib/repositories/order-repository.ts';
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

    if (hasSupabaseEnvironment && getSupabaseSecretKey()) {
      try {
        const client = createPrivilegedSupabaseClient();
        const orderRepo = new OrderRepository(client);

        if (staff) {
          order = await orderRepo.getById(id, { kind: 'staff', staff });
        } else {
          const tokens = getAllGuestTokensFromRequest(request, id);
          for (const token of tokens) {
            order = await orderRepo.getById(id, {
              kind: 'guest',
              tokenHash: hashGuestOrderAccessToken(token),
            });
            if (order) break;
          }
        }
        const purpose =
          order?.payment?.purpose ??
          serverOrderStore.getOrder(id)?.payment?.purpose ??
          'full_order_payment';

        const { data: rpcData, error: rpcError } = await client.rpc(
          'report_checkout_payment',
          { p_order_id: id, p_purpose: purpose },
        );

        if (rpcError) {
          recordReliabilityMetric('payment_confirmation_conflict', { role: staff ? staff.role : 'guest', status: 500 });
          reportUnexpectedError({
            operation: 'report_checkout_payment_rpc',
            route: '/api/orders/[id]/payment/report',
            role: staff ? staff.role : 'guest',
            error: rpcError,
          });
        } else {
          const code =
            rpcData && typeof rpcData === 'object' && 'code' in rpcData
              ? String(rpcData.code)
              : '';
          if (code === 'not_found') {
            return NextResponse.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
          }
        }

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
        reportUnexpectedError({
          operation: 'report_payment_supabase_update',
          route: '/api/orders/[id]/payment/report',
          role: staff ? staff.role : 'guest',
          error: err,
        });
      }
    }

    if (!order) {
      order = serverOrderStore.reportPayment(id);
    } else if (order.paymentStatus !== 'paid') {
      serverOrderStore.reportPayment(id);
    }
    if (!order) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (err) {
    reportUnexpectedError({
      operation: 'report_payment',
      route: '/api/orders/[id]/payment/report',
      status: 500,
      error: err,
    });
    return NextResponse.json(
      { error: 'Có lỗi xảy ra khi ghi nhận thanh toán.' },
      { status: 500 }
    );
  }
}
