import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type ActiveOrderHold,
  type AdminOrderDetail,
  type AttentionReason,
  type CreatePendingOrderInput,
  normalizeDesignStatus,
  normalizeFulfillmentStatus,
  type InboxCounts,
  mapOrderActivityItem,
  mapOrderInboxRow,
  normalizePreflightSummary,
  type OrderAccess,
  type OrderInboxRow,
  type OrderListQuery,
  type OrderOperationalState,
  type PaymentStatus,
  type StaffIdentity,
  type StaffRole,
} from '../domain/order.ts';
import { resolveOrderNextAction } from '../admin/order-next-action.ts';
import { resolveApprovedThumbnailUrl } from '../admin/thumbnail-delivery.ts';
import type { ApprovedDesignSnapshot, CustomerInfo, OrderPayment, PendingOrder } from '../order-types.ts';
import type { DesignState, DesignSummary, ProductId } from '../product-state.ts';

interface QueryFilterable {
  eq(column: string, value: unknown): QueryFilterable;
  gt(column: string, value: unknown): QueryFilterable;
}

export class OrderRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async createPendingOrder(input: CreatePendingOrderInput): Promise<PendingOrder> {
    const customerApprovedId = input.customerApprovedDesignVersionId ?? input.approvedDesignVersionId;
    const productionId = input.productionDesignVersionId ?? customerApprovedId;
    const orderPayload = {
      project_id: input.projectId ?? null,
      customer_approved_design_version_id: customerApprovedId,
      production_design_version_id: productionId,
      approved_design_version_id: customerApprovedId,
      product_snapshot: {
        id: input.productId,
        name: input.productId,
      },
      variant_snapshot: {
        id: input.variantId,
        name: input.variantId,
        price: input.unitPrice,
      },
      quantity: input.quantity,
      unit_price: input.unitPrice,
      subtotal: input.subtotal,
      total: input.total,
      currency: input.currency ?? 'VND',
      customer_full_name: input.customer.fullName,
      customer_phone: input.customer.phone,
      customer_phone_normalized: input.customer.phone.trim(),
      shipping_address: input.customer.shippingAddress,
      payment_status: input.payment.status,
      design_status: 'awaiting_review',
      fulfillment_status: 'unprocessed',
      idempotency_key: input.idempotencyKey,
    };

    const { data: orderData, error: orderError } = await this.client
      .from('orders')
      .insert(orderPayload)
      .select('*, order_payments(*), design_versions(*)')
      .single();

    if (orderError || !orderData) {
      throw new Error(`Failed to create order: ${orderError?.message ?? 'unknown error'}`);
    }


