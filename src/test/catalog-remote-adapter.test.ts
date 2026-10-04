import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';

class RemoteClient {
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  readonly tables: Array<{ name: string; payload: Record<string, unknown> }> = [];
  rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    if (name === 'save_product_commercial_draft') {
      return Promise.resolve({ data: { ok: true, draft: { id: args.p_draft_id, product_id: 'card', base_version_id: null, revision: 2, payload: args.p_payload, author_id: 'admin' } }, error: null });
    }
    return Promise.resolve({ data: { ok: true, version: { id: 'version-1', product_id: args.p_product_id, version_number: 1, payment_policy: { kind: 'full_payment' }, variantRules: [] } }, error: null });
  }
  from(table: string) {
    const state: { payload?: Record<string, unknown> } = {};
    const query = {
      insert: (payload: Record<string, unknown>) => {
        state.payload = payload;
        this.tables.push({ name: table, payload });
        return query;
      },
      select: () => query,
      single: () => Promise.resolve({ data: { ...state.payload, id: 'quote-remote' }, error: null }),
    };
    return query;
  }
}

test('remote admin repository uses draft/publish RPCs with exact arguments and quote table', async () => {
  const client = new RemoteClient();
  const repo = new AdminCatalogRepository(client as never);
  const payload = { id: 'draft', productId: 'card', versionNumber: 1, currency: 'VND' as const, paymentPolicy: { kind: 'full_payment' as const }, variantRules: [] };

  const saved = await repo.saveDraft('draft-1', 1, payload);
  assert.equal(saved.revision, 2);
  assert.equal(client.rpcCalls[0]?.name, 'save_product_commercial_draft');
  assert.equal(client.rpcCalls[0]?.args.p_draft_id, 'draft-1');
  assert.equal(client.rpcCalls[0]?.args.p_expected_revision, 1);

  const published = await repo.publishDraft('card', 'draft-1', 2, 1, 'request-123');
  assert.equal(published.id, 'version-1');
  assert.equal(client.rpcCalls[1]?.name, 'publish_product_commercial_config');
  assert.equal(client.rpcCalls[1]?.args.p_product_id, 'card');
  assert.equal(client.rpcCalls[1]?.args.p_draft_id, 'draft-1');
  assert.equal(client.rpcCalls[1]?.args.p_expected_draft_revision, 2);
  assert.equal(client.rpcCalls[1]?.args.p_expected_product_revision, 1);
  assert.equal(client.rpcCalls[1]?.args.p_request_id, 'request-123');

  const quote = await repo.saveQuote({
    id: 'quote-local', productId: 'card', variantId: 'horizontal', commercialConfigVersionId: 'version-1',
    quantity: 5, calculation: { totalAmount: 145000 } as never, checkoutKeyHash: 'hash-abc',
    createdAt: '2026-10-04T00:00:00.000Z', expiresAt: '2026-10-04T00:30:00.000Z',
  });
  assert.equal(quote.id, 'quote-remote');
  assert.equal(client.tables[0]?.name, 'price_quotes');
  assert.equal(client.tables[0]?.payload.product_id, 'card');
  assert.equal(client.tables[0]?.payload.variant_id, 'horizontal');
  assert.equal(client.tables[0]?.payload.commercial_config_version_id, 'version-1');
  assert.equal(client.tables[0]?.payload.quantity, 5);
  assert.equal(client.tables[0]?.payload.checkout_key_hash, 'hash-abc');
});
