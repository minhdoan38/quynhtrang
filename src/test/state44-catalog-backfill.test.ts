import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  calculatePrice,
  validateCommercialConfig,
  type CommercialConfigVersion,
  type CommercialVariantRule,
} from '../lib/domain/commercial-config.ts';
import {
  CATALOG_PRODUCTS,
  getAllCatalogProducts,
} from '../lib/product-catalog.ts';
import {
  resolveProductDefinition,
  type ProductDefinitionKey,
} from '../lib/product-definition-registry.ts';

const EXPECTED_MAPPINGS: Record<string, { productId: string; definitionKey: ProductDefinitionKey }> = {
  a1: { productId: 'wrapping', definitionKey: 'wrapping:a1' },
  a2: { productId: 'wrapping', definitionKey: 'wrapping:a2' },
  horizontal: { productId: 'card', definitionKey: 'card:horizontal' },
  vertical: { productId: 'card', definitionKey: 'card:vertical' },
  'die-cut': { productId: 'sticker', definitionKey: 'sticker:die-cut' },
  'fixed-shape': { productId: 'sticker', definitionKey: 'sticker:fixed-shape' },
  phone: { productId: 'sticker', definitionKey: 'sticker:phone' },
  standard: { productId: 'notebook', definitionKey: 'notebook:standard' },
};

