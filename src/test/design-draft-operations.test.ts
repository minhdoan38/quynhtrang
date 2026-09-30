import test from 'node:test';
import assert from 'node:assert/strict';
import { DesignRevisionRepository } from '../lib/repositories/design-revision-repository.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

function createMockSupabaseClient(
  rpcHandler: (fn: string, params: Record<string, unknown>) => unknown
): SupabaseClient {
  return {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      const result = await rpcHandler(fn, params);
      return { data: result, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => ({
            data: [],
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

test('createDraft dispatches create_design_revision_draft RPC with proper params', async () => {
  let calledRpc = '';
  let calledParams: Record<string, unknown> = {};

  const mockClient = createMockSupabaseClient((fn, params) => {
    calledRpc = fn;
    calledParams = params;
    return {
      ok: true,
      value: {
        id: 'draft-1',
        orderId: params.p_order_id,
        projectId: 'project-1',
        baseDesignVersionId: params.p_base_version_id,
        expectedProductionDesignVersionId: params.p_expected_production_version_id,
        document: { productId: 'card' },
        revision: 1,
        reason: params.p_reason,
        status: 'editing',
        createdBy: 'user-1',
        editorUserId: 'user-1',
        lease: { sessionId: params.p_session_id, epoch: 1, expiresAt: '2026-09-30T16:00:00Z' },
        createdAt: '2026-09-30T15:00:00Z',
        updatedAt: '2026-09-30T15:00:00Z',
        approvedDesignVersionId: null,
      },
    };
  });

  const repo = new DesignRevisionRepository(mockClient);
  const result = await repo.createDraft({
    orderId: 'order-123',
    baseVersionId: 'ver-1',
    expectedProductionVersionId: 'ver-1',
    reason: 'Chỉnh sửa lề in thiệp',
    sessionId: 'session-uuid-1',
    requestId: 'req-1',
  });

  assert.equal(calledRpc, 'create_design_revision_draft');
  assert.equal(calledParams.p_order_id, 'order-123');
  assert.equal(calledParams.p_reason, 'Chỉnh sửa lề in thiệp');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.id, 'draft-1');
    assert.equal(result.value.status, 'editing');
  }
});

test('heartbeatLease returns updated lease or error code on loss', async () => {
  const mockClient = createMockSupabaseClient((_fn, params) => {
    if (params.p_epoch === 1) {
      return {
        ok: true,
        value: {
          sessionId: params.p_session_id,
          epoch: 1,
          expiresAt: '2026-09-30T16:02:00Z',
        },
      };
    }
    return {
      ok: false,
      code: 'LEASE_LOST',
      message: 'Quyền chỉnh sửa đã bị chuyển sang phiên khác',
    };
  });

  const repo = new DesignRevisionRepository(mockClient);
  const okResult = await repo.heartbeatLease('draft-1', 'session-1', 1);
  assert.equal(okResult.ok, true);
  if (okResult.ok) {
    assert.equal(okResult.value.epoch, 1);
  }

  const lostResult = await repo.heartbeatLease('draft-1', 'session-1', 2);
  assert.equal(lostResult.ok, false);
  if (!lostResult.ok) {
    assert.equal(lostResult.code, 'LEASE_LOST');
  }
});

test('takeoverLease dispatches takeover_draft_lease RPC', async () => {
  let calledRpc = '';
  let calledParams: Record<string, unknown> = {};

  const mockClient = createMockSupabaseClient((fn, params) => {
    calledRpc = fn;
    calledParams = params;
    return {
      ok: true,
      value: {
        id: params.p_draft_id,
        orderId: 'order-1',
        projectId: 'proj-1',
        baseDesignVersionId: 'ver-1',
        expectedProductionDesignVersionId: 'ver-1',
        document: {},
        revision: 1,
        reason: 'Takeover reason',
        status: 'editing',
        createdBy: 'user-editor',
        editorUserId: 'user-admin',
        lease: { sessionId: params.p_session_id, epoch: 2, expiresAt: '2026-09-30T16:05:00Z' },
        createdAt: '2026-09-30T15:00:00Z',
        updatedAt: '2026-09-30T15:05:00Z',
        approvedDesignVersionId: null,
      },
    };
  });

  const repo = new DesignRevisionRepository(mockClient);
  const result = await repo.takeoverLease({
    draftId: 'draft-1',
    expectedEpoch: 1,
    sessionId: 'session-admin',
    requestId: 'req-takeover-1',
  });

  assert.equal(calledRpc, 'takeover_draft_lease');
  assert.equal(calledParams.p_expected_epoch, 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.editorUserId, 'user-admin');
    assert.equal(result.value.lease?.epoch, 2);
  }
});

test('discardDraft dispatches discard_design_revision_draft RPC', async () => {
  let calledRpc = '';
  const mockClient = createMockSupabaseClient((fn) => {
    calledRpc = fn;
    return {
      ok: true,
      value: { draftId: 'draft-1', status: 'discarded' },
    };
  });

  const repo = new DesignRevisionRepository(mockClient);
  const result = await repo.discardDraft({
    draftId: 'draft-1',
    expectedRevision: 2,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    requestId: 'req-discard-1',
  });

  assert.equal(calledRpc, 'discard_design_revision_draft');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.status, 'discarded');
  }
});
