import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { promoteDesignAssets } from '../asset-store.ts';
import type { CreatePendingOrderInput } from '../domain/order.ts';
import type { CustomerInfo, PaymentInstructions, PendingOrder } from '../order-types.ts';
import { getPaymentInstructions } from '../payment-qr-provider.ts';
import { calculatePriceQuote } from '../pricing.ts';
import { getDesignSummary, type DesignState } from '../product-state.ts';
import { AssetRepository } from '../repositories/asset-repository.ts';
import { DesignVersionRepository } from '../repositories/design-version-repository.ts';
import { OrderEventRepository } from '../repositories/order-event-repository.ts';
import { OrderRepository } from '../repositories/order-repository.ts';
import { PaymentRepository } from '../repositories/payment-repository.ts';
import { ProjectRepository } from '../repositories/project-repository.ts';
import { createPrivilegedSupabaseClient } from '../supabase/admin.ts';
import { getSupabaseSecretKey } from '../supabase/config.ts';

export interface PrepareOrderInput {
  idempotencyKey: string;
  design: DesignState;
  customer: CustomerInfo;
  designRevision: string;
  preflightRevision: string;
  preflightAcknowledged: boolean;
  preflightSnapshot?: Record<string, unknown> | null;
  guestAccessSeed?: string;
}

export interface PreparedOrderResult {
  order: PendingOrder;
  guestAccessToken: string;
  paymentData: PaymentInstructions;
}

type ProjectRepo = Pick<ProjectRepository, 'createProject'>;
type AssetRepo = Pick<AssetRepository, 'promoteAsset'>;
type DesignVersionRepo = Pick<DesignVersionRepository, 'createVersion'>;
type OrderRepo = Pick<OrderRepository, 'getByIdempotencyKey' | 'createPendingOrder' | 'createGuestAccess'>;
type PaymentRepo = Pick<PaymentRepository, 'create'>;
type OrderEventRepo = Pick<OrderEventRepository, 'append'>;

export interface PrepareOrderOptions {
  supabaseClient?: SupabaseClient;
  orderRepo?: OrderRepo;
  assetRepo?: AssetRepo;
  projectRepo?: ProjectRepo;
  designVersionRepo?: DesignVersionRepo;
  orderEventRepo?: OrderEventRepo;
  paymentRepo?: PaymentRepo;
}

export class OrderPreparationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'OrderPreparationError';
    this.status = status;
  }
}

function resolveGuestToken(input: PrepareOrderInput): string {
  const secret = input.guestAccessSeed?.trim() || getSupabaseSecretKey();
  if (!secret) return randomBytes(32).toString('base64url');
  return createHmac('sha256', secret)
    .update(`guest-order:${input.idempotencyKey.trim()}`)
    .digest('base64url');
}

function createRepositories(options: PrepareOrderOptions) {
  if (
    options.orderRepo &&
    options.assetRepo &&
    options.projectRepo &&
    options.designVersionRepo &&
    options.orderEventRepo &&
    options.paymentRepo
  ) {
    return {
      orderRepo: options.orderRepo,
      assetRepo: options.assetRepo,
      projectRepo: options.projectRepo,
      designVersionRepo: options.designVersionRepo,
      orderEventRepo: options.orderEventRepo,
      paymentRepo: options.paymentRepo,
    };
  }

  const client = options.supabaseClient ?? createPrivilegedSupabaseClient();
  return {
    orderRepo: options.orderRepo ?? new OrderRepository(client),
    assetRepo: options.assetRepo ?? new AssetRepository(client),
    projectRepo: options.projectRepo ?? new ProjectRepository(client),
    designVersionRepo: options.designVersionRepo ?? new DesignVersionRepository(client),
    orderEventRepo: options.orderEventRepo ?? new OrderEventRepository(client),
    paymentRepo: options.paymentRepo ?? new PaymentRepository(client),
  };
}

