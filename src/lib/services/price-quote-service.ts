import { createHash, randomUUID } from 'node:crypto';
import type { PriceCalculation } from '../domain/commercial-config.ts';
import { calculatePrice } from '../domain/commercial-config.ts';
import type { AdminCatalogRepository } from '../repositories/admin-catalog-repository.ts';

export interface CreatePriceQuoteInput {
  productId: string;
  variantId: string;
  quantity: number;
  checkoutKey: string;
  clientProvidedPrice?: number;
}

export interface PriceQuote {
  id: string;
  productId: string;
  variantId: string;
  commercialConfigVersionId: string;
  quantity: number;
  calculation: PriceCalculation;
  checkoutKeyHash: string;
  expiresAt: string;
  createdAt: string;
}

export const PRICE_QUOTE_TTL_MS = 30 * 60 * 1000;

interface QuoteDeps {
  repo: AdminCatalogRepository;
}

export async function createPriceQuote(input: CreatePriceQuoteInput, deps: QuoteDeps): Promise<PriceQuote> {
  if (!input.productId.trim() || !input.variantId.trim() || !input.checkoutKey.trim()) throw new Error('INVALID_INPUT');
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
  const createdAt = new Date();
  const quote: PriceQuote = {
    id: randomUUID(),
    productId: input.productId,
    variantId: input.variantId,
    commercialConfigVersionId: config.id,
    quantity: input.quantity,
    calculation,
    checkoutKeyHash: createHash('sha256').update(input.checkoutKey).digest('hex'),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + PRICE_QUOTE_TTL_MS).toISOString(),
  };
  return deps.repo.saveQuote(quote);
}
