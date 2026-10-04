import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';
import { enableSupportedVariant, updateProductMetadata } from '../lib/services/admin-product-catalog.ts';
import type { StaffIdentity } from '../lib/domain/order.ts';
import { readFileSync } from 'node:fs';
import { catalogStartingPrice } from '../lib/admin/product-catalog-ui.ts';

const admin: StaffIdentity = { userId: 'admin', role: 'admin' };
const editor: StaffIdentity = { userId: 'editor', role: 'editor' };
function repo() {
  const value = new AdminCatalogRepository(null);
  value.seedProduct({ id: 'card', slug: 'card', name: 'Thiệp', productType: 'card', status: 'draft', revision: 1 });
  return value;
}

describe('Admin product catalog operations', () => {
  it('updates display metadata without replacing structural metadata; stale tab conflicts', async () => {
    const value = repo();
    value.seedProduct({ ...value.getProduct('card')!, metadata: { geometry: { width: 10 }, description: 'old' } });
    const result = await updateProductMetadata('card', 1, { name: 'Thiệp mới', description: 'Mô tả', thumbnail: '/catalog/card.png', sortOrder: 2 }, { staff: admin, repo: value });
    assert.equal(result.ok, true);
    assert.equal(value.getProduct('card')?.name, 'Thiệp mới');
    assert.deepEqual(value.getProduct('card')?.metadata?.geometry, { width: 10 });
    assert.equal((await updateProductMetadata('card', 1, { name: 'stale' }, { staff: admin, repo: value })).code, 'REVISION_CONFLICT');
  });
  it('rejects empty name, unsafe thumbnail URL, invalid revision, and structural patch keys', async () => {
    const value = repo();
    for (const patch of [{ name: '' }, { thumbnail: 'javascript:alert(1)' }, { sortOrder: 1.5 }, { definitionKey: 'card:vertical' }]) {
      const result = await updateProductMetadata('card', 1, patch as never, { staff: admin, repo: value });
      assert.equal(result.code, 'INVALID_INPUT');
    }
    assert.equal((await updateProductMetadata('card', 0, { name: 'X' }, { staff: admin, repo: value })).code, 'INVALID_INPUT');
    assert.equal(value.getProduct('card')?.revision, 1);
  });
  it('rejects editor metadata and enablement mutations before changing data', async () => {
    const value = repo();
    assert.equal((await updateProductMetadata('card', 1, { name: 'X' }, { staff: editor, repo: value })).code, 'FORBIDDEN');
    assert.equal((await enableSupportedVariant('card', 'card:horizontal', 1, { staff: editor, repo: value })).code, 'FORBIDDEN');
    assert.equal(value.getProduct('card')?.revision, 1);
  });
  it('enables only registry identities; duplicates, cross-family keys and stale tabs fail', async () => {
    const value = repo();
    assert.equal((await enableSupportedVariant('card', 'card:horizontal', 1, { staff: admin, repo: value })).ok, true);
    assert.equal(value.getAvailableDefinitions('card').some((item) => item.definitionKey === 'card:horizontal'), false);
    assert.equal((await enableSupportedVariant('card', 'card:vertical', 1, { staff: admin, repo: value })).code, 'REVISION_CONFLICT');
    assert.equal((await enableSupportedVariant('card', 'card:horizontal', 2, { staff: admin, repo: value })).code, 'ALREADY_CONFIGURED');
    assert.equal((await enableSupportedVariant('card', 'wrapping:a1', 2, { staff: admin, repo: value })).code, 'UNKNOWN_DEFINITION_KEY');
  });
  it('lists every lifecycle and hydrates current published pricing rather than legacy variant price', async () => {
    const value = repo();
    value.seedProduct({ id: 'wrapping', slug: 'wrapping', name: 'Giấy', productType: 'wrapping', status: 'archived', revision: 1 });
    value.seedProduct({ ...value.getProduct('card')!, currentCommercialConfigVersionId: 'v1' });
    value.seedCommercialVersion({ id: 'v1', productId: 'card', versionNumber: 1, currency: 'VND', paymentPolicy: { kind: 'full_payment' }, variantRules: [{ variantId: 'horizontal', minimumQuantity: 1, quantityStep: 1, maximumQuantity: null, tiers: [{ minimumQuantity: 1, unitPrice: 100 }] }] });
    assert.equal((await value.listProducts()).length, 2);
    assert.equal((await value.listProducts({ status: 'archived' }))[0].id, 'wrapping');
    assert.equal((await value.getProductById('card'))?.currentConfig?.variantRules[0].tiers[0].unitPrice, 100);
  });
  it('hydrates remote rules, tiers and drafts before services read synchronous state', async () => {
    const rows: Record<string, unknown[]> = {
      products: [{ id: 'card', slug: 'card', name: 'Thiệp', product_type: 'card', status: 'active', revision: 4, current_commercial_config_version_id: 'v1', metadata: {} }],
      product_variants: [{ id: 'horizontal', product_id: 'card', name: 'Ngang', price: 999, status: 'active', revision: 2, definition_key: 'card:horizontal', metadata: {} }],
      product_commercial_config_versions: [{ id: 'v1', product_id: 'card', version_number: 1, payment_policy: { kind: 'full_payment' } }],
      commercial_variant_rules: [{ id: 'r1', version_id: 'v1', variant_id: 'horizontal', minimum_quantity: 1, quantity_step: 1, maximum_quantity: null }],
      commercial_pricing_tiers: [{ rule_id: 'r1', minimum_quantity: 1, unit_price: 120 }],
      product_commercial_drafts: [{ id: 'd1', product_id: 'card', base_version_id: 'v1', revision: 3, payload: { currency: 'VND', paymentPolicy: { kind: 'full_payment' }, variantRules: [] }, author_id: 'admin' }],
    };
    const remote = new AdminCatalogRepository({ from(table: string) { assert.ok(rows[table]); const response = { data: rows[table], error: null }; return { select() { return { ...Promise.resolve(response), then: Promise.resolve(response).then.bind(Promise.resolve(response)), order: async () => response }; } }; } } as never);
    const product = await remote.getProductById('card');
    assert.equal(product?.revision, 4);
    assert.equal(catalogStartingPrice(product!), 120);
    assert.equal(remote.getCommercialDraftById('d1')?.revision, 3);
    assert.deepEqual(remote.getAvailableDefinitions('card').map((definition) => definition.definitionKey), ['card:vertical']);
  });
  it('migration keeps privileged RPCs null-safe and closes nullable prior role guards', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0016_state44_admin_catalog_ui.sql', import.meta.url), 'utf8');
    for (const name of ['catalog_update_product_metadata', 'catalog_enable_variant', 'catalog_open_commercial_draft']) {
      const body = sql.split(`create or replace function public.${name}`)[1]?.split('$$;')[0];
      assert.ok(body);
      assert.match(body, /v_role is distinct from 'admin'/);
      assert.match(body, /auth\.uid\(\) is null/);
      assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(`));
    }
    assert.match(sql, /save_product_commercial_draft\(uuid,bigint,jsonb\)/);
    assert.match(sql, /publish_product_commercial_config\(text,uuid,bigint,bigint,text\)/);
  });
});
