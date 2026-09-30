import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerOrderClaimService } from '../lib/services/customer-order-claim.ts';
import { handleAutosaveResponse } from '../lib/services/cloud-project-autosave.ts';
import { getCustomerFacingStatusText } from '../lib/domain/order.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

test('State 41 end-to-end integration contracts', async () => {
  // 1. Claim contract: requires guest token proof
  const claimService = new CustomerOrderClaimService({
    rpc: async (_fn: string, params: Record<string, unknown>) => {
      if (!params.p_guest_token) throw new Error('INVALID_GUEST_PROOF');
      return { data: { success: true, order_id: params.p_order_id, project_id: 'proj-1' }, error: null };
    },
  } as unknown as SupabaseClient);

  const claimRes = await claimService.claimGuestOrder('order-uuid', 'valid-guest-token');
  assert.equal(claimRes.success, true);
  assert.equal(claimRes.orderId, 'order-uuid');

  // 2. Monotonic revision contract: rejects stale revision
  const conflict = handleAutosaveResponse({
    success: false,
    error: 'STALE_REVISION',
    current_revision: 3,
  });
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.serverRevision, 3);

  // 3. Customer projection status contract: never leaks internal state
  assert.equal(getCustomerFacingStatusText('in_production'), 'Đang sản xuất');
  assert.equal(getCustomerFacingStatusText('waiting_payment'), 'Chờ xác nhận thanh toán');
  assert.equal(getCustomerFacingStatusText('production_completed'), 'Sản xuất hoàn tất');
});
