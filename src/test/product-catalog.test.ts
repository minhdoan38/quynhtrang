import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveProductIdFromSlug,
  getCatalogProductBySlug,
  getCatalogProduct,
  getCanonicalSlug,
  getAllCatalogProducts,
  getPublishedProducts,
  getPublishedTemplates,
  ALL_PRODUCT_SLUGS,
} from '../lib/product-catalog.ts';
import { getCompatibleTemplates } from '../lib/product-state.ts';

test('resolves canonical and alternate slugs to ProductId', () => {
  assert.equal(resolveProductIdFromSlug('wrapping-paper'), 'wrapping');
  assert.equal(resolveProductIdFromSlug('wrapping'), 'wrapping');
  assert.equal(resolveProductIdFromSlug('card'), 'card');
  assert.equal(resolveProductIdFromSlug('greeting-card'), 'card');
  assert.equal(resolveProductIdFromSlug('sticker'), 'sticker');
  assert.equal(resolveProductIdFromSlug('stickers'), 'sticker');
  assert.equal(resolveProductIdFromSlug('notebook-cover'), 'notebook');
  assert.equal(resolveProductIdFromSlug('notebook'), 'notebook');
  assert.equal(resolveProductIdFromSlug('unknown-slug'), null);
  assert.equal(resolveProductIdFromSlug(''), null);
});

test('retrieves complete catalog product details by slug', () => {
  const card = getCatalogProductBySlug('card');
  assert.ok(card);
  assert.equal(card.id, 'card');
  assert.equal(card.name, 'Thiệp chúc mừng');
  assert.equal(card.englishName, 'Greeting Card');
  assert.ok(card.paperSpecs.paperType.length > 0);
  assert.ok(card.variants.length >= 2);
  assert.ok(card.startingPrice > 0);
  assert.equal(getCatalogProduct('card').id, 'card');
  assert.ok(card.startingPrice > 0);
});

test('retrieves all 4 physical products in Soft Paper Studio catalog', () => {
  const products = getAllCatalogProducts();
  assert.equal(products.length, 4);
  const ids = products.map((p) => p.id);
  assert.deepEqual(ids, ['wrapping', 'card', 'sticker', 'notebook']);

  for (const p of products) {
    assert.ok(p.tagline.length > 0);
    assert.ok(p.description.length > 0);
    assert.ok(p.capabilities.length >= 2);
    assert.ok(p.tone.bg.startsWith('bg-'));
    assert.ok(p.tone.border.startsWith('border-'));
  }
});

test('canonical slug helper returns expected URLs', () => {
  assert.equal(getCanonicalSlug('wrapping'), 'wrapping-paper');
  assert.equal(getCanonicalSlug('card'), 'card');
  assert.equal(getCanonicalSlug('sticker'), 'sticker');
  assert.equal(getCanonicalSlug('notebook'), 'notebook-cover');
  for (const slug of ALL_PRODUCT_SLUGS) {
    const product = getCatalogProductBySlug(slug);
    assert.ok(product);
  }
});

test('filters templates with all-variant selection', () => {
  const allCardTemplates = getCompatibleTemplates({
    productId: 'card',
    variantId: 'all',
  });
  const allCardIds = allCardTemplates.map((t) => t.id);

  // Both horizontal and vertical templates should be present when variantId='all'
  assert.ok(allCardIds.includes('card-h-birthday'));
  assert.ok(allCardIds.includes('card-v-floral'));
  assert.ok(!allCardIds.includes('wrapping-a1-cute'));

  // Specific variant filters properly
  const horizontalOnly = getCompatibleTemplates({
    productId: 'card',
    variantId: 'horizontal',
  });
  const horizontalIds = horizontalOnly.map((t) => t.id);
  assert.ok(horizontalIds.includes('card-h-birthday'));
  assert.ok(!horizontalIds.includes('card-v-floral'));

  // Blank canvas template is compatible with all products
  for (const slug of ALL_PRODUCT_SLUGS) {
    const product = getCatalogProductBySlug(slug)!;
    const templates = getCompatibleTemplates({
      productId: product.id,
      variantId: product.variants[0].id,
    });
    assert.ok(templates.some((t) => t.id === 'blank'));
  }
});

test('filters templates by search keywords across name and hints', () => {
  const birthdayTemplates = getCompatibleTemplates({
    productId: 'wrapping',
    variantId: 'all',
    searchQuery: 'sinh nhật',
  });
  assert.ok(birthdayTemplates.length > 0);
  assert.ok(birthdayTemplates.some((t) => t.template.name.toLowerCase().includes('sinh nhật')));
});

test('getPublishedProducts falls back to static catalog products with variants and tone', async () => {
  const products = await getPublishedProducts();
  assert.equal(products.length, 4);
  const ids = products.map((p) => p.id);
  assert.deepEqual(ids, ['wrapping', 'card', 'sticker', 'notebook']);
  for (const p of products) {
    assert.ok(p.variants.length > 0);
    assert.ok(p.tone.badgeVariant);
    assert.ok(p.startingPrice > 0);
  }
});

test('getPublishedTemplates returns published templates and supports productId filtering with offline fallback', async () => {
  const allTemplates = await getPublishedTemplates();
  assert.ok(allTemplates.length >= 10);

  const cardTemplates = await getPublishedTemplates('card');
  assert.ok(cardTemplates.length > 0);
  assert.ok(cardTemplates.every((t) => !t.productId || t.productId === 'card'));
});
