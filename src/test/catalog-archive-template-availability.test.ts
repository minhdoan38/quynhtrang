import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TemplateRepository } from '../lib/repositories/template-repository.ts';
import { ProjectRepository } from '../lib/repositories/project-repository.ts';
import { CatalogRepository } from '../lib/repositories/catalog-repository.ts';
import { cloneTemplateIntoProject } from '../lib/services/template-clone.ts';
import { createTemplateTarget } from '../lib/template-target.ts';
import {
  getPublishedProductBySlug,
  getCanonicalSlug,
} from '../lib/product-catalog.ts';
import { startProductionInternal, completeProductionInternal } from '../lib/services/admin-fulfillment-operations.ts';
import type { UseTemplateInput } from '../lib/domain/template.ts';

interface QueryFilter {
  col: string;
  op: 'eq' | 'is' | 'not_null';
  val: unknown;
}

function matchesFilters(item: Record<string, unknown>, filters: QueryFilter[]): boolean {
  for (const f of filters) {
    if (f.op === 'eq' && item[f.col] !== f.val) return false;
    if (f.op === 'is' && f.val === null && item[f.col] != null) return false;
    if (f.op === 'not_null' && item[f.col] == null) return false;
  }
  return true;
}

function createMockSupabase(options: {
  products?: Array<Record<string, unknown>>;
  variants?: Array<Record<string, unknown>>;
  templates?: Array<Record<string, unknown>>;
  versions?: Array<Record<string, unknown>>;
  rules?: Array<Record<string, unknown>>;
  tiers?: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
} = {}): SupabaseClient {
  const products = options.products ?? [];
  const variants = options.variants ?? [];
  const templates = options.templates ?? [];
  const versions = options.versions ?? [];
  const rules = options.rules ?? [];
  const tiers = options.tiers ?? [];
  const orders = options.orders ?? [];

  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'get_template_availability') {
        const tmplId = String(args.p_template_id);
        const tmpl = templates.find((t) => t.id === tmplId);
        if (!tmpl) {
          return { data: { available: false, blockers: [{ code: 'NOT_FOUND', message: 'Mẫu không tồn tại' }] }, error: null };
        }
        if (tmpl.status === 'archived' || tmpl.archived_at) {
          return { data: { available: false, blockers: [{ code: 'TEMPLATE_ARCHIVED', message: 'Mẫu đã lưu trữ' }] }, error: null };
        }
        if (!tmpl.current_published_version_id) {
          return { data: { available: false, blockers: [{ code: 'NO_PUBLISHED_VERSION', message: 'Chưa xuất bản' }] }, error: null };
        }
        return { data: { available: true, blockers: [] }, error: null };
      }
      if (fn === 'browse_available_templates') {
        const rows = templates
          .filter((t) => t.status === 'published' && !t.archived_at && t.current_published_version_id)
          .map((t) => ({
            id: t.id,
            slug: t.slug ?? t.id,
            name: t.name,
            product_id: t.product_id,
            variant_id: t.variant_id,
            product_mode: t.product_mode ?? null,
            fixed_sticker_shape: t.fixed_sticker_shape ?? null,
            category_id: t.category_id ?? null,
            tags: t.tags ?? [],
            sort_order: Number(t.sort_order ?? 0),
            current_published_version_id: t.current_published_version_id,
            thumbnail_path: t.thumbnail_path ?? null,
            target_snapshot: t.target_snapshot ?? null,
            updated_at: t.updated_at ?? '2026-10-05T00:00:00Z',
          }));
        return { data: rows, error: null };
      }
      if (fn === 'start_order_production') {
        const order = orders.find((o) => o.id === args.p_order_id);
        if (!order) return { data: null, error: { message: 'ORDER_NOT_FOUND' } };
        return { data: { ok: true, value: { orderId: order.id, fulfillmentStatus: 'in_production' } }, error: null };
      }
      if (fn === 'complete_order_production') {
        const order = orders.find((o) => o.id === args.p_order_id);
        if (!order) return { data: null, error: { message: 'ORDER_NOT_FOUND' } };
        return { data: { ok: true, value: { orderId: order.id, fulfillmentStatus: 'completed' } }, error: null };
      }
      return { data: null, error: new Error(`Unknown RPC ${fn}`) };
    },
    from: (table: string) => {
      let dataStore: Array<Record<string, unknown>> = [];
      if (table === 'products') dataStore = products;
      else if (table === 'product_variants') dataStore = variants;
      else if (table === 'templates') dataStore = templates;
      else if (table === 'template_versions' || table === 'product_commercial_config_versions') dataStore = versions;
      else if (table === 'commercial_variant_rules') dataStore = rules;
      else if (table === 'commercial_pricing_tiers') dataStore = tiers;
      else if (table === 'orders') dataStore = orders;

      const filters: QueryFilter[] = [];
      const builder = {
        select: (_cols?: string) => builder,
        eq: (col: string, val: unknown) => {
          filters.push({ col, op: 'eq', val });
          return builder;
        },
        is: (col: string, val: unknown) => {
          filters.push({ col, op: 'is', val });
          return builder;
        },
        not: (col: string, op: string, val: unknown) => {
          if (op === 'is' && val === null) {
            filters.push({ col, op: 'not_null', val: null });
          }
          return builder;
        },
        or: (_clause: string) => builder,
        order: (_col: string, _opts?: { ascending?: boolean }) => builder,
        maybeSingle: async () => {
          const filtered = dataStore.filter((item) => matchesFilters(item, filters));
          return { data: filtered[0] ?? null, error: null };
        },
        single: async () => {
          const filtered = dataStore.filter((item) => matchesFilters(item, filters));
          return { data: filtered[0] ?? null, error: filtered.length ? null : { message: 'Not found' } };
        },
        then: (resolve: (val: { data: Array<Record<string, unknown>>; error: null }) => void) => {
          const filtered = dataStore.filter((item) => matchesFilters(item, filters));
          resolve({ data: filtered, error: null });
        },
      };
      return builder;
    },
  };

  // cast mock client to SupabaseClient interface for testing boundary
  return client as unknown as SupabaseClient;
}

