import type { CustomerInfo, OrderPayment, PaymentStatus, PendingOrder } from '../order-types.ts';
export type { PaymentStatus } from '../order-types.ts';
import type { ProductId } from '../product-state.ts';

export type StaffRole = 'admin' | 'editor';

export interface StaffIdentity {
  userId: string;
  role: StaffRole;
  email?: string | null;
}

export type DesignStatus = 'awaiting_review' | 'ready' | 'editing' | 'approved' | 'needs_changes';
export type FulfillmentStatus = 'unprocessed' | 'ready_for_production' | 'in_production' | 'completed' | 'cancelled';

export interface ActiveOrderHold {
  id: string;
  reason: string;
  heldAt: string;
  heldBy: { userId: string; displayName: string; role: StaffRole };
}

export interface OrderOperationalState {
  paymentStatus: PaymentStatus;
  designStatus: DesignStatus;
  fulfillmentStatus: FulfillmentStatus;
  activeHold: ActiveOrderHold | null;
}
export type CustomerFacingOrderStatus =
  | 'waiting_payment'
  | 'design_review'
  | 'preparing_production'
  | 'in_production'
  | 'production_completed'
  | 'cancelled'
  | 'processing';

export function getCustomerFacingStatusText(status: string): string {
  switch (status) {
    case 'waiting_payment':
      return 'Chờ xác nhận thanh toán';
    case 'design_review':
      return 'Đang kiểm tra thiết kế';
    case 'preparing_production':
      return 'Đang chuẩn bị sản xuất';
    case 'in_production':
      return 'Đang sản xuất';
    case 'production_completed':
      return 'Sản xuất hoàn tất';
    case 'cancelled':
      return 'Đã hủy';
    default:
      return 'Đang xử lý';
  }
}


export type OrderNextActionKind =
  | 'release_hold'
  | 'verify_payment'
  | 'wait_for_payment'
  | 'review_design'
  | 'continue_design_edit'
  | 'resolve_design_changes'
  | 'ready_for_production'
  | 'production_in_progress'
  | 'none';

export interface OrderNextAction {
  kind: OrderNextActionKind;
  eyebrow: 'CẦN XỬ LÝ' | 'ĐANG CHỜ' | 'SẴN SÀNG' | 'TRẠNG THÁI';
  title: string;
  description: string;
  intent: 'attention' | 'waiting' | 'ready' | 'neutral';
  cta: null | {
    label: string;
    type: 'confirm_payment' | 'release_hold' | 'navigate' | 'start_production' | 'complete_production' | 'cancel_order';
    href?: string;
  };
}

export interface PreflightSummary {
  level: 'pass' | 'warning' | 'error';
  passCount: number;
  warningCount: number;
  errorCount: number;
  acceptedWarningCount: number;
  checks: Array<{
    id: string;
    level: 'warning' | 'error';
    category: 'image' | 'safe-area' | 'sticker' | 'notebook' | 'card' | 'general';
    label: string;
    description: string | null;
    advice: string | null;
  }>;
}

export interface OrderActivityItem {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  actor: { kind: 'customer' | 'system' | 'staff'; displayName: string };
  createdAt: string;
}

export interface AdminOrderDetail {
  id: string;
  publicOrderCode: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus: PaymentStatus;
  designStatus: DesignStatus;
  fulfillmentStatus: FulfillmentStatus;
  payment: {
    id: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    reference: string;
    customerReportedAt: string | null;
    confirmedAt: string | null;
    confirmedBy: null | { userId: string; displayName: string };
  };
  approvedDesign: {
    id: string;
    versionNumber: number;
    source: 'customer_approved' | 'admin_revision';
    label: string;
    thumbnailUrl: string | null;
    preflight: PreflightSummary;
    createdAt: string;
  };
  product: {
    name: string;
    variant: string;
    configuration: Array<{ label: string; value: string }>;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    total: number;
    currency: string;
  };
  customer: { fullName: string; phone: string };
  delivery: { shippingAddress: string };
  activeHold: ActiveOrderHold | null;
  nextAction: OrderNextAction;
  recentEvents: OrderActivityItem[];
  nextEventCursor: string | null;
}

