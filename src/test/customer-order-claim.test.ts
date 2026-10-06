import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CustomerOrderClaimService } from '../lib/services/customer-order-claim.ts';
import { POST as claimOrderRoute } from '../app/api/orders/[id]/claim/route.ts';
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

test('POST /api/orders/[id]/claim rejects unauthenticated requests with 401', async () => {
  const res = await claimOrderRoute(
    new Request('http://localhost/api/orders/order-123/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ id: 'order-123' }) },
  );
  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /đăng nhập/);
});

test('POST /api/orders/[id]/claim rejects empty order id with 400', async () => {
  const res = await claimOrderRoute(
    new Request('http://localhost/api/orders//claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ id: '' }) },
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
});
