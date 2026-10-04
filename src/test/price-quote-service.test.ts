import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PriceCalculation } from '../lib/domain/commercial-config.ts';
import {
  createPriceQuote,
  type CreatePriceQuoteInput,
  type PriceQuote,
} from '../lib/services/price-quote-service.ts';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';

describe('Price Quote Service', () => {
  it('creates authoritative price quote ignoring client-supplied price', async () => {
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'active',
      revision: 1,
      currentCommercialConfigVersionId: 'ver-card-1',
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
    repo.seedCommercialVersion({
      id: 'ver-card-1',
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
          tiers: [
            { minimumQuantity: 1, unitPrice: 29000 },
            { minimumQuantity: 10, unitPrice: 25000 },
          ],
        },
      ],
    });

    const input: CreatePriceQuoteInput = {
      productId: 'card',
      variantId: 'horizontal',
      quantity: 10,
      checkoutKey: 'guest-session-123',
      clientProvidedPrice: 1000, // tampered client price!
    };

    const quote = await createPriceQuote(input, { repo });
    assert.ok(quote.id);
    assert.equal(quote.productId, 'card');
    assert.equal(quote.variantId, 'horizontal');
    assert.equal(quote.commercialConfigVersionId, 'ver-card-1');
    assert.equal(quote.quantity, 10);
    // Unit price is calculated server-side: 25,000 VND (tier 10), total 250,000 VND
    assert.equal(quote.calculation.unitPrice, 25000);
    assert.equal(quote.calculation.totalAmount, 250000);
    assert.notEqual(quote.calculation.totalAmount, 1000);
    assert.ok(quote.checkoutKeyHash);
    assert.ok(quote.expiresAt);

    // Persisted in repo
    const persisted = await repo.getPriceQuote(quote.id);
    assert.ok(persisted);
    assert.equal(persisted?.id, quote.id);
  });

  it('rejects quote creation for draft or archived product', async () => {
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'draft-card',
      slug: 'draft-card',
      name: 'Thiệp Nháp',
      productType: 'card',
      status: 'draft',
      revision: 1,
      currentCommercialConfigVersionId: 'ver-draft-1',
    });
    repo.seedVariant({
      id: 'horizontal',
      productId: 'draft-card',
      name: 'Ngang',
      price: 29000,
      status: 'active',
      definitionKey: 'card:horizontal',
      revision: 1,
    });

    const input: CreatePriceQuoteInput = {
      productId: 'draft-card',
      variantId: 'horizontal',
      quantity: 1,
      checkoutKey: 'key-1',
    };

    await assert.rejects(
      () => createPriceQuote(input, { repo }),
      /PRODUCT_NOT_SELLABLE/,
    );
  });

  it('rejects quote creation for draft or archived variant', async () => {
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'active',
      revision: 1,
      currentCommercialConfigVersionId: 'ver-card-1',
    });
    repo.seedVariant({
      id: 'archived-var',
      productId: 'card',
      name: 'Cũ',
      price: 29000,
      status: 'archived',
      definitionKey: 'card:horizontal',
      revision: 1,
    });

    const input: CreatePriceQuoteInput = {
      productId: 'card',
      variantId: 'archived-var',
      quantity: 1,
      checkoutKey: 'key-2',
    };

    await assert.rejects(
      () => createPriceQuote(input, { repo }),
      /VARIANT_NOT_SELLABLE/,
    );
  });

  it('rejects quote creation for invalid quantity outside rule bounds or step', async () => {
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'active',
      revision: 1,
      currentCommercialConfigVersionId: 'ver-card-1',
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
    repo.seedCommercialVersion({
      id: 'ver-card-1',
      productId: 'card',
      versionNumber: 1,
      currency: 'VND',
      paymentPolicy: { kind: 'full_payment' },
      variantRules: [
        {
          variantId: 'horizontal',
          minimumQuantity: 5,
          quantityStep: 5,
          maximumQuantity: 50,
          tiers: [{ minimumQuantity: 5, unitPrice: 29000 }],
        },
      ],
    });

    // 1. Below minimum (4 < 5)
    await assert.rejects(
      () => createPriceQuote({ productId: 'card', variantId: 'horizontal', quantity: 4, checkoutKey: 'k' }, { repo }),
      /INVALID_QUANTITY/,
    );

    // 2. Invalid step ((7 - 5) % 5 !== 0)
    await assert.rejects(
      () => createPriceQuote({ productId: 'card', variantId: 'horizontal', quantity: 7, checkoutKey: 'k' }, { repo }),
      /INVALID_QUANTITY/,
    );

    // 3. Above maximum (55 > 50)
    await assert.rejects(
      () => createPriceQuote({ productId: 'card', variantId: 'horizontal', quantity: 55, checkoutKey: 'k' }, { repo }),
      /INVALID_QUANTITY/,
    );
  });

  it('sets 30 minute expiry and populates payment policy breakdown', async () => {
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'sticker',
      slug: 'sticker',
      name: 'Sticker',
      productType: 'sticker',
      status: 'active',
      revision: 1,
      currentCommercialConfigVersionId: 'ver-sticker-1',
    });
    repo.seedVariant({
      id: 'die-cut',
      productId: 'sticker',
      name: 'Die-cut',
      price: 15000,
      status: 'active',
      definitionKey: 'sticker:die-cut',
      revision: 1,
    });
    repo.seedCommercialVersion({
      id: 'ver-sticker-1',
      productId: 'sticker',
      versionNumber: 1,
      currency: 'VND',
      paymentPolicy: { kind: 'fixed_deposit', depositAmount: 50000 },
      variantRules: [
        {
          variantId: 'die-cut',
          minimumQuantity: 10,
          quantityStep: 5,
          maximumQuantity: null,
          tiers: [{ minimumQuantity: 10, unitPrice: 15000 }],
        },
      ],
    });

    const before = Date.now();
    const quote = await createPriceQuote({
      productId: 'sticker',
      variantId: 'die-cut',
      quantity: 10,
      checkoutKey: 'session-sticker-99',
    }, { repo });
    const after = Date.now();

    const expiresAtMs = new Date(quote.expiresAt).getTime();
    // Expected TTL is approx 30 minutes (1,800,000 ms)
    assert.ok(expiresAtMs >= before + 29 * 60 * 1000);
    assert.ok(expiresAtMs <= after + 31 * 60 * 1000);

    assert.equal(quote.calculation.totalAmount, 150000);
    assert.equal(quote.calculation.amountDueNow, 50000);
    assert.equal(quote.calculation.remainingAmount, 100000);
  });
});
