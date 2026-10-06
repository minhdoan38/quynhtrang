import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  startProductionInternal,
  completeProductionInternal,
  cancelOrderInternal,
  startOrderProduction,
  completeOrderProduction,
} from '../lib/services/admin-fulfillment-operations.ts';
import { AuthorizationError } from '../lib/admin/authorization.ts';
import { createInitialState } from '../lib/product-state.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processRenderJobs } from '../../scripts/state39-render-jobs.ts';

function createMockSupabase(rpcHandler: (fn: string, params: Record<string, unknown>) => unknown): SupabaseClient {
  return {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      const data = await rpcHandler(fn, params);
      return { data, error: null };
    },
  } as unknown as SupabaseClient;
}

test('production transitions reject editors with 403', async () => {
  const previousBypass = process.env.ENABLE_TEST_STAFF_BYPASS;
  const previousRole = process.env.SMOKE_TEST_STAFF_ROLE;
  process.env.ENABLE_TEST_STAFF_BYPASS = '1';
  process.env.SMOKE_TEST_STAFF_ROLE = 'editor';

  try {
    for (const transition of [startOrderProduction, completeOrderProduction]) {
      await assert.rejects(
        () => transition({ orderId: 'ord-123', requestId: 'req-editor' }),
        (error: unknown) => {
          assert(error instanceof AuthorizationError);
          assert.equal(error.status, 403);
          return true;
        }
      );
    }
  } finally {
    if (previousBypass === undefined) delete process.env.ENABLE_TEST_STAFF_BYPASS;
    else process.env.ENABLE_TEST_STAFF_BYPASS = previousBypass;
    if (previousRole === undefined) delete process.env.SMOKE_TEST_STAFF_ROLE;
    else process.env.SMOKE_TEST_STAFF_ROLE = previousRole;
  }
});
test('production recovery migration enforces admin roles and atomic render leases', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/0020_state45_fulfillment_render_recovery.sql'),
    'utf8'
  );
  const startBody = migration.split('create or replace function public.start_order_production')[1]?.split('$$;')[0];
  const completeBody = migration.split('create or replace function public.complete_order_production')[1]?.split('$$;')[0];
  const claimBody = migration.split('create or replace function public.claim_next_render_job')[1]?.split('$$;')[0];

  assert.ok(startBody);
  assert.ok(completeBody);
  assert.ok(claimBody);
  assert.match(startBody, /v_role is null or v_role <> 'admin'/);
  assert.match(completeBody, /v_role is null or v_role <> 'admin'/);
  assert.match(startBody, /payment_status = 'deposit_confirmed'.*fixed_deposit/s);
  assert.match(claimBody, /status in \('pending', 'failed'\)/);
  assert.match(claimBody, /status = 'running'.*claim_expires_at <= clock_timestamp\(\)/s);
  assert.match(claimBody, /for update skip locked/i);
  assert.match(claimBody, /attempts = .*attempts \+ 1/);
  assert.match(claimBody, /p_lease_seconds \|\| ' seconds'/);
});

test('render worker uses atomic claims, fenced finalization, retry-safe upsert, and thumbnail pointer', () => {
  const worker = readFileSync(resolve(process.cwd(), 'scripts/state39-render-jobs.ts'), 'utf8');

  assert.match(worker, /\.rpc\('claim_next_render_job'/);
  assert.match(worker, /\.upsert\(\s*\{\s*version_id: job\.version_id,\s*storage_path: storagePath,\s*checksum: rendered\.sha256,?\s*\},\s*\{ onConflict: 'version_id' \}\s*\)/s);
  assert.match(worker, /approved_thumbnail_path: storagePath/);
  assert.match(worker, /\.eq\('claimed_by', workerId\)/);
  assert.match(worker, /\.eq\('attempts', job\.attempts\)/);
});

test('startProductionInternal dispatches start_order_production RPC', async () => {
  let calledFn = '';
  let calledParams: Record<string, unknown> = {};

  const mockClient = createMockSupabase((fn, params) => {
    calledFn = fn;
    calledParams = params;
    return {
      ok: true,
      value: { orderId: params.p_order_id, fulfillmentStatus: 'in_production' },
    };
  });

  const res = await startProductionInternal(
    {
      orderId: 'ord-123',
      expectedFulfillmentStatus: 'ready_for_production',
      requestId: 'req-1',
    },
    mockClient
  );

  assert.equal(calledFn, 'start_order_production');
  assert.equal(calledParams.p_order_id, 'ord-123');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.fulfillmentStatus, 'in_production');
  }
});

test('completeProductionInternal dispatches complete_order_production RPC', async () => {
  let calledFn = '';
  const mockClient = createMockSupabase((fn, params) => {
    calledFn = fn;
    return {
      ok: true,
      value: { orderId: params.p_order_id, fulfillmentStatus: 'completed' },
    };
  });

  const res = await completeProductionInternal(
    {
      orderId: 'ord-123',
      expectedFulfillmentStatus: 'in_production',
      requestId: 'req-2',
    },
    mockClient
  );

  assert.equal(calledFn, 'complete_order_production');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.fulfillmentStatus, 'completed');
  }
});

