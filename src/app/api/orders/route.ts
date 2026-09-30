import { NextResponse } from 'next/server.js';
import { setGuestOrderAccessCookie } from '../../../lib/guest-order-access.ts';
import { validateCustomerInfo } from '../../../lib/customer-info.ts';
import { DEFAULT_BANK_DETAILS } from '../../../lib/payment-qr-provider.ts';
import {
  createServerOrderPreparationOptions,
} from '../../../lib/server-order-store.ts';
import type { CustomerInfo, PendingOrder } from '../../../lib/order-types.ts';
import type { DesignState } from '../../../lib/product-state.ts';
import {
  OrderPreparationError,
  prepareOrderFromGuestCheckout,
} from '../../../lib/services/prepare-order-from-guest-checkout.ts';
import { getSupabaseSecretKey } from '../../../lib/supabase/config.ts';
import { createServerSupabaseClient } from '../../../lib/supabase/server.ts';

export interface CreateOrderRequestBody {
  idempotencyKey: string;
  design: DesignState;
  customer: CustomerInfo;
  designRevision?: string;
  preflightRevision?: string;
  preflightAcknowledged?: boolean;
}
export interface CreateOrderResponseBody {
  order: PendingOrder;
  paymentData: {
    orderId: string;
    amount: number;
    description: string;
    accountName: string;
    bankName: string;
  };
}


export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateOrderRequestBody>;
    if (!body?.design || !body.design.productId) {
      return Response.json({ error: 'Dữ liệu thiết kế không hợp lệ.' }, { status: 400 });
    }

    const validation = validateCustomerInfo(body.customer ?? {});
    if (!validation.isValid) {
      const firstError =
        validation.errors.fullName ??
        validation.errors.phone ??
        validation.errors.shippingAddress ??
        'Thông tin khách hàng không hợp lệ.';
      return Response.json({ error: firstError }, { status: 400 });
    }

    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim()
        : `order-key-${crypto.randomUUID()}`;
    const hasSupabaseEnvironment = Boolean(
      getSupabaseSecretKey() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      process.env.SUPABASE_URL?.trim(),
    );
    let prepared;
    let authenticatedUserId: string | undefined;
    if (hasSupabaseEnvironment) {
      try {
        const supabase = await createServerSupabaseClient();
        const { data: authData } = await supabase.auth.getUser();
        authenticatedUserId = authData?.user?.id;
      } catch {
        // Guest user
      }
    }

    try {
      prepared = await prepareOrderFromGuestCheckout(
        {
          idempotencyKey,
          design: body.design,
          customer: validation.normalized,
          designRevision: body.designRevision ?? '',
          preflightRevision: body.preflightRevision ?? '',
          preflightAcknowledged: body.preflightAcknowledged === true,
          authenticatedUserId,
        },
        hasSupabaseEnvironment ? undefined : createServerOrderPreparationOptions(),
      );
    } catch (error) {
      if (error instanceof OrderPreparationError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof Error && /Tài nguyên/.test(error.message)) {
        return Response.json(
          { error: 'Chưa thể chuẩn bị tệp in từ thiết kế. Vui lòng tải lại ảnh và thử lại.' },
          { status: 400 },
        );
      }
      throw error;
    }

    const responsePayload: CreateOrderResponseBody = {
      order: prepared.order,
      paymentData: {
        orderId: prepared.order.id,
        amount: prepared.paymentData.amount,
        description: `Thanh toán đơn hàng ${prepared.order.id}`,
        accountName: DEFAULT_BANK_DETAILS.accountName,
        bankName: DEFAULT_BANK_DETAILS.bankName,
      },
    };
    const response = NextResponse.json(responsePayload, { status: 201 });
    setGuestOrderAccessCookie(response, prepared.guestAccessToken, prepared.order.id);
    return response;
  } catch (error) {
    console.error('Lỗi tạo đơn hàng:', error);
    return Response.json({ error: 'Có lỗi xảy ra khi tạo đơn hàng.' }, { status: 500 });
  }
}
