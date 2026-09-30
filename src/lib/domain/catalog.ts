import type { ProductId } from '../product-state.ts';

export interface PublishedVariant {
  id: string;
  productId: ProductId;
  name: string;
  price: number;
  active: boolean;
  dimensions?: string;
  bestFor?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishedProduct {
  id: ProductId;
  slug: string;
  name: string;
  productType: string;
  active: boolean;
  cardTitle?: string;
  variantSummary?: string;
  englishName?: string;
  tagline?: string;
  description?: string;
  paperSpecs?: {
    paperType?: string;
    printSurfaces?: string;
    packaging?: string;
  };
  variants?: PublishedVariant[];
  capabilities?: string[];
  tone?: {
    bg?: string;
    cardBg?: string;
    border?: string;
    badgeVariant?: string;
    tape?: string;
    accent?: string;
  };
  startingPrice?: number;
  metadata?: Record<string, unknown>;
}

export interface PublishedTemplate {
  id: string;
  productId?: ProductId | null;
  slug?: string | null;
  name: string;
  thumbnailPath?: string | null;
  category?: string;
  variantIds?: string[];
  previewHint?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishedFont {
  id: string;
  name: string;
  family: string;
  category: 'sans' | 'serif' | 'handwriting' | 'display';
  googleFont?: string | null;
  storagePath?: string | null;
  sampleText?: string;
  metadata?: Record<string, unknown>;
}

export interface PublishedSticker {
  id: string;
  category: string;
  tags: string[];
  storagePath: string;
  thumbnailPath?: string | null;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface DatabaseProductRow {
  id: string;
  slug: string;
  name: string;
  product_type: string;
  active: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface DatabaseVariantRow {
  id: string;
  product_id: string;
  name: string;
  price: number;
  active: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface DatabaseTemplateRow {
  id: string;
  product_id?: string | null;
  slug?: string | null;
  name: string;
  published: boolean;
  thumbnail_path?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DatabaseFontRow {
  id: string;
  family_name: string;
  google_font?: string | null;
  storage_path?: string | null;
  published: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface DatabaseStickerRow {
  id: string;
  category: string;
  tags: string[];
  storage_path: string;
  thumbnail_path?: string | null;
  published: boolean;
  metadata?: Record<string, unknown> | null;
}

export function mapProductRow(row: DatabaseProductRow): PublishedProduct {
  const meta = row.metadata ?? {};
  return {
    id: row.id as ProductId,
    slug: row.slug,
    name: row.name,
    productType: row.product_type,
    active: row.active,
    ...(typeof meta.englishName === 'string' ? { englishName: meta.englishName } : {}),
    ...(typeof meta.cardTitle === 'string' ? { cardTitle: meta.cardTitle } : {}),
    ...(typeof meta.variantSummary === 'string' ? { variantSummary: meta.variantSummary } : {}),
    ...(typeof meta.tagline === 'string' ? { tagline: meta.tagline } : {}),
    ...(typeof meta.description === 'string' ? { description: meta.description } : {}),
    ...(typeof meta.startingPrice === 'number' ? { startingPrice: meta.startingPrice } : {}),
    ...(Array.isArray(meta.capabilities) ? { capabilities: meta.capabilities as string[] } : {}),
    ...(typeof meta.paperSpecs === 'object' && meta.paperSpecs !== null ? { paperSpecs: meta.paperSpecs as PublishedProduct['paperSpecs'] } : {}),
    ...(typeof meta.tone === 'object' && meta.tone !== null ? { tone: meta.tone as PublishedProduct['tone'] } : {}),
    ...(row.metadata ? {} : {}),
  };
}

export function mapVariantRow(row: DatabaseVariantRow): PublishedVariant {
  const meta = row.metadata ?? {};
  return {
    id: row.id,
    productId: row.product_id as ProductId,
    name: row.name,
    price: Number(row.price),
    active: row.active,
    ...(typeof meta.dimensions === 'string' ? { dimensions: meta.dimensions } : {}),
    ...(typeof meta.bestFor === 'string' ? { bestFor: meta.bestFor } : {}),
  };
}

export function mapTemplateRow(row: DatabaseTemplateRow): PublishedTemplate {
  const meta = row.metadata ?? {};
  return {
    id: row.id,
    productId: (row.product_id as ProductId | null) ?? null,
    slug: row.slug ?? null,
    name: row.name,
    thumbnailPath: row.thumbnail_path ?? null,
    ...(typeof meta.category === 'string' ? { category: meta.category } : {}),
    ...(Array.isArray(meta.variantIds) ? { variantIds: meta.variantIds as string[] } : {}),
    ...(typeof meta.previewHint === 'string' ? { previewHint: meta.previewHint } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
  };
}

export function mapFontRow(row: DatabaseFontRow): PublishedFont {
  const meta = row.metadata ?? {};
  return {
    id: row.id,
    name: row.family_name,
    family: typeof meta.family === 'string' ? meta.family : row.family_name,
    category: (meta.category as PublishedFont['category']) ?? 'sans',
    googleFont: row.google_font ?? null,
    storagePath: row.storage_path ?? null,
    ...(typeof meta.sampleText === 'string' ? { sampleText: meta.sampleText } : {}),
  };
}

export function mapStickerRow(row: DatabaseStickerRow): PublishedSticker {
  const meta = row.metadata ?? {};
  return {
    id: row.id,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path ?? null,
    ...(typeof meta.title === 'string' ? { title: meta.title } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
  };
}
