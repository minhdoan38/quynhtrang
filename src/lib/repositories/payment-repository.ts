import type { SupabaseClient } from '@supabase/supabase-js';

import type { PaymentStatus } from '../order-types.ts';

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider: string;
  amount: number;
  currency: string;
  reference: string;
  qrPayload?: string | null;
  status: PaymentStatus;
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
  status?: PaymentStatus;
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

  async getByOrderId(orderId: string): Promise<PaymentRecord | null> {
    const { data, error } = await this.client
      .from('order_payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  async markCustomerReported(orderId: string, reportedAt: string = new Date().toISOString()): Promise<PaymentRecord> {
    const { data, error } = await this.client
      .from('order_payments')
      .update({
        status: 'payment_reported',
        customer_reported_at: reportedAt,
      })
      .eq('order_id', orderId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to mark payment reported: ${error?.message ?? 'unknown'}`);
    }

    return this.mapRow(data);
  }

  async confirmPayment(orderId: string, confirmedByUserId?: string, confirmedAt: string = new Date().toISOString()): Promise<PaymentRecord> {
    const { data, error } = await this.client
      .from('order_payments')
      .update({
        status: 'paid',
        confirmed_at: confirmedAt,
        confirmed_by: confirmedByUserId ?? null,
      })
      .eq('order_id', orderId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to confirm payment: ${error?.message ?? 'unknown'}`);
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
      status: (r.status as PaymentStatus) ?? 'pending_payment',
      customerReportedAt: (r.customer_reported_at as string | null) ?? null,
      confirmedAt: (r.confirmed_at as string | null) ?? null,
      confirmedBy: (r.confirmed_by as string | null) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }
}
