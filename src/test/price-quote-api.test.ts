import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';
import { POST, GET } from '../app/api/quotes/route.ts';
import { calculatePrice, PRICE_QUOTE_TTL_MS } from '../lib/domain/commercial-config.ts';
import { createCheckoutDraft, loadCheckoutDraft, saveCheckoutDraft, attachQuoteToDraft, isQuoteExpired } from '../lib/checkout-draft.ts';
import { createInitialState } from '../lib/product-state.ts';
import { prepareOrderFromGuestCheckout, OrderPreparationError } from '../lib/services/prepare-order-from-guest-checkout.ts';
import { createServerOrderPreparationOptions } from '../lib/server-order-store.ts';

function setupSessionStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
    },
  });
  return values;
}

function createTestCatalog() {
  const repo = new AdminCatalogRepository(null);

  repo.seedProduct({
    id: 'card',
    slug: 'card',
    name: 'Thiệp chúc mừng',
    productType: 'card',
    status: 'active',
    revision: 1,
    currentCommercialConfigVersionId: 'ver-card-1',
  });

  repo.seedVariant({
    id: 'horizontal',
    productId: 'card',
    name: 'Ngang',
    price: 25000,
    status: 'active',
    definitionKey: 'card:horizontal',
    revision: 1,
  });

  repo.seedCommercialVersion({
    id: 'ver-card-1',
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
        tiers: [
          { minimumQuantity: 10, unitPrice: 25000 },
          { minimumQuantity: 50, unitPrice: 20000 },
        ],
      },
    ],
  });

  return repo;
}

