import type { CustomerInfo, OrderPayment, PendingOrder } from '../order-types.ts';
import type { ProductId } from '../product-state.ts';

export type StaffRole = 'admin' | 'editor';

export interface StaffIdentity {
  userId: string;
  role: StaffRole;
}

export type DesignStatus = 'awaiting_review' | 'ready' | 'editing' | 'approved' | 'needs_changes';
export type FulfillmentStatus = 'unprocessed' | 'ready_for_production' | 'in_production' | 'completed' | 'cancelled';

export type AttentionReason =
  | 'PAYMENT_REPORTED'
  | 'PAYMENT_FAILED'
  | 'DESIGN_REVIEW'
  | 'DESIGN_CHANGES'
  | 'READY_FOR_PRODUCTION';

export interface InboxCounts {
  all: number;
  needsAttention: number;
  paymentReported: number;
  designReview: number;
  readyForProduction: number;
}

export type OrderAccess =
  | { kind: 'staff'; staff: StaffIdentity }
  | { kind: 'owner'; userId: string }
  | { kind: 'guest'; tokenHash: string };

export interface CreatePendingOrderInput {
  idempotencyKey: string;
  productId: ProductId;
  variantId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  total: number;
  currency?: string;
  customer: CustomerInfo;
  projectId?: string;
  approvedDesignVersionId: string;
  preflightRevision?: string;
  designSnapshot: PendingOrder['snapshot'];
  payment: OrderPayment;
}

export interface ApprovedDesignVersionSummary {
  id: string;
  versionNumber: number;
  source: string;
  preflightRevision?: string | null;
  createdAt: string;
}

export interface PaymentSummary {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  reference: string;
  qrPayload?: string | null;
  status: string;
  customerReportedAt?: string | null;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
}