test('1. Customer browse filters archived products and variants from sellable listing', async () => {
  const mockClient = createMockSupabase({
    products: [
      { id: 'card', slug: 'greeting-card', name: 'Thiệp', status: 'active', active: true, current_commercial_config_version_id: 'v-card' },
      { id: 'wrapping', slug: 'wrapping-paper', name: 'Giấy gói', status: 'archived', active: false, current_commercial_config_version_id: 'v-wrap' },
    ],
    variants: [
      { id: 'horizontal', product_id: 'card', name: 'Ngang', status: 'active', active: true, definition_key: 'card:horizontal' },
      { id: 'vertical', product_id: 'card', name: 'Đứng', status: 'archived', active: false, definition_key: 'card:vertical' },
      { id: 'a1', product_id: 'wrapping', name: 'A1', status: 'archived', active: false, definition_key: 'wrapping:a1' },
    ],
    versions: [
      { id: 'v-card', product_id: 'card', version_number: 1 },
      { id: 'v-wrap', product_id: 'wrapping', version_number: 1 },
    ],
    rules: [
      { id: 'r-card-h', version_id: 'v-card', variant_id: 'horizontal' },
      { id: 'r-card-v', version_id: 'v-card', variant_id: 'vertical' },
    ],
    tiers: [
      { id: 't-card-h', rule_id: 'r-card-h' },
      { id: 't-card-v', rule_id: 'r-card-v' },
    ],
  });

  const repo = new CatalogRepository(mockClient);
  const sellable = await repo.browseSellableProducts();

  // Wrapping is archived -> not in browse
  assert.equal(sellable.some((p) => p.id === 'wrapping'), false);

  // Card is active -> returned
  const card = sellable.find((p) => p.id === 'card');
  assert.ok(card);
  assert.ok(card.variants);

  // Vertical variant is archived -> excluded from variants list
  assert.equal(card.variants.some((v) => v.id === 'vertical'), false);
  // Horizontal is active sellable -> included
  assert.equal(card.variants.some((v) => v.id === 'horizontal'), true);
});

