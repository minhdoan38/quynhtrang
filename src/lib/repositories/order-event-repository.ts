import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type EventPage,
  mapOrderActivityItem,
  type OrderActivityItem,
  type StaffIdentity,
} from '../domain/order.ts';
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

  async listForOrder(
    orderId: string,
    staff: StaffIdentity,
    options: { limit: number; cursor?: string }
  ): Promise<EventPage> {
    this.assertStaffIdentity(staff);

    const limit = Math.min(50, Math.max(1, options.limit || 20));
    let query = this.client
      .from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (options.cursor) {
      try {
        const decoded = Buffer.from(options.cursor, 'base64').toString('utf-8');
        const [cursorCreatedAt] = decoded.split('#');
        if (cursorCreatedAt) {
          query = query.lt('created_at', cursorCreatedAt);
        }
      } catch {
        // ignore invalid cursor
      }
    }

    const { data, error } = await query;
    if (error || !data || !Array.isArray(data)) {
      return { items: [], nextCursor: null };
    }

    const hasMore = data.length > limit;
    const pageRows = hasMore ? data.slice(0, limit) : data;

    const actorIds = [...new Set(pageRows.map((r: Record<string, unknown>) => r.actor_user_id).filter(Boolean) as string[])];
    const staffNames = new Map<string, string>();
    if (actorIds.length > 0) {
      try {
        const { data: staffData } = await this.client
          .from('staff_roles')
          .select('user_id, display_name')
          .in('user_id', actorIds);
        if (staffData && Array.isArray(staffData)) {
          for (const s of staffData) {
            staffNames.set(s.user_id, s.display_name || 'Nhân viên');
          }
        }
      } catch {
        // Fallback gracefully without throwing
      }
    }

    const items: OrderActivityItem[] = pageRows.map((r: Record<string, unknown>) =>
      mapOrderActivityItem(
        {
          id: String(r.id),
          event_type: String(r.event_type),
          actor_user_id: (r.actor_user_id as string | null) ?? null,
          actor_role: (r.actor_role as string | null) ?? null,
          payload: (r.payload as Record<string, unknown>) ?? {},
          created_at: String(r.created_at),
        },
        staffNames
      )
    );

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      nextCursor = Buffer.from(`${lastRow.created_at}#${lastRow.id}`).toString('base64');
    }

    return {
      items,
      nextCursor,
    };
  }

  private assertStaffIdentity(staff: StaffIdentity): void {
    if (!staff || !staff.userId || (staff.role !== 'admin' && staff.role !== 'editor')) {
      throw new Error('Unauthorized: Staff access required');
    }
  }
}
