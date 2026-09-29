import type { DesignState, DesignSummary, ProductId } from './product-state';

export type PaymentStatus =
  | 'pending_payment'
  | 'payment_reported'
  | 'paid'
  | 'payment_failed'
  | 'cancelled';

export interface OrderPayment {
  orderId: string;
  provider: string;
  amount: number;
  currency: string;
  paymentReference: string;
  status: PaymentStatus;
  customerReportedAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  providerTransactionId?: string;
}

export interface PaymentInstructions {
  orderId: string;
  provider: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  currency: string;
  paymentReference: string;
  qrPayload: string;
  qrUrl?: string;
  expiresAt?: string;
}

export interface CustomerInfo {
  fullName: string;
  phone: string;
  shippingAddress: string;
}

export interface PromotedAsset {
  id: string;
  sourceKey: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  originalUrl: string;
  derivedUrls?: Record<string, string>;
  checksum?: string;
  data?: string;
  payload?: string;
}

export interface ApprovedDesignVersion {
  id: string;
  revision: string;
  design: DesignState;
  assets: PromotedAsset[];
  preflightRevision: string;
  preflightAcknowledged: boolean;
  createdAt: string;
}

export interface PendingOrder {
  id: string;
  idempotencyKey: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'confirmed' | PaymentStatus;
  customer: CustomerInfo;
  product: {
    productId: ProductId;
    variantId: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  };
  approvedDesignVersionId: string;
  preflightRevision: string;
  createdAt: string;
  snapshot: ApprovedDesignSnapshot;
  payment: OrderPayment;
}

export interface ApprovedDesignSnapshot {
  id: string;
  design: DesignState;
  summary: DesignSummary;
  createdAt: string;
}

export interface CheckoutDraft {
  id: string;
  idempotencyKey: string;
  designRevision: string;
  design: DesignState;
  productId: ProductId;
  variantId: string;
  quantity: number;
  customer: CustomerInfo;
  preflightRevision: string;
  preflightAcknowledged: boolean;
  promotedAssets: PromotedAsset[];
  approvedDesignVersionId?: string;
  orderId?: string;
  status: 'editing' | 'promoting' | 'creating-order' | 'ready-for-payment' | 'failed';
  updatedAt: string;
}
