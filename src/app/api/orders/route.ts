import { promoteDesignAssets } from '../../../lib/asset-store.ts';
import { validateCustomerInfo } from '../../../lib/customer-info.ts';
import { DEFAULT_BANK_DETAILS } from '../../../lib/payment-qr-provider.ts';
import { serverOrderStore } from '../../../lib/server-order-store.ts';
import type { CustomerInfo, PendingOrder } from '../../../lib/order-types.ts';
import type { DesignState } from '../../../lib/product-state.ts';

export interface CreateOrderRequestBody {
  idempotencyKey: string;
  design: DesignState;
  customer: CustomerInfo;
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
      return Response.json(
        { error: 'Dữ liệu thiết kế không hợp lệ.' },
        { status: 400 }
      );
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

    const { rewrittenDesign, promotedAssets } = await promoteDesignAssets(body.design);
    const order = serverOrderStore.createOrder({
      idempotencyKey: body.idempotencyKey || `order-key-${Date.now()}`,
      design: rewrittenDesign,
      customer: validation.normalized,
      preflightRevision: body.preflightRevision,
      preflightAcknowledged: body.preflightAcknowledged,
      assets: promotedAssets,
    });

    const responsePayload: CreateOrderResponseBody = {
      order,
      paymentData: {
        orderId: order.id,
        amount: order.payment?.amount ?? order.product.subtotal,
        description: `Thanh toán đơn hàng ${order.id}`,
        accountName: DEFAULT_BANK_DETAILS.accountName,
        bankName: DEFAULT_BANK_DETAILS.bankName,
      },
    };

    return Response.json(responsePayload, { status: 201 });
  } catch (err) {
    console.error('Lỗi tạo đơn hàng:', err);
    return Response.json(
      { error: 'Có lỗi xảy ra khi tạo đơn hàng.' },
      { status: 500 }
    );
  }
}
