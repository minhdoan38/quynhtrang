import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { StaffIdentity } from '../lib/domain/order.ts';
import {
  activateProduct,
  archiveProduct,
  activateVariant,
  archiveVariant,
  enableSupportedVariant,
  updateProductMetadata,
} from '../lib/services/admin-product-catalog.ts';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';
import { CatalogRepository } from '../lib/repositories/catalog-repository.ts';
import {
  resolveProductDefinition,
  resolveProductDefinitionKey,
  listProductDefinitionCapabilities,
} from '../lib/product-definition-registry.ts';
import {
  prepareOrderFromGuestCheckout,
  OrderPreparationError,
} from '../lib/services/prepare-order-from-guest-checkout.ts';
import { createPriceQuote } from '../lib/services/price-quote-service.ts';
import { createInitialState } from '../lib/product-state.ts';
import type { CustomerInfo, PendingOrder } from '../lib/order-types.ts';
import type { PaymentRecord } from '../lib/repositories/payment-repository.ts';

function createAdmin(userId = '44000000-0000-0000-0000-0000000000a1'): StaffIdentity {
  return {
    userId,
    role: 'admin',
    email: 'admin@quynhtrang.test',
  };
}

function createMockSupabase(data: {
  products?: Array<Record<string, unknown>>;
  variants?: Array<Record<string, unknown>>;
  versions?: Array<Record<string, unknown>>;
  rules?: Array<Record<string, unknown>>;
  tiers?: Array<Record<string, unknown>>;
}): SupabaseClient {
  const products = data.products ?? [];
  const variants = data.variants ?? [];
  const versions = data.versions ?? [];
  const rules = data.rules ?? [];
  const tiers = data.tiers ?? [];

  return {
    from: (table: string) => {
      let store: Array<Record<string, unknown>> = [];
      if (table === 'products') store = products;
      else if (table === 'product_variants') store = variants;
      else if (table === 'product_commercial_config_versions') store = versions;
      else if (table === 'commercial_variant_rules') store = rules;
      else if (table === 'commercial_pricing_tiers') store = tiers;

      const filters: Array<{ col: string; val: unknown }> = [];

      const query: Record<string, unknown> = {
        select: () => query,
        order: () => query,
        eq: (col: string, val: unknown) => {
          filters.push({ col, val });
          return query;
        },
        maybeSingle: async () => {
          const matched = store.filter((item) =>
            filters.every((f) => item[f.col] === f.val),
          );
          return { data: matched[0] ?? null, error: null };
        },
        then: (resolve: (val: unknown) => void) => {
          const matched = store.filter((item) =>
            filters.every((f) => item[f.col] === f.val),
          );
          resolve({ data: matched, error: null });
        },
      };

      return query;
    },
  } as unknown as SupabaseClient;
}

