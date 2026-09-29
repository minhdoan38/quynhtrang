import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, type DesignState } from '../lib/product-state.ts';
import { getAsset, promoteDesignAssets, storeAsset } from '../lib/asset-store.ts';
import { calculatePriceQuote } from '../lib/pricing.ts';
import { serverOrderStore } from '../lib/server-order-store.ts';
import { GET as getAssetRoute } from '../app/api/assets/[id]/route.ts';
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

test('asset route serves promoted asset with proper content-type and returns 404 for unknown asset', async () => {
  const design = {
    ...createInitialState('card'),
    image: {
      src: 'blob:serve-test',
      name: 'banner.png',
      type: 'image/png',
      size: 512,
    },
  };
  const { promotedAssets } = await promoteDesignAssets(design);
  const asset = promotedAssets[0];
  const assetId = asset.id.replace(/^\/api\/assets\//, '');

  // 1. Fetch valid asset
  const req = new Request(`http://localhost:3000/api/assets/${assetId}`);
  const res = await getAssetRoute(req, { params: Promise.resolve({ id: assetId }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/png');
  const buffer = await res.arrayBuffer();
  assert.ok(buffer.byteLength > 0);

  // 2. Fetch custom payload data
  storeAsset({
    id: '/api/assets/asset-custom-data',
    sourceKey: 'blob:custom',
    mimeType: 'image/webp',
    byteSize: 12,
    originalUrl: '/api/assets/asset-custom-data',
    data: 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
  });
  const customRes = await getAssetRoute(
    new Request('http://localhost:3000/api/assets/asset-custom-data'),
    { params: Promise.resolve({ id: 'asset-custom-data' }) },
  );
  assert.equal(customRes.status, 200);
  assert.equal(customRes.headers.get('Content-Type'), 'image/webp');

  // 3. Fetch non-existent asset returns 404
  const unknownReq = new Request('http://localhost:3000/api/assets/non-existent-id');
  const unknownRes = await getAssetRoute(unknownReq, { params: Promise.resolve({ id: 'non-existent-id' }) });
  assert.equal(unknownRes.status, 404);
});

test('promotes asset with payload and serves real artwork payload from route', async () => {
  const rawArtwork = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x42]);
  const design = {
    ...createInitialState('card'),
    image: {
      src: 'blob:artwork-full',
      name: 'artwork.png',
      type: 'image/png',
      payload: rawArtwork,
    },
  };

  const { promotedAssets, rewrittenDesign } = await promoteDesignAssets(design);
  const asset = promotedAssets[0];
  assert.ok(asset);
  assert.equal(rewrittenDesign.image?.src, asset.id);
  assert.equal(asset.payload, Buffer.from(rawArtwork).toString('base64'));
  const assetId = asset.id.replace(/^\/api\/assets\//, '');
  const req = new Request(`http://localhost:3000/api/assets/${assetId}`);
  const res = await getAssetRoute(req, { params: Promise.resolve({ id: assetId }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/png');

  const servedBuffer = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual(servedBuffer, rawArtwork);
});

test('normalizes binary payloads before approved-version JSON storage', async () => {
  serverOrderStore.clear();
  const rawArtwork = Buffer.from([0xfb, 0xef]);
  const design = {
    ...createInitialState('card'),
    image: {
      src: 'blob:approved-artwork',
      name: 'approved.png',
      type: 'image/png',
      payload: rawArtwork,
    },
  };

  const { promotedAssets } = await promoteDesignAssets(design);
  const expectedPayload = rawArtwork.toString('base64');
  assert.equal(promotedAssets[0].payload, expectedPayload);
  assert.equal(getAsset(promotedAssets[0].id)?.payload, expectedPayload);

  const order = serverOrderStore.createOrder({
    idempotencyKey: 'approved-binary-payload',
    design,
    customer: { fullName: 'Test User', phone: '0900000000', shippingAddress: 'Address' },
    assets: promotedAssets,
  });
  const version = serverOrderStore.getApprovedDesignVersion(order.approvedDesignVersionId);
  assert.equal(version?.assets[0].payload, expectedPayload);
  assert.equal(JSON.parse(JSON.stringify(version)).assets[0].payload, expectedPayload);
});

test('asset route decodes unpadded, whitespace-wrapped, and data URL base64 payloads', async () => {
  const expected = new Uint8Array([0xfb, 0xef]);
  const payloads = ['++8', ' ++\n8= \t', 'data:image/png;base64,++8='];

  for (const [index, payload] of payloads.entries()) {
    const id = `/api/assets/asset-base64-${index}`;
    storeAsset({
      id,
      sourceKey: `blob:base64-${index}`,
      mimeType: 'image/png',
      byteSize: expected.byteLength,
      originalUrl: id,
      payload,
    });
    const response = await getAssetRoute(
      new Request(`http://localhost:3000${id}`),
      { params: Promise.resolve({ id: id.replace('/api/assets/', '') }) },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expected);
  }
});

test('asset store preserves and serves raw SVG artwork text', async () => {
  const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Artwork</text></svg>';
  const id = '/api/assets/asset-raw-svg';
  const stored = storeAsset({
    id,
    sourceKey: 'blob:raw-svg',
    mimeType: 'image/svg+xml',
    byteSize: Buffer.byteLength(rawSvg),
    originalUrl: id,
    payload: rawSvg,
  });

  assert.equal(stored.payload, Buffer.from(rawSvg, 'utf8').toString('base64'));
  const response = await getAssetRoute(
    new Request(`http://localhost:3000${id}`),
    { params: Promise.resolve({ id: 'asset-raw-svg' }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/svg+xml');
  assert.equal(await response.text(), rawSvg);
  // Also verify raw SVG passed through asset.data directly
  const dataSvgId = '/api/assets/asset-raw-svg-data';
  storeAsset({
    id: dataSvgId,
    sourceKey: 'blob:raw-svg-data',
    mimeType: 'image/svg+xml',
    byteSize: Buffer.byteLength(rawSvg),
    originalUrl: dataSvgId,
    data: rawSvg,
  });
  const dataResponse = await getAssetRoute(
    new Request(`http://localhost:3000${dataSvgId}`),
    { params: Promise.resolve({ id: 'asset-raw-svg-data' }) },
  );
  assert.equal(dataResponse.status, 200);
  assert.equal(dataResponse.headers.get('Content-Type'), 'image/svg+xml');
  assert.equal(await dataResponse.text(), rawSvg);
});