    return this.mapToPendingOrder(orderData, input);
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await this.client.from('orders').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete order: ${error.message}`);
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<PendingOrder | null> {
    const { data, error } = await this.client
      .from('orders')
      .select('*, order_payments(*), design_versions(*)')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code === 'PGRST116') return null;
      const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'unknown error';
      throw new Error(`Failed to find order by idempotency key: ${message}`);
    }
    if (!data) return null;
    return this.mapToPendingOrder(data);
  }

  async createGuestAccess(input: {
    orderId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void> {
    const { error } = await this.client.from('guest_order_access').insert({
      order_id: input.orderId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
    });

    if (error) {
      throw new Error(`Failed to create guest order access: ${error.message}`);
    }
  }

  async getById(id: string, access: OrderAccess): Promise<PendingOrder | null> {
    this.assertAccessValid(access);
    const selectQuery = this.buildSelectForAccess(access);

    let query = this.client
      .from('orders')
      .select(selectQuery)
      .eq('id', id);

    query = this.applyAccessFilter(query, access);

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return this.mapToPendingOrder(data);
  }

  async getByPublicCode(code: string, access: OrderAccess): Promise<PendingOrder | null> {
    this.assertAccessValid(access);
    const selectQuery = this.buildSelectForAccess(access);

    let query = this.client
      .from('orders')
      .select(selectQuery)
      .eq('public_order_code', code);

    query = this.applyAccessFilter(query, access);

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return this.mapToPendingOrder(data);
  }

  async listInbox(
    query: OrderListQuery,
    staff: StaffIdentity
  ): Promise<{ rows: OrderInboxRow[]; total: number }> {
    this.assertStaffIdentity(staff);

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 20);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let dbQuery = this.client
      .from('orders')
      .select('*, order_payments(*), design_versions(*), order_events(*)', { count: 'exact' });

    if (query.view === 'attention') {
      dbQuery = dbQuery
        .or('payment_status.eq.payment_reported,design_status.in.(awaiting_review,needs_changes)')
        .not('fulfillment_status', 'in', '("cancelled","completed")')
        .neq('payment_status', 'cancelled');
    } else if (query.view === 'payment') {
      dbQuery = dbQuery.eq('payment_status', 'pending_payment');
    } else if (query.view === 'production') {
      dbQuery = dbQuery
        .eq('payment_status', 'paid')
        .eq('design_status', 'approved')
        .eq('fulfillment_status', 'ready_for_production');
    }

    if (query.attentionReason && query.attentionReason.length > 0) {
      const clauses: string[] = [];
      for (const reason of query.attentionReason) {
        if (reason === 'PAYMENT_REPORTED') clauses.push('payment_status.eq.payment_reported');
        else if (reason === 'PAYMENT_FAILED') clauses.push('payment_status.eq.payment_failed');
        else if (reason === 'DESIGN_REVIEW') clauses.push('design_status.eq.awaiting_review');
        else if (reason === 'DESIGN_CHANGES') clauses.push('design_status.eq.needs_changes');
        else if (reason === 'READY_FOR_PRODUCTION') {
          clauses.push('and(payment_status.eq.paid,design_status.eq.approved,fulfillment_status.eq.ready_for_production)');
        }
      }
      if (clauses.length > 0) {
        dbQuery = dbQuery
          .or(clauses.join(','))
          .not('fulfillment_status', 'in', '("cancelled","completed")')
          .neq('payment_status', 'cancelled');
      }
    }

    if (query.paymentStatus && query.paymentStatus.length > 0) {
      dbQuery = dbQuery.in('payment_status', query.paymentStatus);
    }

    if (query.designStatus && query.designStatus.length > 0) {
      dbQuery = dbQuery.in('design_status', query.designStatus);
    }

    if (query.fulfillmentStatus && query.fulfillmentStatus.length > 0) {
      dbQuery = dbQuery.in('fulfillment_status', query.fulfillmentStatus);
    }

    if (query.product) {
      dbQuery = dbQuery.eq('product_snapshot->>id', query.product);
    }

    if (query.createdFrom) {
      dbQuery = dbQuery.gte('created_at', query.createdFrom);
    }

    if (query.createdTo) {
      dbQuery = dbQuery.lte('created_at', query.createdTo);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      dbQuery = dbQuery.or(`public_order_code.ilike.%${term}%,customer_full_name.ilike.%${term}%,customer_phone.ilike.%${term}%,customer_phone_normalized.ilike.%${term}%`);
    }

    if (query.sort === 'oldest') {
      dbQuery = dbQuery.order('created_at', { ascending: true });
    } else {
      dbQuery = dbQuery.order('created_at', { ascending: false });
    }

    const { data, error, count } = await dbQuery.range(from, to);
    if (error || !data) {
      return { rows: [], total: 0 };
    }

    const rawRows = Array.isArray(data) ? data : [];
    let rows = rawRows.map((item) => mapOrderInboxRow(item as Parameters<typeof mapOrderInboxRow>[0]));


    return {
      rows,
      total: count ?? rows.length,
    };
  }

  async countViews(staff: StaffIdentity): Promise<InboxCounts> {
    this.assertStaffIdentity(staff);

    const [allRes, attentionRes, paymentRes, designReviewRes, readyRes] = await Promise.all([
      this.client.from('orders').select('*', { count: 'exact', head: true }),
      this.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .or('payment_status.eq.payment_reported,design_status.in.(awaiting_review,needs_changes)')
        .not('fulfillment_status', 'in', '("cancelled","completed")')
        .neq('payment_status', 'cancelled'),
      this.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'payment_reported')
        .not('fulfillment_status', 'in', '("cancelled","completed")')
        .neq('payment_status', 'cancelled'),
      this.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('design_status', ['awaiting_review', 'needs_changes'])
        .not('fulfillment_status', 'in', '("cancelled","completed")')
        .neq('payment_status', 'cancelled'),
      this.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'paid')
        .eq('design_status', 'approved')
        .eq('fulfillment_status', 'ready_for_production'),
    ]);

    return {
      all: allRes.count ?? 0,
      needsAttention: attentionRes.count ?? 0,
      paymentReported: paymentRes.count ?? 0,
      designReview: designReviewRes.count ?? 0,
      readyForProduction: readyRes.count ?? 0,
    };
  }

  async getOrderDetail(
    orderId: string,
    staff: StaffIdentity,
    options?: { eventLimit?: number }
  ): Promise<AdminOrderDetail | null> {
    this.assertStaffIdentity(staff);

    const { data, error } = await this.client
      .from('orders')
      .select('*, order_payments(*), design_versions(*), order_holds(*)')
      .eq('id', orderId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const eventLimit = Math.min(50, Math.max(1, options?.eventLimit ?? 20));
    const { data: eventsData } = await this.client
      .from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(eventLimit + 1);

    const rawEvents = Array.isArray(eventsData) ? eventsData : [];
    const hasMoreEvents = rawEvents.length > eventLimit;
    const pageEvents = hasMoreEvents ? rawEvents.slice(0, eventLimit) : rawEvents;

    const paymentRow = Array.isArray(data.order_payments) ? data.order_payments[0] : data.order_payments;
    const versions = Array.isArray(data.design_versions)
      ? data.design_versions
      : data.design_versions
        ? [data.design_versions]
        : [];
    const targetVersionId = (data.production_design_version_id ??
      data.customer_approved_design_version_id ??
      data.approved_design_version_id) as string | undefined;
    const designVersionRow = (targetVersionId
      ? versions.find((v: Record<string, unknown>) => v && v.id === targetVersionId)
      : null) ?? versions[0] ?? null;
    const holds = Array.isArray(data.order_holds) ? data.order_holds : [];
    const activeHoldRow = holds.find((h: Record<string, unknown>) => h && h.released_at === null) ?? null;

    const staffIdsToLookup = [
      activeHoldRow?.held_by,
      paymentRow?.confirmed_by,
      ...pageEvents.map((e: Record<string, unknown>) => e.actor_user_id),
    ].filter(Boolean) as string[];

    const staffMap = new Map<string, { displayName: string; role: StaffRole }>();
    if (staffIdsToLookup.length > 0) {
      try {
        const { data: staffData } = await this.client
          .from('staff_roles')
          .select('user_id, display_name, role')
          .in('user_id', staffIdsToLookup);
        if (staffData && Array.isArray(staffData)) {
          for (const s of staffData) {
            staffMap.set(s.user_id, {
              displayName: s.display_name || 'Nhân viên',
              role: s.role === 'admin' ? 'admin' : 'editor',
            });
          }
        }
      } catch {
        // Fallback gracefully
      }
    }

    let activeHold: ActiveOrderHold | null = null;
    if (activeHoldRow) {
      const holder = staffMap.get(activeHoldRow.held_by);
      activeHold = {
        id: String(activeHoldRow.id),
        reason: String(activeHoldRow.reason ?? ''),
        heldAt: String(activeHoldRow.held_at),
        heldBy: {
          userId: String(activeHoldRow.held_by),
          displayName: holder?.displayName || 'Nhân viên',
          role: holder?.role || 'admin',
        },
      };
    }

    const paymentStatus = ((paymentRow?.status ?? data.payment_status) as PaymentStatus) || 'pending_payment';
    const confirmer = paymentRow?.confirmed_by ? staffMap.get(paymentRow.confirmed_by) : null;

    const payment = {
      id: paymentRow ? String(paymentRow.id) : '',
      status: paymentStatus,
      amount: Number(paymentRow?.amount ?? data.total ?? 0),
      currency: String(paymentRow?.currency ?? data.currency ?? 'VND'),
      reference: String(paymentRow?.reference ?? data.public_order_code ?? ''),
      customerReportedAt: (paymentRow?.customer_reported_at as string | null) ?? null,
      confirmedAt: (paymentRow?.confirmed_at as string | null) ?? null,
      confirmedBy: paymentRow?.confirmed_by
        ? {
          userId: String(paymentRow.confirmed_by),
          displayName: confirmer?.displayName || 'Nhân viên',
        }
        : null,
    };

    const preflight = normalizePreflightSummary(designVersionRow?.preflight_snapshot);
    const thumbnailUrl = await resolveApprovedThumbnailUrl(
      this.client,
      (designVersionRow?.approved_thumbnail_path as string | null) ?? null
    );

    const versionNum = Number(designVersionRow?.version_number ?? 1);
    const versionSource = (designVersionRow?.source === 'admin_revision' ? 'admin_revision' : 'customer_approved') as 'customer_approved' | 'admin_revision';
    const versionLabel = versionSource === 'admin_revision'
      ? `Bản chỉnh sửa v${versionNum}`
      : `Phiên bản khách duyệt v${versionNum}`;

    const approvedDesign = {
      id: designVersionRow ? String(designVersionRow.id) : '',
      versionNumber: versionNum,
      source: versionSource,
      label: versionLabel,
      thumbnailUrl,
      preflight,
      createdAt: designVersionRow ? String(designVersionRow.created_at) : String(data.created_at),
    };

    const prodSnap = (data.product_snapshot ?? {}) as Record<string, unknown>;
    const varSnap = (data.variant_snapshot ?? {}) as Record<string, unknown>;
    const product = {
      name: String(prodSnap.name ?? data.public_order_code),
      variant: String(varSnap.name ?? ''),
      configuration: Array.isArray(prodSnap.configuration) ? (prodSnap.configuration as Array<{ label: string; value: string }>) : [],
      quantity: Number(data.quantity ?? 1),
      unitPrice: Number(data.unit_price ?? 0),
      subtotal: Number(data.subtotal ?? 0),
      total: Number(data.total ?? 0),
      currency: String(data.currency ?? 'VND'),
    };

    const customer = {
      fullName: String(data.customer_full_name ?? ''),
      phone: String(data.customer_phone ?? ''),
    };

    const delivery = {
      shippingAddress: String(data.shipping_address ?? ''),
    };

    const operationalState: OrderOperationalState = {
      paymentStatus: payment.status,
      designStatus: normalizeDesignStatus(data.design_status),
      fulfillmentStatus: normalizeFulfillmentStatus(data.fulfillment_status),
      activeHold,
    };

    const nextAction = resolveOrderNextAction(operationalState);

    const staffNameMap = new Map<string, string>();
    for (const [uid, info] of staffMap.entries()) {
      staffNameMap.set(uid, info.displayName);
    }

    const recentEvents = pageEvents.map((e: Record<string, unknown>) =>
      mapOrderActivityItem(
        {
          id: String(e.id),
          event_type: String(e.event_type),
          actor_user_id: (e.actor_user_id as string | null) ?? null,
          actor_role: (e.actor_role as string | null) ?? null,
          payload: (e.payload as Record<string, unknown>) ?? {},
          created_at: String(e.created_at),
        },
        staffNameMap
      )
    );

    let nextEventCursor: string | null = null;
    if (hasMoreEvents && pageEvents.length > 0) {
      const lastEvent = pageEvents[pageEvents.length - 1];
      nextEventCursor = Buffer.from(`${lastEvent.created_at}#${lastEvent.id}`).toString('base64');
    }

    return {
      id: String(data.id),
      publicOrderCode: String(data.public_order_code),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
      paymentStatus: payment.status,
      designStatus: operationalState.designStatus,
      fulfillmentStatus: operationalState.fulfillmentStatus,
      payment,
      approvedDesign,
      product,
      customer,
      delivery,
      activeHold,
      nextAction,
      recentEvents,
      nextEventCursor,
    };
  }

  private buildSelectForAccess(access: OrderAccess): string {
    if (access.kind === 'owner') {
      return '*, order_payments(*), design_versions(*), projects!inner(*)';
    }
    if (access.kind === 'guest') {
      return '*, order_payments(*), design_versions(*), guest_order_access!inner(token_hash, expires_at)';
    }
    return '*, order_payments(*), design_versions(*), projects(*), guest_order_access(*)';
  }

  private assertStaffIdentity(staff: StaffIdentity): void {
    if (!staff || !staff.userId || (staff.role !== 'admin' && staff.role !== 'editor')) {
      throw new Error('Valid staff identity required');
    }
  }

  private assertAccessValid(access: OrderAccess): void {
    if (access.kind === 'staff') {
      this.assertStaffIdentity(access.staff);
    } else if (access.kind === 'owner') {
      if (!access.userId || !access.userId.trim()) {
        throw new Error('Valid owner access required');
      }
    } else if (access.kind === 'guest') {
      if (!access.tokenHash || !access.tokenHash.trim()) {
        throw new Error('Valid guest access required');
      }
    }
  }

  private applyAccessFilter<T extends QueryFilterable>(query: T, access: OrderAccess): T {
    if (access.kind === 'owner') {
      return query.eq('projects.owner_user_id', access.userId) as T;
    }
    if (access.kind === 'guest') {
      return query
        .eq('guest_order_access.token_hash', access.tokenHash)
        .gt('guest_order_access.expires_at', new Date().toISOString()) as T;
    }
    return query;
  }

  private extractStringField(obj: unknown, key: string): string | undefined {
    if (obj && typeof obj === 'object' && key in obj) {
      const val = (obj as Record<string, unknown>)[key];
      return typeof val === 'string' ? val : undefined;
    }
    return undefined;
  }

  private extractNumberField(obj: unknown, key: string): number | undefined {
    if (obj && typeof obj === 'object' && key in obj) {
      const val = (obj as Record<string, unknown>)[key];
      return typeof val === 'number' ? val : undefined;
    }
    return undefined;
  }

  private extractObjectField(obj: unknown, key: string): Record<string, unknown> | undefined {
    if (obj && typeof obj === 'object' && key in obj) {
      const val = (obj as Record<string, unknown>)[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return val as Record<string, unknown>;
      }
    }
    return undefined;
  }

  private mapToPendingOrder(raw: unknown, inputFallback?: CreatePendingOrderInput): PendingOrder {
    const rawObj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

    let paymentObj: Record<string, unknown> = {};
    if ('order_payments' in rawObj) {
      const paymentVal = rawObj.order_payments;
      if (Array.isArray(paymentVal) && paymentVal[0] && typeof paymentVal[0] === 'object') {
        paymentObj = paymentVal[0] as Record<string, unknown>;
      } else if (paymentVal && typeof paymentVal === 'object' && !Array.isArray(paymentVal)) {
        paymentObj = paymentVal as Record<string, unknown>;
      }
    }

    let designVersionObj: Record<string, unknown> | null = null;
    if ('design_versions' in rawObj) {
      const dvVal = rawObj.design_versions;
      if (Array.isArray(dvVal) && dvVal[0] && typeof dvVal[0] === 'object') {
        designVersionObj = dvVal[0] as Record<string, unknown>;
      } else if (dvVal && typeof dvVal === 'object' && !Array.isArray(dvVal)) {
        designVersionObj = dvVal as Record<string, unknown>;
      }
    }

    const productSnap = this.extractObjectField(rawObj, 'product_snapshot') ?? {};
    const variantSnap = this.extractObjectField(rawObj, 'variant_snapshot') ?? {};

    const customerFullName = this.extractStringField(rawObj, 'customer_full_name') ?? inputFallback?.customer.fullName ?? '';
    const customerPhone = this.extractStringField(rawObj, 'customer_phone') ?? inputFallback?.customer.phone ?? '';
    const shippingAddress = this.extractStringField(rawObj, 'shipping_address') ?? inputFallback?.customer.shippingAddress ?? '';

    const customer: CustomerInfo = {
      fullName: customerFullName,
      phone: customerPhone,
      shippingAddress,
    };

    const orderId = this.extractStringField(rawObj, 'id') ?? '';
    const paymentStatusRaw = this.extractStringField(paymentObj, 'status') ?? this.extractStringField(rawObj, 'payment_status') ?? 'pending_payment';

    const orderPayment: OrderPayment = {
      orderId,
      provider: this.extractStringField(paymentObj, 'provider') ?? inputFallback?.payment.provider ?? 'vietqr',
      amount: this.extractNumberField(paymentObj, 'amount') ?? this.extractNumberField(rawObj, 'total') ?? inputFallback?.payment.amount ?? 0,
      currency: this.extractStringField(paymentObj, 'currency') ?? this.extractStringField(rawObj, 'currency') ?? 'VND',
      paymentReference: this.extractStringField(paymentObj, 'reference') ?? inputFallback?.payment.paymentReference ?? '',
      status: paymentStatusRaw as OrderPayment['status'],
      customerReportedAt: this.extractStringField(paymentObj, 'customer_reported_at'),
      confirmedAt: this.extractStringField(paymentObj, 'confirmed_at'),
      confirmedBy: this.extractStringField(paymentObj, 'confirmed_by'),
    };

    const fulfillmentStatus = this.extractStringField(rawObj, 'fulfillment_status');
    const paymentStatus = this.extractStringField(rawObj, 'payment_status') ?? 'pending_payment';

    let status: PendingOrder['status'] = 'pending';
    if (fulfillmentStatus === 'completed') status = 'completed';
    else if (fulfillmentStatus === 'cancelled' || paymentStatus === 'cancelled') status = 'cancelled';
    else if (fulfillmentStatus === 'in_production' || fulfillmentStatus === 'ready_for_production') status = 'processing';

    const customerApprovedId = this.extractStringField(rawObj, 'customer_approved_design_version_id');
    const productionApprovedId = this.extractStringField(rawObj, 'production_design_version_id');
    const rawApprovedId = customerApprovedId ?? this.extractStringField(rawObj, 'approved_design_version_id');
    const approvedDesignVersionId = rawApprovedId ?? inputFallback?.approvedDesignVersionId ?? '';

    const quantity = this.extractNumberField(rawObj, 'quantity') ?? inputFallback?.quantity ?? 1;
    const unitPrice = this.extractNumberField(rawObj, 'unit_price') ?? inputFallback?.unitPrice ?? 0;
    const total = this.extractNumberField(rawObj, 'total') ?? inputFallback?.total ?? (quantity * unitPrice);

    const extractedDesign = this.extractObjectField(designVersionObj, 'design_document');
    const designDocument: DesignState = (extractedDesign as unknown as DesignState) ??
      inputFallback?.designSnapshot?.design ??
      ({} as DesignState);

    const preflightRevision = this.extractStringField(designVersionObj, 'preflight_revision') ?? inputFallback?.preflightRevision ?? '';

    const summary: DesignSummary = {
      product: String(productSnap.name ?? productSnap.id ?? inputFallback?.productId ?? ''),
      variant: String(variantSnap.name ?? variantSnap.id ?? inputFallback?.variantId ?? ''),
      quantity,
      unitPrice,
      totalPrice: total,
      priceLabel: `${total.toLocaleString('vi-VN')} đ`,
    };

    const snapshot: ApprovedDesignSnapshot = {
      id: approvedDesignVersionId,
      design: designDocument,
      summary,
      createdAt: this.extractStringField(designVersionObj, 'created_at') ?? this.extractStringField(rawObj, 'created_at') ?? '',
    };

    return {
      id: orderId,
      idempotencyKey: this.extractStringField(rawObj, 'idempotency_key') ?? inputFallback?.idempotencyKey ?? '',
      status,
      paymentStatus: paymentStatus as PendingOrder['paymentStatus'],
      customer,
      product: {
        productId: (productSnap.id as ProductId) ?? inputFallback?.productId ?? 'card',
        variantId: (variantSnap.id as string) ?? inputFallback?.variantId ?? '',
        quantity,
        unitPrice,
        subtotal: this.extractNumberField(rawObj, 'subtotal') ?? inputFallback?.subtotal ?? 0,
      },
      approvedDesignVersionId,
      preflightRevision,
      createdAt: this.extractStringField(rawObj, 'created_at') ?? new Date().toISOString(),
      snapshot,
      payment: orderPayment,
    };
  }
}