describe('State 44 Lifecycle Invariants', () => {
  describe('Draft hidden, active visible, archived hidden; historical resolution intact', () => {
    it('customer browseSellableProducts excludes draft and archived products', async () => {
      const mockClient = createMockSupabase({
        products: [
          { id: 'card', slug: 'card', name: 'Thiệp Active', status: 'active', active: true, current_commercial_config_version_id: 'ver-card' },
          { id: 'wrapping', slug: 'wrapping', name: 'Giấy Draft', status: 'draft', active: false, current_commercial_config_version_id: 'ver-wrap' },
          { id: 'sticker', slug: 'sticker', name: 'Sticker Archived', status: 'archived', active: false, current_commercial_config_version_id: 'ver-stk' },
        ],
        variants: [
          { id: 'horizontal', product_id: 'card', name: 'Thiệp Ngang', status: 'active', active: true, definition_key: 'card:horizontal' },
          { id: 'a1', product_id: 'wrapping', name: 'Giấy A1', status: 'draft', active: false, definition_key: 'wrapping:a1' },
          { id: 'die-cut', product_id: 'sticker', name: 'Sticker Die-cut', status: 'archived', active: false, definition_key: 'sticker:die-cut' },
        ],
        versions: [
          { id: 'ver-card', product_id: 'card', version_number: 1 },
          { id: 'ver-wrap', product_id: 'wrapping', version_number: 1 },
          { id: 'ver-stk', product_id: 'sticker', version_number: 1 },
        ],
        rules: [
          { id: 'rule-card', version_id: 'ver-card', variant_id: 'horizontal' },
        ],
        tiers: [
          { id: 'tier-card', rule_id: 'rule-card', minimum_quantity: 1, unit_price: 29000 },
        ],
      });

      const repo = new CatalogRepository(mockClient);
      const sellable = await repo.browseSellableProducts();

      assert.equal(sellable.length, 1);
      assert.equal(sellable[0].id, 'card');
      assert.equal(sellable[0].name, 'Thiệp Active');
      assert.equal(sellable.some((p) => p.id === 'wrapping'), false);
      assert.equal(sellable.some((p) => p.id === 'sticker'), false);
    });

    it('customer browseSellableProducts excludes archived variants on active products', async () => {
      const mockClient = createMockSupabase({
        products: [
          { id: 'card', slug: 'card', name: 'Thiệp', status: 'active', active: true, current_commercial_config_version_id: 'ver-card' },
        ],
        variants: [
          { id: 'horizontal', product_id: 'card', name: 'Thiệp Ngang Active', status: 'active', active: true, definition_key: 'card:horizontal' },
          { id: 'vertical', product_id: 'card', name: 'Thiệp Đứng Archived', status: 'archived', active: false, definition_key: 'card:vertical' },
        ],
        versions: [
          { id: 'ver-card', product_id: 'card', version_number: 1 },
        ],
        rules: [
          { id: 'rule-h', version_id: 'ver-card', variant_id: 'horizontal' },
          { id: 'rule-v', version_id: 'ver-card', variant_id: 'vertical' },
        ],
        tiers: [
          { id: 'tier-h', rule_id: 'rule-h', minimum_quantity: 1, unit_price: 29000 },
          { id: 'tier-v', rule_id: 'rule-v', minimum_quantity: 1, unit_price: 29000 },
        ],
      });

      const repo = new CatalogRepository(mockClient);
      const sellable = await repo.browseSellableProducts();

      assert.equal(sellable.length, 1);
      const variants = sellable[0].variants;
      assert.ok(variants);
      assert.equal(variants.some((v) => v.id === 'horizontal'), true);
      assert.equal(variants.some((v) => v.id === 'vertical'), false);
    });

    it('historical resolution resolveProductById and resolveVariantById preserves archived products and variants', async () => {
      const mockClient = createMockSupabase({
        products: [
          { id: 'sticker', slug: 'sticker', name: 'Sticker Cũ', status: 'archived', active: false, revision: 3 },
        ],
        variants: [
          { id: 'phone', product_id: 'sticker', name: 'Sticker Điện Thoại', status: 'archived', active: false, definition_key: 'sticker:phone', revision: 2 },
        ],
      });

      const repo = new CatalogRepository(mockClient);
      const historicalProduct = await repo.resolveProductById('sticker');
      assert.ok(historicalProduct);
      assert.equal(historicalProduct.id, 'sticker');
      assert.equal(historicalProduct.status, 'archived');
      assert.equal(historicalProduct.revision, 3);
      assert.equal(historicalProduct.variants.length, 1);
      assert.equal(historicalProduct.variants[0].id, 'phone');
      assert.equal(historicalProduct.variants[0].status, 'archived');

      const historicalVariant = await repo.resolveVariantById('phone');
      assert.ok(historicalVariant);
      assert.equal(historicalVariant.id, 'phone');
      assert.equal(historicalVariant.status, 'archived');
      assert.equal(historicalVariant.definitionKey, 'sticker:phone');
      assert.ok(historicalVariant.definition);
      assert.equal(historicalVariant.definition?.variantId, 'phone');
    });
  });

  describe('Active vs archived Variant selection and archived checkout rejection', () => {
    it('rejects price quote creation for archived variant with VARIANT_NOT_SELLABLE', async () => {
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'active',
        revision: 1,
        currentCommercialConfigVersionId: 'ver-1',
      });
      repo.seedVariant({
        id: 'vertical',
        productId: 'card',
        name: 'Thiệp Đứng',
        price: 29000,
        status: 'archived',
        definitionKey: 'card:vertical',
        revision: 1,
      });
      repo.seedCommercialVersion({
        id: 'ver-1',
        productId: 'card',
        versionNumber: 1,
        currency: 'VND',
        paymentPolicy: { kind: 'full_payment' },
        variantRules: [
          {
            variantId: 'vertical',
            minimumQuantity: 1,
            quantityStep: 1,
            maximumQuantity: 100,
            tiers: [{ minimumQuantity: 1, unitPrice: 29000 }],
          },
        ],
      });

      await assert.rejects(
        () =>
          createPriceQuote(
            {
              productId: 'card',
              variantId: 'vertical',
              quantity: 1,
              checkoutKey: 'key-archived-variant',
            },
            { repo },
          ),
        /VARIANT_NOT_SELLABLE/,
      );
    });

    it('rejects order preparation when product or variant is archived', async () => {
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'archived',
        revision: 1,
      });
      repo.seedVariant({
        id: 'horizontal',
        productId: 'card',
        name: 'Thiệp Ngang',
        price: 29000,
        status: 'active',
        definitionKey: 'card:horizontal',
        revision: 1,
      });

      const design = { ...createInitialState('card'), variantId: 'horizontal' };
      const customer: CustomerInfo = {
        fullName: 'Nguyễn Văn A',
        phone: '0901234567',
        shippingAddress: '123 Phố Huế',
      };

      const fakeDeps = {
        orderRepo: {
          getByIdempotencyKey: async () => null,
          createPendingOrder: async () => ({} as PendingOrder),
          createGuestAccess: async () => { },
          deleteById: async () => { },
        },
        assetRepo: { promoteAsset: async () => ({}) },
        projectRepo: {
          createProject: async () => ({ id: 'proj-1', productId: 'card', variantId: 'horizontal' }),
        },
        designVersionRepo: { createVersion: async () => ({}) },
        orderEventRepo: { append: async () => { } },
        paymentRepo: { create: async () => ({} as PaymentRecord) },
        catalogRepo: repo,
      };

      await assert.rejects(
        () =>
          prepareOrderFromGuestCheckout(
            {
              design,
              customer,
              idempotencyKey: 'idemp-archived-prod',
              designRevision: 'rev-1',
              preflightAcknowledged: true,
              preflightRevision: 'rev-1',
            },
            fakeDeps as never,
          ),
        (err: unknown) => {
          assert.ok(err instanceof OrderPreparationError);
          assert.equal(err.message, 'Sản phẩm đã ngừng kinh doanh.');
          assert.equal(err.status, 400);
          return true;
        },
      );

      // Now set product active but variant archived
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'active',
        revision: 2,
      });
      repo.seedVariant({
        id: 'horizontal',
        productId: 'card',
        name: 'Thiệp Ngang',
        price: 29000,
        status: 'archived',
        definitionKey: 'card:horizontal',
        revision: 2,
      });

      await assert.rejects(
        () =>
          prepareOrderFromGuestCheckout(
            {
              design,
              customer,
              idempotencyKey: 'idemp-archived-variant',
              designRevision: 'rev-1',
              preflightAcknowledged: true,
              preflightRevision: 'rev-1',
            },
            fakeDeps as never,
          ),
        (err: unknown) => {
          assert.ok(err instanceof OrderPreparationError);
          assert.equal(err.message, 'Biến thể sản phẩm đã ngừng kinh doanh.');
          assert.equal(err.status, 400);
          return true;
        },
      );
    });
  });

  describe('Unknown definition and arbitrary geometry rejection', () => {
    it('rejects enabling variant with arbitrary or unknown definitionKey', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'draft',
        revision: 1,
      });

      // Unknown definition key
      const resultUnknown = await enableSupportedVariant('card', 'card:triangle-3d', 1, { staff: admin, repo });
      assert.equal(resultUnknown.ok, false);
      assert.equal(resultUnknown.code, 'UNKNOWN_DEFINITION_KEY');

      // Mismatched product ID (wrapping definition for card product)
      const resultMismatched = await enableSupportedVariant('card', 'wrapping:a1', 1, { staff: admin, repo });
      assert.equal(resultMismatched.ok, false);
      assert.equal(resultMismatched.code, 'UNKNOWN_DEFINITION_KEY');

      // Registry lookup returns null for arbitrary key
      assert.equal(resolveProductDefinition('card', 'triangle-3d'), null);
      assert.equal(resolveProductDefinitionKey('card:triangle-3d'), null);
    });

    it('admin can activate and archive product through lifecycle service', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'draft',
        revision: 1,
        currentCommercialConfigVersionId: 'ver-1',
      });
      repo.seedVariant({
        id: 'horizontal',
        productId: 'card',
        name: 'Thiệp Ngang',
        price: 29000,
        status: 'active',
        definitionKey: 'card:horizontal',
        revision: 1,
      });

      const activeRes = await activateProduct('card', 1, { staff: admin, repo });
      assert.equal(activeRes.ok, true);
      assert.equal(activeRes.status, 'active');
      assert.equal(activeRes.revision, 2);

      const archiveRes = await archiveProduct('card', 2, { staff: admin, repo });
      assert.equal(archiveRes.ok, true);
      assert.equal(archiveRes.status, 'archived');
      assert.equal(archiveRes.revision, 3);
    });

    it('rejects variant activation when definition_key is missing or invalid', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'draft',
        revision: 1,
      });
      repo.seedVariant({
        id: 'custom-card',
        productId: 'card',
        name: 'Thiệp Tùy Biến Không Key',
        price: 30000,
        status: 'draft',
        definitionKey: null,
        revision: 1,
      });

      const resultMissing = await activateVariant('custom-card', 1, { staff: admin, repo });
      assert.equal(resultMissing.ok, false);
      assert.equal(resultMissing.code, 'MISSING_DEFINITION_KEY');

      // With forged definitionKey not in registry
      repo.seedVariant({
        id: 'forged-card',
        productId: 'card',
        name: 'Thiệp Giả Key',
        price: 30000,
        status: 'draft',
        definitionKey: 'card:unregistered-cut',
        revision: 1,
      });

      const resultForged = await activateVariant('forged-card', 1, { staff: admin, repo });
      assert.equal(resultForged.ok, false);
      assert.equal(resultForged.code, 'UNKNOWN_DEFINITION_KEY');
    });
  });

  describe('Structural identity immutability after sale', () => {
    it('prevents re-enabling an already configured variant', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'draft',
        revision: 1,
      });
      repo.seedVariant({
        id: 'horizontal',
        productId: 'card',
        name: 'Ngang',
        price: 29000,
        status: 'active',
        definitionKey: 'card:horizontal',
        revision: 1,
      });

      const result = await enableSupportedVariant('card', 'card:horizontal', 1, { staff: admin, repo });
      assert.equal(result.ok, false);
      assert.equal(result.code, 'ALREADY_CONFIGURED');
    });

    it('prevents archiving the last active variant of an active product', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'active',
        revision: 1,
        currentCommercialConfigVersionId: 'ver-1',
      });
      repo.seedVariant({
        id: 'horizontal',
        productId: 'card',
        name: 'Ngang',
        price: 29000,
        status: 'active',
        definitionKey: 'card:horizontal',
        revision: 1,
      });

      const result = await archiveVariant('horizontal', 1, { staff: admin, repo });
      assert.equal(result.ok, false);
      assert.equal(result.code, 'LAST_ACTIVE_VARIANT');
    });

    it('product revision increments monotonically on valid metadata update', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'draft',
        revision: 1,
      });

      const patchResult = await updateProductMetadata('card', 1, { name: 'Thiệp Chúc Mừng 2026' }, { staff: admin, repo });
      assert.equal(patchResult.ok, true);
      assert.equal(patchResult.revision, 2);

      const updated = repo.getProduct('card');
      assert.equal(updated?.name, 'Thiệp Chúc Mừng 2026');
      assert.equal(updated?.revision, 2);
    });
  });

  describe('Registry capabilities completeness', () => {
    it('covers all standard product and variant definitions with render and preview capabilities', () => {
      const allCapabilities = listProductDefinitionCapabilities();
      assert.equal(allCapabilities.length, 8);

      const keys = allCapabilities.map((c) => c.definitionKey);
      assert.deepEqual(keys.sort(), [
        'card:horizontal',
        'card:vertical',
        'notebook:standard',
        'sticker:die-cut',
        'sticker:fixed-shape',
        'sticker:phone',
        'wrapping:a1',
        'wrapping:a2',
      ]);

      for (const cap of allCapabilities) {
        assert.equal(cap.previewAvailable, true);
        assert.equal(cap.productionRendererAvailable, true);
        assert.ok(cap.templateTargetKeys.length > 0);
      }
    });
  });
});
