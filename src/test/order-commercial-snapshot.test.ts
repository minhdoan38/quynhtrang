import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';
import { setSharedCatalogRepositoryForTest } from '../lib/repositories/price-quote-repository.ts';
import { createInitialState } from '../lib/product-state.ts';
import { createPriceQuote } from '../lib/services/price-quote-service.ts';
import { prepareOrderFromGuestCheckout } from '../lib/services/prepare-order-from-guest-checkout.ts';
import { createServerOrderPreparationOptions, serverOrderStore } from '../lib/server-order-store.ts';
import { POST as createOrderRoute } from '../app/api/orders/route.ts';

function catalog() {
  const repo = new AdminCatalogRepository(null);
  repo.seedProduct({
    id: 'card',
    slug: 'card',
    name: 'Thiệp v1',
    productType: 'card',
    status: 'active',
    revision: 1,
    currentCommercialConfigVersionId: 'version-1',
  });
  repo.seedVariant({
    id: 'horizontal',
    productId: 'card',
    name: 'Ngang v1',
    price: 29000,
    status: 'active',
    revision: 1,
    definitionKey: 'card:horizontal',
  });
  repo.seedCommercialVersion({
    id: 'version-1',
    productId: 'card',
    versionNumber: 1,
    currency: 'VND',
    paymentPolicy: { kind: 'fixed_deposit', depositAmount: 50000 },
    variantRules: [
      {
        variantId: 'horizontal',
        minimumQuantity: 10,
        quantityStep: 5,
        maximumQuantity: 100,
        tiers: [{ minimumQuantity: 10, unitPrice: 29000 }],
      },
    ],
  });
  return repo;
}

test('order snapshots quote economics and ignores catalog changes after creation', async () => {
  const repo = catalog();
  const quote = await createPriceQuote(
    { productId: 'card', variantId: 'horizontal', quantity: 10, checkoutKey: 'order-snapshot-key' },
    { repo },
  );

  const result = await prepareOrderFromGuestCheckout(
    {
      idempotencyKey: 'order-snapshot-key',
      quoteId: quote.id,
      design: { ...createInitialState('card'), quantity: 10 },
      customer: { fullName: 'Nguyễn An', phone: '0901234567', shippingAddress: 'Hà Nội' },
      designRevision: 'rev-1',
      preflightRevision: 'rev-1',
      preflightAcknowledged: true,
    },
    { ...createServerOrderPreparationOptions(), catalogRepo: repo },
  );

  assert.deepEqual(result.order.commercialSnapshot, {
    productId: 'card',
    productName: 'Thiệp v1',
    variantId: 'horizontal',
    variantName: 'Ngang v1',
    definitionKey: 'card:horizontal',
    commercialConfigVersionId: 'version-1',
    tierMinimumQuantity: 10,
    quantity: 10,
    unitPrice: 29000,
    subtotal: 290000,
    total: 290000,
    currency: 'VND',
    paymentPolicy: { kind: 'fixed_deposit', depositAmount: 50000 },
    depositAmount: 50000,
    amountDueNow: 50000,
    remainingAmount: 240000,
  });

  // Mutating catalog with v2 higher price does not reprice existing order
  repo.seedProduct({
    id: 'card',
    slug: 'card',
    name: 'Thiệp v2',
    productType: 'card',
    status: 'active',
    revision: 2,
    currentCommercialConfigVersionId: 'version-2',
  });
  repo.seedVariant({
    id: 'horizontal',
    productId: 'card',
    name: 'Ngang v2',
    price: 99000,
    status: 'active',
    revision: 2,
    definitionKey: 'card:horizontal',
  });

  assert.equal(result.order.commercialSnapshot.productName, 'Thiệp v1');
  assert.equal(result.order.payment.amount, 50000);
});

test('quote is marked consumed by order and cannot be reused by another order', async () => {
  const repo = catalog();
  const quote = await createPriceQuote(
    { productId: 'card', variantId: 'horizontal', quantity: 10, checkoutKey: 'consume-test-key' },
    { repo },
  );

  const result = await prepareOrderFromGuestCheckout(
    {
      idempotencyKey: 'consume-test-key',
      quoteId: quote.id,
      design: { ...createInitialState('card'), quantity: 10 },
      customer: { fullName: 'Nguyễn An', phone: '0901234567', shippingAddress: 'Hà Nội' },
      designRevision: 'rev-1',
      preflightRevision: 'rev-1',
      preflightAcknowledged: true,
    },
    { ...createServerOrderPreparationOptions(), catalogRepo: repo },
  );

  // Quote is consumed
  const consumedQuote = await repo.getPriceQuote(quote.id);
  assert.equal(consumedQuote?.consumedOrderId, result.order.id);

  // Another order trying to use the same quote fails with 409
  await assert.rejects(
    () =>
      prepareOrderFromGuestCheckout(
        {
          idempotencyKey: 'second-order-key',
          quoteId: quote.id,
          design: { ...createInitialState('card'), quantity: 10 },
          customer: { fullName: 'Trần B', phone: '0909999999', shippingAddress: 'Đà Nẵng' },
          designRevision: 'rev-1',
          preflightRevision: 'rev-1',
          preflightAcknowledged: true,
        },
        { ...createServerOrderPreparationOptions(), catalogRepo: repo },
      ),
    /Báo giá đã được sử dụng|không khớp/i,
  );
});