test('2. getPublishedProductBySlug returns null for archived product, preserving canonical slug for active', async () => {
  const mockClient = createMockSupabase({
    products: [
      { id: 'card', slug: 'greeting-card', name: 'Thiệp', status: 'active', active: true, current_commercial_config_version_id: 'v-card' },
      { id: 'wrapping', slug: 'wrapping-paper', name: 'Giấy gói', status: 'archived', active: false, current_commercial_config_version_id: 'v-wrap' },
    ],
    variants: [
      { id: 'horizontal', product_id: 'card', name: 'Ngang', status: 'active', active: true, definition_key: 'card:horizontal' },
    ],
    versions: [
      { id: 'v-card', product_id: 'card', version_number: 1 },
    ],
    rules: [
      { id: 'r-card-h', version_id: 'v-card', variant_id: 'horizontal' },
    ],
    tiers: [
      { id: 't-card-h', rule_id: 'r-card-h' },
    ],
  });

  const repo = new CatalogRepository(mockClient);

  // Active product resolves
  const activeProduct = await getPublishedProductBySlug('card', repo);
  assert.ok(activeProduct);
  assert.equal(activeProduct.id, 'card');
  assert.equal(getCanonicalSlug('card'), 'card');
  assert.equal(getCanonicalSlug('wrapping'), 'wrapping-paper');

  // Alternate slug also resolves for active product
  const byAlternateSlug = await getPublishedProductBySlug('greeting-card', repo);
  assert.ok(byAlternateSlug);
  assert.equal(byAlternateSlug.id, 'card');

  // Archived product returns null
  const archivedProduct = await getPublishedProductBySlug('wrapping-paper', repo);
  assert.equal(archivedProduct, null);
});

test('3. Template availability returns PRODUCT_UNAVAILABLE when targeted product is archived', async () => {
  const mockClient = createMockSupabase({
    products: [
      { id: 'card', status: 'archived', active: false },
    ],
    variants: [
      { id: 'horizontal', product_id: 'card', status: 'active', active: true, definition_key: 'card:horizontal' },
    ],
    templates: [
      {
        id: 'tmpl-archived-prod',
        name: 'Mẫu thiệp lưu trữ',
        status: 'published',
        product_id: 'card',
        variant_id: 'horizontal',
        current_published_version_id: 'ver-1',
      },
    ],
    versions: [
      { id: 'ver-1', template_id: 'tmpl-archived-prod', version: 1 },
    ],
  });

  const repo = new TemplateRepository(mockClient);
  const availability = await repo.getTemplateAvailability('tmpl-archived-prod');

  assert.equal(availability.available, false);
  const prodBlocker = availability.blockers.find((b) => b.code === 'PRODUCT_UNAVAILABLE');
  assert.ok(prodBlocker, 'Must have PRODUCT_UNAVAILABLE blocker');
});

test('4. Template availability returns VARIANT_UNAVAILABLE when targeted variant is archived', async () => {
  const mockClient = createMockSupabase({
    products: [
      { id: 'card', status: 'active', active: true },
    ],
    variants: [
      { id: 'vertical', product_id: 'card', status: 'archived', active: false, definition_key: 'card:vertical' },
    ],
    templates: [
      {
        id: 'tmpl-archived-variant',
        name: 'Mẫu thiệp đứng',
        status: 'published',
        product_id: 'card',
        variant_id: 'vertical',
        current_published_version_id: 'ver-2',
      },
    ],
    versions: [
      { id: 'ver-2', template_id: 'tmpl-archived-variant', version: 1 },
    ],
  });

  const repo = new TemplateRepository(mockClient);
  const availability = await repo.getTemplateAvailability('tmpl-archived-variant');

  assert.equal(availability.available, false);
  const varBlocker = availability.blockers.find((b) => b.code === 'VARIANT_UNAVAILABLE');
  assert.ok(varBlocker, 'Must have VARIANT_UNAVAILABLE blocker');
});

test('5. Template availability returns VARIANT_UNAVAILABLE when variant code definition is missing', async () => {
  const mockClient = createMockSupabase({
    products: [
      { id: 'card', status: 'active', active: true },
    ],
    variants: [
      { id: 'unknown-shape', product_id: 'card', status: 'active', active: true, definition_key: 'card:nonexistent' },
    ],
    templates: [
      {
        id: 'tmpl-missing-def',
        name: 'Mẫu định nghĩa lỗi',
        status: 'published',
        product_id: 'card',
        variant_id: 'unknown-shape',
        current_published_version_id: 'ver-3',
      },
    ],
    versions: [
      { id: 'ver-3', template_id: 'tmpl-missing-def', version: 1 },
    ],
  });

  const repo = new TemplateRepository(mockClient);
  const availability = await repo.getTemplateAvailability('tmpl-missing-def');

  assert.equal(availability.available, false);
  const varBlocker = availability.blockers.find((b) => b.code === 'VARIANT_UNAVAILABLE');
  assert.ok(varBlocker, 'Must have VARIANT_UNAVAILABLE blocker for missing code definition');
});

