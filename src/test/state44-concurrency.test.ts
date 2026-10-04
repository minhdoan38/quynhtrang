import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { StaffIdentity } from '../lib/domain/order.ts';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';
import {
  createOrLoadCommercialDraft,
  saveCommercialDraft,
  publishProductCommercialConfig,
} from '../lib/services/commercial-config-service.ts';
import {
  updateProductMetadata,
  activateVariant,
  archiveVariant,
  activateProduct,
} from '../lib/services/admin-product-catalog.ts';
import { createPriceQuote } from '../lib/services/price-quote-service.ts';
import {
  prepareOrderFromGuestCheckout,
  OrderPreparationError,
} from '../lib/services/prepare-order-from-guest-checkout.ts';
import { createInitialState } from '../lib/product-state.ts';
import type { CustomerInfo, PendingOrder } from '../lib/order-types.ts';

function createAdmin(userId = '44000000-0000-0000-0000-0000000000a1'): StaffIdentity {
  return {
    userId,
    role: 'admin',
    email: 'admin@quynhtrang.test',
  };
}

describe('State 44 Concurrency and Optimistic Locking Invariants', () => {
  describe('Commercial draft publication concurrency', () => {
    it('concurrent publication attempts: first succeeds, second fails with conflict; no duplicate version numbers', async () => {
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
        name: 'Thiệp Ngang',
        price: 29000,
        status: 'active',
        definitionKey: 'card:horizontal',
        revision: 1,
      });

      const draft = await createOrLoadCommercialDraft('card', admin.userId, { staff: admin, repo });
      await saveCommercialDraft(
        {
          draftId: draft.id,
          expectedRevision: draft.revision,
          payload: {
            currency: 'VND',
            paymentPolicy: { kind: 'full_payment' },
            variantRules: [
              {
                variantId: 'horizontal',
                minimumQuantity: 1,
                quantityStep: 1,
                maximumQuantity: 100,
                tiers: [{ minimumQuantity: 1, unitPrice: 29000 }],
              },
            ],
          },
          requestId: 'req-draft-concurrency',
        },
        { staff: admin, repo },
      );

      // Both callers saw draft revision 2 and product revision 1
      const p1 = publishProductCommercialConfig(
        {
          productId: 'card',
          expectedDraftRevision: 2,
          expectedProductRevision: 1,
          requestId: 'req-worker-1',
        },
        { staff: admin, repo },
      );

      const p2 = publishProductCommercialConfig(
        {
          productId: 'card',
          expectedDraftRevision: 2,
          expectedProductRevision: 1,
          requestId: 'req-worker-2',
        },
        { staff: admin, repo },
      );

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Exactly one concurrent publication must succeed');
      assert.equal(rejected.length, 1, 'Concurrent publication must be rejected');

      // Verify repository state: exactly one published version exists
      const product = repo.getProduct('card');
      assert.ok(product);
      assert.ok(product.currentCommercialConfigVersionId);
      assert.equal(product.revision, 2);

      const published = repo.getCommercialVersion(product.currentCommercialConfigVersionId);
      assert.ok(published);
      assert.equal(published.versionNumber, 1);
    });

    it('rejects publication when expectedDraftRevision is stale', async () => {
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
        name: 'Thiệp Ngang',
        price: 29000,
        status: 'active',
        definitionKey: 'card:horizontal',
        revision: 1,
      });

      const draft = await createOrLoadCommercialDraft('card', admin.userId, { staff: admin, repo });
      // Draft starts at revision 1, saving advances to revision 2
      await saveCommercialDraft(
        {
          draftId: draft.id,
          expectedRevision: 1,
          payload: {
            currency: 'VND',
            paymentPolicy: { kind: 'full_payment' },
            variantRules: [
              {
                variantId: 'horizontal',
                minimumQuantity: 1,
                quantityStep: 1,
                maximumQuantity: 100,
                tiers: [{ minimumQuantity: 1, unitPrice: 29000 }],
              },
            ],
          },
          requestId: 'req-save-1',
        },
        { staff: admin, repo },
      );

      // Attempt to publish using stale draft revision 1 instead of 2
      await assert.rejects(
        () =>
          publishProductCommercialConfig(
            {
              productId: 'card',
              expectedDraftRevision: 1,
              expectedProductRevision: 1,
              requestId: 'req-pub-stale',
            },
            { staff: admin, repo },
          ),
        /REVISION_CONFLICT/,
      );
    });

    it('rejects publication when expectedProductRevision is stale', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);

      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'draft',
        revision: 2, // product revision already advanced to 2
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

      const draft = await createOrLoadCommercialDraft('card', admin.userId, { staff: admin, repo });
      await saveCommercialDraft(
        {
          draftId: draft.id,
          expectedRevision: 1,
          payload: {
            currency: 'VND',
            paymentPolicy: { kind: 'full_payment' },
            variantRules: [
              {
                variantId: 'horizontal',
                minimumQuantity: 1,
                quantityStep: 1,
                maximumQuantity: 100,
                tiers: [{ minimumQuantity: 1, unitPrice: 29000 }],
              },
            ],
          },
          requestId: 'req-save-p-stale',
        },
        { staff: admin, repo },
      );

      // Publish specifying expectedProductRevision 1 when product is at 2
      await assert.rejects(
        () =>
          publishProductCommercialConfig(
            {
              productId: 'card',
              expectedDraftRevision: 2,
              expectedProductRevision: 1,
              requestId: 'req-pub-product-stale',
            },
            { staff: admin, repo },
          ),
        /REVISION_CONFLICT/,
      );
    });
  });

  describe('Optimistic locking on catalog and variant mutations', () => {
    it('updateProductMetadata rejects stale expectedRevision', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'draft',
        revision: 2,
      });

      const res = await updateProductMetadata('card', 1, { name: 'Thiệp Đổi Tên' }, { staff: admin, repo });
      assert.equal(res.ok, false);
      assert.equal(res.code, 'REVISION_CONFLICT');
    });

    it('activateProduct rejects stale expectedRevision', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'draft',
        revision: 3,
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

      const res = await activateProduct('card', 2, { staff: admin, repo });
      assert.equal(res.ok, false);
      assert.equal(res.code, 'REVISION_CONFLICT');
    });

    it('activateVariant and archiveVariant reject stale expectedRevision', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'active',
        revision: 1,
      });
      repo.seedVariant({
        id: 'horizontal',
        productId: 'card',
        name: 'Ngang',
        price: 29000,
        status: 'draft',
        definitionKey: 'card:horizontal',
        revision: 5,
      });

      const activateRes = await activateVariant('horizontal', 4, { staff: admin, repo });
      assert.equal(activateRes.ok, false);
      assert.equal(activateRes.code, 'REVISION_CONFLICT');

      const archiveRes = await archiveVariant('horizontal', 4, { staff: admin, repo });
      assert.equal(archiveRes.ok, false);
      assert.equal(archiveRes.code, 'REVISION_CONFLICT');
    });

    it('saveCommercialDraft rejects stale draft revision', async () => {
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

      const draft = await createOrLoadCommercialDraft('card', admin.userId, { staff: admin, repo });
      // draft.revision is 1, but we pass expectedRevision: 99
      await assert.rejects(
        () =>
          saveCommercialDraft(
            {
              draftId: draft.id,
              expectedRevision: 99,
              payload: {
                currency: 'VND',
                paymentPolicy: { kind: 'full_payment' },
                variantRules: [
                  {
                    variantId: 'horizontal',
                    minimumQuantity: 1,
                    quantityStep: 1,
                    maximumQuantity: 100,
                    tiers: [{ minimumQuantity: 1, unitPrice: 29000 }],
                  },
                ],
              },
              requestId: 'req-stale-draft',
            },
            { staff: admin, repo },
          ),
        /REVISION_CONFLICT/,
      );
    });
  });

  describe('Quote consumption race safety', () => {
    it('concurrent order creations with same quoteId: first succeeds, second fails with 409', async () => {
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'active',
        revision: 1,
        currentCommercialConfigVersionId: 'ver-shared-quote',
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
      repo.seedCommercialVersion({
        id: 'ver-shared-quote',
        productId: 'card',
        versionNumber: 1,
        currency: 'VND',
        paymentPolicy: { kind: 'full_payment' },
        variantRules: [
          {
            variantId: 'horizontal',
            minimumQuantity: 1,
            quantityStep: 1,
            maximumQuantity: 100,
            tiers: [{ minimumQuantity: 1, unitPrice: 29000 }],
          },
        ],
      });

      const quote = await createPriceQuote(
        {
          productId: 'card',
          variantId: 'horizontal',
          quantity: 1,
          checkoutKey: 'idemp-shared-quote',
        },
        { repo },
      );

      const design = { ...createInitialState('card'), variantId: 'horizontal', quantity: 1 };
      const customer: CustomerInfo = {
        fullName: 'Khách Đua Đơn',
        phone: '0901234567',
        shippingAddress: '123 Đua Lệnh',
      };

      let orderSeq = 0;
      const fakeDeps = {
        orderRepo: {
          getByIdempotencyKey: async () => null,
          createPendingOrder: async (input: Record<string, unknown>) => {
            orderSeq++;
            return {
              id: `QT-ORD-RACE-${orderSeq}`,
              ...input,
              product: {
                productId: input.productId,
                variantId: input.variantId,
                quantity: input.quantity,
                unitPrice: input.unitPrice,
                subtotal: input.subtotal,
              },
            } as unknown as PendingOrder;
          },
          createGuestAccess: async () => { },
          deleteById: async () => { },
        },
        assetRepo: { promoteAsset: async () => ({}) },
        projectRepo: {
          createProject: async () => ({ id: 'proj-race', productId: 'card', variantId: 'horizontal' }),
        },
        designVersionRepo: { createVersion: async () => ({}) },
        orderEventRepo: { append: async () => { } },
        paymentRepo: { create: async () => ({ id: 'pay-race' }) },
        catalogRepo: repo,
      };

      // Order 1 succeeds and consumes quote
      const order1Result = await prepareOrderFromGuestCheckout(
        {
          design,
          customer,
          idempotencyKey: 'idemp-shared-quote',
          designRevision: 'rev-1',
          preflightAcknowledged: true,
          preflightRevision: 'rev-1',
          priceQuoteId: quote.id,
        },
        fakeDeps as never,
      );
      assert.ok(order1Result.order);
      // Order 2 concurrent request with same session attempting to consume already-consumed quote
      await assert.rejects(
        () =>
          prepareOrderFromGuestCheckout(
            {
              design,
              customer,
              idempotencyKey: 'idemp-shared-quote',
              designRevision: 'rev-1',
              preflightAcknowledged: true,
              preflightRevision: 'rev-1',
              priceQuoteId: quote.id,
            },
            fakeDeps as never,
          ),
        (err: unknown) => {
          assert.ok(err instanceof OrderPreparationError);
          assert.equal(err.status, 409);
          assert.equal(err.message, 'Báo giá đã được sử dụng.');
          return true;
        },
      );
    });
  });
});
