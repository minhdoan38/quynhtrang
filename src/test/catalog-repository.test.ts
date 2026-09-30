import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mapFontRow,
  mapProductRow,
  mapStickerRow,
  mapTemplateRow,
  mapVariantRow,
} from '../lib/domain/catalog.ts';
import { CatalogRepository } from '../lib/repositories/catalog-repository.ts';
import { getPublishedProducts, getPublishedTemplates } from '../lib/product-catalog.ts';
import { loadPublishedFonts } from '../lib/fonts.ts';
import { getPublishedStickers } from '../lib/add-content.ts';

class CatalogClient {
  readonly results: Record<string, { data: unknown; error: unknown }>;
  readonly orClauses: string[] = [];

  constructor(results: Record<string, { data: unknown; error: unknown }>) {
    this.results = results;
  }

  from(table: string) {
    const result = this.results[table] ?? { data: [], error: null };
    const query = {
      select: () => query,
      eq: () => query,
      or: (clause: string) => {
        this.orClauses.push(clause);
        return query;
      },
      order: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  }
}

test('catalog row mappers convert database rows to published models', () => {
  assert.deepEqual(mapProductRow({
    id: 'card', slug: 'card', name: 'Thiệp', product_type: 'card', active: true,
    metadata: { englishName: 'Card', cardTitle: 'Thiệp', variantSummary: '2 kiểu', tagline: 'Tag', description: 'Desc', startingPrice: 29000, capabilities: ['Fold'], paperSpecs: { paperType: 'Ivory', printSurfaces: '3', packaging: 'Envelope' }, tone: { bg: '#fff' } },
  }), {
    id: 'card', slug: 'card', name: 'Thiệp', productType: 'card', active: true,
    englishName: 'Card', cardTitle: 'Thiệp', variantSummary: '2 kiểu', tagline: 'Tag', description: 'Desc', startingPrice: 29000, capabilities: ['Fold'], paperSpecs: { paperType: 'Ivory', printSurfaces: '3', packaging: 'Envelope' }, tone: { bg: '#fff' },
  });
  assert.deepEqual(mapVariantRow({ id: 'horizontal', product_id: 'card', name: 'Ngang', price: 29000, active: true, metadata: { dimensions: '15x10', bestFor: 'Ảnh' } }), {
    id: 'horizontal', productId: 'card', name: 'Ngang', price: 29000, active: true, dimensions: '15x10', bestFor: 'Ảnh',
  });
  assert.deepEqual(mapTemplateRow({ id: 'birthday', product_id: 'card', slug: 'birthday', name: 'Sinh nhật', published: true, thumbnail_path: 'templates/a.png', metadata: { category: 'birthday', variantIds: ['horizontal'], previewHint: 'Ấm áp' } }), {
    id: 'birthday', productId: 'card', slug: 'birthday', name: 'Sinh nhật', thumbnailPath: 'templates/a.png', category: 'birthday', variantIds: ['horizontal'], previewHint: 'Ấm áp', metadata: { category: 'birthday', variantIds: ['horizontal'], previewHint: 'Ấm áp' },
  });
  assert.deepEqual(mapFontRow({ id: 'lora', family_name: 'Lora', google_font: 'Lora:wght@500', storage_path: null, published: true, metadata: { family: 'Lora, serif', category: 'serif', sampleText: 'Mẫu' } }), {
    id: 'lora', name: 'Lora', family: 'Lora, serif', category: 'serif', googleFont: 'Lora:wght@500', storagePath: null, sampleText: 'Mẫu',
  });
  assert.deepEqual(mapStickerRow({ id: 'cat', category: 'cute', tags: ['cat'], storage_path: 'stickers/cat.svg', thumbnail_path: null, published: true, metadata: { title: 'Mèo' } }), {
    id: 'cat', category: 'cute', tags: ['cat'], storagePath: 'stickers/cat.svg', thumbnailPath: null, title: 'Mèo', metadata: { title: 'Mèo' },
  });
});

test('catalog repository reads mapped published rows', async () => {
  const repository = new CatalogRepository(new CatalogClient({
    products: { data: [{ id: 'card', slug: 'card', name: 'Thiệp', product_type: 'card', active: true, metadata: {} }], error: null },
    product_variants: { data: [{ id: 'horizontal', product_id: 'card', name: 'Ngang', price: 29000, active: true, metadata: {} }], error: null },
    templates: { data: [{ id: 'blank', product_id: null, slug: 'blank', name: 'Trống', published: true, thumbnail_path: null, metadata: {} }], error: null },
    fonts: { data: [{ id: 'lora', family_name: 'Lora', google_font: null, storage_path: null, published: true, metadata: { category: 'serif' } }], error: null },
    sticker_assets: { data: [{ id: 'cat', category: 'cute', tags: [], storage_path: 'cat.svg', thumbnail_path: null, published: true, metadata: {} }], error: null },
  }) as never);

  assert.equal((await repository.listProducts())[0]?.productType, 'card');
  assert.equal((await repository.listVariants('card'))[0]?.productId, 'card');
  assert.equal((await repository.listTemplates('card'))[0]?.id, 'blank');
  assert.equal((await repository.listFonts())[0]?.name, 'Lora');
  assert.equal((await repository.listStickers())[0]?.storagePath, 'cat.svg');
});

test('catalog repository falls back to static catalog when unconfigured or query fails', async () => {
  const unconfigured = new CatalogRepository(null);
  assert.ok((await unconfigured.listProducts()).some((product: { id: string }) => product.id === 'wrapping'));
  assert.ok((await unconfigured.listTemplates()).some((template: { id: string }) => template.id === 'blank'));
  assert.ok((await unconfigured.listFonts()).some((font: { id: string }) => font.id === 'be-vietnam-pro'));

  const failing = new CatalogRepository(new CatalogClient({ products: { data: null, error: new Error('offline') } }) as never);
  assert.ok((await failing.listProducts()).some((product: { id: string }) => product.id === 'card'));
});

test('catalog repository preserves successful empty queries and returns empty sticker fallback', async () => {
  const emptyRepo = new CatalogRepository(new CatalogClient({
    products: { data: [], error: null },
    templates: { data: [], error: null },
  }) as never);
  assert.deepEqual(await emptyRepo.listProducts(), []);
  assert.deepEqual(await emptyRepo.listTemplates(), []);

  const unconfigured = new CatalogRepository(null);
  assert.deepEqual(await unconfigured.listStickers(), []);
});

test('catalog repository provides alias methods matching PublishedCatalogRepository', async () => {
  const repo = new CatalogRepository();
  const templates = await repo.listPublishedTemplates('card');
  assert.ok(templates.length > 0);
  assert.ok(templates.every((t) => !t.productId || t.productId === 'card'));

  const fonts = await repo.listPublishedFonts();
  assert.ok(fonts.length >= 8);

  const stickers = await repo.listPublishedStickers();
  assert.deepEqual(stickers, []);
});

test('published adapters map dynamic database rows when repository has configured client', async () => {
  const repo = new CatalogRepository(new CatalogClient({
    products: {
      data: [{
        id: 'card',
        slug: 'card',
        name: 'Thiệp Custom DB',
        product_type: 'card',
        active: true,
        metadata: { tagline: 'Tagline từ DB' },
      }],
      error: null,
    },
    product_variants: {
      data: [{
        id: 'horizontal',
        product_id: 'card',
        name: 'Ngang DB',
        price: 35000,
        active: true,
        metadata: { dimensions: '15x10 cm' },
      }],
      error: null,
    },
    templates: {
      data: [{
        id: 'tpl-db-1',
        product_id: 'card',
        slug: 'tpl-db-1',
        name: 'Mẫu DB',
        published: true,
        thumbnail_path: null,
        metadata: { category: 'birthday' },
      }],
      error: null,
    },
    fonts: {
      data: [{
        id: 'font-db-1',
        family_name: 'Playfair Display',
        google_font: 'Playfair+Display',
        storage_path: null,
        published: true,
        metadata: { category: 'serif' },
      }],
      error: null,
    },
    sticker_assets: {
      data: [{
        id: 'sticker-db-1',
        category: 'vintage',
        tags: ['flower'],
        storage_path: 'stickers/flower.svg',
        thumbnail_path: null,
        published: true,
        metadata: { title: 'Hoa vintage' },
      }],
      error: null,
    },
  }) as never);

  const products = await getPublishedProducts(repo);
  assert.equal(products.length, 1);
  assert.equal(products[0]?.name, 'Thiệp Custom DB');
  assert.equal(products[0]?.tagline, 'Tagline từ DB');
  assert.equal(products[0]?.variants[0]?.name, 'Ngang DB');
  assert.equal(products[0]?.variants[0]?.price, 35000);

  const templates = await getPublishedTemplates('card', repo);
  assert.equal(templates.length, 1);
  assert.equal(templates[0]?.name, 'Mẫu DB');

  const fonts = await loadPublishedFonts(repo);
  assert.equal(fonts.length, 1);
  assert.equal(fonts[0]?.name, 'Playfair Display');
  assert.equal(fonts[0]?.category, 'serif');

  const stickers = await getPublishedStickers('vintage', repo);
  assert.equal(stickers.length, 1);
  assert.equal(stickers[0]?.storagePath, 'stickers/flower.svg');
});

test('listTemplates includes global templates when filtering by productId', async () => {
  const client = new CatalogClient({
    templates: {
      data: [
        { id: 'global-blank', product_id: null, slug: 'global-blank', name: 'Trống chung', published: true, thumbnail_path: null, metadata: {} },
        { id: 'card-birthday', product_id: 'card', slug: 'card-birthday', name: 'Thiệp sinh nhật', published: true, thumbnail_path: null, metadata: {} },
        { id: 'notebook-lined', product_id: 'notebook', slug: 'notebook-lined', name: 'Sổ kẻ dòng', published: true, thumbnail_path: null, metadata: {} },
      ],
      error: null,
    },
  });

  const repository = new CatalogRepository(client as never);
  const templates = await repository.listTemplates('card');

  assert.ok(client.orClauses.includes('product_id.eq.card,product_id.is.null'));
  assert.equal(templates.length, 2);
  assert.ok(templates.some((t) => t.id === 'global-blank'));
  assert.ok(templates.some((t) => t.id === 'card-birthday'));
  assert.ok(!templates.some((t) => t.id === 'notebook-lined'));
});