test('6. browseAvailableTemplates excludes templates targeting archived product or variant', async () => {
  const mockClient = createMockSupabase({
    products: [
      { id: 'card', status: 'active', active: true },
      { id: 'wrapping', status: 'archived', active: false },
    ],
    variants: [
      { id: 'horizontal', product_id: 'card', status: 'active', active: true, definition_key: 'card:horizontal' },
      { id: 'vertical', product_id: 'card', status: 'archived', active: false, definition_key: 'card:vertical' },
      { id: 'a1', product_id: 'wrapping', status: 'archived', active: false, definition_key: 'wrapping:a1' },
    ],
    templates: [
      {
        id: 'tmpl-active',
        name: 'Mẫu thiệp ngang active',
        status: 'published',
        product_id: 'card',
        variant_id: 'horizontal',
        current_published_version_id: 'ver-10',
      },
      {
        id: 'tmpl-archived-v',
        name: 'Mẫu thiệp đứng archived',
        status: 'published',
        product_id: 'card',
        variant_id: 'vertical',
        current_published_version_id: 'ver-20',
      },
      {
        id: 'tmpl-archived-p',
        name: 'Mẫu giấy gói archived',
        status: 'published',
        product_id: 'wrapping',
        variant_id: 'a1',
        current_published_version_id: 'ver-30',
      },
    ],
    versions: [
      { id: 'ver-10', template_id: 'tmpl-active', version: 1 },
      { id: 'ver-20', template_id: 'tmpl-archived-v', version: 1 },
      { id: 'ver-30', template_id: 'tmpl-archived-p', version: 1 },
    ],
  });

  const repo = new TemplateRepository(mockClient);
  const result = await repo.browseAvailableTemplates();

  // Only tmpl-active should be present
  assert.equal(result.items.some((item) => item.id === 'tmpl-active'), true);
  assert.equal(result.items.some((item) => item.id === 'tmpl-archived-v'), false);
  assert.equal(result.items.some((item) => item.id === 'tmpl-archived-p'), false);
});

test('7. cloneTemplateIntoProject rejects new clone/use when Product or Variant is unavailable', async () => {
  const mockClient = createMockSupabase({
    products: [
      { id: 'card', status: 'active', active: true },
    ],
    variants: [
      { id: 'vertical', product_id: 'card', status: 'archived', active: false, definition_key: 'card:vertical' },
    ],
    templates: [
      {
        id: 'tmpl-vert',
        name: 'Mẫu thiệp đứng',
        status: 'published',
        product_id: 'card',
        variant_id: 'vertical',
        current_published_version_id: 'ver-vert',
      },
    ],
    versions: [
      {
        id: 'ver-vert',
        template_id: 'tmpl-vert',
        version: 1,
        design_document: { version: 1, surfaces: {} },
        target_snapshot: { productId: 'card', variantId: 'vertical' },
      },
    ],
  });

  const repo = new TemplateRepository(mockClient);
  const input: UseTemplateInput = {
    templateId: 'tmpl-vert',
    expectedVersionId: 'ver-vert',
    requestId: 'req-new-clone',
    target: { productId: 'card', variantId: 'vertical', mode: null, shape: null },
  };

  await assert.rejects(
    () => cloneTemplateIntoProject(null, input, { repo }),
    (err: unknown) => {
      if (err && typeof err === 'object' && 'code' in err && 'status' in err) {
        assert.equal(err.code, 'TEMPLATE_UNAVAILABLE');
        assert.equal(err.status, 409);
        if ('details' in err && err.details && typeof err.details === 'object' && 'blockers' in err.details) {
          const blockers = err.details.blockers;
          if (Array.isArray(blockers)) {
            assert.ok(blockers.some((b) => typeof b === 'object' && b && 'code' in b && b.code === 'VARIANT_UNAVAILABLE'));
          }
        }
        return true;
      }
      return false;
    },
  );
});

