import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  listProductDefinitionCapabilities,
  resolveProductDefinition,
  resolveProductDefinitionKey,
} from '../lib/product-definition-registry.ts';
import { CATALOG_PRODUCTS } from '../lib/product-catalog.ts';
import { PRODUCTS } from '../lib/product-state.ts';
import {
  calculatePriceQuote,
  formatCurrencyVND,
} from '../lib/pricing.ts';
import {
  listAllSupportedTargetKeys,
  createTemplateTarget,
  templateTargetsEqual,
} from '../lib/template-target.ts';
import {
  assertProductionStartEligible,
  assertProductionCompleteEligible,
  type OrderOperationalState,
} from '../lib/domain/order.ts';
import { resolveOrderNextAction } from '../lib/admin/order-next-action.ts';
import { resolvePaymentPresentation } from '../lib/domain/payment-presentation.ts';

describe('State 44 Comprehensive Regression Invariants', () => {
  describe('Product Definition Registry & Code-Owned Geometry', () => {
    it('maps all 4 core products and 8 standard variants deterministically', () => {
      const caps = listProductDefinitionCapabilities();
      assert.equal(caps.length, 8);

      const expectedKeys = [
        'card:horizontal',
        'card:vertical',
        'notebook:standard',
        'sticker:die-cut',
        'sticker:fixed-shape',
        'sticker:phone',
        'wrapping:a1',
        'wrapping:a2',
      ];

      assert.deepEqual(
        caps.map((c) => c.definitionKey).sort(),
        expectedKeys.sort(),
      );

      for (const key of expectedKeys) {
        const resolved = resolveProductDefinitionKey(key);
        assert.ok(resolved, `Key ${key} must resolve in definition registry`);
        assert.equal(resolved.previewAvailable, true);
        assert.equal(resolved.productionRendererAvailable, true);
        assert.ok(resolved.physicalSummary.length > 0);
        assert.ok(resolved.surfacesSummary.length > 0);
      }
    });

    it('rejects unknown or invalid definition lookup returning null', () => {
      assert.equal(resolveProductDefinition('unknown-prod', 'unknown-var'), null);
      assert.equal(resolveProductDefinitionKey('card:unknown-cut'), null);
      assert.equal(resolveProductDefinitionKey('nonexistent:key'), null);
    });
  });

  describe('Static Catalog and Product State Backward Compatibility', () => {
    it('CATALOG_PRODUCTS retains 4 products with valid IDs and slugs', () => {
      const products = Object.values(CATALOG_PRODUCTS);
      assert.equal(products.length, 4);
      const productIds = products.map((p) => p.id).sort();
      assert.deepEqual(productIds, ['card', 'notebook', 'sticker', 'wrapping']);

      const card = products.find((p) => p.id === 'card');
      assert.ok(card);
      assert.equal(card.name, 'Thiệp chúc mừng');
      assert.ok(card.variants.length >= 2);
    });

    it('PRODUCTS from product-state defines exact dimensions and layout structures', () => {
      assert.ok(PRODUCTS.wrapping);
      assert.ok(PRODUCTS.card);
      assert.ok(PRODUCTS.sticker);
      assert.ok(PRODUCTS.notebook);

      // Card horizontal and vertical variants exist
      const cardVariants = PRODUCTS.card.variants.map((v) => v.id);
      assert.ok(cardVariants.includes('horizontal'));
      assert.ok(cardVariants.includes('vertical'));

      // Wrapping paper variants exist
      const wrappingVariants = PRODUCTS.wrapping.variants.map((v) => v.id);
      assert.ok(wrappingVariants.includes('a1'));
      assert.ok(wrappingVariants.includes('a2'));
    });
  });

  describe('Template Target Resolution & 14 Exact Target Keys', () => {
    it('exactly 14 supported template targets exist in State 43/44', () => {
      const keys = listAllSupportedTargetKeys();
      assert.equal(keys.length, 14);
    });

    it('creates exact template targets and compares them accurately', () => {
      const targetCard1 = createTemplateTarget({
        productId: 'card',
        variantId: 'horizontal',
        mode: null,
        shape: null,
      });

      const targetCard2 = createTemplateTarget({
        productId: 'card',
        variantId: 'horizontal',
        mode: null,
        shape: null,
      });

      const targetCardVert = createTemplateTarget({
        productId: 'card',
        variantId: 'vertical',
        mode: null,
        shape: null,
      });

      assert.equal(templateTargetsEqual(targetCard1, targetCard2), true);
      assert.equal(templateTargetsEqual(targetCard1, targetCardVert), false);
    });
  });

  describe('Pricing Calculations and Formatting', () => {
    it('calculatePriceQuote calculates default pricing synchronously without throwing', () => {
      const quote = calculatePriceQuote({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 5,
      });

      assert.equal(quote.productId, 'card');
      assert.equal(quote.variantId, 'horizontal');
      assert.equal(quote.quantity, 5);
      assert.equal(quote.unitPrice, 29000);
      assert.equal(quote.subtotal, 145000);
      assert.equal(quote.formattedUnitPrice, '29.000đ');
      assert.equal(quote.formattedSubtotal, '145.000đ');
    });

    it('formatCurrencyVND handles zero, positive, and negative amounts', () => {
      assert.equal(formatCurrencyVND(0), '0đ');
      assert.equal(formatCurrencyVND(1000), '1.000đ');
      assert.equal(formatCurrencyVND(250000), '250.000đ');
      assert.equal(formatCurrencyVND(1500000), '1.500.000đ');
      assert.equal(formatCurrencyVND(-50000), '-50.000đ');
    });
  });

  describe('Order Domain Invariants & Next Action Resolution', () => {
    it('assertProductionStartEligible rejects orders with active hold or unapproved design', () => {
      const heldOrder: OrderOperationalState & { productionDesignVersionId: string } = {
        paymentStatus: 'paid',
        designStatus: 'approved',
        fulfillmentStatus: 'ready_for_production',
        productionDesignVersionId: 'ver-prod-1',
        activeHold: {
          id: 'hold-1',
          reason: 'Chờ đối soát',
          heldAt: '2026-10-05T00:00:00Z',
          heldBy: { userId: 'admin-1', displayName: 'Admin', role: 'admin' },
        },
      };

      assert.throws(
        () => assertProductionStartEligible(heldOrder),
        /Đơn hàng đang tạm giữ, không thể bắt đầu sản xuất/,
      );

      const unapprovedOrder: OrderOperationalState & { productionDesignVersionId: string } = {
        paymentStatus: 'paid',
        designStatus: 'awaiting_review',
        fulfillmentStatus: 'ready_for_production',
        productionDesignVersionId: 'ver-prod-1',
        activeHold: null,
      };

      assert.throws(
        () => assertProductionStartEligible(unapprovedOrder),
        /Thiết kế chưa được duyệt, không thể bắt đầu sản xuất/,
      );
    });

    it('assertProductionCompleteEligible requires in_production fulfillment status', () => {
      const readyOrder: OrderOperationalState = {
        paymentStatus: 'paid',
        designStatus: 'approved',
        fulfillmentStatus: 'ready_for_production',
        activeHold: null,
      };

      assert.throws(
        () => assertProductionCompleteEligible(readyOrder),
        /Đơn hàng chưa ở trạng thái đang sản xuất/,
      );

      const inProdOrder: OrderOperationalState = {
        paymentStatus: 'paid',
        designStatus: 'approved',
        fulfillmentStatus: 'in_production',
        activeHold: null,
      };

      assert.doesNotThrow(() => assertProductionCompleteEligible(inProdOrder));
    });

    it('resolveOrderNextAction prioritizes active hold over other steps', () => {
      const heldState: OrderOperationalState = {
        paymentStatus: 'payment_reported',
        designStatus: 'approved',
        fulfillmentStatus: 'unprocessed',
        activeHold: {
          id: 'hold-1',
          reason: 'Lỗi địa chỉ giao hàng',
          heldAt: '2026-10-05T00:00:00Z',
          heldBy: { userId: 'admin-1', displayName: 'Admin', role: 'admin' },
        },
      };

      const action = resolveOrderNextAction(heldState);
      assert.equal(action.kind, 'release_hold');
      assert.equal(action.eyebrow, 'CẦN XỬ LÝ');
      assert.equal(action.cta?.label, 'Bỏ tạm giữ');
    });

    it('resolvePaymentPresentation accurately projects payment state for both deposit and full payment', () => {
      const depositPres = resolvePaymentPresentation({
        total: 1000000,
        depositAmount: 300000,
        amountDueNow: 300000,
        remainingAmount: 700000,
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 300000 },
        paymentStatus: 'deposit_confirmed',
      });

      assert.equal(depositPres.policyLabel, 'Đặt cọc');
      assert.equal(depositPres.statusLabel, 'Đã xác nhận cọc');
      assert.equal(depositPres.amountDueNow, 300000);
      assert.equal(depositPres.remainingAmount, 700000);
      assert.equal(depositPres.isCheckoutPaymentConfirmed, true);
      assert.equal(depositPres.isFullyPaid, false);

      const fullPres = resolvePaymentPresentation({
        total: 1000000,
        amountDueNow: 1000000,
        remainingAmount: 0,
        paymentPolicy: { kind: 'full_payment' },
        paymentStatus: 'paid',
      });

      assert.equal(fullPres.policyLabel, 'Thanh toán toàn bộ');
      assert.equal(fullPres.statusLabel, 'Đã thanh toán');
      assert.equal(fullPres.amountDueNow, 1000000);
      assert.equal(fullPres.remainingAmount, 0);
      assert.equal(fullPres.isCheckoutPaymentConfirmed, true);
      assert.equal(fullPres.isFullyPaid, true);
    });
  });
});