export interface EventPage {
  items: OrderActivityItem[];
  nextCursor: string | null;
}

export function assertProductionStartEligible(order: OrderOperationalState & { productionDesignVersionId?: string | null }): void {
  if (order.activeHold) {
    throw new Error('Đơn hàng đang tạm giữ, không thể bắt đầu sản xuất');
  }
  if (order.paymentStatus !== 'paid') {
    throw new Error('Đơn hàng chưa thanh toán, không thể bắt đầu sản xuất');
  }
  if (order.designStatus !== 'approved') {
    throw new Error('Thiết kế chưa được duyệt, không thể bắt đầu sản xuất');
  }
  if (order.fulfillmentStatus !== 'unprocessed' && order.fulfillmentStatus !== 'ready_for_production') {
    throw new Error(`Trạng thái xử lý không hợp lệ để bắt đầu sản xuất: ${order.fulfillmentStatus}`);
  }
  if (!order.productionDesignVersionId) {
    throw new Error('Đơn hàng thiếu phiên bản thiết kế sản xuất');
  }
}

export function assertProductionCompleteEligible(order: OrderOperationalState): void {
  if (order.activeHold) {
    throw new Error('Đơn hàng đang tạm giữ, không thể hoàn tất sản xuất');
  }
  if (order.fulfillmentStatus !== 'in_production') {
    throw new Error('Đơn hàng chưa ở trạng thái đang sản xuất');
  }
}

export function assertOrderCancelEligible(order: OrderOperationalState): void {
  if (order.fulfillmentStatus === 'completed') {
    throw new Error('Đơn hàng đã hoàn tất, không thể hủy');
  }
  if (order.fulfillmentStatus === 'cancelled' || order.paymentStatus === 'cancelled') {
    throw new Error('Đơn hàng đã hủy trước đó');
  }
}

export function normalizePreflightSummary(raw: unknown): PreflightSummary {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const level = r.level === 'error' ? 'error' : r.level === 'warning' ? 'warning' : 'pass';
    const passCount = typeof r.passCount === 'number' ? r.passCount : 0;
    const warningCount = typeof r.warningCount === 'number' ? r.warningCount : 0;
    const errorCount = typeof r.errorCount === 'number' ? r.errorCount : 0;
    const acceptedWarningCount = typeof r.acceptedWarningCount === 'number' ? r.acceptedWarningCount : 0;
    const checks: PreflightSummary['checks'] = [];
    if (Array.isArray(r.checks)) {
      for (const item of r.checks) {
        if (item && typeof item === 'object') {
          const c = item as Record<string, unknown>;
          checks.push({
            id: String(c.id ?? ''),
            level: c.level === 'error' ? 'error' : 'warning',
            category: (c.category as PreflightSummary['checks'][0]['category']) || 'general',
            label: String(c.label ?? ''),
            description: typeof c.description === 'string' ? c.description : null,
            advice: typeof c.advice === 'string' ? c.advice : null,
          });
        }
      }
    }
    return {
      level,
      passCount,
      warningCount,
      errorCount,
      acceptedWarningCount,
      checks,
    };
  }
  return {
    level: 'pass',
    passCount: 0,
    warningCount: 0,
    errorCount: 0,
    acceptedWarningCount: 0,
    checks: [],
  };
}

