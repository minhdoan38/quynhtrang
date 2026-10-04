import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { promoteDesignAssets } from '../asset-store.ts';
import type { CreatePendingOrderInput } from '../domain/order.ts';
import type { PaymentPolicy } from '../domain/commercial-config.ts';
import type { CustomerInfo, PaymentInstructions, PendingOrder } from '../order-types.ts';
import { getPaymentInstructions } from '../payment-qr-provider.ts';
import { calculatePriceQuote } from '../pricing.ts';
import type { AdminCatalogRepository } from '../repositories/admin-catalog-repository.ts';
import { getDesignSummary, type DesignState } from '../product-state.ts';
import { resolveLegacyReferences } from './library-dependencies.ts';
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
  authenticatedUserId?: string;
  priceQuoteId?: string;
  quoteId?: string;
}

export interface PreparedOrderResult {
  order: PendingOrder;
  guestAccessToken: string;
  paymentData: PaymentInstructions;
}

type ProjectRepo = Pick<ProjectRepository, 'createProject'>;
type AssetRepo = Pick<AssetRepository, 'promoteAsset'>;
type DesignVersionRepo = Pick<DesignVersionRepository, 'createVersion'>;
type OrderRepo = Pick<OrderRepository, 'getByIdempotencyKey' | 'createPendingOrder' | 'createGuestAccess' | 'deleteById'>;
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
  catalogRepo?: Pick<AdminCatalogRepository, 'getProduct' | 'getProductById' | 'getVariant' | 'getCommercialVersion' | 'getPriceQuote' | 'consumeQuote'>;
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
  const message = `guest-order:${input.idempotencyKey.trim()}`;
  const secret = input.guestAccessSeed?.trim() || getSupabaseSecretKey();
  return secret
    ? createHmac('sha256', secret).update(message).digest('base64url')
    : createHash('sha256').update(message).digest('base64url');
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
      catalogRepo: options.catalogRepo,
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
    catalogRepo: options.catalogRepo,
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
  const candTmplId = input.design.sourceTemplate?.templateId ?? (typeof input.design.templateId === 'string' && input.design.templateId !== 'blank' ? input.design.templateId : null);
  const candVerId = input.design.sourceTemplate?.templateVersionId?.trim() || null;
  const project = await repositories.projectRepo.createProject({
    productId: input.design.productId,
    variantId: input.design.variantId,
    ownerUserId: input.authenticatedUserId ?? null,
    guestKeyHash: tokenHash,
    status: 'approved',
    currentWorkingRevision: 1,
    sourceTemplateId: candTmplId,
    sourceTemplateVersionId: candVerId,
  });
  const checkoutDesign = resolveLegacyReferences(input.design);
  const promotion = await promoteDesignAssets(checkoutDesign, [], {
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
  if (repositories.catalogRepo) {
    const prod = (await repositories.catalogRepo.getProductById?.(immutableDesign.productId)) ?? repositories.catalogRepo.getProduct(immutableDesign.productId);
    if (prod && prod.status !== 'active') {
      throw new OrderPreparationError('Sản phẩm đã ngừng kinh doanh.', 400);
    }
    const vr = repositories.catalogRepo.getVariant(immutableDesign.variantId);
    if (vr && (vr.status !== 'active' || vr.productId !== immutableDesign.productId)) {
      throw new OrderPreparationError('Biến thể sản phẩm đã ngừng kinh doanh.', 400);
    }
  }

  let finalUnitPrice: number;
  let finalSubtotal: number;
  let finalTotal: number;
  let finalAmountDueNow: number;
  let finalRemainingAmount: number;
  let resolvedPriceQuoteId: string | undefined;
  let resolvedQuoteExpiresAt: string | undefined;
  let resolvedCommercialConfigVersionId: string | undefined;
  let resolvedPaymentPolicy: PaymentPolicy;
  let resolvedDepositAmount: number | undefined;
  let resolvedAppliedTierMinimumQuantity: number | undefined;
  let commercialSnapshot: PendingOrder['commercialSnapshot'];
  const quoteId = input.quoteId ?? input.priceQuoteId;

  if (quoteId && repositories.catalogRepo) {
    const serverQuote = await repositories.catalogRepo.getPriceQuote(quoteId);
    if (!serverQuote) throw new OrderPreparationError('Báo giá không tồn tại.', 400);
    if (new Date(serverQuote.expiresAt).getTime() <= Date.now()) throw new OrderPreparationError('Báo giá đã hết hạn.', 400);
    if (serverQuote.productId !== immutableDesign.productId) throw new OrderPreparationError('Báo giá không khớp với sản phẩm đặt in.', 400);
    if (serverQuote.variantId !== immutableDesign.variantId) throw new OrderPreparationError('Báo giá không khớp với biến thể đặt in.', 400);
    if (serverQuote.quantity !== immutableDesign.quantity) throw new OrderPreparationError('Báo giá không khớp với số lượng đặt in.', 400);
    const expectedHash = createHash('sha256').update(input.idempotencyKey.trim()).digest('hex');
    if (serverQuote.checkoutKeyHash !== expectedHash) {
      throw new OrderPreparationError('Báo giá không khớp với phiên thanh toán.', 400);
    }
    if (serverQuote.consumedOrderId) {
      throw new OrderPreparationError('Báo giá đã được sử dụng.', 409);
    }
    const quoteProd = (await repositories.catalogRepo.getProductById?.(serverQuote.productId)) ?? repositories.catalogRepo.getProduct(serverQuote.productId);
    if (!quoteProd || quoteProd.status !== 'active') throw new OrderPreparationError('Sản phẩm đã ngừng kinh doanh.', 400);
    const quoteVariant = repositories.catalogRepo.getVariant(serverQuote.variantId);
    if (!quoteVariant || quoteVariant.productId !== serverQuote.productId || quoteVariant.status !== 'active') throw new OrderPreparationError('Biến thể sản phẩm đã ngừng kinh doanh.', 400);
    const calc = serverQuote.calculation;
    finalUnitPrice = calc.unitPrice;
    finalSubtotal = calc.totalAmount;
    finalTotal = calc.totalAmount;
    finalAmountDueNow = calc.amountDueNow;
    finalRemainingAmount = calc.remainingAmount;
    resolvedPriceQuoteId = serverQuote.id;
    resolvedQuoteExpiresAt = serverQuote.expiresAt;
    resolvedCommercialConfigVersionId = serverQuote.commercialConfigVersionId;
    resolvedPaymentPolicy = structuredClone(calc.paymentPolicy);
    resolvedDepositAmount = calc.isDeposit ? calc.amountDueNow : undefined;
    resolvedAppliedTierMinimumQuantity = calc.appliedTierMinimumQuantity;
    commercialSnapshot = {
      productId: serverQuote.productId, productName: serverQuote.productName ?? quoteProd.name,
      variantId: serverQuote.variantId, variantName: serverQuote.variantName ?? quoteVariant.name,
      definitionKey: serverQuote.definitionKey ?? quoteVariant.definitionKey ?? null,
      commercialConfigVersionId: serverQuote.commercialConfigVersionId,
      tierMinimumQuantity: calc.appliedTierMinimumQuantity, quantity: serverQuote.quantity,
      unitPrice: finalUnitPrice, subtotal: finalSubtotal, total: finalTotal, currency: 'VND',
      paymentPolicy: structuredClone(resolvedPaymentPolicy), depositAmount: resolvedDepositAmount ?? null,
      amountDueNow: finalAmountDueNow, remainingAmount: finalRemainingAmount,
    };
  } else {
    const legacyQuote = calculatePriceQuote({ productId: immutableDesign.productId, variantId: immutableDesign.variantId, quantity: immutableDesign.quantity, productOptions: immutableDesign.productOptions });
    finalUnitPrice = legacyQuote.unitPrice;
    finalSubtotal = legacyQuote.subtotal;
    finalTotal = legacyQuote.subtotal;
    finalAmountDueNow = legacyQuote.subtotal;
    finalRemainingAmount = 0;
    resolvedPaymentPolicy = { kind: 'full_payment' };
    const fallbackProduct = repositories.catalogRepo?.getProduct(immutableDesign.productId);
    const fallbackVariant = repositories.catalogRepo?.getVariant(immutableDesign.variantId);
    commercialSnapshot = {
      productId: immutableDesign.productId, productName: fallbackProduct?.name ?? immutableDesign.productId,
      variantId: immutableDesign.variantId, variantName: fallbackVariant?.name ?? immutableDesign.variantId,
      definitionKey: fallbackVariant?.definitionKey ?? null, commercialConfigVersionId: null,
      tierMinimumQuantity: null, quantity: legacyQuote.quantity, unitPrice: finalUnitPrice,
      subtotal: finalSubtotal, total: finalTotal, currency: 'VND', paymentPolicy: resolvedPaymentPolicy,
      depositAmount: null, amountDueNow: finalAmountDueNow, remainingAmount: finalRemainingAmount,
    };
  }

  const summary = getDesignSummary({ ...immutableDesign, quantity: immutableDesign.quantity });
  const version = await repositories.designVersionRepo.createVersion({
    projectId: project.id,
    versionNumber: 1,
    source: 'customer_approved',
    designDocument: structuredClone(immutableDesign),
    productSnapshot: {
      productId: immutableDesign.productId,
      variantId: immutableDesign.variantId,
      quantity: immutableDesign.quantity,
      unitPrice: finalUnitPrice,
      subtotal: finalSubtotal,
    },
    preflightSnapshot: structuredClone(input.preflightSnapshot ?? {}),
    preflightRevision: input.preflightRevision.trim(),
    sourceTemplateId: (project as { sourceTemplateId?: string | null }).sourceTemplateId ?? candTmplId,
    sourceTemplateVersionId: (project as { sourceTemplateVersionId?: string | null }).sourceTemplateVersionId ?? candVerId,
  });

  const paymentReference = `QT-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
  const orderInput: CreatePendingOrderInput = {
    idempotencyKey: input.idempotencyKey.trim(),
    productId: immutableDesign.productId,
    variantId: immutableDesign.variantId,
    quantity: immutableDesign.quantity,
    unitPrice: finalUnitPrice,
    subtotal: finalSubtotal,
    total: finalTotal,
    priceQuoteId: resolvedPriceQuoteId,
    quoteExpiresAt: resolvedQuoteExpiresAt,
    commercialSnapshot,
    commercialConfigVersionId: resolvedCommercialConfigVersionId,
    paymentPolicy: resolvedPaymentPolicy,
    depositAmount: resolvedDepositAmount,
    amountDueNow: finalAmountDueNow,
    remainingAmount: finalRemainingAmount,
    appliedTierMinimumQuantity: resolvedAppliedTierMinimumQuantity,
    currency: 'VND',
    customer: structuredClone(input.customer),
    projectId: project.id,
    customerUserId: input.authenticatedUserId ?? null,
    approvedDesignVersionId: version.id,
    customerApprovedDesignVersionId: version.id,
    productionDesignVersionId: version.id,
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
      amount: finalAmountDueNow,
      currency: 'VND',
      paymentReference,
      status: 'pending_payment',
    },
  };
  const order = await repositories.orderRepo.createPendingOrder(orderInput);
  if (resolvedPriceQuoteId && repositories.catalogRepo) {
    const consumed = await repositories.catalogRepo.consumeQuote?.(resolvedPriceQuoteId, order.id);
    if (!consumed) {
      await repositories.orderRepo.deleteById(order.id);
      throw new OrderPreparationError('Báo giá đã được sử dụng.', 409);
    }
  }
  const persistedOrder: PendingOrder = {
    ...order,
    payment: {
      ...order.payment,
      orderId: order.id,
      paymentReference,
      amount: finalAmountDueNow,
      status: 'pending_payment',
    },
  };
  const paymentData = await getPaymentInstructions(persistedOrder);
  try {
    await repositories.paymentRepo.create({
      orderId: order.id,
      provider: order.payment.provider,
      amount: finalAmountDueNow,
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
  } catch (error) {
    try {
      await repositories.orderRepo.deleteById(order.id);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Order preparation failed and rollback could not delete the order');
    }
    throw error;
  }

  return { order: persistedOrder, guestAccessToken, paymentData };
}
