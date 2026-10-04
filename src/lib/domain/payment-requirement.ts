export type PaymentPurpose = 'checkout_deposit' | 'full_order_payment';

export type PaymentRequirementStatus =
  | 'pending_payment'
  | 'payment_reported'
  | 'paid'
  | 'payment_failed'
  | 'cancelled';

export type PaymentRequirement = {
  id: string;
  orderId: string;
  purpose: PaymentPurpose;
  amount: number;
  currency: 'VND';
  status: PaymentRequirementStatus;
};
