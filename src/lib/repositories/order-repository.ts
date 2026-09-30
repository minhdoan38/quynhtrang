import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type CreatePendingOrderInput,
  type InboxCounts,
  mapOrderInboxRow,
  type OrderAccess,
  type OrderInboxRow,
  type OrderListQuery,
  type StaffIdentity,
} from '../domain/order.ts';
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
    const orderPayload = {
      project_id: input.projectId ?? null,
      approved_design_version_id: input.approvedDesignVersionId,
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

    const createdOrderId = this.extractStringField(orderData, 'id') ?? '';
    const paymentPayload = {
      order_id: createdOrderId,
      provider: input.payment.provider,
      amount: input.payment.amount,
      currency: input.payment.currency || 'VND',
      reference: input.payment.paymentReference,
      status: input.payment.status,
      customer_reported_at: input.payment.customerReportedAt ?? null,
      confirmed_at: input.payment.confirmedAt ?? null,
    };

    const { error: paymentError } = await this.client.from('order_payments').insert(paymentPayload);
    if (paymentError) {
      await this.client.from('orders').delete().eq('id', createdOrderId);
      throw new Error(`Failed to create order payment: ${paymentError.message}`);
    }

    return this.mapToPendingOrder(orderData, input);
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
      dbQuery = dbQuery.or('payment_status.eq.payment_reported,design_status.in.(awaiting_review,needs_changes)');
    } else if (query.view === 'payment') {
      dbQuery = dbQuery.eq('payment_status', 'pending_payment');
    } else if (query.view === 'production') {
      dbQuery = dbQuery
        .eq('payment_status', 'paid')
        .eq('design_status', 'approved')
        .eq('fulfillment_status', 'ready_for_production');
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

    if (query.createdFrom) {
      dbQuery = dbQuery.gte('created_at', query.createdFrom);
    }

    if (query.createdTo) {
      dbQuery = dbQuery.lte('created_at', query.createdTo);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      dbQuery = dbQuery.or(`public_order_code.ilike.%${term}%,customer_full_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);
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

    if (query.attentionReason && query.attentionReason.length > 0) {
      const targetReasons = new Set(query.attentionReason);
      rows = rows.filter((r) => r.attentionReasons.some((reason) => targetReasons.has(reason)));
    }

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
        .or('payment_status.eq.payment_reported,design_status.in.(awaiting_review,needs_changes)'),
      this.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'payment_reported'),
      this.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('design_status', ['awaiting_review', 'needs_changes']),
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

    const rawApprovedId = this.extractStringField(rawObj, 'approved_design_version_id');
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