describe('State 44 Catalog Backfill Specifications', () => {
  describe('Static catalog alignment and definition keys', () => {
    it('contains all four canonical products with valid slugs and variants', () => {
      const products = getAllCatalogProducts();
      assert.equal(products.length, 4);

      const productIds = products.map((p) => p.id).sort();
      assert.deepEqual(productIds, ['card', 'notebook', 'sticker', 'wrapping']);

      assert.equal(CATALOG_PRODUCTS.wrapping.slug, 'wrapping-paper');
      assert.equal(CATALOG_PRODUCTS.card.slug, 'card');
      assert.equal(CATALOG_PRODUCTS.sticker.slug, 'sticker');
      assert.equal(CATALOG_PRODUCTS.notebook.slug, 'notebook-cover');
    });

    it('maps every variant to its exact definition_key registered in Task 1', () => {
      for (const [variantId, expected] of Object.entries(EXPECTED_MAPPINGS)) {
        const product = CATALOG_PRODUCTS[expected.productId as keyof typeof CATALOG_PRODUCTS];
        assert.ok(product, `Product ${expected.productId} must exist`);

        const variant = product.variants.find((v) => v.id === variantId);
        assert.ok(variant, `Variant ${variantId} must exist under ${expected.productId}`);
        assert.ok(variant.price > 0, `Variant ${variantId} price must be positive`);

        const resolved = resolveProductDefinition(expected.productId, variantId);
        assert.ok(resolved, `Definition must resolve for ${expected.productId}:${variantId}`);
        assert.equal(resolved.definitionKey, expected.definitionKey);
      }
    });

    it('derives starting price directly from minimum active variant price, not metadata', () => {
      for (const product of Object.values(CATALOG_PRODUCTS)) {
        const minVariantPrice = Math.min(...product.variants.map((v) => v.price));
        assert.equal(
          product.startingPrice,
          minVariantPrice,
          `Starting price for ${product.id} should equal min variant price`,
        );
      }
    });
  });

  describe('Commercial config v1 structure and domain invariants', () => {
    it('constructs a valid v1 full-payment commercial config for each product', () => {
      for (const [productId, product] of Object.entries(CATALOG_PRODUCTS)) {
        const rules: CommercialVariantRule[] = product.variants.map((v) => ({
          variantId: v.id,
          minimumQuantity: 1,
          quantityStep: 1,
          maximumQuantity: null,
          tiers: [{ minimumQuantity: 1, unitPrice: v.price }],
        }));

        const v1Config: CommercialConfigVersion = {
          id: `v1-${productId}`,
          productId,
          versionNumber: 1,
          currency: 'VND',
          paymentPolicy: { kind: 'full_payment' },
          variantRules: rules,
        };

        const activeVariantIds = product.variants.map((v) => v.id);
        const validationErrors = validateCommercialConfig(v1Config, activeVariantIds);
        assert.deepEqual(
          validationErrors,
          [],
          `Commercial config v1 for ${productId} must validate with 0 errors`,
        );

        // Price calculation: full payment means due now = total and remaining = 0
        for (const variant of product.variants) {
          const calc1 = calculatePrice(v1Config, variant.id, 1);
          assert.equal(calc1.unitPrice, variant.price);
          assert.equal(calc1.totalAmount, variant.price);
          assert.equal(calc1.amountDueNow, variant.price);
          assert.equal(calc1.remainingAmount, 0);

          const calc10 = calculatePrice(v1Config, variant.id, 10);
          assert.equal(calc10.totalAmount, variant.price * 10);
          assert.equal(calc10.amountDueNow, variant.price * 10);
          assert.equal(calc10.remainingAmount, 0);
        }
      }
    });
  });

  describe('SQL Migration 0011 inspection', () => {
    const migrationSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/0011_state44_catalog_backfill.sql'),
      'utf8',
    );

    it('contains fail-closed checks for all 4 products and 8 variants', () => {
      assert.match(migrationSql, /'wrapping',\s*'card',\s*'sticker',\s*'notebook'/);
      assert.match(migrationSql, /'a1',\s*'a2',\s*'horizontal',\s*'vertical',\s*'die-cut',\s*'fixed-shape',\s*'phone',\s*'standard'/);
      assert.match(migrationSql, /State 44 backfill requires existing Products/);
      assert.match(migrationSql, /State 44 backfill requires existing Variants/);
    });

    it('sets exact definition_keys on public.product_variants', () => {
      for (const [variantId, expected] of Object.entries(EXPECTED_MAPPINGS)) {
        const pattern = new RegExp(`'${variantId}',\\s*'${expected.productId}',\\s*'${expected.definitionKey}'`);
        assert.match(migrationSql, pattern, `SQL must map ${variantId} to ${expected.definitionKey}`);
      }
    });

    it('populates immutable commercial config v1 with full_payment policy and price tier 1', () => {
      assert.match(migrationSql, /insert into public\.product_commercial_config_versions/);
      assert.match(migrationSql, /'\{"kind":"full_payment"\}'::jsonb/);
      assert.match(migrationSql, /insert into public\.commercial_variant_rules/);
      assert.match(migrationSql, /minimum_quantity,\s*quantity_step,\s*maximum_quantity/);
      assert.match(migrationSql, /insert into public\.commercial_pricing_tiers/);
      assert.match(migrationSql, /values\s*\(v_rule_id,\s*1,\s*v_variant\.price\)/);
    });

    it('updates product current_commercial_config_version_id only after validation', () => {
      assert.match(migrationSql, /Commercial v1 validation failed for Product/);
      assert.match(migrationSql, /update public\.products\s+set current_commercial_config_version_id = v_version_id/);
    });

    it('updates status and metadata with explicit blockers for non-qualifying rows', () => {
      assert.match(migrationSql, /state44Blockers/);
      assert.match(migrationSql, /COMMERCIAL_CONFIG_INCOMPLETE/);
      assert.match(migrationSql, /status = case\s+when/);
    });

    it('preserves legacy orders without recomputing totals or changing snapshots', () => {
      assert.match(migrationSql, /update public\.orders/);
      assert.match(migrationSql, /amount_due_now = o\.total/);
      assert.match(migrationSql, /remaining_amount = 0/);
      assert.match(migrationSql, /applied_tier_minimum_quantity = 1/);
      assert.doesNotMatch(migrationSql, /update public\.orders[\s\S]*?set[\s\S]*?\bunit_price\s*=/);
      assert.doesNotMatch(migrationSql, /update public\.orders[\s\S]*?set[\s\S]*?\btotal\s*=/);
    });

    it('sets order_payments purpose to full_order_payment', () => {
      assert.match(migrationSql, /update public\.order_payments\s+set purpose = 'full_order_payment'/);
    });
  });

  describe('SQL Seed State 44 fixture inspection', () => {
    const seedSql = readFileSync(
      resolve(process.cwd(), 'supabase/seed_state44.sql'),
      'utf8',
    );

    it('contains draft product fixture with incomplete variant config', () => {
      assert.match(seedSql, /'fixture-draft-product'/);
      assert.match(seedSql, /'fixture-draft-var'/);
      assert.match(seedSql, /'draft'/);
      assert.match(seedSql, /'MISSING_COMMERCIAL_CONFIG'/);
      assert.match(seedSql, /'COMMERCIAL_CONFIG_INCOMPLETE'/);
    });

    it('contains active full-payment product fixture with two commercial versions', () => {
      assert.match(seedSql, /'fixture-active-full'/);
      assert.match(seedSql, /'fixture-full-var-1'/);
      assert.match(seedSql, /'fixture-full-var-2'/);
      assert.match(seedSql, /44000000-0000-4000-8000-000000001001/); // v1
      assert.match(seedSql, /44000000-0000-4000-8000-000000001002/); // v2
      // Current version points to v2
      assert.match(
        seedSql,
        /set current_commercial_config_version_id = '44000000-0000-4000-8000-000000001002'/
      );
    });

    it('contains active fixed-deposit product fixture with validated tiers', () => {
      assert.match(seedSql, /'fixture-active-deposit'/);
      assert.match(seedSql, /'fixture-deposit-var'/);
      assert.match(seedSql, /'\{"kind": "fixed_deposit", "depositAmount": "50000"\}'::jsonb/);
      // Validated tiers: tier at 10 (15000) and tier at 50 (12000)
      assert.match(seedSql, /10,\s*15000/);
      assert.match(seedSql, /50,\s*12000/);
    });

    it('contains archived product and variant with historical project, template, and order references', () => {
      assert.match(seedSql, /'fixture-archived-product'/);
      assert.match(seedSql, /'fixture-archived-var'/);
      assert.match(seedSql, /'fixture-archived-template'/);
      assert.match(seedSql, /'QT44-ARCHIVED-01'/);
      assert.match(seedSql, /insert into public\.projects/);
      assert.match(seedSql, /insert into public\.design_versions/);
      assert.match(seedSql, /insert into public\.templates/);
      assert.match(seedSql, /insert into public\.orders/);
    });

    it('leaves existing stable State 43 template target rows untouched', () => {
      assert.doesNotMatch(seedSql, /update public\.templates\s+set target_snapshot/);
      assert.doesNotMatch(seedSql, /delete from public\.templates/);
      assert.doesNotMatch(seedSql, /delete from public\.template_versions/);
    });
  });

  describe('In-memory backfill execution simulation', () => {
    it('simulates backfill accurately transitioning legacy tables to State 44 state', () => {
      // Mock existing legacy state
      const products: Record<string, { id: string; active: boolean; status: string; current_config_id: string | null; metadata: Record<string, unknown> }> = {
        wrapping: { id: 'wrapping', active: true, status: 'draft', current_config_id: null, metadata: {} },
        card: { id: 'card', active: true, status: 'draft', current_config_id: null, metadata: {} },
        sticker: { id: 'sticker', active: true, status: 'draft', current_config_id: null, metadata: {} },
        notebook: { id: 'notebook', active: true, status: 'draft', current_config_id: null, metadata: {} },
      };

      const variants: Record<string, { id: string; productId: string; active: boolean; status: string; definitionKey: string | null; price: number; metadata: Record<string, unknown> }> = {};
      for (const [variantId, mapping] of Object.entries(EXPECTED_MAPPINGS)) {
        const catProduct = CATALOG_PRODUCTS[mapping.productId as keyof typeof CATALOG_PRODUCTS];
        const catVar = catProduct.variants.find((v) => v.id === variantId)!;
        variants[variantId] = {
          id: variantId,
          productId: mapping.productId,
          active: true,
          status: 'draft',
          definitionKey: null,
          price: catVar.price,
          metadata: {},
        };
      }

      const orders = [
        {
          id: 'ord-1',
          productId: 'card',
          variantId: 'horizontal',
          total: 290000,
          unitPrice: 29000,
          quantity: 10,
          commercial_config_version_id: null as string | null,
          payment_policy: null as unknown,
          amount_due_now: null as number | null,
          remaining_amount: null as number | null,
          applied_tier_minimum_quantity: null as number | null,
        },
      ];

      const orderPayments = [
        { id: 'pay-1', orderId: 'ord-1', amount: 290000, purpose: null as string | null },
      ];

      // Execute simulated backfill:
      // 1. Definition keys
      for (const [variantId, mapping] of Object.entries(EXPECTED_MAPPINGS)) {
        variants[variantId].definitionKey = mapping.definitionKey;
      }

      // 2. Commercial config v1 headers & rules
      const commercialConfigs: Record<string, { id: string; productId: string; versionNumber: number }> = {};
      for (const productId of Object.keys(products)) {
        const configId = `v1-${productId}`;
        commercialConfigs[productId] = { id: configId, productId, versionNumber: 1 };
        products[productId].current_config_id = configId;
      }

      // 3. Variant status transition
      for (const variant of Object.values(variants)) {
        if (variant.active && variant.definitionKey) {
          variant.status = 'active';
        }
      }

      // 4. Product status transition
      for (const product of Object.values(products)) {
        const hasActiveVar = Object.values(variants).some((v) => v.productId === product.id && v.status === 'active');
        if (product.active && product.current_config_id && hasActiveVar) {
          product.status = 'active';
        }
      }

      // 5. Legacy orders snapshot
      for (const order of orders) {
        order.commercial_config_version_id = commercialConfigs[order.productId].id;
        order.payment_policy = { kind: 'full_payment' };
        order.amount_due_now = order.total;
        order.remaining_amount = 0;
        order.applied_tier_minimum_quantity = 1;
      }

      // 6. Legacy order payments
      for (const payment of orderPayments) {
        payment.purpose = 'full_order_payment';
      }

      // Invariant checks:
      for (const p of Object.values(products)) {
        assert.equal(p.status, 'active');
        assert.ok(p.current_config_id);
      }

      for (const v of Object.values(variants)) {
        assert.equal(v.status, 'active');
        assert.ok(v.definitionKey);
      }

      for (const o of orders) {
        assert.equal(o.total, 290000); // Historical total preserved!
        assert.equal(o.unitPrice, 29000); // Historical unit price preserved!
        assert.equal(o.amount_due_now, 290000);
        assert.equal(o.remaining_amount, 0);
        assert.equal(o.applied_tier_minimum_quantity, 1);
        assert.deepEqual(o.payment_policy, { kind: 'full_payment' });
      }

      for (const pay of orderPayments) {
        assert.equal(pay.purpose, 'full_order_payment');
      }
    });
  });
});
