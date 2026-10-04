import type { PaymentPolicy } from './commercial-config.ts';
import type { PaymentPurpose, PaymentStatus } from '../order-types.ts';

export type PaymentPresentation = {
  policyLabel: string;
  statusLabel: string;
  isFullyPaid: boolean;
  isCheckoutPaymentConfirmed: boolean;
  amountDueNow: number;
  remainingAmount: number;
};

export type OrderWithPaymentSnapshot = {
  id?: string;
  total?: number;
  currency?: string;
  paymentStatus?: PaymentStatus | string;
  payment_status?: string;
  paymentPolicy?: PaymentPolicy | null;
  payment_policy?: PaymentPolicy | Record<string, unknown> | null;
  commercialSnapshot?: {
    total?: number;
    paymentPolicy?: PaymentPolicy;
    depositAmount?: number | null;
    amountDueNow?: number;
    remainingAmount?: number;
    currency?: string;
  } | null;
  payment?: {
    id?: string;
    purpose?: PaymentPurpose | string;
    status?: PaymentStatus | string;
    amount?: number;
    currency?: string;
  } | null;
  order_payments?: Array<Record<string, unknown>> | Record<string, unknown> | null;
  depositAmount?: number | null;
  deposit_amount?: number | null;
  amountDueNow?: number | null;
  amount_due_now?: number | null;
  remainingAmount?: number | null;
  remaining_amount?: number | null;
};

export function resolvePaymentPresentation(order: OrderWithPaymentSnapshot): PaymentPresentation {
  const rawPolicy = order.paymentPolicy ?? order.payment_policy ?? order.commercialSnapshot?.paymentPolicy;
  let policyKind: string | undefined;
  if (rawPolicy && typeof rawPolicy === 'object' && 'kind' in rawPolicy && typeof rawPolicy.kind === 'string') {
    policyKind = rawPolicy.kind;
  }

  let rawPurpose: string | undefined;
  if (order.payment?.purpose) {
    rawPurpose = String(order.payment.purpose);
  } else if (Array.isArray(order.order_payments) && order.order_payments.length > 0) {
    const firstPayment = order.order_payments[0];
    if (firstPayment && typeof firstPayment === 'object' && 'purpose' in firstPayment && typeof firstPayment.purpose === 'string') {
      rawPurpose = firstPayment.purpose;
    }
  } else if (order.order_payments && typeof order.order_payments === 'object' && 'purpose' in order.order_payments && typeof order.order_payments.purpose === 'string') {
    rawPurpose = order.order_payments.purpose;
  }
  const rawStatus = String(order.paymentStatus ?? order.payment_status ?? order.payment?.status ?? 'pending_payment');

  const isDeposit = policyKind === 'fixed_deposit' || (policyKind !== 'full_payment' && (rawPurpose === 'checkout_deposit' || rawStatus === 'deposit_confirmed'));

  const total = Number(order.total ?? order.commercialSnapshot?.total ?? 0);
  let amountDueNow = 0;
  let remainingAmount = 0;

  if (isDeposit) {
    let depositFromPolicy: number | undefined;
    if (rawPolicy && typeof rawPolicy === 'object' && 'depositAmount' in rawPolicy && typeof rawPolicy.depositAmount === 'number') {
      depositFromPolicy = rawPolicy.depositAmount;
    }
    const rawDeposit = order.depositAmount ?? order.deposit_amount ?? order.commercialSnapshot?.depositAmount ?? depositFromPolicy;
    amountDueNow = Number(
      order.amountDueNow ?? order.amount_due_now ?? order.commercialSnapshot?.amountDueNow ?? rawDeposit ?? order.payment?.amount ?? 0
    );
    remainingAmount = Number(
      order.remainingAmount ?? order.remaining_amount ?? order.commercialSnapshot?.remainingAmount ?? (total > amountDueNow ? total - amountDueNow : 0)
    );
  } else {
    amountDueNow = Number(
      order.amountDueNow ?? order.amount_due_now ?? order.commercialSnapshot?.amountDueNow ?? order.payment?.amount ?? total
    );
    remainingAmount = Number(
      order.remainingAmount ?? order.remaining_amount ?? order.commercialSnapshot?.remainingAmount ?? 0
    );
  }

  let isCheckoutPaymentConfirmed = false;
  let isFullyPaid = false;

  if (isDeposit) {
    isCheckoutPaymentConfirmed = rawStatus === 'deposit_confirmed' || rawStatus === 'paid' || order.payment?.status === 'paid';
    isFullyPaid = (rawStatus === 'paid' || order.payment?.status === 'paid') && remainingAmount === 0;
  } else {
    isCheckoutPaymentConfirmed = rawStatus === 'paid' || order.payment?.status === 'paid';
    isFullyPaid = isCheckoutPaymentConfirmed;
  }

  const policyLabel = isDeposit ? 'Đặt cọc' : 'Thanh toán toàn bộ';

  let statusLabel = '';
  if (isDeposit) {
    if (isCheckoutPaymentConfirmed) {
      statusLabel = 'Đã xác nhận cọc';
    } else if (rawStatus === 'payment_reported') {
      statusLabel = 'Khách báo đã chuyển';
    } else if (rawStatus === 'payment_failed') {
      statusLabel = 'Thanh toán lỗi';
    } else if (rawStatus === 'cancelled') {
      statusLabel = 'Đã hủy';
    } else {
      statusLabel = 'Chờ đặt cọc';
    }
  } else {
    if (rawStatus === 'paid' || order.payment?.status === 'paid') {
      statusLabel = 'Đã thanh toán';
    } else if (rawStatus === 'payment_reported') {
      statusLabel = 'Khách báo đã chuyển';
    } else if (rawStatus === 'payment_failed') {
      statusLabel = 'Thanh toán lỗi';
    } else if (rawStatus === 'cancelled') {
      statusLabel = 'Đã hủy';
    } else {
      statusLabel = 'Chờ thanh toán';
    }
  }

  return {
    policyLabel,
    statusLabel,
    isFullyPaid,
    isCheckoutPaymentConfirmed,
    amountDueNow,
    remainingAmount,
  };
}

export function isPaymentSatisfiedForProduction(order: OrderWithPaymentSnapshot): boolean {
  const presentation = resolvePaymentPresentation(order);
  return presentation.isCheckoutPaymentConfirmed;
}
