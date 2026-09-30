import type { SupabaseClient } from '@supabase/supabase-js';

export interface OrderEventRecord {
  id: string;
  orderId: string;
  eventType: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AppendOrderEventInput {
  orderId: string;
  eventType: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  payload?: Record<string, unknown>;
}

export class OrderEventRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async append(input: AppendOrderEventInput): Promise<OrderEventRecord> {
    const payload = {
      order_id: input.orderId,
      event_type: input.eventType,
      actor_user_id: input.actorUserId ?? null,
      actor_role: input.actorRole ?? null,
      payload: input.payload ?? {},
    };

    const { data, error } = await this.client
      .from('order_events')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to append order event: ${error?.message ?? 'unknown'}`);
    }

    return this.mapRow(data);
  }

  async listByOrderId(orderId: string): Promise<OrderEventRecord[]> {
    const { data, error } = await this.client
      .from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error || !data || !Array.isArray(data)) return [];
    return data.map((row) => this.mapRow(row));
  }

  private mapRow(row: unknown): OrderEventRecord {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      orderId: String(r.order_id),
      eventType: String(r.event_type),
      actorUserId: (r.actor_user_id as string | null) ?? null,
      actorRole: (r.actor_role as string | null) ?? null,
      payload: (r.payload as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    };
  }
}
