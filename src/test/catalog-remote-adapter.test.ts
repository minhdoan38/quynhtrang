import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';

class RemoteClient {
  readonly rpcCalls: string[] = [];
  readonly tables: string[] = [];
  rpc(name: string) {
    this.rpcCalls.push(name);
    if (name === 'save_product_commercial_draft') return Promise.resolve({ data: { ok: true, draft: { id: 'draft-1', product_id: 'card', base_version_id: null, revision: 2, payload: {}, author_id: 'admin' } }, error: null });
    return Promise.resolve({ data: { ok: true, version: { id: 'version-1', product_id: 'card', version_number: 1, payment_policy: { kind: 'full_payment' }, variantRules: [] } }, error: null });
  }
  from(table: string) {
    this.tables.push(table);
    const query = {
      insert: () => query,
      select: () => query,
      single: () => Promise.resolve({ data: { id: 'quote-1', product_id: 'card', variant_id: 'horizontal', commercial_config_version_id: 'version-1', quantity: 1, calculation: {}, checkout_key_hash: 'hash', created_at: '2026-10-04T00:00:00.000Z', expires_at: '2026-10-04T00:30:00.000Z' }, error: null }),
    };
    return query;
  }
}

test('remote admin repository uses draft/publish RPCs and quote table', async () => {
  const client = new RemoteClient();
  const repo = new AdminCatalogRepository(client as never);
  const payload = { id: 'draft', productId: 'card', versionNumber: 1, currency: 'VND' as const, paymentPolicy: { kind: 'full_payment' as const }, variantRules: [] };
  assert.equal((await repo.saveDraft('draft-1', 1, payload)).revision, 2);
  assert.equal((await repo.publishDraft('card', 'draft-1', 2, 1, 'request')).id, 'version-1');
  await repo.saveQuote({ id: 'quote-local', productId: 'card', variantId: 'horizontal', commercialConfigVersionId: 'version-1', quantity: 1, calculation: {} as never, checkoutKeyHash: 'hash', createdAt: '2026-10-04T00:00:00.000Z', expiresAt: '2026-10-04T00:30:00.000Z' });
  assert.deepEqual(client.rpcCalls, ['save_product_commercial_draft', 'publish_product_commercial_config']);
  assert.ok(client.tables.includes('price_quotes'));
});
