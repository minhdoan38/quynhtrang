import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculatePrice } from '../lib/domain/commercial-config.ts';
import { validateCommercialConfig } from '../lib/domain/commercial-config.ts';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';
import { createOrLoadCommercialDraft, saveCommercialDraft, publishProductCommercialConfig } from '../lib/services/commercial-config-service.ts';
import { catalogActionError, catalogStartingPrice, commercialDraftConfig } from '../lib/admin/product-catalog-ui.ts';
import { activateProductAction, archiveProductAction, activateVariantAction, archiveVariantAction, updateProductMetadataAction, enableVariantAction, loadCommercialDraftAction, saveCommercialDraftAction, publishCommercialConfigAction } from '../app/admin/products/actions.ts';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';

interface TestElement {
  type: unknown;
  key: string | null;
  props: { children?: unknown; type?: string; checked?: boolean; open?: boolean; error?: string; role?: string; onChange: () => void; onClick: () => void; onConfirm: () => Promise<void>; onOpenChange: (open: boolean) => void };
}

// Execute real TSX component functions; mock only React hooks, framework and I/O boundaries.
function componentModule(path: string, mocks: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const require = createRequire(import.meta.url);
  const babel = require('next/dist/compiled/babel/core') as { transformSync: (source: string, options: object) => { code: string } };
  const compiled = babel.transformSync(source, { filename: 'component.tsx', presets: [require('next/dist/compiled/babel/preset-typescript'), [require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]], plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')] }).code;
  const module = { exports: {} as Record<string, (props: unknown) => TestElement> };
  new Function('require', 'module', 'exports', compiled)((id: string) => mocks[id] ?? (id.startsWith('@/components/') || id.startsWith('./') ? new Proxy({}, { get: (_, name) => String(name) }) : require(id)), module, module.exports);
  return module.exports;
}

function componentHarness(path: string, name: string, mocks: Record<string, unknown>) {
  const state: unknown[] = []; let cursor = 0;
  const hooks = { useState(initial: unknown) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value: unknown) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; } };
  const component = componentModule(path, { ...mocks, react: hooks })[name];
  return { render(props: unknown) { cursor = 0; return component(props); } };
}

