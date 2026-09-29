import type { CheckoutDraft, CustomerInfo } from './order-types.ts';
import type { DesignState } from './product-state.ts';

const DRAFT_STORAGE_KEY = 'quynhtrang_checkout_draft_v1';

export function createCheckoutDraft(
  design: DesignState,
  customer?: Partial<CustomerInfo>
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
