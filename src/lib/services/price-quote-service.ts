import { createHash, randomUUID } from 'node:crypto';
import type { PriceCalculation } from '../domain/commercial-config.ts';
import { calculatePrice, PRICE_QUOTE_TTL_MS } from '../domain/commercial-config.ts';
import type { AdminCatalogRepository } from '../repositories/admin-catalog-repository.ts';

export { PRICE_QUOTE_TTL_MS };

export interface QuoteSummaryLabels {
  totalLabel: string;
  amountDueNowLabel?: string;
  remainingAmountLabel?: string;
  unitPriceLabel: string;
}

export function getQuoteSummaryLabels(calculation: PriceCalculation): QuoteSummaryLabels {
  const isDeposit = calculation.paymentPolicy.kind !== 'full_payment' && calculation.amountDueNow < calculation.totalAmount;
  return {
    totalLabel: isDeposit ? 'Tổng đơn' : 'Tạm tính',
    amountDueNowLabel: isDeposit ? 'Thanh toán trước' : undefined,
    remainingAmountLabel: isDeposit ? 'Còn lại' : undefined,
    unitPriceLabel: 'Đơn giá',
  };
}

export interface CreatePriceQuoteInput {
  productId: string;
  variantId: string;
  quantity: number;
  checkoutKey: string;
  clientProvidedPrice?: number;
  accessContext?: string;
}

export interface PriceQuote {
  id: string;
  productId: string;
  variantId: string;
  productName?: string;
  variantName?: string;
  definitionKey?: string | null;
  commercialConfigVersionId: string;
  quantity: number;
  calculation: PriceCalculation & {
    isDeposit: boolean;
    appliedTierMinimumQuantity: number;
  };
  summaryLabels?: QuoteSummaryLabels;
  checkoutKeyHash: string;
  expiresAt: string;
  createdAt: string;
  consumedOrderId?: string | null;
}

interface QuoteDeps {
  repo: AdminCatalogRepository;
}

export async function createPriceQuote(input: CreatePriceQuoteInput, deps: QuoteDeps): Promise<PriceQuote> {
  if (!input.productId.trim() || !input.variantId.trim() || !input.checkoutKey.trim()) throw new Error('INVALID_INPUT');
  if ('getProductById' in deps.repo && typeof deps.repo.getProductById === 'function') {
    await deps.repo.getProductById(input.productId);
  }
  const product = deps.repo.getProduct(input.productId);
  if (!product || product.status !== 'active') throw new Error('PRODUCT_NOT_SELLABLE');
  const variant = deps.repo.getVariant(input.variantId);
  if (!variant || variant.productId !== input.productId || variant.status !== 'active') throw new Error('VARIANT_NOT_SELLABLE');
  if (!product.currentCommercialConfigVersionId) throw new Error('COMMERCIAL_CONFIG_UNAVAILABLE');
  const config = deps.repo.getCommercialVersion(product.currentCommercialConfigVersionId);
  if (!config) throw new Error('COMMERCIAL_CONFIG_UNAVAILABLE');
  let calculation: PriceCalculation;
  try {
    calculation = calculatePrice(config, input.variantId, input.quantity);
  } catch (error) {
    throw new Error(`INVALID_QUANTITY: ${error instanceof Error ? error.message : String(error)}`);
  }
  const isDeposit = calculation.paymentPolicy.kind !== 'full_payment' && calculation.amountDueNow < calculation.totalAmount;
  const enrichedCalculation = {
    ...calculation,
    isDeposit,
    appliedTierMinimumQuantity: calculation.appliedTier.minimumQuantity,
  };
  const createdAt = new Date();
  const hashPayload = [input.checkoutKey, input.accessContext].filter(Boolean).join(':');
  const quote: PriceQuote = {
    id: randomUUID(),
    productId: input.productId,
    variantId: input.variantId,
    productName: product.name,
    variantName: variant.name,
    definitionKey: variant.definitionKey,
    commercialConfigVersionId: config.id,
    quantity: input.quantity,
    calculation: enrichedCalculation,
    summaryLabels: getQuoteSummaryLabels(calculation),
    checkoutKeyHash: createHash('sha256').update(hashPayload).digest('hex'),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + PRICE_QUOTE_TTL_MS).toISOString(),
    consumedOrderId: null,
  };
  return deps.repo.saveQuote(quote);
}

export interface VerifyQuoteResult {
  valid: boolean;
  code?: 'VALID' | 'QUOTE_NOT_FOUND' | 'QUOTE_EXPIRED' | 'PRODUCT_NOT_SELLABLE' | 'VARIANT_NOT_SELLABLE';
  quote?: PriceQuote;
}

export async function verifyPriceQuote(
  quoteId: string,
  deps: QuoteDeps
): Promise<VerifyQuoteResult> {
  const quote = await deps.repo.getPriceQuote(quoteId);
  if (!quote) {
    return { valid: false, code: 'QUOTE_NOT_FOUND' };
  }
  if ('getProductById' in deps.repo && typeof deps.repo.getProductById === 'function') {
    await deps.repo.getProductById(quote.productId);
  }
  const product = deps.repo.getProduct(quote.productId);
  if (!product || product.status !== 'active') {
    return { valid: false, code: 'PRODUCT_NOT_SELLABLE', quote };
  }
  const variant = deps.repo.getVariant(quote.variantId);
  if (!variant || variant.productId !== quote.productId || variant.status !== 'active') {
    return { valid: false, code: 'VARIANT_NOT_SELLABLE', quote };
  }
  if (new Date(quote.expiresAt).getTime() <= Date.now()) {
    return { valid: false, code: 'QUOTE_EXPIRED', quote };
  }
  return { valid: true, code: 'VALID', quote };
}

export async function refreshPriceQuote(
  quoteId: string,
  checkoutKey: string,
  deps: QuoteDeps,
  quantity?: number
): Promise<{ quote: PriceQuote; previousVersionId: string }> {
  const oldQuote = await deps.repo.getPriceQuote(quoteId);
  if (!oldQuote) throw new Error('QUOTE_NOT_FOUND');
  const targetQuantity = typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity >= 1
    ? quantity
    : oldQuote.quantity;
  const newQuote = await createPriceQuote(
    {
      productId: oldQuote.productId,
      variantId: oldQuote.variantId,
      quantity: targetQuantity,
      checkoutKey,
    },
    deps
  );
  return { quote: newQuote, previousVersionId: oldQuote.commercialConfigVersionId };
}