test('8. Historical project resolution resolves archived product/variant while validating code registry key', async () => {
  const mockClient = createMockSupabase({
    products: [
      { id: 'card', status: 'archived', active: false },
    ],
    variants: [
      { id: 'vertical', product_id: 'card', status: 'archived', active: false, definition_key: 'card:vertical' },
    ],
  });

  const projectRepo = new ProjectRepository(mockClient);

  // Even though product and variant are archived in DB, historical project loading succeeds:
  const result = await projectRepo.resolveHistoricalProductVariant('card', 'vertical');
  assert.equal(result.ok, true);
  assert.equal(result.productId, 'card');
  assert.equal(result.variantId, 'vertical');
  assert.ok(result.definition, 'Definition must be resolved from code registry');
  assert.equal(result.definition?.definitionKey, 'card:vertical');

  // But invalid code registry key fails:
  const invalidResult = await projectRepo.resolveHistoricalProductVariant('card', 'nonexistent-variant');
  assert.equal(invalidResult.ok, false);
  assert.equal(invalidResult.code, 'MISSING_CODE_DEFINITION');
});

test('9. Existing Order for archived Product/Variant continues artifact retrieval and production completion', async () => {
  const mockClient = createMockSupabase({
    products: [
      { id: 'card', status: 'archived', active: false },
    ],
    variants: [
      { id: 'horizontal', product_id: 'card', status: 'archived', active: false, definition_key: 'card:horizontal' },
    ],
    orders: [
      {
        id: 'ord-hist-1',
        status: 'unprocessed',
        fulfillment_status: 'unprocessed',
        snapshot: {
          product: 'card',
          variant: 'horizontal',
          design: { text: 'Happy Birthday' },
        },
      },
    ],
  });

  // Start production succeeds on existing historical order
  const startRes = await startProductionInternal(
    { orderId: 'ord-hist-1', requestId: 'req-start-hist' },
    mockClient,
  );
  assert.equal(startRes.ok, true);
  if (startRes.ok) {
    assert.equal(startRes.value.fulfillmentStatus, 'in_production');
  }

  // Complete production succeeds on existing historical order
  const completeRes = await completeProductionInternal(
    { orderId: 'ord-hist-1', requestId: 'req-complete-hist' },
    mockClient,
  );
  assert.equal(completeRes.ok, true);
  if (completeRes.ok) {
    assert.equal(completeRes.value.fulfillmentStatus, 'completed');
  }
});

test('10. Exact State 43 geometry keys and targets remain intact', () => {
  const cardH = createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null });
  assert.equal(cardH.geometryKey, 'card:horizontal:mode:none:shape:none:surfaces:front-148x105_inside-296x105_back-148x105');
  assert.equal(cardH.surfaces.length, 3);

  const cardV = createTemplateTarget({ productId: 'card', variantId: 'vertical', mode: null, shape: null });
  assert.equal(cardV.geometryKey, 'card:vertical:mode:none:shape:none:surfaces:front-105x148_inside-210x148_back-105x148');
  assert.equal(cardV.surfaces.length, 3);

  const wrapA1 = createTemplateTarget({ productId: 'wrapping', variantId: 'a1', mode: 'pattern', shape: null });
  assert.equal(wrapA1.geometryKey, 'wrapping:a1:mode:pattern:shape:none:surfaces:sheet-594x841');

  const stickerCircle = createTemplateTarget({ productId: 'sticker', variantId: 'fixed-shape', mode: null, shape: 'circle' });
  assert.equal(stickerCircle.geometryKey, 'sticker:fixed-shape:mode:none:shape:circle:surfaces:front-50x50');

  const stickerDieCut = createTemplateTarget({ productId: 'sticker', variantId: 'die-cut', mode: null, shape: null });
  assert.equal(stickerDieCut.geometryKey, 'sticker:die-cut:mode:none:shape:none:surfaces:front-50x50');

  const notebook = createTemplateTarget({ productId: 'notebook', variantId: 'standard', mode: null, shape: null });
  assert.equal(notebook.geometryKey, 'notebook:standard:mode:none:shape:none:surfaces:front-148x210');
});
