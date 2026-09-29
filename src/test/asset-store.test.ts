import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, type DesignState } from '../lib/product-state.ts';
import { getAsset, promoteDesignAssets } from '../lib/asset-store.ts';
import { calculatePriceQuote } from '../lib/pricing.ts';
import { serverOrderStore } from '../lib/server-order-store.ts';
import type { CustomerInfo } from '../lib/order-types.ts';

test('promotes blob image URLs with metadata and rewrites every design reference', async () => {
  const design: DesignState = {
    ...createInitialState('card'),
    image: {
      src: 'blob:portrait',
      name: 'portrait.png',
      type: 'image/png',
      size: 2048,
      width: 640,
      height: 480,
    },
    elements: [{
      id: 'image-1', type: 'image', x: 0, y: 0, width: 100, height: 100, rotation: 0,
      data: {
        src: 'blob:portrait', originalSrc: 'blob:portrait', type: 'image/png', size: 2048,
        sourceWidth: 640, sourceHeight: 480,
      },
    }],
    productOptions: {
      ...createInitialState('card').productOptions,
      customBackgroundImage: 'blob:background',
    },
  };

  const result = await promoteDesignAssets(design);
  assert.equal(result.promotedAssets.length, 2);
  assert.ok(result.promotedAssets.every((asset) => asset.id.startsWith('/api/assets/asset-')));
  const portrait = result.promotedAssets.find((asset) => asset.sourceKey === 'blob:portrait');
  assert.ok(portrait);
  assert.deepEqual(
    { mimeType: portrait.mimeType, byteSize: portrait.byteSize, width: portrait.width, height: portrait.height },
    { mimeType: 'image/png', byteSize: 2048, width: 640, height: 480 },
  );
  assert.equal(result.rewrittenDesign.image?.src, portrait.id);
  assert.equal(result.rewrittenDesign.elements?.[0].data?.src, portrait.id);
  assert.equal(result.rewrittenDesign.elements?.[0].data?.originalSrc, portrait.id);
  assert.notEqual(result.rewrittenDesign, design);
  // Server-side registry retrieval
  const registered = getAsset(portrait.id);
  assert.ok(registered);
  assert.equal(registered.sourceKey, 'blob:portrait');
  assert.equal(registered.mimeType, 'image/png');
  assert.equal(design.image?.src, 'blob:portrait');
});

test('reuses matching assets by exact source key without duplicates and does not alias different sources', async () => {
  const designA = {
    ...createInitialState('sticker'),
    image: {
      src: 'blob:sticker-a',
      name: 'sticker.webp',
      type: 'image/webp',
      size: 99,
      width: 100,
      height: 100,
    },
  };
  const first = await promoteDesignAssets(designA);
  const second = await promoteDesignAssets(designA, first.promotedAssets);
  assert.deepEqual(second.promotedAssets, first.promotedAssets);
  assert.equal(second.rewrittenDesign.image?.src, first.promotedAssets[0].id);

  // Different image with identical dimensions/metadata must not be aliased by checksum
  const designB = {
    ...createInitialState('sticker'),
    image: {
      src: 'blob:sticker-b',
      name: 'sticker.webp',
      type: 'image/webp',
      size: 99,
      width: 100,
      height: 100,
    },
  };
  const third = await promoteDesignAssets(designB, first.promotedAssets);
  assert.equal(third.promotedAssets.length, 1);
  assert.notEqual(third.promotedAssets[0].id, first.promotedAssets[0].id);
  assert.equal(third.promotedAssets[0].sourceKey, 'blob:sticker-b');
});

test('retains existing assets when design already uses promoted URLs on retry', async () => {
  const initialDesign = {
    ...createInitialState('card'),
    image: {
      src: 'blob:card-photo',
      name: 'card.png',
      type: 'image/png',
      size: 1024,
      width: 400,
      height: 300,
    },
  };
  const initial = await promoteDesignAssets(initialDesign);
  assert.ok(initial.rewrittenDesign.image?.src.startsWith('/api/assets/asset-'));

  // On retry or next phase, design already has /api/assets/ URL
  const retried = await promoteDesignAssets(initial.rewrittenDesign, initial.promotedAssets);
  assert.equal(retried.promotedAssets.length, 1);
  assert.equal(retried.promotedAssets[0].id, initial.promotedAssets[0].id);
  assert.equal(retried.rewrittenDesign.image?.src, initial.promotedAssets[0].id);
});

test('server order store recalculates quote and is idempotent with immutable approved version', () => {
  serverOrderStore.clear();
  const design = { ...createInitialState('card'), quantity: 3 };
  const customer: CustomerInfo = { fullName: 'Test User', phone: '0900000000', shippingAddress: 'Address' };
  const first = serverOrderStore.createOrder({
    idempotencyKey: 'asset-test-key', design, customer, preflightRevision: 'rev-7', preflightAcknowledged: true,
  });
  const expected = calculatePriceQuote({ productId: design.productId, variantId: design.variantId, quantity: design.quantity, productOptions: design.productOptions });
  assert.equal(first.product.subtotal, expected.subtotal);
  assert.equal(first.product.unitPrice, expected.unitPrice);

  design.text = 'mutated';
  const approved = serverOrderStore.getApprovedDesignVersion(first.approvedDesignVersionId);
  assert.ok(approved);
  assert.notEqual(approved.design.text, 'mutated');
  assert.equal(approved.preflightRevision, 'rev-7');
  assert.equal(approved.preflightAcknowledged, true);

  const second = serverOrderStore.createOrder({ idempotencyKey: 'asset-test-key', design: { ...design, text: 'different' }, customer });
  assert.equal(second.id, first.id);
  assert.equal(serverOrderStore.getOrderByKey('asset-test-key')?.id, first.id);
});

test('server order store stores normalized quantity from price quote', () => {
  serverOrderStore.clear();
  const design = { ...createInitialState('card'), quantity: 0 };
  const customer: CustomerInfo = { fullName: 'Test User', phone: '0900000000', shippingAddress: 'Address' };
  const order = serverOrderStore.createOrder({
    idempotencyKey: 'zero-qty-key',
    design,
    customer,
  });

  const quote = calculatePriceQuote({ productId: design.productId, quantity: design.quantity });
  assert.equal(quote.quantity, 1);
  assert.equal(order.product.quantity, 1);
});