test('idempotent resubmission returns original order without creating second payment requirement', async () => {
  const repo = catalog();
  const quote = await createPriceQuote(
    { productId: 'card', variantId: 'horizontal', quantity: 10, checkoutKey: 'idemp-quote-key' },
    { repo },
  );

  const first = await prepareOrderFromGuestCheckout(
    {
      idempotencyKey: 'idemp-quote-key',
      quoteId: quote.id,
      design: { ...createInitialState('card'), quantity: 10 },
      customer: { fullName: 'Nguyễn An', phone: '0901234567', shippingAddress: 'Hà Nội' },
      designRevision: 'rev-1',
      preflightRevision: 'rev-1',
      preflightAcknowledged: true,
    },
    { ...createServerOrderPreparationOptions(), catalogRepo: repo },
  );

  const second = await prepareOrderFromGuestCheckout(
    {
      idempotencyKey: 'idemp-quote-key',
      quoteId: quote.id,
      design: { ...createInitialState('card'), quantity: 10 },
      customer: { fullName: 'Nguyễn An', phone: '0901234567', shippingAddress: 'Hà Nội' },
      designRevision: 'rev-1',
      preflightRevision: 'rev-1',
      preflightAcknowledged: true,
    },
    { ...createServerOrderPreparationOptions(), catalogRepo: repo },
  );

  assert.equal(second.order.id, first.order.id);
  assert.equal(second.paymentData.amount, first.paymentData.amount);
});

test('quote binding rejects mismatched checkout key before order creation', async () => {
  const repo = catalog();
  const quote = await createPriceQuote(
    { productId: 'card', variantId: 'horizontal', quantity: 10, checkoutKey: 'bound-key' },
    { repo },
  );
  await assert.rejects(
    () =>
      prepareOrderFromGuestCheckout(
        {
          idempotencyKey: 'other-key',
          quoteId: quote.id,
          design: { ...createInitialState('card'), quantity: 10 },
          customer: { fullName: 'Nguyễn An', phone: '0901234567', shippingAddress: 'Hà Nội' },
          designRevision: 'rev-1',
          preflightRevision: 'rev-1',
          preflightAcknowledged: true,
        },
        { ...createServerOrderPreparationOptions(), catalogRepo: repo },
      ),
    /không hợp lệ|không khớp|checkout/i,
  );
});

test('POST /api/orders ignores forged client-supplied money and snapshots quote authoritative values', async () => {
  serverOrderStore.clear();
  const repo = catalog();
  setSharedCatalogRepositoryForTest(repo);

  try {
    const quote = await createPriceQuote(
      { productId: 'card', variantId: 'horizontal', quantity: 10, checkoutKey: 'forge-money-key' },
      { repo },
    );

    const forgedReq = new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'forge-money-key',
        quoteId: quote.id,
        unitPrice: 1, // Tampered client money
        total: 10,
        subtotal: 10,
        amountDueNow: 1,
        design: { ...createInitialState('card'), quantity: 10 },
        customer: { fullName: 'Nguyễn Văn B', phone: '0901234567', shippingAddress: '123 Đường Hoa Lan, Quận 1, TP.HCM' },
        designRevision: 'rev-1',
        preflightRevision: 'rev-1',
        preflightAcknowledged: true,
      }),
    });
    const res = await createOrderRoute(forgedReq);
    const body = await res.json();

    assert.equal(body.order.commercialSnapshot.unitPrice, 29000);
    assert.equal(body.order.commercialSnapshot.total, 290000);
    assert.equal(body.order.commercialSnapshot.amountDueNow, 50000);
    assert.equal(body.paymentData.amount, 50000);
  } finally {
    setSharedCatalogRepositoryForTest(null);
  }
});

test('legacy fallback in-memory store exposes complete commercialSnapshot structure', () => {
  serverOrderStore.clear();
  const order = serverOrderStore.createOrder(
    { ...createInitialState('card'), quantity: 5 },
    { fullName: 'Fallback User', phone: '0901234567', shippingAddress: 'Hà Nội' },
    'fallback-key-1',
  );

  assert.ok(order.commercialSnapshot);
  assert.equal(order.commercialSnapshot.quantity, 5);
  assert.equal(order.commercialSnapshot.unitPrice, 29000);
  assert.equal(order.commercialSnapshot.total, 145000);
  assert.equal(order.commercialSnapshot.currency, 'VND');
  assert.equal(order.commercialSnapshot.paymentPolicy.kind, 'full_payment');
  assert.equal(order.commercialSnapshot.amountDueNow, 145000);
  assert.equal(order.commercialSnapshot.remainingAmount, 0);
});
