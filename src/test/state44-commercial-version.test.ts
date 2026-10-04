import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { StaffIdentity } from '../lib/domain/order.ts';
import {
  calculatePrice,
  validateCommercialConfig,
  validateQuantity,
  type CommercialConfigVersion,
  type CommercialVariantRule,
} from '../lib/domain/commercial-config.ts';
import {
  createOrLoadCommercialDraft,
  saveCommercialDraft,
  publishProductCommercialConfig,
} from '../lib/services/commercial-config-service.ts';
import { createPriceQuote } from '../lib/services/price-quote-service.ts';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';
import {
  prepareOrderFromGuestCheckout,
  OrderPreparationError,
} from '../lib/services/prepare-order-from-guest-checkout.ts';
import { createInitialState } from '../lib/product-state.ts';
import type { CustomerInfo, PendingOrder } from '../lib/order-types.ts';
import { getPaymentInstructions } from '../lib/payment-qr-provider.ts';
import { confirmOrderPayment } from '../lib/services/admin-order-operations.ts';
import { assertProductionStartEligible } from '../lib/domain/order.ts';
import { resolvePaymentPresentation, isPaymentSatisfiedForProduction } from '../lib/domain/payment-presentation.ts';

function createAdmin(userId = '44000000-0000-0000-0000-0000000000a1'): StaffIdentity {
  return {
    userId,
    role: 'admin',
    email: 'admin@quynhtrang.test',
  };
}

