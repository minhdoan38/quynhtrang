import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculatePrice } from '../lib/domain/commercial-config.ts';
import { validateCommercialConfig } from '../lib/domain/commercial-config.ts';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';
import { createOrLoadCommercialDraft, saveCommercialDraft, publishProductCommercialConfig } from '../lib/services/commercial-config-service.ts';
import { catalogActionError, catalogStartingPrice, commercialDraftConfig } from '../lib/admin/product-catalog-ui.ts';
import { activateProductAction, archiveProductAction, activateVariantAction, archiveVariantAction, updateProductMetadataAction, enableVariantAction, loadCommercialDraftAction, saveCommercialDraftAction, publishCommercialConfigAction } from '../app/admin/products/actions.ts';

describe('Admin commercial editor contracts', () => {
  it('preview uses calculatePrice tier, due now, and remaining values', () => {
    const config = { id: 'v1', productId: 'card', versionNumber: 1, currency: 'VND' as const, paymentPolicy: { kind: 'fixed_deposit' as const, depositAmount: 10000 }, variantRules: [{ variantId: 'horizontal', minimumQuantity: 1, quantityStep: 1, maximumQuantity: 100, tiers: [{ minimumQuantity: 1, unitPrice: 29000 }, { minimumQuantity: 10, unitPrice: 25000 }] }] };
    const quote = calculatePrice(config, 'horizontal', 10); assert.equal(quote.appliedTier.unitPrice, 25000); assert.equal(quote.amountDueNow, 10000); assert.equal(quote.remainingAmount, 240000);
  });
  it('invalid rule thresholds produce Vietnamese validation state', () => {
    const errors = validateCommercialConfig({ id: 'v1', productId: 'card', versionNumber: 1, currency: 'VND', paymentPolicy: { kind: 'full_payment' }, variantRules: [{ variantId: 'horizontal', minimumQuantity: 2, quantityStep: 2, maximumQuantity: null, tiers: [{ minimumQuantity: 3, unitPrice: 29000 }] }] }, ['horizontal']); assert.ok(errors.length > 0); assert.match(errors.join(' '), /first tier threshold/i);
  });
  it('starts from current version, saves first draft, rejects stale tab, publishes immutable new version', async () => {
    const repo = new AdminCatalogRepository(null);
    const staff = { userId: 'admin', role: 'admin' as const };
    repo.seedProduct({ id: 'card', slug: 'card', name: 'Thiệp', productType: 'card', status: 'draft', revision: 1 });
    repo.seedVariant({ id: 'horizontal', productId: 'card', name: 'Ngang', price: 999, status: 'active', revision: 1, definitionKey: 'card:horizontal' });
    const draft = await createOrLoadCommercialDraft('card', 'admin', { staff, repo });
    const payload = { currency: 'VND' as const, paymentPolicy: { kind: 'full_payment' as const }, variantRules: [{ variantId: 'horizontal', minimumQuantity: 1, quantityStep: 1, maximumQuantity: null, tiers: [{ minimumQuantity: 1, unitPrice: 100 }] }] };
    const input = { draftId: draft.id, expectedRevision: 1, payload, requestId: 'save' };
    const saved = await saveCommercialDraft(input, { staff, repo });
    assert.equal(saved.revision, 2);
    await assert.rejects(() => saveCommercialDraft(input, { staff, repo }), /REVISION_CONFLICT/);
    const published = await publishProductCommercialConfig({ productId: 'card', expectedDraftRevision: 2, expectedProductRevision: 1, requestId: 'publish' }, { staff, repo });
    assert.equal(repo.getCommercialDraft('card'), null);
    const next = await createOrLoadCommercialDraft('card', 'admin', { staff, repo });
    assert.equal(next.baseVersionId, published.id);
    assert.equal(commercialDraftConfig(next).variantRules[0].tiers[0].unitPrice, 100);
    assert.equal(catalogStartingPrice(repo.getProduct('card')!), 100);
  });
  it('redacts raw database errors and exposes conflict recovery', () => {
    const error = catalogActionError(new Error('relation private.secret does not exist'));
    assert.equal(error.ok, false);
    if (!error.ok) assert.equal(error.message, 'Chưa thể áp dụng giá mới.');
    const conflict = catalogActionError(new Error('REVISION_CONFLICT'));
    if (!conflict.ok) assert.equal(conflict.status, 409);
  });
  it('every server mutation returns 403 for Editor without touching Supabase', async () => {
    const previous = process.env.SMOKE_TEST_STAFF_ROLE;
    process.env.SMOKE_TEST_STAFF_ROLE = 'editor';
    try {
      const input = { productId: 'card', expectedRevision: 1, variantId: 'horizontal' };
      const results = await Promise.all([
        activateProductAction(input), archiveProductAction(input), activateVariantAction(input), archiveVariantAction(input),
        updateProductMetadataAction({ ...input, patch: { name: 'X' } }),
        enableVariantAction({ ...input, definitionKey: 'card:vertical', expectedProductRevision: 1 }),
        loadCommercialDraftAction('card'),
        saveCommercialDraftAction({ ...input, draftId: 'd1', requestId: 'r', payload: {} as never }),
        publishCommercialConfigAction({ productId: 'card', draftId: 'd1', expectedDraftRevision: 1, expectedProductRevision: 1, requestId: 'r' }),
      ]);
      for (const result of results) { assert.equal(result.ok, false); if (!result.ok) { assert.equal(result.code, 'FORBIDDEN'); assert.equal(result.status, 403); } }
    } finally { if (previous === undefined) delete process.env.SMOKE_TEST_STAFF_ROLE; else process.env.SMOKE_TEST_STAFF_ROLE = previous; }
  });
});
