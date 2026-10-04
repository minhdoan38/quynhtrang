import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePaymentPresentation,
  isPaymentSatisfiedForProduction,
  type OrderWithPaymentSnapshot,
} from '../lib/domain/payment-presentation.ts';
import {
  assertProductionStartEligible,
  type OrderOperationalState,
} from '../lib/domain/order.ts';
import { resolveOrderNextAction } from '../lib/admin/order-next-action.ts';

describe('Payment Readiness & Presentation Domain', () => {
  describe('resolvePaymentPresentation', () => {
    it('resolves presentation for deposit product with confirmed deposit', () => {
      const order: OrderWithPaymentSnapshot = {
        id: 'ord-dep-1',
        total: 300000,
        currency: 'VND',
        paymentStatus: 'deposit_confirmed',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 100000 },
        depositAmount: 100000,
        amountDueNow: 100000,
        remainingAmount: 200000,
        payment: {
          id: 'pay-1',
          purpose: 'checkout_deposit',
          status: 'paid',
          amount: 100000,
          currency: 'VND',
        },
      };

      const presentation = resolvePaymentPresentation(order);

      assert.equal(presentation.policyLabel, 'Đặt cọc');
      assert.equal(presentation.statusLabel, 'Đã xác nhận cọc');
      assert.equal(presentation.isCheckoutPaymentConfirmed, true);
      assert.equal(presentation.isFullyPaid, false);
      assert.equal(presentation.amountDueNow, 100000);
      assert.equal(presentation.remainingAmount, 200000);
    });

    it('never displays full-paid wording for confirmed deposit with remaining amount', () => {
      const order: OrderWithPaymentSnapshot = {
        id: 'ord-dep-2',
        total: 500000,
        currency: 'VND',
        paymentStatus: 'deposit_confirmed',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 150000 },
        depositAmount: 150000,
        amountDueNow: 150000,
        remainingAmount: 350000,
      };

      const presentation = resolvePaymentPresentation(order);

      assert.notEqual(presentation.statusLabel, 'Đã thanh toán');
      assert.equal(presentation.statusLabel, 'Đã xác nhận cọc');
      assert.equal(presentation.isFullyPaid, false);
    });

    it('resolves presentation for pending deposit', () => {
      const order: OrderWithPaymentSnapshot = {
        id: 'ord-dep-pending',
        total: 300000,
        currency: 'VND',
        paymentStatus: 'pending_payment',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 100000 },
        depositAmount: 100000,
        amountDueNow: 100000,
        remainingAmount: 200000,
      };

      const presentation = resolvePaymentPresentation(order);

      assert.equal(presentation.policyLabel, 'Đặt cọc');
      assert.equal(presentation.statusLabel, 'Chờ đặt cọc');
      assert.equal(presentation.isCheckoutPaymentConfirmed, false);
      assert.equal(presentation.isFullyPaid, false);
    });

    it('resolves presentation for full-payment product when paid', () => {
      const order: OrderWithPaymentSnapshot = {
        id: 'ord-full-paid',
        total: 250000,
        currency: 'VND',
        paymentStatus: 'paid',
        paymentPolicy: { kind: 'full_payment' },
        depositAmount: null,
        amountDueNow: 250000,
        remainingAmount: 0,
        payment: {
          id: 'pay-2',
          purpose: 'full_order_payment',
          status: 'paid',
          amount: 250000,
          currency: 'VND',
        },
      };

      const presentation = resolvePaymentPresentation(order);

      assert.equal(presentation.policyLabel, 'Thanh toán toàn bộ');
      assert.equal(presentation.statusLabel, 'Đã thanh toán');
      assert.equal(presentation.isCheckoutPaymentConfirmed, true);
      assert.equal(presentation.isFullyPaid, true);
      assert.equal(presentation.amountDueNow, 250000);
      assert.equal(presentation.remainingAmount, 0);
    });

    it('resolves presentation for pending full-payment product', () => {
      const order: OrderWithPaymentSnapshot = {
        id: 'ord-full-pending',
        total: 250000,
        currency: 'VND',
        paymentStatus: 'pending_payment',
        paymentPolicy: { kind: 'full_payment' },
        amountDueNow: 250000,
        remainingAmount: 0,
      };

      const presentation = resolvePaymentPresentation(order);

      assert.equal(presentation.policyLabel, 'Thanh toán toàn bộ');
      assert.equal(presentation.statusLabel, 'Chờ thanh toán');
      assert.equal(presentation.isCheckoutPaymentConfirmed, false);
      assert.equal(presentation.isFullyPaid, false);
    });

    it('resolves presentation when order embeds commercialSnapshot', () => {
      const order: OrderWithPaymentSnapshot = {
        id: 'ord-snap',
        commercialSnapshot: {
          total: 400000,
          paymentPolicy: { kind: 'fixed_deposit', depositAmount: 100000 },
          depositAmount: 100000,
          amountDueNow: 100000,
          remainingAmount: 300000,
        },
        paymentStatus: 'deposit_confirmed',
      };

      const presentation = resolvePaymentPresentation(order);

      assert.equal(presentation.policyLabel, 'Đặt cọc');
      assert.equal(presentation.statusLabel, 'Đã xác nhận cọc');
      assert.equal(presentation.amountDueNow, 100000);
      assert.equal(presentation.remainingAmount, 300000);
    });
  });

  describe('isPaymentSatisfiedForProduction', () => {
    it('deposit confirmed satisfies production payment even if remaining amount > 0', () => {
      const order: OrderWithPaymentSnapshot = {
        paymentStatus: 'deposit_confirmed',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 100000 },
        remainingAmount: 200000,
      };

      assert.equal(isPaymentSatisfiedForProduction(order), true);
    });

    it('deposit pending blocks production payment', () => {
      const order: OrderWithPaymentSnapshot = {
        paymentStatus: 'pending_payment',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 100000 },
      };

      assert.equal(isPaymentSatisfiedForProduction(order), false);
    });

    it('deposit payment reported blocks production payment', () => {
      const order: OrderWithPaymentSnapshot = {
        paymentStatus: 'payment_reported',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 100000 },
      };

      assert.equal(isPaymentSatisfiedForProduction(order), false);
    });

    it('full payment paid satisfies production payment', () => {
      const order: OrderWithPaymentSnapshot = {
        paymentStatus: 'paid',
        paymentPolicy: { kind: 'full_payment' },
      };

      assert.equal(isPaymentSatisfiedForProduction(order), true);
    });

    it('full payment pending blocks production payment', () => {
      const order: OrderWithPaymentSnapshot = {
        paymentStatus: 'pending_payment',
        paymentPolicy: { kind: 'full_payment' },
      };

      assert.equal(isPaymentSatisfiedForProduction(order), false);
    });

    it('full payment policy rejects deposit_confirmed status', () => {
      const order: OrderWithPaymentSnapshot = {
        paymentStatus: 'deposit_confirmed',
        paymentPolicy: { kind: 'full_payment' },
      };

      assert.equal(isPaymentSatisfiedForProduction(order), false);
    });
  });

  describe('assertProductionStartEligible integration', () => {
    it('allows starting production when deposit is confirmed and design approved', () => {
      const order = {
        paymentStatus: 'deposit_confirmed' as const,
        paymentPolicy: { kind: 'fixed_deposit' as const, depositAmount: 50000 },
        designStatus: 'approved' as const,
        fulfillmentStatus: 'ready_for_production' as const,
        activeHold: null,
        productionDesignVersionId: 'ver-prod-1',
      };

      assert.doesNotThrow(() => assertProductionStartEligible(order));
    });

    it('blocks production and provides exact deposit copy when deposit not confirmed', () => {
      const order = {
        paymentStatus: 'pending_payment' as const,
        paymentPolicy: { kind: 'fixed_deposit' as const, depositAmount: 50000 },
        designStatus: 'approved' as const,
        fulfillmentStatus: 'ready_for_production' as const,
        activeHold: null,
        productionDesignVersionId: 'ver-prod-1',
      };

      assert.throws(
        () => assertProductionStartEligible(order),
        (err: Error) => err.message.includes('Tiền cọc chưa được xác nhận')
      );
    });

    it('blocks production and provides exact full payment copy when full payment not confirmed', () => {
      const order = {
        paymentStatus: 'pending_payment' as const,
        paymentPolicy: { kind: 'full_payment' as const },
        designStatus: 'approved' as const,
        fulfillmentStatus: 'ready_for_production' as const,
        activeHold: null,
        productionDesignVersionId: 'ver-prod-1',
      };

      assert.throws(
        () => assertProductionStartEligible(order),
        (err: Error) => err.message.includes('Thanh toán chưa được xác nhận')
      );
    });
  });

  describe('resolveOrderNextAction for deposit orders', () => {
    it('resolves ready_for_production when deposit confirmed and design approved', () => {
      const action = resolveOrderNextAction({
        paymentStatus: 'deposit_confirmed',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 50000 },
        designStatus: 'approved',
        fulfillmentStatus: 'ready_for_production',
        activeHold: null,
      });

      assert.equal(action.kind, 'ready_for_production');
      assert.equal(action.cta?.type, 'start_production');
    });

    it('resolves review_design when deposit confirmed and design awaiting review', () => {
      const action = resolveOrderNextAction({
        paymentStatus: 'deposit_confirmed',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 50000 },
        designStatus: 'awaiting_review',
        fulfillmentStatus: 'unprocessed',
        activeHold: null,
      });

      assert.equal(action.kind, 'review_design');
    });

    it('resolves production_in_progress when deposit confirmed and fulfillment is in_production', () => {
      const action = resolveOrderNextAction({
        paymentStatus: 'deposit_confirmed',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 50000 },
        designStatus: 'approved',
        fulfillmentStatus: 'in_production',
        activeHold: null,
      });

      assert.equal(action.kind, 'production_in_progress');
      assert.equal(action.cta?.type, 'complete_production');
    });
  });
});
