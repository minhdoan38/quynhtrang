import { getAsset, promoteDesignAssets } from '../../../lib/asset-store.ts';
import { validateCustomerInfo } from '../../../lib/customer-info.ts';
import { DEFAULT_BANK_DETAILS } from '../../../lib/payment-qr-provider.ts';
import { serverOrderStore } from '../../../lib/server-order-store.ts';
import type { CustomerInfo, PendingOrder, PromotedAsset } from '../../../lib/order-types.ts';
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

function hasUnpromotedOrInvalidBlob(design: DesignState, rewrittenDesign: DesignState): boolean {
  if (rewrittenDesign.image?.src?.startsWith('blob:')) {
    return true;
  }

  const customBg = (rewrittenDesign.productOptions as { customBackgroundImage?: unknown } | undefined)?.customBackgroundImage;
  if (typeof customBg === 'string' && customBg.startsWith('blob:')) {
    return true;
  }

  if (Array.isArray(rewrittenDesign.elements)) {
    for (const el of rewrittenDesign.elements) {
      const data = el.data as Record<string, unknown> | undefined;
      if (data) {
        for (const key of ['src', 'url', 'originalSrc', 'removedBackgroundSrc', 'previewSrc']) {
          const val = data[key];
          if (typeof val === 'string' && val.startsWith('blob:')) {
            return true;
          }
        }
        if (data.texture && typeof data.texture === 'object') {
          const texture = data.texture as Record<string, unknown>;
          if (typeof texture.url === 'string' && texture.url.startsWith('blob:')) return true;
          if (typeof texture.src === 'string' && texture.src.startsWith('blob:')) return true;
        }
      }
      const directEl = el as unknown as Record<string, unknown>;
      if (typeof directEl.src === 'string' && directEl.src.startsWith('blob:')) return true;
      if (typeof directEl.url === 'string' && directEl.url.startsWith('blob:')) return true;
    }
  }

  if (design.image?.src && typeof design.image.src === 'string' && design.image.src.startsWith('blob:')) {
    const img = design.image as {
      src: string;
      type?: string;
      size?: number;
      width?: number;
      height?: number;
    };
    if (img.type && !img.type.startsWith('image/')) return true;
    if (img.size !== undefined && img.size <= 0) return true;
    if (img.width !== undefined && img.width <= 0) return true;
    if (img.height !== undefined && img.height <= 0) return true;
  }

  if (Array.isArray(design.elements)) {
    for (const el of design.elements) {
      const data = el.data as Record<string, unknown> | undefined;
      if (!data) continue;
      for (const key of ['src', 'url', 'originalSrc', 'removedBackgroundSrc', 'previewSrc']) {
        const val = data[key];
        if (typeof val === 'string' && val.startsWith('blob:')) {
          if (typeof data.type === 'string' && !data.type.startsWith('image/')) return true;
          if (typeof data.size === 'number' && data.size <= 0) return true;
        }
      }
    }
  }

  return false;
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

    if (body.preflightAcknowledged === false) {
      return Response.json(
        { error: 'Thiết kế chưa được xác nhận kiểm tra in.' },
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

    let rewrittenDesign: DesignState;
    let promotedAssets: PromotedAsset[];
    try {
      const promotion = await promoteDesignAssets(body.design);
      rewrittenDesign = promotion.rewrittenDesign;
      promotedAssets = promotion.promotedAssets;
      if (hasUnpromotedOrInvalidBlob(body.design, rewrittenDesign)) {
        return Response.json(
          { error: 'Chưa thể chuẩn bị tệp in từ thiết kế. Vui lòng tải lại ảnh và thử lại.' },
          { status: 400 }
        );
      }

      const hasMissingPayload = promotedAssets.some(
        (asset) => !(asset.payload || getAsset(asset.id)?.payload)
      );
      if (hasMissingPayload) {
        return Response.json(
          { error: 'Chưa thể chuẩn bị tệp in từ thiết kế. Vui lòng tải lại ảnh và thử lại.' },
          { status: 400 }
        );
      }
    } catch {
      return Response.json(
        { error: 'Chưa thể chuẩn bị tệp in từ thiết kế. Vui lòng tải lại ảnh và thử lại.' },
        { status: 400 }
      );
    }

    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim().length > 0
        ? body.idempotencyKey.trim()
        : `order-key-${crypto.randomUUID()}`;

    const order = serverOrderStore.createOrder({
      idempotencyKey,
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
