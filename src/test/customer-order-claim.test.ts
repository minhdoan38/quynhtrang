import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerOrderClaimService } from '../lib/services/customer-order-claim.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

test('claimGuestOrder rejects empty token or order ID before hitting DB', async () => {
  const service = new CustomerOrderClaimService({} as unknown as SupabaseClient);
  await assert.rejects(
    () => service.claimGuestOrder('', 'token-123'),
    /Mã đơn hàng không hợp lệ/
  );
  await assert.rejects(
    () => service.claimGuestOrder('order-uuid', '   '),
    /Mã bảo mật phiên khách không hợp lệ/
  );
});

test('claimGuestOrder dispatches claim_guest_order_and_project RPC and maps response', async () => {
  let calledRpc = '';
  let calledParams: Record<string, unknown> = {};

  const mockClient = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calledRpc = fn;
      calledParams = params;
      return {
        data: {
          success: true,
          idempotent: false,
          order_id: params.p_order_id,
          project_id: 'proj-123',
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const service = new CustomerOrderClaimService(mockClient);
  const result = await service.claimGuestOrder('ord-1', 'tok-abc');

  assert.equal(calledRpc, 'claim_guest_order_and_project');
  assert.equal(calledParams.p_order_id, 'ord-1');
  assert.equal(calledParams.p_guest_token, 'tok-abc');
  assert.equal(result.success, true);
  assert.equal(result.orderId, 'ord-1');
  assert.equal(result.projectId, 'proj-123');
});
