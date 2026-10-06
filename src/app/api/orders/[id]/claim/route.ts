import { NextResponse } from 'next/server.js';
import {
  getAllGuestTokensFromRequest,
} from '../../../../../lib/guest-order-access.ts';
import {
  CustomerOrderClaimService,
  type ClaimResult,
} from '../../../../../lib/services/customer-order-claim.ts';
import { createServerSupabaseClient } from '../../../../../lib/supabase/server.ts';
import { createPrivilegedSupabaseClient } from '../../../../../lib/supabase/admin.ts';
import { getSupabaseSecretKey } from '../../../../../lib/supabase/config.ts';
import { toSafeRouteResponse } from '../../../../../lib/reliability/error-contract.ts';
export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;
    if (!id || !id.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Thiếu mã đơn hàng.' },
        { status: 400 },
      );
    }

    let authUser: { id: string } | null = null;
    let authClient = null;
    try {
      authClient = await createServerSupabaseClient();
      const { data: authData } = await authClient.auth.getUser();
      if (authData?.user?.id) {
        authUser = { id: authData.user.id };
      }
    } catch {
      // In non-auth context
    }

    if (!authUser) {
      return NextResponse.json(
        { ok: false, error: 'Vui lòng đăng nhập để lưu đơn hàng vào tài khoản.' },
        { status: 401 },
      );
    }

    const tokens = getAllGuestTokensFromRequest(request, id);
    let guestToken: string | null = tokens[0] ?? null;

    if (!guestToken) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      if (
        body &&
        typeof body === 'object' &&
        'guestToken' in body &&
        typeof body.guestToken === 'string' &&
        body.guestToken.trim()
      ) {
        guestToken = body.guestToken.trim();
      }
    }

    if (!guestToken) {
      return NextResponse.json(
        { ok: false, error: 'Phiên truy cập đơn hàng đã hết hạn hoặc không hợp lệ.' },
        { status: 401 },
      );
    }

    let result: ClaimResult;
    try {
      const claimService = new CustomerOrderClaimService(authClient ?? createPrivilegedSupabaseClient());
      result = await claimService.claimGuestOrder(id, guestToken);
    } catch (authErr) {
      if (getSupabaseSecretKey()) {
        try {
          const privService = new CustomerOrderClaimService(createPrivilegedSupabaseClient());
          result = await privService.claimGuestOrder(id, guestToken);
        } catch {
          throw authErr;
        }
      } else {
        throw authErr;
      }
    }

    return NextResponse.json({
      ok: true,
      orderId: result.orderId,
      projectId: result.projectId,
      idempotent: result.idempotent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Vui lòng đăng nhập')) {
      return NextResponse.json({ ok: false, error: message }, { status: 401 });
    }
    if (message.includes('hết hạn') || message.includes('không hợp lệ')) {
      return NextResponse.json({ ok: false, error: message }, { status: 403 });
    }
    if (message.includes('đã được liên kết')) {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    if (message.includes('Không tìm thấy')) {
      return NextResponse.json({ ok: false, error: message }, { status: 404 });
    }
    return toSafeRouteResponse(error, 500);
  }
}