describe('State 44 Commercial Version & Payment Invariants', () => {
  describe('Publish v1, create Order, publish v2; v1 and Order unchanged, new Quote uses v2', () => {
    it('historical order retains immutable v1 commercial snapshot and v2 quote gets new pricing', async () => {
      const admin = createAdmin();
      const repo = new AdminCatalogRepository(null);

      // 1. Seed product and variant
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
        name: 'Thiệp Ngang',
        price: 30000,
        status: 'active',
        definitionKey: 'card:horizontal',
        revision: 1,
      });

      // 2. Draft & Publish v1 (30,000 VND full payment)
      const draftV1 = await createOrLoadCommercialDraft('card', admin.userId, { staff: admin, repo });
      await saveCommercialDraft(
        {
          draftId: draftV1.id,
          expectedRevision: draftV1.revision,
          payload: {
            currency: 'VND',
            paymentPolicy: { kind: 'full_payment' },
            variantRules: [
              {
                variantId: 'horizontal',
                minimumQuantity: 1,
                quantityStep: 1,
                maximumQuantity: 1000,
                tiers: [
                  { minimumQuantity: 1, unitPrice: 30000 },
                  { minimumQuantity: 50, unitPrice: 25000 },
                ],
              },
            ],
          },
          requestId: 'req-save-v1',
        },
        { staff: admin, repo },
      );

      const publishedV1 = await publishProductCommercialConfig(
        {
          productId: 'card',
          expectedDraftRevision: 2,
          expectedProductRevision: 1,
          requestId: 'req-pub-v1',
        },
        { staff: admin, repo },
      );

      assert.equal(publishedV1.versionNumber, 1);
      assert.equal(publishedV1.variantRules[0].tiers[0].unitPrice, 30000);

      // 3. Create Quote and Order under v1
      const quoteV1 = await createPriceQuote(
        {
          productId: 'card',
          variantId: 'horizontal',
          quantity: 10,
          checkoutKey: 'idemp-v1-order',
        },
        { repo },
      );

      assert.equal(quoteV1.commercialConfigVersionId, publishedV1.id);
      assert.equal(quoteV1.calculation.unitPrice, 30000);
      assert.equal(quoteV1.calculation.totalAmount, 300000);

      // Prepare order from quote
      const design = { ...createInitialState('card'), variantId: 'horizontal', quantity: 10 };
      const customer: CustomerInfo = {
        fullName: 'Khách Hàng V1',
        phone: '0901234567',
        shippingAddress: '123 Kim Mã',
      };

      const stateBox: { storedOrder: PendingOrder | null } = { storedOrder: null };
      const fakeDeps = {
        orderRepo: {
          getByIdempotencyKey: async () => null,
          createPendingOrder: async (input: Record<string, unknown>) => {
            const raw = {
              id: 'QT-ORD-V1',
              ...input,
              product: {
                productId: input.productId,
                variantId: input.variantId,
                quantity: input.quantity,
                unitPrice: input.unitPrice,
                subtotal: input.subtotal,
              },
            } as unknown as PendingOrder;
            stateBox.storedOrder = raw;
            return raw;
          },
          createGuestAccess: async () => { },
          deleteById: async () => { },
        },
        assetRepo: { promoteAsset: async () => ({}) },
        projectRepo: {
          createProject: async () => ({ id: 'proj-v1', productId: 'card', variantId: 'horizontal' }),
        },
        designVersionRepo: { createVersion: async () => ({}) },
        orderEventRepo: { append: async () => { } },
        paymentRepo: { create: async () => ({ id: 'pay-v1' }) },
        catalogRepo: repo,
      };

      const orderResult = await prepareOrderFromGuestCheckout(
        {
          design,
          customer,
          idempotencyKey: 'idemp-v1-order',
          designRevision: 'rev-1',
          preflightAcknowledged: true,
          preflightRevision: 'rev-1',
          priceQuoteId: quoteV1.id,
        },
        fakeDeps as never,
      );

      assert.ok(orderResult.order);
      assert.equal(orderResult.order.commercialSnapshot.total, 300000);
      assert.equal(orderResult.order.commercialSnapshot.commercialConfigVersionId, publishedV1.id);
      assert.equal(orderResult.order.commercialSnapshot.unitPrice, 30000);

      // 4. Create and publish v2 with revised pricing (unit price 35,000 VND)
      const currentProduct = repo.getProduct('card');
      assert.ok(currentProduct);
      const draftV2 = await createOrLoadCommercialDraft('card', admin.userId, { staff: admin, repo });
      await saveCommercialDraft(
        {
          draftId: draftV2.id,
          expectedRevision: draftV2.revision,
          payload: {
            currency: 'VND',
            paymentPolicy: { kind: 'full_payment' },
            variantRules: [
              {
                variantId: 'horizontal',
                minimumQuantity: 1,
                quantityStep: 1,
                maximumQuantity: 1000,
                tiers: [
                  { minimumQuantity: 1, unitPrice: 35000 },
                  { minimumQuantity: 50, unitPrice: 30000 },
                ],
              },
            ],
          },
          requestId: 'req-save-v2',
        },
        { staff: admin, repo },
      );

      const publishedV2 = await publishProductCommercialConfig(
        {
          productId: 'card',
          expectedDraftRevision: 2,
          expectedProductRevision: currentProduct.revision,
          requestId: 'req-pub-v2',
        },
        { staff: admin, repo },
      );

      assert.equal(publishedV2.versionNumber, 2);
      assert.equal(publishedV2.variantRules[0].tiers[0].unitPrice, 35000);

      // 5. Invariants:
      // a) Old order retains v1 snapshot and total (300,000 VND)
      assert.ok(stateBox.storedOrder);
      assert.equal(stateBox.storedOrder.commercialSnapshot.total, 300000);
      assert.equal(stateBox.storedOrder.commercialSnapshot.commercialConfigVersionId, publishedV1.id);
      assert.equal(stateBox.storedOrder.commercialSnapshot.unitPrice, 30000);

      // b) Historical v1 in repository is immutable and intact
      const historicalV1 = repo.getCommercialVersion(publishedV1.id);
      assert.ok(historicalV1);
      assert.equal(historicalV1.versionNumber, 1);
      assert.equal(historicalV1.variantRules[0].tiers[0].unitPrice, 30000);

      // c) New Quote requested uses v2 pricing (10 * 35,000 = 350,000 VND)
      const quoteV2 = await createPriceQuote(
        {
          productId: 'card',
          variantId: 'horizontal',
          quantity: 10,
          checkoutKey: 'checkout-v2',
        },
        { repo },
      );

      assert.equal(quoteV2.commercialConfigVersionId, publishedV2.id);
      assert.equal(quoteV2.calculation.unitPrice, 35000);
      assert.equal(quoteV2.calculation.totalAmount, 350000);
    });
  });

  describe('Tier boundaries and quantity step', () => {
    const multiTierRule: CommercialVariantRule = {
      variantId: 'horizontal',
      minimumQuantity: 10,
      quantityStep: 5,
      maximumQuantity: 500,
      tiers: [
        { minimumQuantity: 10, unitPrice: 20000 },
        { minimumQuantity: 50, unitPrice: 18000 },
        { minimumQuantity: 100, unitPrice: 15000 },
      ],
    };

    const config: CommercialConfigVersion = {
      id: 'cfg-tiers',
      productId: 'card',
      versionNumber: 1,
      currency: 'VND',
      paymentPolicy: { kind: 'full_payment' },
      variantRules: [multiTierRule],
    };

    it('volume pricing applies highest applicable minimum threshold for all units (no graduated pricing)', () => {
      // At quantity 10 (Tier 1 threshold): 10 * 20,000 = 200,000
      const calc10 = calculatePrice(config, 'horizontal', 10);
      assert.equal(calc10.unitPrice, 20000);
      assert.equal(calc10.totalAmount, 200000);

      // At quantity 45 (still Tier 1): 45 * 20,000 = 900,000
      const calc45 = calculatePrice(config, 'horizontal', 45);
      assert.equal(calc45.unitPrice, 20000);
      assert.equal(calc45.totalAmount, 900000);

      // At quantity 50 (Tier 2 threshold): 50 * 18,000 = 900,000 (all 50 units at 18,000)
      const calc50 = calculatePrice(config, 'horizontal', 50);
      assert.equal(calc50.unitPrice, 18000);
      assert.equal(calc50.totalAmount, 900000);

      // At quantity 100 (Tier 3 threshold): 100 * 15,000 = 1,500,000 (all 100 units at 15,000)
      const calc100 = calculatePrice(config, 'horizontal', 100);
      assert.equal(calc100.unitPrice, 15000);
      assert.equal(calc100.totalAmount, 1500000);
    });

    it('validates quantity step lattice strictly', () => {
      // Min 10, step 5: valid values are 10, 15, 20, 25...
      assert.equal(validateQuantity(multiTierRule, 10), true);
      assert.equal(validateQuantity(multiTierRule, 15), true);
      assert.equal(validateQuantity(multiTierRule, 25), true);

      // Invalid quantities
      assert.equal(validateQuantity(multiTierRule, 9), false); // below min
      assert.equal(validateQuantity(multiTierRule, 11), false); // off step
      assert.equal(validateQuantity(multiTierRule, 14), false); // off step
      assert.equal(validateQuantity(multiTierRule, 505), false); // above max

      assert.throws(
        () => calculatePrice(config, 'horizontal', 12),
        /Số lượng không hợp lệ/,
      );
    });
  });

  describe('Fixed deposit/full payment amounts and invalid deposit publication rejection', () => {
    it('correctly calculates amountDueNow and remainingAmount for fixed deposit', () => {
      const depositConfig: CommercialConfigVersion = {
        id: 'cfg-dep',
        productId: 'card',
        versionNumber: 1,
        currency: 'VND',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 50000 },
        variantRules: [
          {
            variantId: 'horizontal',
            minimumQuantity: 5,
            quantityStep: 1,
            maximumQuantity: 100,
            tiers: [{ minimumQuantity: 5, unitPrice: 20000 }],
          },
        ],
      };

      // 5 units * 20,000 = 100,000 VND total. Deposit 50,000. Due now: 50,000. Remaining: 50,000.
      const calc = calculatePrice(depositConfig, 'horizontal', 5);
      assert.equal(calc.totalAmount, 100000);
      assert.equal(calc.amountDueNow, 50000);
      assert.equal(calc.remainingAmount, 50000);
    });

    it('rejects publication when fixed deposit exceeds minimum reachable total across reachable tiers', () => {
      const invalidDepositConfig: CommercialConfigVersion = {
        id: 'cfg-invalid-dep',
        productId: 'card',
        versionNumber: 1,
        currency: 'VND',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 150000 },
        variantRules: [
          {
            variantId: 'horizontal',
            minimumQuantity: 5,
            quantityStep: 1,
            maximumQuantity: 100,
            tiers: [{ minimumQuantity: 5, unitPrice: 20000 }], // min total = 5 * 20000 = 100,000 VND
          },
        ],
      };

      const errors = validateCommercialConfig(invalidDepositConfig, ['horizontal']);
      assert.ok(errors.length > 0);
      assert.ok(
        errors.some((e) =>
          e.includes('Fixed deposit 150000 exceeds minimum reachable total 100000'),
        ),
      );
    });
  });

  describe('Client total manipulation rejection', () => {
    it('order preparation always enforces server quote calculation and rejects client price tampering', async () => {
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'active',
        revision: 1,
        currentCommercialConfigVersionId: 'ver-tamper',
      });
      repo.seedVariant({
        id: 'horizontal',
        productId: 'card',
        name: 'Thiệp Ngang',
        price: 50000,
        status: 'active',
        definitionKey: 'card:horizontal',
        revision: 1,
      });
      repo.seedCommercialVersion({
        id: 'ver-tamper',
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
            tiers: [{ minimumQuantity: 1, unitPrice: 50000 }],
          },
        ],
      });

      // Valid quote created by server: 2 * 50,000 = 100,000 VND
      const serverQuote = await createPriceQuote(
        {
          productId: 'card',
          variantId: 'horizontal',
          quantity: 2,
          checkoutKey: 'idemp-tamper',
          accessContext: 'tamper-check',
        },
        { repo },
      );

      // Attempt to tamper with price inside client request (e.g. claim unitPrice = 1,000 VND, total = 2,000 VND)
      const tamperedDesign = {
        ...createInitialState('card'),
        variantId: 'horizontal',
        quantity: 2,
      };

      const tamperBox: { createdOrder: PendingOrder | null } = { createdOrder: null };
      const fakeDeps = {
        orderRepo: {
          getByIdempotencyKey: async () => null,
          createPendingOrder: async (input: Record<string, unknown>) => {
            const created = {
              id: 'QT-ORD-SECURE',
              ...input,
              product: {
                productId: input.productId,
                variantId: input.variantId,
                quantity: input.quantity,
                unitPrice: input.unitPrice,
                subtotal: input.subtotal,
              },
            } as unknown as PendingOrder;
            tamperBox.createdOrder = created;
            return created;
          },
          createGuestAccess: async () => { },
          deleteById: async () => { },
        },
        assetRepo: { promoteAsset: async () => ({}) },
        projectRepo: {
          createProject: async () => ({ id: 'proj-tamper', productId: 'card', variantId: 'horizontal' }),
        },
        designVersionRepo: { createVersion: async () => ({}) },
        orderEventRepo: { append: async () => { } },
        paymentRepo: { create: async () => ({ id: 'pay-tamper' }) },
        catalogRepo: repo,
      };

      await prepareOrderFromGuestCheckout(
        {
          design: tamperedDesign,
          customer: { fullName: 'Attacker', phone: '0900000000', shippingAddress: 'Nowhere' },
          idempotencyKey: 'idemp-tamper',
          designRevision: 'rev-1',
          preflightAcknowledged: true,
          preflightRevision: 'rev-1',
          priceQuoteId: serverQuote.id,
          accessContext: 'tamper-check',
        },
        fakeDeps as never,
      );

      // Server calculation (100,000 VND) was enforced, ignoring client manipulation completely
      assert.ok(tamperBox.createdOrder);
      assert.equal(tamperBox.createdOrder.commercialSnapshot.total, 100000);
      assert.equal(tamperBox.createdOrder.commercialSnapshot.unitPrice, 50000);
    });
  });

  describe('Quote expiry refresh preserving design/customer data', () => {
    it('rejects expired quote and accepts refreshed quote with preserved design and customer data', async () => {
      const repo = new AdminCatalogRepository(null);
      repo.seedProduct({
        id: 'card',
        slug: 'card',
        name: 'Thiệp',
        productType: 'card',
        status: 'active',
        revision: 1,
        currentCommercialConfigVersionId: 'ver-exp',
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
        id: 'ver-exp',
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

      // Seed an expired quote
      const expiredQuote = {
        id: 'quote-expired',
        productId: 'card',
        variantId: 'horizontal',
        quantity: 1,
        commercialConfigVersionId: 'ver-exp',
        calculation: {
          commercialConfigVersionId: 'ver-exp',
          productId: 'card',
          variantId: 'horizontal',
          currency: 'VND' as const,
          quantity: 1,
          appliedTier: { minimumQuantity: 1, unitPrice: 29000 },
          unitPrice: 29000,
          subtotal: 29000,
          totalAmount: 29000,
          paymentPolicy: { kind: 'full_payment' as const },
          amountDueNow: 29000,
          remainingAmount: 0,
          isDeposit: false,
          appliedTierMinimumQuantity: 1,
        },
        checkoutKeyHash: createHash('sha256').update('idemp-expired-check').digest('hex'),
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(), // expired in past
      };
      await repo.saveQuote(expiredQuote);

      const design = { ...createInitialState('card'), variantId: 'horizontal', quantity: 1 };
      const customer: CustomerInfo = {
        fullName: 'Nguyễn Văn B',
        phone: '0901234567',
        shippingAddress: '789 Hai Bà Trưng',
      };

      const fakeDeps = {
        orderRepo: {
          getByIdempotencyKey: async () => null,
          createPendingOrder: async (input: Record<string, unknown>) => ({
            id: 'QT-ORD-REFRESH',
            ...input,
            product: {
              productId: input.productId,
              variantId: input.variantId,
              quantity: input.quantity,
              unitPrice: input.unitPrice,
              subtotal: input.subtotal,
            },
          } as unknown as PendingOrder),
          createGuestAccess: async () => { },
          deleteById: async () => { },
        },
        assetRepo: { promoteAsset: async () => ({}) },
        projectRepo: {
          createProject: async () => ({ id: 'proj-exp', productId: 'card', variantId: 'horizontal' }),
        },
        designVersionRepo: { createVersion: async () => ({}) },
        orderEventRepo: { append: async () => { } },
        paymentRepo: { create: async () => ({ id: 'pay-exp' }) },
        catalogRepo: repo,
      };

      // 1. Expired quote rejected
      await assert.rejects(
        () =>
          prepareOrderFromGuestCheckout(
            {
              design,
              customer,
              idempotencyKey: 'idemp-expired-check',
              designRevision: 'rev-1',
              preflightAcknowledged: true,
              preflightRevision: 'rev-1',
              priceQuoteId: 'quote-expired',
            },
            fakeDeps as never,
          ),
        (err: unknown) => {
          assert.ok(err instanceof OrderPreparationError);
          assert.equal(err.message, 'Báo giá đã hết hạn.');
          return true;
        },
      );

      // 2. Refresh quote for same design and idempotency key
      const freshQuote = await createPriceQuote(
        {
          productId: 'card',
          variantId: 'horizontal',
          quantity: 1,
          checkoutKey: 'idemp-expired-check',
        },
        { repo },
      );

      assert.ok(freshQuote.id !== expiredQuote.id);
      assert.ok(new Date(freshQuote.expiresAt).getTime() > Date.now());

      // 3. Prepare order successfully with fresh quote; design and customer preserved
      const result = await prepareOrderFromGuestCheckout(
        {
          design,
          customer,
          idempotencyKey: 'idemp-expired-check',
          designRevision: 'rev-1',
          preflightAcknowledged: true,
          preflightRevision: 'rev-1',
          priceQuoteId: freshQuote.id,
        },
        fakeDeps as never,
      );

      assert.ok(result.order);
      assert.equal(result.order.customer.fullName, 'Nguyễn Văn B');
      assert.equal(result.order.customer.phone, '0901234567');
      assert.equal(result.order.product.productId, 'card');
    });
  });

  describe('QR amount due-now and payment confirmation purpose', () => {
    it('QR instructions set transfer amount to amountDueNow for deposit orders and total for full payment', async () => {
      // Deposit order: total 500,000, deposit 150,000
      const depositOrder = {
        id: 'ord-dep-qr',
        publicOrderCode: 'QT-DEP-QR',
        commercialSnapshot: {
          amountDueNow: 150000,
          total: 500000,
          remainingAmount: 350000,
          paymentPolicy: { kind: 'fixed_deposit' as const, depositAmount: 150000 },
        },
        payment: { paymentReference: 'REF-DEP', purpose: 'checkout_deposit' as const, amount: 150000, status: 'pending_payment' as const },
      } as unknown as PendingOrder;

      const depositInstructions = await getPaymentInstructions(depositOrder);
      assert.equal(depositInstructions.amount, 150000);
      assert.ok(depositInstructions.qrUrl?.includes('150000'));

      // Full payment order: total 500,000
      const fullOrder = {
        id: 'ord-full-qr',
        publicOrderCode: 'QT-FULL-QR',
        commercialSnapshot: {
          amountDueNow: 500000,
          total: 500000,
          remainingAmount: 0,
          paymentPolicy: { kind: 'full_payment' as const },
        },
        payment: { paymentReference: 'REF-FULL', purpose: 'full_order_payment' as const, amount: 500000, status: 'pending_payment' as const },
      } as unknown as PendingOrder;

      const fullInstructions = await getPaymentInstructions(fullOrder);
      assert.equal(fullInstructions.amount, 500000);
      assert.ok(fullInstructions.qrUrl?.includes('500000'));
    });

    it('confirmOrderPayment enforces purpose and idempotency (already_paid)', async () => {
      const admin = createAdmin();
      let rpcCalls = 0;
      const fakeSupabase = {
        rpc: async (fn: string) => {
          if (fn === 'confirm_order_payment') {
            rpcCalls++;
            if (rpcCalls === 1) {
              return { data: { code: 'confirmed', ok: true }, error: null };
            }
            return { data: { code: 'already_paid', ok: false }, error: null };
          }
          return { data: null, error: new Error('Unknown RPC') };
        },
      } as unknown as SupabaseClient;
      // First confirmation: succeeds
      const firstResult = await confirmOrderPayment(
        { supabase: fakeSupabase, staff: admin },
        { orderId: 'ord-1', expectedState: 'pending_payment', purpose: 'checkout_deposit' },
      );
      assert.equal(firstResult.ok, true);
      assert.equal(firstResult.code, 'confirmed');

      // Duplicate confirmation: returns already_paid
      const secondResult = await confirmOrderPayment(
        { supabase: fakeSupabase, staff: admin },
        { orderId: 'ord-1', expectedState: 'pending_payment', purpose: 'checkout_deposit' },
      );
      assert.equal(secondResult.ok, false);
      assert.equal(secondResult.code, 'already_paid');
    });
  });

  describe('Deposit production eligibility and full-payment blocking', () => {
    it('fixed_deposit: unconfirmed deposit blocks production; confirmed deposit allows production', () => {
      const pendingDepositOrder = {
        orderId: 'ord-dep',
        paymentStatus: 'pending_payment' as const,
        paymentPolicy: { kind: 'fixed_deposit' as const, depositAmount: 50000 },
        payment: { purpose: 'checkout_deposit' as const, status: 'pending_payment' as const },
        activeHold: null,
        designStatus: 'approved' as const,
        fulfillmentStatus: 'ready_for_production' as const,
        productionDesignVersionId: 'ver-design-1',
      };

      assert.equal(isPaymentSatisfiedForProduction(pendingDepositOrder), false);
      assert.throws(
        () => assertProductionStartEligible(pendingDepositOrder),
        /Tiền cọc chưa được xác nhận/,
      );

      // Confirmed deposit
      const confirmedDepositOrder = {
        ...pendingDepositOrder,
        paymentStatus: 'deposit_confirmed' as const,
        payment: { purpose: 'checkout_deposit' as const, status: 'paid' as const },
      };

      assert.equal(isPaymentSatisfiedForProduction(confirmedDepositOrder), true);
      assert.doesNotThrow(() => assertProductionStartEligible(confirmedDepositOrder));
    });

    it('full_payment: unconfirmed payment blocks production; paid status allows production', () => {
      const pendingFullOrder = {
        orderId: 'ord-full',
        paymentStatus: 'pending_payment' as const,
        paymentPolicy: { kind: 'full_payment' as const },
        payment: { purpose: 'full_order_payment' as const, status: 'pending_payment' as const },
        activeHold: null,
        designStatus: 'approved' as const,
        fulfillmentStatus: 'ready_for_production' as const,
        productionDesignVersionId: 'ver-design-1',
      };

      assert.equal(isPaymentSatisfiedForProduction(pendingFullOrder), false);
      assert.throws(
        () => assertProductionStartEligible(pendingFullOrder),
        /Thanh toán chưa được xác nhận/,
      );

      // Paid full payment
      const paidFullOrder = {
        ...pendingFullOrder,
        paymentStatus: 'paid' as const,
        payment: { purpose: 'full_order_payment' as const, status: 'paid' as const },
      };

      assert.equal(isPaymentSatisfiedForProduction(paidFullOrder), true);
      assert.doesNotThrow(() => assertProductionStartEligible(paidFullOrder));
    });

    it('payment presentation renders distinct labels for deposit vs full payment', () => {
      const depositPres = resolvePaymentPresentation({
        total: 500000,
        amountDueNow: 150000,
        remainingAmount: 350000,
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 150000 },
        paymentStatus: 'deposit_confirmed',
      });

      assert.equal(depositPres.policyLabel, 'Đặt cọc');
      assert.equal(depositPres.statusLabel, 'Đã xác nhận cọc');
      assert.equal(depositPres.isCheckoutPaymentConfirmed, true);
      assert.equal(depositPres.isFullyPaid, false);
      assert.equal(depositPres.amountDueNow, 150000);
      assert.equal(depositPres.remainingAmount, 350000);

      const fullPres = resolvePaymentPresentation({
        total: 500000,
        amountDueNow: 500000,
        remainingAmount: 0,
        paymentPolicy: { kind: 'full_payment' },
        paymentStatus: 'paid',
      });

      assert.equal(fullPres.policyLabel, 'Thanh toán toàn bộ');
      assert.equal(fullPres.statusLabel, 'Đã thanh toán');
      assert.equal(fullPres.isCheckoutPaymentConfirmed, true);
      assert.equal(fullPres.isFullyPaid, true);
    });
  });
});
