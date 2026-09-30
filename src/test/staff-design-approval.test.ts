import test from 'node:test';
import assert from 'node:assert/strict';
import { DesignRevisionRepository } from '../lib/repositories/design-revision-repository.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

test('approveRevision requires all warning IDs to be acknowledged', async () => {
  let calledRpc = '';
  let calledParams: Record<string, unknown> = {};

  const mockClient = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calledRpc = fn;
      calledParams = params;
      const acked = params.p_acknowledged_warning_ids as string[];
      if (!acked.includes('warn-1')) {
        return {
          data: {
            ok: false,
            code: 'WARNINGS_UNACKNOWLEDGED',
            message: 'Chưa xác nhận hết các cảnh báo in ấn',
          },
          error: null,
        };
      }
      return {
        data: {
          ok: true,
          value: {
            orderId: 'order-1',
            customerVersionId: 'ver-1',
            productionVersionId: 'ver-2',
            versionNumber: 2,
            draftId: params.p_draft_id,
          },
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const repo = new DesignRevisionRepository(mockClient);

  // Missing warning ack
  const unackedResult = await repo.approveRevision({
    draftId: 'draft-1',
    expectedRevision: 1,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    assessmentId: 'assess-1',
    acknowledgedWarningIds: [],
    requestId: 'req-app-1',
  });

  assert.equal(unackedResult.ok, false);
  if (!unackedResult.ok) {
    assert.equal(unackedResult.code, 'WARNINGS_UNACKNOWLEDGED');
  }

  // With warning ack
  const ackedResult = await repo.approveRevision({
    draftId: 'draft-1',
    expectedRevision: 1,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    assessmentId: 'assess-1',
    acknowledgedWarningIds: ['warn-1'],
    requestId: 'req-app-2',
  });

  assert.equal(calledRpc, 'approve_design_revision');
  assert.equal(ackedResult.ok, true);
  if (ackedResult.ok) {
    assert.equal(ackedResult.value.versionNumber, 2);
  }
});

test('approveCustomerAsIs preserves customer version as production', async () => {
  const mockClient = {
    rpc: async (_fn: string, params: Record<string, unknown>) => {
      return {
        data: {
          ok: true,
          value: {
            orderId: params.p_order_id,
            customerVersionId: params.p_expected_customer_version_id,
            productionVersionId: params.p_expected_customer_version_id,
            versionNumber: 1,
            draftId: null,
          },
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const repo = new DesignRevisionRepository(mockClient);
  const result = await repo.approveCustomerAsIs({
    orderId: 'order-1',
    expectedCustomerVersionId: 'ver-1',
    expectedProductionVersionId: 'ver-1',
    assessmentId: 'assess-customer',
    acknowledgedWarningIds: [],
    requestId: 'req-as-is-1',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.customerVersionId, result.value.productionVersionId);
    assert.equal(result.value.versionNumber, 1);
  }
});