describe('Price Quote API & Commercial Checkout UX', () => {
  it('1. Min/step/max derive from configuration and reject invalid quantities', async () => {
    const repo = createTestCatalog();

    // Valid quantity: 10 (meets min 10, step 5)
    const validReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-test-1',
      }),
    });
    const validRes = await POST(validReq, { repo });
    assert.equal(validRes.status, 200);
    const validData = await validRes.json();
    assert.ok(validData.quote);
    assert.equal(validData.quote.quantity, 10);
    assert.equal(validData.quote.calculation.totalAmount, 250000);

    // Invalid quantity: 12 (fails quantityStep 5)
    const invalidStepReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 12,
        checkoutKey: 'key-test-1',
      }),
    });
    const invalidStepRes = await POST(invalidStepReq, { repo });
    assert.equal(invalidStepRes.status, 400);
    const stepErr = await invalidStepRes.json();
    assert.match(stepErr.error, /Số lượng không hợp lệ/);

    // Invalid quantity: 5 (below min 10)
    const belowMinReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 5,
        checkoutKey: 'key-test-1',
      }),
    });
    const belowMinRes = await POST(belowMinReq, { repo });
    assert.equal(belowMinRes.status, 400);

    // Invalid quantity: 105 (above max 100)
    const aboveMaxReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 105,
        checkoutKey: 'key-test-1',
      }),
    });
    const aboveMaxRes = await POST(aboveMaxReq, { repo });
    assert.equal(aboveMaxRes.status, 400);
  });

  it('2. Client-forged total is ignored/rejected; server quote governs', async () => {
    const repo = createTestCatalog();

    const forgeReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-forge-1',
        clientProvidedPrice: 1000, // Forged client price
        subtotal: 1000,
        totalAmount: 1000,
      }),
    });

    const res = await POST(forgeReq, { repo });
    assert.equal(res.status, 200);
    const data = await res.json();
    // Server quote authoritative total must be 250,000 VND (10 * 25,000 VND), not 1,000 VND
    assert.equal(data.quote.calculation.totalAmount, 250000);
    assert.equal(data.quote.calculation.unitPrice, 25000);
    assert.notEqual(data.quote.calculation.totalAmount, 1000);
  });

  it('3. Valid v1 quote remains v1 after v2 publication until expiry', async () => {
    const repo = createTestCatalog();

    // 1. Create quote under v1
    const createReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-v1-test',
      }),
    });
    const createRes = await POST(createReq, { repo });
    assert.equal(createRes.status, 200);
    const { quote: q1 } = await createRes.json();
    assert.equal(q1.commercialConfigVersionId, 'ver-card-1');
    assert.equal(q1.calculation.unitPrice, 25000);

    // 2. Publish v2 with higher price: 35,000 VND
    repo.seedCommercialVersion({
      id: 'ver-card-2',
      productId: 'card',
      versionNumber: 2,
      currency: 'VND',
      paymentPolicy: { kind: 'full_payment' },
      variantRules: [
        {
          variantId: 'horizontal',
          minimumQuantity: 10,
          quantityStep: 5,
          maximumQuantity: 100,
          tiers: [{ minimumQuantity: 10, unitPrice: 35000 }],
        },
      ],
    });
    const product = repo.getProduct('card');
    assert.ok(product);
    product.currentCommercialConfigVersionId = 'ver-card-2';
    repo.seedProduct(product);

    // 3. Verify quote Q1: still returns v1 version & price because it is unexpired
    const getReq = new Request(`http://localhost/api/quotes?id=${q1.id}`);
    const getRes = await GET(getReq, { repo });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.quote.id, q1.id);
    assert.equal(getData.quote.commercialConfigVersionId, 'ver-card-1');
    assert.equal(getData.quote.calculation.unitPrice, 25000);
    assert.equal(getData.quote.calculation.totalAmount, 250000);
    assert.equal(getData.expired, false);
  });

  it('4. Expired v1 refreshes to v2 and requires continuation', async () => {
    const repo = createTestCatalog();

    // 1. Create quote under v1
    const createReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-expire-test',
      }),
    });
    const createRes = await POST(createReq, { repo });
    const { quote: q1 } = await createRes.json();

    // 2. Publish v2
    repo.seedCommercialVersion({
      id: 'ver-card-2',
      productId: 'card',
      versionNumber: 2,
      currency: 'VND',
      paymentPolicy: { kind: 'full_payment' },
      variantRules: [
        {
          variantId: 'horizontal',
          minimumQuantity: 10,
          quantityStep: 5,
          maximumQuantity: 100,
          tiers: [{ minimumQuantity: 10, unitPrice: 35000 }],
        },
      ],
    });
    const product = repo.getProduct('card');
    assert.ok(product);
    product.currentCommercialConfigVersionId = 'ver-card-2';
    repo.seedProduct(product);

    // 3. Fast-forward expiry: manually set q1.expiresAt to 1 minute ago in repo
    const persistedQ1 = await repo.getPriceQuote(q1.id);
    assert.ok(persistedQ1);
    persistedQ1.expiresAt = new Date(Date.now() - 60000).toISOString();
    await repo.saveQuote(persistedQ1);

    // Check GET returns expired: true
    const getReq = new Request(`http://localhost/api/quotes?id=${q1.id}`);
    const getRes = await GET(getReq, { repo });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.expired, true);

    // 4. Refresh quote: calls POST /api/quotes with quoteId to refresh
    const refreshReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: q1.id,
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-expire-test',
      }),
    });
    const refreshRes = await POST(refreshReq, { repo });
    assert.equal(refreshRes.status, 200);
    const refreshData = await refreshRes.json();
    assert.ok(refreshData.quote);
    assert.equal(refreshData.refreshed, true);
    assert.equal(refreshData.message, 'Giá sản phẩm vừa được cập nhật.');
    // Upgraded to v2 with 35,000 VND unit price
    assert.equal(refreshData.quote.commercialConfigVersionId, 'ver-card-2');
    assert.equal(refreshData.quote.calculation.unitPrice, 35000);
    assert.equal(refreshData.quote.calculation.totalAmount, 350000);
  });

  it('5. Quantity, design, and customer data survive expiry in checkout draft', () => {
    setupSessionStorage();
    const design = {
      ...createInitialState('card'),
      quantity: 25,
      text: 'Chúc mừng sinh nhật',
      color: '#B3535D',
    };
    const customer = {
      fullName: 'Nguyễn Thị B',
      phone: '0912345678',
      shippingAddress: '789 Trần Hưng Đạo, Q5, TP.HCM',
    };

    const draft = createCheckoutDraft(design, customer);
    const expiredTimestamp = new Date(Date.now() - 1000).toISOString();

    const draftWithQuote = attachQuoteToDraft(draft, {
      id: 'quote-old-1',
      commercialConfigVersionId: 'ver-card-1',
      expiresAt: expiredTimestamp,
      calculation: {
        unitPrice: 25000,
        totalAmount: 625000,
        amountDueNow: 50000,
        remainingAmount: 575000,
      },
    });

    saveCheckoutDraft(draftWithQuote);

    const rehydrated = loadCheckoutDraft();
    assert.ok(rehydrated);
    assert.equal(rehydrated.quantity, 25);
    assert.equal(rehydrated.design.text, 'Chúc mừng sinh nhật');
    assert.equal(rehydrated.design.color, '#B3535D');
    assert.equal(rehydrated.customer.fullName, 'Nguyễn Thị B');
    assert.equal(rehydrated.customer.phone, '0912345678');
    assert.equal(rehydrated.customer.shippingAddress, '789 Trần Hưng Đạo, Q5, TP.HCM');
    assert.equal(rehydrated.priceQuoteId, 'quote-old-1');
    assert.equal(isQuoteExpired(rehydrated), true);

    // Refresh quote updates pricing metadata while leaving design and customer data intact
    const refreshedDraft = attachQuoteToDraft(rehydrated, {
      id: 'quote-new-2',
      commercialConfigVersionId: 'ver-card-2',
      expiresAt: new Date(Date.now() + PRICE_QUOTE_TTL_MS).toISOString(),
      calculation: {
        unitPrice: 35000,
        totalAmount: 875000,
        amountDueNow: 875000,
        remainingAmount: 0,
      },
    });
    saveCheckoutDraft(refreshedDraft);

    const reloaded = loadCheckoutDraft();
    assert.ok(reloaded);
    assert.equal(reloaded.priceQuoteId, 'quote-new-2');
    assert.equal(reloaded.quantity, 25);
    assert.equal(reloaded.design.text, 'Chúc mừng sinh nhật');
    assert.equal(reloaded.customer.fullName, 'Nguyễn Thị B');
    assert.equal(isQuoteExpired(reloaded), false);
  });

  it('6. Archived Product/Variant cannot produce a new quote or order', async () => {
    const repo = createTestCatalog();

    // Archive product
    const product = repo.getProduct('card');
    assert.ok(product);
    product.status = 'archived';
    repo.seedProduct(product);

    // POST /api/quotes rejects archived product
    const quoteReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-archived-1',
      }),
    });
    const quoteRes = await POST(quoteReq, { repo });
    assert.equal(quoteRes.status, 400);
    const err = await quoteRes.json();
    assert.equal(err.error, 'PRODUCT_NOT_SELLABLE');

    // Reactivate product, archive variant
    product.status = 'active';
    repo.seedProduct(product);
    const variant = repo.getVariant('horizontal');
    assert.ok(variant);
    variant.status = 'archived';
    repo.seedVariant(variant);

    const variantReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-archived-2',
      }),
    });
    const variantRes = await POST(variantReq, { repo });
    assert.equal(variantRes.status, 400);
    const varErr = await variantRes.json();
    assert.equal(varErr.error, 'VARIANT_NOT_SELLABLE');

    // Test order creation: unexpired quote for now-archived product must be blocked
    const unexpiredQuote = {
      id: 'quote-pre-archived',
      productId: 'card',
      variantId: 'horizontal',
      commercialConfigVersionId: 'ver-card-1',
      quantity: 10,
      calculation: {
        ...calculatePrice(repo.getCommercialVersion('ver-card-1')!, 'horizontal', 10),
        isDeposit: false,
        appliedTierMinimumQuantity: 10,
      },
      checkoutKeyHash: 'abc',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + PRICE_QUOTE_TTL_MS).toISOString(),
    };
    await repo.saveQuote(unexpiredQuote);

    // Archive product again
    product.status = 'archived';
    repo.seedProduct(product);

    const prepOptions = {
      ...createServerOrderPreparationOptions(),
      catalogRepo: repo,
    };

    await assert.rejects(
      async () => {
        await prepareOrderFromGuestCheckout(
          {
            idempotencyKey: 'idemp-archive-test',
            design: { ...createInitialState('card'), quantity: 10 },
            customer: { fullName: 'Tran C', phone: '0900000000', shippingAddress: '123 Test' },
            designRevision: 'rev-1',
            preflightRevision: 'rev-1',
            preflightAcknowledged: true,
            priceQuoteId: unexpiredQuote.id,
          },
          prepOptions
        );
      },
      (error: unknown) => {
        assert.ok(error instanceof OrderPreparationError);
        assert.equal(error.status, 400);
        assert.match(error.message, /không khả dụng|ngừng kinh doanh/);
        return true;
      }
    );
  });

  it('7. Deposit summary shows Tổng đơn, Thanh toán trước, Còn lại; full payment does not show fake deposit row', async () => {
    const repo = createTestCatalog();

    // 1. Quote with fixed deposit policy
    const depositReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-deposit-1',
      }),
    });
    const depositRes = await POST(depositReq, { repo });
    const depositData = await depositRes.json();
    assert.equal(depositData.quote.calculation.isDeposit, true);
    assert.equal(depositData.quote.calculation.totalAmount, 250000);
    assert.equal(depositData.quote.calculation.amountDueNow, 50000);
    assert.equal(depositData.quote.calculation.remainingAmount, 200000);
    assert.equal(depositData.quote.summaryLabels.totalLabel, 'Tổng đơn');
    assert.equal(depositData.quote.summaryLabels.amountDueNowLabel, 'Thanh toán trước');
    assert.equal(depositData.quote.summaryLabels.remainingAmountLabel, 'Còn lại');

    // 2. Full payment policy
    repo.seedCommercialVersion({
      id: 'ver-card-full',
      productId: 'card',
      versionNumber: 3,
      currency: 'VND',
      paymentPolicy: { kind: 'full_payment' },
      variantRules: [
        {
          variantId: 'horizontal',
          minimumQuantity: 10,
          quantityStep: 5,
          maximumQuantity: 100,
          tiers: [{ minimumQuantity: 10, unitPrice: 25000 }],
        },
      ],
    });
    const product = repo.getProduct('card');
    assert.ok(product);
    product.currentCommercialConfigVersionId = 'ver-card-full';
    repo.seedProduct(product);

    const fullReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-full-1',
      }),
    });
    const fullRes = await POST(fullReq, { repo });
    const fullData = await fullRes.json();
    assert.equal(fullData.quote.calculation.isDeposit, false);
    assert.equal(fullData.quote.calculation.totalAmount, 250000);
    assert.equal(fullData.quote.calculation.amountDueNow, 250000);
    assert.equal(fullData.quote.calculation.remainingAmount, 0);
    assert.equal(fullData.quote.summaryLabels.amountDueNowLabel, undefined);
    assert.equal(fullData.quote.summaryLabels.remainingAmountLabel, undefined);
  });

  it('8. prepareOrderFromGuestCheckout rejects quotes with mismatched product, variant, or quantity', async () => {
    const repo = createTestCatalog();
    const prepOptions = {
      ...createServerOrderPreparationOptions(),
      catalogRepo: repo,
    };

    // Create valid quote for card:horizontal qty 10
    const createReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-mismatch-1',
      }),
    });
    const createRes = await POST(createReq, { repo });
    const { quote } = await createRes.json();

    // 1. Mismatched quantity: design has qty 15, quote has qty 10
    await assert.rejects(
      async () => {
        await prepareOrderFromGuestCheckout(
          {
            idempotencyKey: 'idemp-qty-mismatch',
            design: { ...createInitialState('card'), quantity: 15 },
            customer: { fullName: 'Nguyen A', phone: '0901234567', shippingAddress: '123 Test' },
            designRevision: 'rev-1',
            preflightRevision: 'rev-1',
            preflightAcknowledged: true,
            priceQuoteId: quote.id,
          },
          prepOptions
        );
      },
      (error: unknown) => {
        assert.ok(error instanceof OrderPreparationError);
        assert.match(error.message, /số lượng/);
        return true;
      }
    );

    // 2. Mismatched variant: design has vertical, quote has horizontal
    await assert.rejects(
      async () => {
        await prepareOrderFromGuestCheckout(
          {
            idempotencyKey: 'idemp-variant-mismatch',
            design: { ...createInitialState('card'), variantId: 'vertical', quantity: 10 },
            customer: { fullName: 'Nguyen A', phone: '0901234567', shippingAddress: '123 Test' },
            designRevision: 'rev-1',
            preflightRevision: 'rev-1',
            preflightAcknowledged: true,
            priceQuoteId: quote.id,
          },
          prepOptions
        );
      },
      (error: unknown) => {
        assert.ok(error instanceof OrderPreparationError);
        assert.match(error.message, /biến thể/);
        return true;
      }
    );
  });

  it('9. Quote refresh reflects updated design quantity', async () => {
    const repo = createTestCatalog();

    // Initial quote with qty 10
    const initialReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: 'card',
        variantId: 'horizontal',
        quantity: 10,
        checkoutKey: 'key-qty-update',
      }),
    });
    const initialRes = await POST(initialReq, { repo });
    const { quote: q1 } = await initialRes.json();
    assert.equal(q1.quantity, 10);

    // Refresh with updated qty 25
    const refreshReq = new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: q1.id,
        productId: 'card',
        variantId: 'horizontal',
        quantity: 25,
        checkoutKey: 'key-qty-update',
      }),
    });
    const refreshRes = await POST(refreshReq, { repo });
    const refreshData = await refreshRes.json();
    assert.ok(refreshData.quote);
    assert.equal(refreshData.quote.quantity, 25);
    assert.equal(refreshData.quote.calculation.totalAmount, 625000);
  });
});
