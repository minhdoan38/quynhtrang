import { PRODUCTS } from './product-state.ts';
import { formatCurrencyVND } from './domain/commercial-config.ts';
export { formatCurrencyVND } from './domain/commercial-config.ts';
export {
  calculatePrice,
  validateCommercialConfig,
  validateQuantity,
} from './domain/commercial-config.ts';
export type {
  CatalogStatus,
  CommercialConfigVersion,
  CommercialVariantRule,
  PaymentPolicy,
  PriceCalculation,
  VolumeTier,
} from './domain/commercial-config.ts';

export interface PriceQuote {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  formattedUnitPrice: string;
  formattedSubtotal: string;
  discountAmount?: number;
  formattedDiscount?: string;
}

const DEFAULT_PRICES: Readonly<Record<string, number>> = {
  wrapping: 49000,
  card: 29000,
  sticker: 19000,
  notebook: 49000,
};


export function calculatePriceQuote(params: {
  productId: string;
  variantId?: string;
  quantity: number;
  productOptions?: Record<string, unknown>;
}): PriceQuote {
  const safeQty = Math.max(1, Math.min(999, Math.floor(params.quantity) || 1));
  const product = PRODUCTS[params.productId as keyof typeof PRODUCTS];
  const variant = product?.variants.find(({ id }) => id === params.variantId);
  const unitPrice = variant?.price ?? DEFAULT_PRICES[params.productId] ?? 29000;
  const subtotal = unitPrice * safeQty;

  return {
    productId: params.productId,
    ...(params.variantId === undefined ? {} : { variantId: params.variantId }),
    quantity: safeQty,
    unitPrice,
    subtotal,
    formattedUnitPrice: formatCurrencyVND(unitPrice),
    formattedSubtotal: formatCurrencyVND(subtotal),
  };
}