export async function prepareOrderFromGuestCheckout(
  input: PrepareOrderInput,
  options: PrepareOrderOptions = {},
): Promise<PreparedOrderResult> {
  if (input.preflightAcknowledged !== true || !input.preflightRevision?.trim()) {
    throw new OrderPreparationError('Thiết kế cần được xác nhận kiểm tra in trước khi đặt hàng.');
  }
  if (input.designRevision?.trim() && input.designRevision.trim() !== input.preflightRevision.trim()) {
    throw new OrderPreparationError('Thiết kế đã có thay đổi so với bản kiểm tra in. Vui lòng kiểm tra lại thiết kế.');
  }
  if (!input.idempotencyKey?.trim()) {
    throw new OrderPreparationError('Thiếu mã chống tạo đơn trùng lặp.');
  }

  const repositories = createRepositories(options);
  const guestAccessToken = resolveGuestToken(input);
  const existingOrder = await repositories.orderRepo.getByIdempotencyKey(input.idempotencyKey.trim());
  if (existingOrder) {
    return {
      order: existingOrder,
      guestAccessToken,
      paymentData: await getPaymentInstructions(existingOrder),
    };
  }

  const tokenHash = createHash('sha256').update(guestAccessToken).digest('hex');
  const project = await repositories.projectRepo.createProject({
    productId: input.design.productId,
    variantId: input.design.variantId,
    guestKeyHash: tokenHash,
    status: 'approved',
    currentWorkingRevision: 1,
  });
  const promotion = await promoteDesignAssets(input.design, [], {
    projectId: project.id,
    assetRepo: repositories.assetRepo,
  });
  const immutableDesign = structuredClone(promotion.rewrittenDesign);
  if (Array.isArray(immutableDesign.elements)) {
    immutableDesign.elements = immutableDesign.elements.filter((element) => {
      const candidate = element as { generated?: unknown; data?: Record<string, unknown> };
      return candidate.generated !== true && candidate.data?.generated !== true && candidate.data?.patternGenerated !== true;
    });
  }

  const quote = calculatePriceQuote({
    productId: immutableDesign.productId,
    variantId: immutableDesign.variantId,
    quantity: immutableDesign.quantity,
    productOptions: immutableDesign.productOptions,
  });
  const summary = getDesignSummary({ ...immutableDesign, quantity: quote.quantity });
  const version = await repositories.designVersionRepo.createVersion({
    projectId: project.id,
    versionNumber: 1,
    source: 'customer_approved',
    designDocument: structuredClone(immutableDesign),
    productSnapshot: {
      productId: immutableDesign.productId,
      variantId: immutableDesign.variantId,
      quantity: quote.quantity,
      unitPrice: quote.unitPrice,
      subtotal: quote.subtotal,
    },
    preflightSnapshot: structuredClone(input.preflightSnapshot ?? {}),
    preflightRevision: input.preflightRevision.trim(),
  });

  const paymentReference = `QT-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
  const orderInput: CreatePendingOrderInput = {
    idempotencyKey: input.idempotencyKey.trim(),
    productId: immutableDesign.productId,
    variantId: immutableDesign.variantId,
    quantity: quote.quantity,
    unitPrice: quote.unitPrice,
    subtotal: quote.subtotal,
    total: quote.subtotal,
    currency: 'VND',
    customer: structuredClone(input.customer),
    projectId: project.id,
    approvedDesignVersionId: version.id,
    preflightRevision: input.preflightRevision.trim(),
    designSnapshot: {
      id: version.id,
      design: structuredClone(immutableDesign),
      summary,
      createdAt: version.createdAt,
    },
    payment: {
      orderId: '',
      provider: 'vietqr-demo',
      amount: quote.subtotal,
      currency: 'VND',
      paymentReference,
      status: 'pending_payment',
    },
  };
  const order = await repositories.orderRepo.createPendingOrder(orderInput);
  const persistedOrder: PendingOrder = {
    ...order,
    payment: {
      ...order.payment,
      orderId: order.id,
      paymentReference,
      amount: quote.subtotal,
      status: 'pending_payment',
    },
  };
  const paymentData = await getPaymentInstructions(persistedOrder);
  await repositories.paymentRepo.create({
    orderId: order.id,
    provider: order.payment.provider,
    amount: quote.subtotal,
    currency: 'VND',
    reference: paymentReference,
    qrPayload: paymentData.qrPayload,
    status: 'pending_payment',
  });
  await repositories.orderRepo.createGuestAccess({
    orderId: order.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await repositories.orderEventRepo.append({
    orderId: order.id,
    eventType: 'ORDER_CREATED',
    actorRole: 'customer',
    payload: {
      projectId: project.id,
      approvedDesignVersionId: version.id,
      paymentReference,
    },
  });

  return { order: persistedOrder, guestAccessToken, paymentData };
}
