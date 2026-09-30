import { NextResponse, type NextRequest } from 'next/server.js';
import { AuthorizationError, requireStaff } from '../../../../lib/admin/authorization.ts';
import {
  parseInboxQueryParams,
  toOrderListQuery,
  type InboxResponse,
} from '../../../../lib/admin/inbox-query.ts';
import { OrderRepository } from '../../../../lib/repositories/order-repository.ts';
import { createServerSupabaseClient } from '../../../../lib/supabase/server.ts';

export async function GET(request: NextRequest) {
  try {
    const staff = await requireStaff(request);
    const parsedParams = parseInboxQueryParams(request.nextUrl.searchParams);
    const listQuery = toOrderListQuery(parsedParams);

    const supabase = await createServerSupabaseClient();
    const orderRepo = new OrderRepository(supabase);

    const [{ rows, total }, counts] = await Promise.all([
      orderRepo.listInbox(listQuery, staff),
      orderRepo.countViews(staff),
    ]);

    const response: InboxResponse = {
      rows,
      counts,
      page: parsedParams.page,
      pageSize: parsedParams.pageSize,
      total,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      (error && typeof error === 'object' && 'status' in error && typeof (error as { status: unknown }).status === 'number')
    ) {
      const err = error as { message: string; status: number };
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = error instanceof Error ? error.message : 'Chưa thể tải danh sách đơn hàng.';
    const status =
      message.includes('Chưa đăng nhập')
        ? 401
        : message.includes('không có quyền') || message.includes('Yêu cầu quyền')
          ? 403
          : 500;
    return NextResponse.json(
      { error: status === 500 ? 'Chưa thể tải danh sách đơn hàng.' : message },
      { status }
    );
  }
}
