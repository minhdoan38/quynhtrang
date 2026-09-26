import type { DesignState, DesignSummary } from './product-state';

export type PaymentStatus = 'pending' | 'confirmed';

export interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
  email?: string;
  note?: string;
}

export interface ApprovedDesignSnapshot {
  id: string;
  design: DesignState;
  summary: DesignSummary;
  createdAt: string;
}

export interface PendingOrder {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  paymentStatus: PaymentStatus;
  customer: CustomerInfo;
  snapshot: ApprovedDesignSnapshot;
  createdAt: string;
}
