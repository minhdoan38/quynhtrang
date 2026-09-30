import { NextResponse, type NextRequest } from 'next/server.js';
import { requireStaff } from '@/lib/admin/authorization.ts';
import { OrderEventRepository } from '@/lib/repositories/order-event-repository.ts';
import { OrderRepository } from '@/lib/repositories/order-repository.ts';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';

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
    const order = await orderRepo.getOrderDetail(id, staff, { eventLimit: 1 });

    if (!order) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limitParam = parseInt(searchParams.get('limit') || '20', 10);
    const cursor = searchParams.get('cursor') || undefined;

    const eventRepo = new OrderEventRepository(supabase);
    const eventPage = await eventRepo.listForOrder(id, staff, {
      limit: isNaN(limitParam) ? 20 : limitParam,
      cursor,
    });

    return NextResponse.json(eventPage);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chưa thể tải hoạt động.';
    const status = message.includes('Chưa đăng nhập') ? 401 : message.includes('không có quyền') ? 403 : 500;
    return NextResponse.json({ error: 'Chưa thể tải hoạt động.' }, { status });
  }
}
