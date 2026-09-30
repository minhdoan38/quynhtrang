import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../supabase/config.ts';

import {
  type DatabaseFontRow,
  type DatabaseProductRow,
  type DatabaseStickerRow,
  type DatabaseTemplateRow,
  type DatabaseVariantRow,
  mapFontRow,
  mapProductRow,
  mapStickerRow,
  mapTemplateRow,
  mapVariantRow,
  type PublishedFont,
  type PublishedProduct,
  type PublishedSticker,
  type PublishedTemplate,
  type PublishedVariant,
} from '../domain/catalog.ts';
import { FONT_REGISTRY } from '../fonts.ts';
import { CATALOG_PRODUCTS } from '../product-catalog.ts';
import { type ProductId, TEMPLATES } from '../product-state.ts';

export interface PublishedCatalogRepository {
  listProducts(): Promise<PublishedProduct[]>;
  listVariants(productId?: ProductId): Promise<PublishedVariant[]>;
  listTemplates(productId?: ProductId): Promise<PublishedTemplate[]>;
  listPublishedTemplates(productId?: ProductId): Promise<PublishedTemplate[]>;
  listFonts(): Promise<PublishedFont[]>;
  listPublishedFonts(): Promise<PublishedFont[]>;
  listStickers(category?: string): Promise<PublishedSticker[]>;
  listPublishedStickers(category?: string): Promise<PublishedSticker[]>;
}

export class CatalogRepository implements PublishedCatalogRepository {
  private readonly client: SupabaseClient | null;

  constructor(client?: SupabaseClient | null) {
    if (client !== undefined) {
      this.client = client;
    } else {
      const config = getSupabaseConfig();
      if (!config) {
        this.client = null;
      } else {
        try {
          this.client = createClient(config.url, config.publishableKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          });
        } catch {
          this.client = null;
        }
      }
    }
  }

  async listProducts(): Promise<PublishedProduct[]> {
    if (!this.client) return this.getStaticProducts();
    try {
      const { data, error } = await this.client
        .from('products')
        .select('*')
        .eq('active', true)
        .order('id');
      if (error || data === null || data === undefined) return this.getStaticProducts();
      return (data as DatabaseProductRow[]).map(mapProductRow);
    } catch {
      return this.getStaticProducts();
    }
  }

  async listVariants(productId?: ProductId): Promise<PublishedVariant[]> {
    if (!this.client) return this.getStaticVariants(productId);
    try {
      let query = this.client
        .from('product_variants')
        .select('*')
        .eq('active', true);
      if (productId) {
        query = query.eq('product_id', productId);
      }
      const { data, error } = await query.order('price');
      if (error || data === null || data === undefined) return this.getStaticVariants(productId);
      return (data as DatabaseVariantRow[]).map(mapVariantRow);
    } catch {
      return this.getStaticVariants(productId);
    }
  }

  async listTemplates(productId?: ProductId): Promise<PublishedTemplate[]> {
    if (!this.client) return this.getStaticTemplates(productId);
    try {
      const { data, error } = await this.client
        .from('templates')
        .select('*')
        .eq('published', true)
        .order('id');
      if (error || data === null || data === undefined) return this.getStaticTemplates(productId);
      const rows = (data as DatabaseTemplateRow[]).map(mapTemplateRow);
      if (!productId) return rows;
      return rows.filter((tpl) => !tpl.productId || tpl.productId === productId);
    } catch {
      return this.getStaticTemplates(productId);
    }
  }

  async listFonts(): Promise<PublishedFont[]> {
    if (!this.client) return this.getStaticFonts();
    try {
      const { data, error } = await this.client
        .from('fonts')
        .select('*')
        .eq('published', true)
        .order('id');
      if (error || data === null || data === undefined) return this.getStaticFonts();
      return (data as DatabaseFontRow[]).map(mapFontRow);
    } catch {
      return this.getStaticFonts();
    }
  }

  async listStickers(category?: string): Promise<PublishedSticker[]> {
    if (!this.client) return [];
    try {
      let query = this.client
        .from('sticker_assets')
        .select('*')
        .eq('published', true);
      if (category) {
        query = query.eq('category', category);
      }
      const { data, error } = await query.order('id');
      if (error || data === null || data === undefined) return [];
      return (data as DatabaseStickerRow[]).map(mapStickerRow);
    } catch {
      return [];
    }
  }
  async listPublishedTemplates(productId?: ProductId): Promise<PublishedTemplate[]> {
    return this.listTemplates(productId);
  }

  async listPublishedFonts(): Promise<PublishedFont[]> {
    return this.listFonts();
  }

  async listPublishedStickers(category?: string): Promise<PublishedSticker[]> {
    return this.listStickers(category);
  }


  private getStaticProducts(): PublishedProduct[] {
    return Object.values(CATALOG_PRODUCTS).map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      productType: p.id,
      active: true,
      cardTitle: p.cardTitle,
      variantSummary: p.variantSummary,
      englishName: p.englishName,
      tagline: p.tagline,
      description: p.description,
      paperSpecs: p.paperSpecs,
      capabilities: p.capabilities,
      tone: p.tone,
      startingPrice: p.startingPrice,
      variants: p.variants.map((v) => ({
        id: v.id,
        productId: p.id,
        name: v.name,
        price: v.price,
        active: true,
        dimensions: v.dimensions,
        bestFor: v.bestFor,
      })),
    }));
  }

  private getStaticVariants(productId?: ProductId): PublishedVariant[] {
    const products = productId ? [CATALOG_PRODUCTS[productId]].filter(Boolean) : Object.values(CATALOG_PRODUCTS);
    return products.flatMap((product) =>
      product.variants.map((variant) => ({
        id: variant.id,
        productId: product.id,
        name: variant.name,
        price: variant.price,
        active: true,
        dimensions: variant.dimensions,
        bestFor: variant.bestFor,
      }))
    );
  }

  private getStaticTemplates(productId?: ProductId): PublishedTemplate[] {
    return Object.entries(TEMPLATES)
      .filter(([, tpl]) => {
        if (!productId) return true;
        if (!tpl.productIds || tpl.productIds.length === 0) return true;
        return tpl.productIds.includes(productId);
      })
      .map(([id, tpl]) => ({
        id,
        productId: (tpl.productIds?.[0] as ProductId | undefined) ?? null,
        name: tpl.name,
        category: tpl.category,
        variantIds: tpl.variantIds ? [...tpl.variantIds] : undefined,
        previewHint: tpl.previewHint,
      }));
  }

  private getStaticFonts(): PublishedFont[] {
    return FONT_REGISTRY.filter((f) => f.status === 'published').map((f) => ({
      id: f.id,
      name: f.name,
      family: f.family,
      category: f.category,
      googleFont: f.googleFont ?? null,
      storagePath: null,
      sampleText: f.sampleText,
    }));
  }
}
