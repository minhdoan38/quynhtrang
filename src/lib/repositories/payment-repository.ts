import type { SupabaseClient } from '@supabase/supabase-js';

import type { PaymentPurpose, PaymentRequirementStatus } from '../order-types.ts';

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider: string;
  amount: number;
  currency: string;
  reference: string;
  qrPayload?: string | null;
  status: PaymentRequirementStatus;
  purpose: PaymentPurpose;
  customerReportedAt?: string | null;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentInput {
  orderId: string;
  provider: string;
  amount: number;
  currency?: string;
  reference: string;
  qrPayload?: string | null;
  status?: PaymentRequirementStatus;
  purpose?: PaymentPurpose;
}

export interface ConfirmPaymentRequirementInput {
  orderId: string;
  purpose?: PaymentPurpose;
  paymentId?: string;
  confirmedByUserId?: string;
  confirmedAt?: string;
}

export class PaymentRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async create(input: CreatePaymentInput): Promise<PaymentRecord> {
    const payload = {
      order_id: input.orderId,
      provider: input.provider,
      amount: input.amount,
      currency: input.currency ?? 'VND',
      reference: input.reference,
      qr_payload: input.qrPayload ?? null,
      status: input.status ?? 'pending_payment',
      purpose: input.purpose ?? 'full_order_payment',
    };

    const { data, error } = await this.client
      .from('order_payments')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create order payment: ${error?.message ?? 'unknown'}`);
    }

    return this.mapRow(data);
  }

  async getByOrderId(orderId: string, purpose?: PaymentPurpose): Promise<PaymentRecord | null> {
    let query = this.client.from('order_payments').select('*').eq('order_id', orderId);
    if (purpose) {
      query = query.eq('purpose', purpose);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Failed to read payment: ${error.message}`);
    return data ? this.mapRow(data) : null;
  }

  async markCustomerReported(
    orderId: string,
    reportedAt: string = new Date().toISOString(),
    purpose?: PaymentPurpose
  ): Promise<PaymentRecord> {
    let query = this.client
      .from('order_payments')
      .update({
        status: 'payment_reported',
        customer_reported_at: reportedAt,
      })
      .eq('order_id', orderId);

    if (typeof (query as unknown as { neq?: unknown }).neq === 'function') {
      query = (query as unknown as { neq(col: string, val: unknown): typeof query }).neq('status', 'paid');
    }

    if (purpose) {
      query = query.eq('purpose', purpose);
    }

    const { data, error } = await query.select('*').single();
    if (error || !data) {
      throw new Error(`Failed to mark payment reported: ${error?.message ?? 'unknown'}`);
    }

    let orderQuery = this.client
      .from('orders')
      .update({ payment_status: 'payment_reported' })
      .eq('id', orderId);

    if (typeof (orderQuery as unknown as { neq?: unknown }).neq === 'function') {
      orderQuery = (orderQuery as unknown as { neq(col: string, val: unknown): typeof orderQuery }).neq('payment_status', 'paid');
    }

    const { error: orderError } = await orderQuery;

    if (orderError) {
      throw orderError;
    }
    return this.mapRow(data);
  }

  async confirmPayment(input: ConfirmPaymentRequirementInput): Promise<PaymentRecord> {
    if (!input.orderId || (!input.purpose && !input.paymentId)) {
      throw new Error('Payment confirmation requires an explicit purpose or payment ID');
    }

    const confirmedAt = input.confirmedAt ?? new Date().toISOString();
    let query = this.client
      .from('order_payments')
      .update({
        status: 'paid',
        confirmed_at: confirmedAt,
        confirmed_by: input.confirmedByUserId ?? null,
      });

    if (input.paymentId) {
      query = query.eq('id', input.paymentId);
    } else {
      query = query.eq('order_id', input.orderId);
      if (input.purpose) {
        query = query.eq('purpose', input.purpose);
      }
    }

    const { data, error } = await query.select('*').single();
    if (error || !data) {
      throw new Error(`Failed to confirm payment: ${error?.message ?? 'unknown'}`);
    }

    const targetPurpose = input.purpose ?? (data.purpose as PaymentPurpose);
    const resultingOrderStatus = targetPurpose === 'checkout_deposit' ? 'deposit_confirmed' : 'paid';

    const { error: orderError } = await this.client
      .from('orders')
      .update({ payment_status: resultingOrderStatus })
      .eq('id', input.orderId);

    if (orderError) {
      throw orderError;
    }

    return this.mapRow(data);
  }
  private mapRow(row: unknown): PaymentRecord {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      orderId: String(r.order_id),
      provider: String(r.provider),
      amount: Number(r.amount),
      currency: String(r.currency || 'VND'),
      reference: String(r.reference),
      qrPayload: (r.qr_payload as string | null) ?? null,
      status: r.status as PaymentRequirementStatus,
      purpose: r.purpose as PaymentPurpose,
      customerReportedAt: (r.customer_reported_at as string | null) ?? null,
      confirmedAt: (r.confirmed_at as string | null) ?? null,
      confirmedBy: (r.confirmed_by as string | null) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }
}
