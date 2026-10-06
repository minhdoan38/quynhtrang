import type { Page } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createTestSupabaseClient,
  type TestSupabaseClientOptions,
} from '../fixtures/supabase.ts';
import { TestCleanupRegistry } from '../fixtures/cleanup.ts';
import { applyTestAuth, type TestActorKey } from '../fixtures/auth.ts';

export interface GoldenTestContext {
  readonly page: Page;
  readonly supabase: SupabaseClient;
  readonly cleanup: TestCleanupRegistry;
  readonly testUrl: string;
}

export function createGoldenSupabaseClient(
  options: TestSupabaseClientOptions = {},
): SupabaseClient {
  const testUrl = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  return createTestSupabaseClient({
    url: testUrl,
    ...options,
  });
}

export async function setupGoldenTestContext(
  page: Page,
  options: {
    actor?: TestActorKey;
    workerIndex?: number;
    runId?: string;
  } = {},
): Promise<GoldenTestContext> {
  const testUrl = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const supabase = createGoldenSupabaseClient({
    workerIndex: options.workerIndex ?? 0,
    runId: options.runId ?? 'state45-golden',
  });
  const cleanup = new TestCleanupRegistry(testUrl);

  if (options.actor) {
    await applyTestAuth(page.context(), options.actor);
  }

  return {
    page,
    supabase,
    cleanup,
    testUrl,
  };
}

export interface BackendOrderRecord {
  readonly id: string;
  readonly publicOrderCode: string;
  readonly status: string;
  readonly paymentStatus: string;
  readonly designStatus: string;
  readonly fulfillmentStatus: string;
  readonly quantity: number;
  readonly totalAmount: number;
  readonly customerDesignVersionId: string | null;
  readonly productionDesignVersionId: string | null;
  readonly projectId: string | null;
  readonly commercialSnapshot: Record<string, unknown> | null;
  readonly customerInfo: Record<string, unknown> | null;
}

export interface BackendPaymentRecord {
  readonly id: string;
  readonly orderId: string;
  readonly amount: number;
  readonly status: string;
  readonly purpose: string;
  readonly confirmedAt: string | null;
}

export interface BackendOrderEventRecord {
  readonly id: string;
  readonly orderId: string;
  readonly eventType: string;
  readonly actorRole: string | null;
  readonly actorId: string | null;
  readonly createdAt: string;
}

export async function queryBackendOrder(
  supabase: SupabaseClient,
  orderIdOrCode: string,
): Promise<BackendOrderRecord | null> {
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderIdOrCode);
    const query = supabase.from('orders').select('*');
    const { data, error } = isUuid
      ? await query.eq('id', orderIdOrCode).maybeSingle()
      : await query.eq('public_order_code', orderIdOrCode).maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      publicOrderCode: data.public_order_code,
      status: data.status,
      paymentStatus: data.payment_status,
      designStatus: data.design_status,
      fulfillmentStatus: data.fulfillment_status,
      quantity: data.quantity,
      totalAmount: data.total_amount,
      customerDesignVersionId: data.customer_design_version_id,
      productionDesignVersionId: data.production_design_version_id,
      projectId: data.project_id,
      commercialSnapshot: data.commercial_snapshot,
      customerInfo: data.customer_info,
    };
  } catch {
    return null;
  }
}

export async function queryBackendPayments(
  supabase: SupabaseClient,
  orderId: string,
): Promise<BackendPaymentRecord[]> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error || !Array.isArray(data)) return [];

    return data.map((p) => ({
      id: p.id,
      orderId: p.order_id,
      amount: p.amount,
      status: p.status,
      purpose: p.purpose,
      confirmedAt: p.confirmed_at,
    }));
  } catch {
    return [];
  }
}

export async function queryBackendOrderEvents(
  supabase: SupabaseClient,
  orderId: string,
): Promise<BackendOrderEventRecord[]> {
  try {
    const { data, error } = await supabase
      .from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error || !Array.isArray(data)) return [];

    return data.map((e) => ({
      id: e.id,
      orderId: e.order_id,
      eventType: e.event_type,
      actorRole: e.actor_role,
      actorId: e.actor_id,
      createdAt: e.created_at,
    }));
  } catch {
    return [];
  }
}
