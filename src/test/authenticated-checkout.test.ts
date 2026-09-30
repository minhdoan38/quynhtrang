import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOrderFromGuestCheckout } from '../lib/services/prepare-order-from-guest-checkout.ts';
import type { DesignState } from '../lib/product-state.ts';

test('attaches customer_user_id and project owner when authenticated user is provided', async () => {
  let createdProjectOwner: string | null = null;
  let createdOrderCustomer: string | null = null;

  const mockProjectRepo = {
    createProject: async (input: { ownerUserId?: string | null }) => {
      createdProjectOwner = input.ownerUserId ?? null;
      return { id: 'p-1', ...input };
    },
  };

  const mockOrderRepo = {
    getByIdempotencyKey: async () => null,
    createPendingOrder: async (input: { customerUserId?: string | null }) => {
      createdOrderCustomer = input.customerUserId ?? null;
      return { id: 'o-1', ...input, payment: {} };
    },
    createGuestAccess: async () => { },
    deleteById: async () => { },
  };

  await prepareOrderFromGuestCheckout(
    {
      idempotencyKey: 'idem-auth-1',
      design: { productId: 'card', quantity: 10, productOptions: {} } as unknown as DesignState,
      customer: { fullName: 'Minh', phone: '0901234567', shippingAddress: 'HN' },
      designRevision: 'rev-1',
      preflightRevision: 'rev-1',
      preflightAcknowledged: true,
      authenticatedUserId: 'user-auth-uuid-123',
    },
    {
      projectRepo: mockProjectRepo as never,
      orderRepo: mockOrderRepo as never,
      assetRepo: { promoteAsset: async () => ({ id: 'a1' }) } as never,
      designVersionRepo: { createVersion: async () => ({ id: 'v1', createdAt: '' }) } as never,
      orderEventRepo: { append: async () => { } } as never,
      paymentRepo: { create: async () => { } } as never,
    }
  );

  assert.equal(createdProjectOwner, 'user-auth-uuid-123');
  assert.equal(createdOrderCustomer, 'user-auth-uuid-123');
});
