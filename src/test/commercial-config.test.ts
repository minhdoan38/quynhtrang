import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculatePrice,
  formatCurrencyVND,
  validateCommercialConfig,
  validateQuantity,
  type CommercialConfigVersion,
  type CommercialVariantRule,
} from '../lib/domain/commercial-config.ts';
import type { PaymentRequirement, PaymentPurpose } from '../lib/domain/payment-requirement.ts';

function rule(overrides: Partial<CommercialVariantRule> = {}): CommercialVariantRule {
  return {
    variantId: overrides.variantId ?? 'standard',
    minimumQuantity: overrides.minimumQuantity ?? 10,
    quantityStep: overrides.quantityStep ?? 10,
    maximumQuantity: overrides.maximumQuantity === undefined ? 100 : overrides.maximumQuantity,
    tiers: overrides.tiers ?? [
      { minimumQuantity: 10, unitPrice: 25_000 },
      { minimumQuantity: 20, unitPrice: 22_000 },
      { minimumQuantity: 50, unitPrice: 20_000 },
    ],
  };
}

function config(overrides: Partial<CommercialConfigVersion> = {}): CommercialConfigVersion {
  return {
    id: 'commercial-v1',
    productId: 'notebook',
    versionNumber: 1,
    currency: 'VND',
    paymentPolicy: { kind: 'fixed_deposit', depositAmount: 50_000 },
    variantRules: [rule()],
    ...overrides,
  };
}

test('validateQuantity enforces minimum, step, maximum, and safe integer boundaries', () => {
  const quantityRule = rule();
  assert.equal(validateQuantity(quantityRule, 9), false);
  assert.equal(validateQuantity(quantityRule, 10), true);
  assert.equal(validateQuantity(quantityRule, 20), true);
  assert.equal(validateQuantity(quantityRule, 100), true);
  assert.equal(validateQuantity(quantityRule, 110), false);
  assert.equal(validateQuantity(quantityRule, Number.MAX_SAFE_INTEGER), false);
  assert.equal(validateQuantity(quantityRule, 10.5), false);
});

test('calculatePrice selects highest applicable tier at 10/19/20/49/50', () => {
  const commercialConfig = config({
    paymentPolicy: { kind: 'full_payment' },
    variantRules: [rule({ quantityStep: 1 })],
  });
  assert.equal(validateQuantity(rule(), 11), false);
  for (const [quantity, expectedUnit] of [[10, 25_000], [19, 25_000], [20, 22_000], [49, 22_000], [50, 20_000]] as const) {
    const result = calculatePrice(commercialConfig, 'standard', quantity);
    assert.equal(result.quantity, quantity);
    assert.equal(result.appliedTier.minimumQuantity, expectedUnit === 25_000 ? 10 : expectedUnit === 22_000 ? 20 : 50);
    assert.equal(result.unitPrice, expectedUnit);
    assert.equal(result.subtotal, expectedUnit * quantity);
    assert.equal(result.totalAmount, result.subtotal);
    assert.equal(result.amountDueNow, result.totalAmount);
    assert.equal(result.remainingAmount, 0);
  }
});

test('calculatePrice rejects invalid or missing configured variants without static fallback', () => {
  assert.throws(() => calculatePrice(config(), 'missing', 10), /variant/i);
  assert.throws(() => calculatePrice(config(), 'standard', 11), /Số lượng/);
});

test('validateCommercialConfig rejects invalid tier structure and unreachable tiers', () => {
  const cases: CommercialConfigVersion[] = [
    config({ variantRules: [rule({ tiers: [{ minimumQuantity: 9, unitPrice: 25_000 }] })] }),
    config({ variantRules: [rule({ tiers: [{ minimumQuantity: 10, unitPrice: 25_000 }, { minimumQuantity: 10, unitPrice: 20_000 }] })] }),
    config({ variantRules: [rule({ tiers: [{ minimumQuantity: 10, unitPrice: 25_000 }, { minimumQuantity: 50, unitPrice: 20_000 }, { minimumQuantity: 20, unitPrice: 22_000 }] })] }),
    config({ variantRules: [rule({ tiers: [{ minimumQuantity: 10, unitPrice: 25_000 }, { minimumQuantity: 15, unitPrice: 20_000 }] })] }),
    config({ variantRules: [rule({ tiers: [] })] }),
    config({ variantRules: [rule({ tiers: [{ minimumQuantity: 10, unitPrice: 0 }] })] }),
  ];
  for (const invalid of cases) assert.notEqual(validateCommercialConfig(invalid, ['standard']).length, 0);
});

test('validateCommercialConfig checks active variants, currency, bounds, and fixed deposit at reachable tier starts', () => {
  assert.match(validateCommercialConfig(config({ currency: 'USD' as 'VND' }), ['standard']).join('\n'), /currency/i);
  assert.notEqual(validateCommercialConfig(config(), ['standard', 'missing']).length, 0);
  assert.notEqual(validateCommercialConfig(config({ variantRules: [rule({ maximumQuantity: 5 })] }), ['standard']).length, 0);

  const discountedLater = config({
    paymentPolicy: { kind: 'fixed_deposit', depositAmount: 1_001 },
    variantRules: [rule({ tiers: [{ minimumQuantity: 10, unitPrice: 1_000 }, { minimumQuantity: 20, unitPrice: 50 }] })],
  });
  assert.match(validateCommercialConfig(discountedLater, ['standard']).join('\n'), /deposit/i);
});

test('fixed deposit calculation returns due now and remaining amounts', () => {
  const result = calculatePrice(config({
    paymentPolicy: { kind: 'fixed_deposit', depositAmount: 50_000 },
    variantRules: [rule({ tiers: [{ minimumQuantity: 10, unitPrice: 20_000 }] })],
  }), 'standard', 10);
  assert.equal(result.totalAmount, 200_000);
  assert.equal(result.amountDueNow, 50_000);
  assert.equal(result.remainingAmount, 150_000);
});

test('payment requirement domain exposes purpose and lifecycle definitions', () => {
  const purpose: PaymentPurpose = 'checkout_deposit';
  const requirement: PaymentRequirement = {
    id: 'pay-1',
    orderId: 'order-1',
    purpose,
    amount: 50_000,
    currency: 'VND',
    status: 'pending_payment',
  };
  assert.equal(requirement.purpose, purpose);
});

test('formatCurrencyVND formats integer VND amounts', () => {
  assert.equal(formatCurrencyVND(200_000), '200.000đ');
  assert.equal(formatCurrencyVND(1_500_000), '1.500.000đ');
});