function elements(tree: unknown): TestElement[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  const element = tree as TestElement; // React JSX runtime owns these in-process element shapes.
  return [element, ...elements(element.props?.children)];
}

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
    const previousSmoke = process.env.SMOKE_TEST_STAFF_ROLE;
    const previousBypass = process.env.ENABLE_TEST_STAFF_BYPASS;
    process.env.SMOKE_TEST_STAFF_ROLE = 'editor';
    process.env.ENABLE_TEST_STAFF_BYPASS = '1';
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
    } finally {
      if (previousSmoke === undefined) delete process.env.SMOKE_TEST_STAFF_ROLE; else process.env.SMOKE_TEST_STAFF_ROLE = previousSmoke;
      if (previousBypass === undefined) delete process.env.ENABLE_TEST_STAFF_BYPASS; else process.env.ENABLE_TEST_STAFF_BYPASS = previousBypass;
    }
  });
  it('keeps editor identity and dirty pricing/payment across unrelated product revision refresh', async () => {
    let product = { id: 'card', revision: 1, variants: [{ id: 'horizontal', revision: 1 }], currentConfig: null };
    const page = componentModule('../app/admin/products/[id]/page.tsx', {
      '@/lib/admin/authorization.ts': { requireCurrentStaff: async () => ({ role: 'admin' }) },
      '@/lib/supabase/server.ts': { createServerSupabaseClient: async () => ({}) },
      '@/lib/repositories/admin-catalog-repository.ts': { AdminCatalogRepository: class { async getProductById() { return product; } getCommercialDraft() { return null; } getAvailableDefinitions() { return []; } } },
    }).default;
    const before = await page({ params: Promise.resolve({ id: 'card' }) });
    product = { ...product, revision: 2, variants: [{ id: 'horizontal', revision: 2 }] };
    const after = await page({ params: Promise.resolve({ id: 'card' }) });
    assert.equal(after.key, before.key, 'React key must not discard local commercial edits on metadata/variant refresh');
    const draft = { id: 'd', productId: 'card', revision: 1, payload: { currency: 'VND', paymentPolicy: { kind: 'full_payment' }, variantRules: [] } };
    const harness = componentHarness('../components/admin/commercial-config-editor.tsx', 'CommercialConfigEditor', {
      '@/lib/admin/product-catalog-ui.ts': { commercialDraftConfig },
      '@/lib/domain/commercial-config.ts': { validateCommercialConfig },
      '@/app/admin/products/actions.ts': {},
    });
    const props = { product, initialDraft: draft, editable: true, onPublished() { } };
    let tree = harness.render(props);
    elements(tree).filter((item) => item.type === 'input' && item.props.type === 'radio')[1].props.onChange();
    tree = harness.render({ ...props, product: { ...product, revision: 3 } });
    assert.equal(elements(tree).filter((item) => item.type === 'input' && item.props.type === 'radio')[1].props.checked, true);
    assert.ok(elements(tree).some((item) => item.props?.children === 'Bản nháp · chưa lưu'));
  });
  it('failed publish and archive responses stay visible inside active dialogs', async () => {
    const failure = { ok: false, code: 'REVISION_CONFLICT', status: 409, message: 'Cấu hình đã thay đổi. Tải lại.' };
    const draft = { id: 'd', productId: 'card', revision: 1, payload: { currency: 'VND', paymentPolicy: { kind: 'full_payment' }, variantRules: [] } };
    const product = { id: 'card', name: 'Thiệp', revision: 1, status: 'draft', variants: [], metadata: {} };
    const editor = componentHarness('../components/admin/commercial-config-editor.tsx', 'CommercialConfigEditor', {
      '@/lib/admin/product-catalog-ui.ts': { commercialDraftConfig }, '@/lib/domain/commercial-config.ts': { validateCommercialConfig },
      '@/app/admin/products/actions.ts': { publishCommercialConfigAction: async () => failure },
    });
    const props = { product, initialDraft: draft, editable: true, onPublished() { } };
    let tree = editor.render(props);
    const initialDialog = elements(tree).find((item) => item.type === 'PublishProductDialog');
    assert.ok(initialDialog);
    initialDialog.props.onOpenChange(true);
    await initialDialog.props.onConfirm();
    tree = editor.render(props);
    const dialog = elements(tree).find((item) => item.type === 'PublishProductDialog');
    assert.ok(dialog);
    assert.equal(dialog.props.open, true);
    assert.equal(dialog.props.error, failure.message);
    const detail = componentHarness('../components/admin/product-detail.tsx', 'ProductDetail', {
      'next/navigation': { useRouter: () => ({ refresh() { } }) },
      '@/lib/admin/product-catalog-ui.ts': { CATALOG_STATUS_LABEL: { draft: 'Bản nháp' }, CATALOG_STATUS_BADGE: { draft: 'honey' }, catalogStartingPrice },
      '@/lib/domain/commercial-config.ts': {}, '@/app/admin/products/actions.ts': { archiveProductAction: async () => failure },
    });
    const detailProps = { product, draft, availableDefinitions: [], canMutate: true };
    tree = detail.render(detailProps);
    const archiveButton = elements(tree).find((item) => item.props?.children === 'Lưu trữ sản phẩm');
    assert.ok(archiveButton);
    archiveButton.props.onClick();
    tree = detail.render(detailProps);
    const confirmDialog = elements(tree).find((item) => item.type === 'ArchiveProductDialog');
    assert.ok(confirmDialog);
    confirmDialog.props.onConfirm();
    await nextTurn();
    const finalDialog = elements(detail.render(detailProps)).find((item) => item.type === 'ArchiveProductDialog');
    assert.ok(finalDialog);
    assert.equal(finalDialog.props.open, true);
    assert.equal(finalDialog.props.error, failure.message);
    const dialogs = componentModule('../components/admin/product-lifecycle-dialogs.tsx', {});
    for (const name of ['PublishProductDialog', 'ArchiveProductDialog']) {
      const rendered = dialogs[name]({ open: true, pending: false, error: failure.message, onConfirm() { }, onOpenChange() { } });
      const content = elements(rendered).find((item) => item.type === 'DialogContent');
      assert.ok(elements(content).some((item) => item.props?.role === 'alert' && item.props.children === failure.message));
    }
  });
});