export interface OrderEventSummary {
  id: string;
  eventType: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface OrderInboxRow {
  id: string;
  publicOrderCode: string;
  projectId?: string | null;
  customerFullName: string;
  customerPhone: string;
  shippingAddress?: string | null;
  product: { id: string; name: string };
  variant: { id: string; name: string; price: number };
  quantity: number;
  total: number;
  currency: string;
  paymentStatus: string;
  designStatus: DesignStatus;
  fulfillmentStatus: FulfillmentStatus;
  attentionReasons: AttentionReason[];
  approvedDesignVersion?: ApprovedDesignVersionSummary | null;
  payment?: PaymentSummary | null;
  latestEvent?: OrderEventSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListQuery {
  view?: 'all' | 'attention' | 'payment' | 'production';
  status?: string[];
  paymentStatus?: string[];
  designStatus?: DesignStatus[];
  fulfillmentStatus?: FulfillmentStatus[];
  attentionReason?: AttentionReason[];
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: 'newest' | 'oldest';
  page?: number;
  pageSize?: number;
}

export function deriveAttentionReasons(
  paymentStatus: string,
  designStatus: DesignStatus,
  fulfillmentStatus: FulfillmentStatus
): AttentionReason[] {
  if (paymentStatus === 'cancelled' || fulfillmentStatus === 'cancelled' || fulfillmentStatus === 'completed') {
    return [];
  }

  const reasons: AttentionReason[] = [];

  if (paymentStatus === 'payment_reported') {
    reasons.push('PAYMENT_REPORTED');
  } else if (paymentStatus === 'payment_failed') {
    reasons.push('PAYMENT_FAILED');
  }

  if (designStatus === 'awaiting_review') {
    reasons.push('DESIGN_REVIEW');
  } else if (designStatus === 'needs_changes') {
    reasons.push('DESIGN_CHANGES');
  }

  if (paymentStatus === 'paid' && designStatus === 'approved' && fulfillmentStatus === 'ready_for_production') {
    reasons.push('READY_FOR_PRODUCTION');
  }

  return reasons;
}

interface RawDatabaseOrderJoin {
  id: string;
  public_order_code: string;
  project_id?: string | null;
  approved_design_version_id?: string | null;
  product_snapshot?: Record<string, unknown> | null;
  variant_snapshot?: Record<string, unknown> | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  total: number;
  currency: string;
  customer_full_name: string;
  customer_phone: string;
  shipping_address?: string | null;
  payment_status: string;
  design_status: string;
  fulfillment_status: string;
  created_at: string;
  updated_at: string;
  order_payments?: Array<Record<string, unknown>> | Record<string, unknown> | null;
  design_versions?: Array<Record<string, unknown>> | Record<string, unknown> | null;
  order_events?: Array<Record<string, unknown>> | Record<string, unknown> | null;
}

function normalizeFirst<T>(input: T[] | T | null | undefined): T | null {
  if (!input) return null;
  if (Array.isArray(input)) return input[0] ?? null;
  return input;
}

function normalizeDesignStatus(status: string): DesignStatus {
  if (status === 'ready' || status === 'editing' || status === 'approved' || status === 'needs_changes') {
    return status;
  }
  return 'awaiting_review';
}

function normalizeFulfillmentStatus(status: string): FulfillmentStatus {
  if (status === 'ready_for_production' || status === 'in_production' || status === 'completed' || status === 'cancelled') {
    return status;
  }
  return 'unprocessed';
}

export function mapOrderInboxRow(raw: RawDatabaseOrderJoin): OrderInboxRow {
  const paymentRow = normalizeFirst(raw.order_payments);
  const designVersionRow = normalizeFirst(raw.design_versions);
  let eventRow: Record<string, unknown> | null = null;
  if (Array.isArray(raw.order_events) && raw.order_events.length > 0) {
    const sortedEvents = [...raw.order_events].sort((a, b) => {
      const timeA = typeof a.created_at === 'string' ? new Date(a.created_at).getTime() : 0;
      const timeB = typeof b.created_at === 'string' ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
    eventRow = sortedEvents[0] ?? null;
  } else if (raw.order_events && typeof raw.order_events === 'object' && !Array.isArray(raw.order_events)) {
    eventRow = raw.order_events as Record<string, unknown>;
  }

  const productSnap = (raw.product_snapshot ?? {}) as { id?: string; name?: string };
  const variantSnap = (raw.variant_snapshot ?? {}) as { id?: string; name?: string; price?: number };

  return {
    id: raw.id,
    publicOrderCode: raw.public_order_code,
    projectId: raw.project_id ?? null,
    customerFullName: raw.customer_full_name,
    customerPhone: raw.customer_phone,
    shippingAddress: raw.shipping_address ?? null,
    product: {
      id: productSnap.id ?? '',
      name: productSnap.name ?? '',
    },
    variant: {
      id: variantSnap.id ?? '',
      name: variantSnap.name ?? '',
      price: Number(variantSnap.price ?? 0),
    },
    quantity: Number(raw.quantity),
    total: Number(raw.total),
    currency: raw.currency || 'VND',
    paymentStatus: raw.payment_status,
    designStatus: normalizeDesignStatus(raw.design_status),
    fulfillmentStatus: normalizeFulfillmentStatus(raw.fulfillment_status),
    attentionReasons: deriveAttentionReasons(
      raw.payment_status,
      normalizeDesignStatus(raw.design_status),
      normalizeFulfillmentStatus(raw.fulfillment_status)
    ),
    approvedDesignVersion: designVersionRow
      ? {
        id: String(designVersionRow.id),
        versionNumber: Number(designVersionRow.version_number ?? 1),
        source: String(designVersionRow.source ?? 'customizer'),
        preflightRevision: (designVersionRow.preflight_revision as string | null) ?? null,
        createdAt: String(designVersionRow.created_at),
      }
      : null,
    payment: paymentRow
      ? {
        id: String(paymentRow.id),
        provider: String(paymentRow.provider ?? ''),
        amount: Number(paymentRow.amount ?? 0),
        currency: String(paymentRow.currency ?? 'VND'),
        reference: String(paymentRow.reference ?? ''),
        qrPayload: (paymentRow.qr_payload as string | null) ?? null,
        status: String(paymentRow.status ?? raw.payment_status),
        customerReportedAt: (paymentRow.customer_reported_at as string | null) ?? null,
        confirmedAt: (paymentRow.confirmed_at as string | null) ?? null,
        confirmedBy: (paymentRow.confirmed_by as string | null) ?? null,
      }
      : null,
    latestEvent: eventRow
      ? {
        id: String(eventRow.id),
        eventType: String(eventRow.event_type ?? ''),
        actorUserId: (eventRow.actor_user_id as string | null) ?? null,
        actorRole: (eventRow.actor_role as string | null) ?? null,
        payload: (eventRow.payload as Record<string, unknown>) ?? {},
        createdAt: String(eventRow.created_at),
      }
      : null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}