export function mapOrderActivityItem(
  event: {
    id: string;
    event_type: string;
    actor_user_id?: string | null;
    actor_role?: string | null;
    payload?: Record<string, unknown> | null;
    created_at: string;
  },
  staffNames?: Map<string, string>
): OrderActivityItem {
  const eventType = event.event_type;
  const payload = event.payload ?? {};
  let title = 'Cập nhật đơn hàng';
  let description: string | null = null;
  let actorKind: 'customer' | 'system' | 'staff' = 'system';
  let displayName = 'Hệ thống';

  if (event.actor_role === 'customer' || eventType === 'customer_payment_reported') {
    actorKind = 'customer';
    displayName = 'Khách hàng';
  } else if (event.actor_role === 'admin' || event.actor_role === 'editor' || event.actor_role === 'staff' || event.actor_user_id) {
    actorKind = 'staff';
    displayName = (event.actor_user_id && staffNames?.get(event.actor_user_id)) || 'Nhân viên';
  }

  switch (eventType) {
    case 'order_created':
      title = 'Đơn hàng được tạo';
      actorKind = 'system';
      displayName = 'Hệ thống';
      break;
    case 'customer_payment_reported':
      title = 'Báo đã chuyển khoản';
      actorKind = 'customer';
      displayName = 'Khách hàng';
      if (typeof payload.ref === 'string') {
        description = `Mã tham chiếu: ${payload.ref}`;
      }
      break;
    case 'payment_confirmed':
      title = 'Đã xác nhận thanh toán';
      actorKind = 'staff';
      if (typeof payload.amount === 'number') {
        description = `Đã nhận ${payload.amount.toLocaleString('vi-VN')}đ`;
      }
      break;
    case 'order_held':
      title = 'Đã tạm giữ đơn';
      actorKind = 'staff';
      if (typeof payload.reason === 'string') {
        description = `Lý do: ${payload.reason}`;
      }
      break;
    case 'order_hold_released':
      title = 'Đã bỏ tạm giữ';
      actorKind = 'staff';
      break;
    case 'design_approved':
      title = 'Thiết kế đã được duyệt';
      break;
    case 'design_draft_created':
      title = 'Tạo bản chỉnh sửa thiết kế';
      actorKind = 'staff';
      if (typeof payload.reason === 'string') {
        description = `Lý do: ${payload.reason}`;
      }
      break;
    case 'design_approved_as_is':
      title = 'Duyệt thiết kế nguyên bản';
      actorKind = 'staff';
      description = 'Sử dụng file khách duyệt làm bản in sản xuất';
      break;
    case 'design_revision_approved':
      title = 'Duyệt bản chỉnh sửa sản xuất';
      actorKind = 'staff';
      if (typeof payload.version_number === 'number') {
        description = `Phiên bản sản xuất v${payload.version_number}`;
      }
      break;
    case 'design_draft_discarded':
      title = 'Đã hủy bản chỉnh sửa nháp';
      actorKind = 'staff';
      break;
    case 'design_draft_taken_over':
      title = 'Tiếp quản quyền chỉnh sửa nháp';
      actorKind = 'staff';
      break;
    case 'production_started':
      title = 'Bắt đầu sản xuất';
      break;
    case 'production_completed':
      title = 'Sản xuất hoàn tất';
      break;
    default:
      title = 'Cập nhật đơn hàng';
      if (typeof payload.description === 'string') {
        description = payload.description;
      }
      break;
  }

  return {
    id: event.id,
    eventType,
    title,
    description,
    actor: {
      kind: actorKind,
      displayName,
    },
    createdAt: event.created_at,
  };
}

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
  customerApprovedDesignVersionId?: string;
  productionDesignVersionId?: string;
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
  product?: ProductId;
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
  } else if (designStatus === 'needs_changes' || designStatus === 'editing') {
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
  customer_approved_design_version_id?: string | null;
  production_design_version_id?: string | null;
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

export function normalizeDesignStatus(status: string): DesignStatus {
  if (status === 'ready' || status === 'editing' || status === 'approved' || status === 'needs_changes') {
    return status;
  }
  return 'awaiting_review';
}

export function normalizeFulfillmentStatus(status: string): FulfillmentStatus {
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
