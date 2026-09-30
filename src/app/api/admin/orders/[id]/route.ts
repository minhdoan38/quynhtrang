import { NextResponse, type NextRequest } from 'next/server.js';
import { AuthorizationError, requireStaff } from '../../../../../lib/admin/authorization.ts';
import { OrderRepository } from '../../../../../lib/repositories/order-repository.ts';
import { createServerSupabaseClient } from '../../../../../lib/supabase/server.ts';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await requireStaff(request);
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
    }

    const supabase = await createServerSupabaseClient();
    const orderRepo = new OrderRepository(supabase);
    const detail = await orderRepo.getOrderDetail(id, staff, { eventLimit: 20 });

    if (!detail) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
    }

    return NextResponse.json({
      detail,
      order: detail,
      approvedDesign: detail.approvedDesign,
      payment: detail.payment,
      events: detail.recentEvents,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Chưa thể tải đơn hàng.';
    const status =
      message.includes('Chưa đăng nhập')
        ? 401
        : message.includes('không có quyền') || message.includes('Yêu cầu quyền')
          ? 403
          : 500;
    return NextResponse.json(
      { error: status === 500 ? 'Chưa thể tải đơn hàng.' : message },
      { status }
    );
  }
}
