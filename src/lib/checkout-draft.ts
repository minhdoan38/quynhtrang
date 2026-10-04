import type { CheckoutDraft, CustomerInfo } from './order-types.ts';
import type { DesignState } from './product-state.ts';
import type { PaymentPolicy } from './domain/commercial-config.ts';

const DRAFT_STORAGE_KEY = 'quynhtrang_checkout_draft_v1';

export function createCheckoutDraft(
  design: DesignState,
  customer?: Partial<CustomerInfo>,
  quote?: Partial<Pick<CheckoutDraft, 'priceQuoteId' | 'commercialConfigVersionId' | 'quoteExpiresAt' | 'unitPrice' | 'totalAmount' | 'amountDueNow' | 'remainingAmount' | 'currency' | 'paymentPolicy'>>
): CheckoutDraft {
  const clonedDesign: DesignState = JSON.parse(JSON.stringify(design));
  const now = new Date().toISOString();

  return {
    id: `draft-${crypto.randomUUID()}`,
    idempotencyKey: `checkout-${crypto.randomUUID()}`,
    designRevision: `rev-${Date.now()}`,
    design: clonedDesign,
    productId: design.productId,
    variantId: design.variantId,
    quantity: design.quantity,
    customer: {
      fullName: customer?.fullName ?? '',
      phone: customer?.phone ?? '',
      shippingAddress: customer?.shippingAddress ?? '',
    },
    preflightRevision: 'rev-0',
    preflightAcknowledged: false,
    promotedAssets: [],
    status: 'editing',
    updatedAt: now,
    ...(quote?.priceQuoteId ? { priceQuoteId: quote.priceQuoteId } : {}),
    ...(quote?.commercialConfigVersionId ? { commercialConfigVersionId: quote.commercialConfigVersionId } : {}),
    ...(quote?.quoteExpiresAt ? { quoteExpiresAt: quote.quoteExpiresAt } : {}),
    ...(quote?.unitPrice !== undefined ? { unitPrice: quote.unitPrice } : {}),
    ...(quote?.totalAmount !== undefined ? { totalAmount: quote.totalAmount } : {}),
    ...(quote?.amountDueNow !== undefined ? { amountDueNow: quote.amountDueNow } : {}),
    ...(quote?.remainingAmount !== undefined ? { remainingAmount: quote.remainingAmount } : {}),
    ...(quote?.currency ? { currency: quote.currency } : {}),
    ...(quote?.paymentPolicy ? { paymentPolicy: quote.paymentPolicy } : {}),
  };
}

export function isQuoteExpired(draft: CheckoutDraft, now: number = Date.now()): boolean {
  if (!draft.quoteExpiresAt) return true;
  return new Date(draft.quoteExpiresAt).getTime() <= now;
}

export function attachQuoteToDraft(
  draft: CheckoutDraft,
  quote: {
    id: string;
    commercialConfigVersionId: string;
    expiresAt: string;
    calculation: {
      unitPrice: number;
      totalAmount: number;
      amountDueNow?: number;
      remainingAmount?: number;
      paymentPolicy?: PaymentPolicy;
    };
  }
): CheckoutDraft {
  return {
    ...draft,
    priceQuoteId: quote.id,
    commercialConfigVersionId: quote.commercialConfigVersionId,
    quoteExpiresAt: quote.expiresAt,
    unitPrice: quote.calculation.unitPrice,
    totalAmount: quote.calculation.totalAmount,
    amountDueNow: quote.calculation.amountDueNow ?? quote.calculation.totalAmount,
    remainingAmount: quote.calculation.remainingAmount ?? 0,
    currency: 'VND',
    paymentPolicy: quote.calculation.paymentPolicy,
    updatedAt: new Date().toISOString(),
  };
}

export function saveCheckoutDraft(draft: CheckoutDraft): void {
  if (typeof window === 'undefined' && typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    console.error('Failed to save checkout draft:', error);
  }
}

export function loadCheckoutDraft(): CheckoutDraft | null {
  if (typeof window === 'undefined' && typeof sessionStorage === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.customer) {
      return null;
    }
    return parsed as CheckoutDraft;
  } catch (error) {
    console.error('Failed to load checkout draft:', error);
    return null;
  }
}

export function clearCheckoutDraft(): void {
  if (typeof window === 'undefined' && typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear checkout draft:', error);
  }
}