test('cancelOrderInternal rejects short reason and dispatches cancel_order RPC', async () => {
  let calledFn = '';
  const mockClient = createMockSupabase((fn, params) => {
    calledFn = fn;
    return {
      ok: true,
      value: { orderId: params.p_order_id, fulfillmentStatus: 'cancelled' },
    };
  });

  // Short reason rejected before RPC
  const invalidRes = await cancelOrderInternal(
    {
      orderId: 'ord-123',
      reason: 'No',
      requestId: 'req-3',
    },
    mockClient
  );
  assert.equal(invalidRes.ok, false);
  if (!invalidRes.ok) {
    assert.equal(invalidRes.code, 'INVALID_REASON');
  }

  // Valid reason dispatched
  const validRes = await cancelOrderInternal(
    {
      orderId: 'ord-123',
      reason: 'Khách hàng yêu cầu hủy đơn',
      requestId: 'req-4',
    },
    mockClient
  );

  assert.equal(calledFn, 'cancel_order');
  assert.equal(validRes.ok, true);
  if (validRes.ok) {
    assert.equal(validRes.value.fulfillmentStatus, 'cancelled');
  }
});

interface UpsertCapture {
  payload: unknown;
  options: unknown;
}

interface ThumbnailUpdateCapture {
  approved_thumbnail_path?: string;
}

interface JobUpdateCapture {
  status?: string;
}

test('processRenderJobs claims atomically, upserts rendition idempotently, updates thumbnail and fences completion', async () => {
  const calls: { name: string; args: unknown }[] = [];
  let renderUpsertArgs: UpsertCapture | undefined;
  let thumbnailUpdateArgs: ThumbnailUpdateCapture | undefined;
  let jobUpdateArgs: JobUpdateCapture | undefined;
  const filters: Record<string, unknown> = {};

  const mockClient = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calls.push({ name: `rpc:${fn}`, args: params });
      if (fn === 'claim_next_render_job') {
        return {
          data: [
            {
              id: 'job-101',
              version_id: 'ver-202',
              order_id: 'ord-303',
              attempts: 1,
            },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        single: async () => {
          if (table === 'design_versions') {
            return {
              data: {
                id: 'ver-202',
                design_document: {
                  ...createInitialState('card'),
                  variantId: 'horizontal',
                  elements: [],
                },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        upsert: async (payload: unknown, options: unknown) => {
          renderUpsertArgs = { payload, options };
          calls.push({ name: `upsert:${table}`, args: { payload, options } });
          return { data: payload, error: null };
        },
        update: (payload: unknown) => {
          if (table === 'design_versions' && payload && typeof payload === 'object') {
            thumbnailUpdateArgs = payload as ThumbnailUpdateCapture;
          }
          if (table === 'design_render_jobs' && payload && typeof payload === 'object') {
            jobUpdateArgs = payload as JobUpdateCapture;
          }
          calls.push({ name: `update:${table}`, args: payload });
          return builder;
        },
        maybeSingle: async () => {
          return { data: { id: 'job-101', status: 'completed' }, error: null };
        },
      };
      return builder;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _body: Buffer, opts: unknown) => {
          calls.push({ name: `storage.upload:${bucket}`, args: { path, opts } });
          return { data: { path }, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;

  await processRenderJobs({
    once: true,
    workerId: 'worker-test-1',
    client: mockClient,
  });

  assert.ok(calls.some((c) => c.name === 'rpc:claim_next_render_job'));
  assert.ok(calls.some((c) => c.name.startsWith('storage.upload:approved-renders')));
  assert.ok(renderUpsertArgs);
  assert.deepEqual(renderUpsertArgs?.options, { onConflict: 'version_id' });
  assert.ok(thumbnailUpdateArgs);
  assert.match(thumbnailUpdateArgs?.approved_thumbnail_path ?? '', /^renders\/ver-202\/[0-9a-f]{64}\.png$/);
  assert.ok(jobUpdateArgs);
  assert.equal(jobUpdateArgs?.status, 'completed');
  assert.equal(filters.claimed_by, 'worker-test-1');
  assert.equal(filters.attempts, 1);
});

test('processRenderJobs marks failed and fences update when render throws', async () => {
  let failedJobPayload: JobUpdateCapture | undefined;
  const failedFilters: Record<string, unknown> = {};

  const mockClient = {
    rpc: async (fn: string) => {
      if (fn === 'claim_next_render_job') {
        return {
          data: [
            {
              id: 'job-bad-1',
              version_id: 'ver-missing',
              order_id: 'ord-303',
              attempts: 2,
            },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          failedFilters[col] = val;
          return builder;
        },
        single: async () => {
          return { data: null, error: new Error('Version not found') };
        },
        update: (payload: unknown) => {
          if (table === 'design_render_jobs' && payload && typeof payload === 'object') {
            failedJobPayload = payload as JobUpdateCapture;
          }
          return builder;
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
      }),
    },
  } as unknown as SupabaseClient;

  await processRenderJobs({
    once: true,
    workerId: 'worker-err-1',
    client: mockClient,
  });

  assert.ok(failedJobPayload);
  assert.equal(failedJobPayload?.status, 'failed');
  assert.equal(failedFilters.claimed_by, 'worker-err-1');
  assert.equal(failedFilters.attempts, 2);
});
