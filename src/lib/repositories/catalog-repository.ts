import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../supabase/config.ts';

import {
  type CatalogProduct,
  type CatalogVariant,
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
  type BrowseAvailableTemplatesOptions,
  type TemplateCard,
  type TemplatePage,
  type TemplateVersionPayload,
} from '../domain/catalog.ts';
import { FONT_REGISTRY } from '../fonts.ts';
import { CATALOG_PRODUCTS } from '../product-catalog.ts';
import type { ProductId } from '../product-state.ts';
import { TemplateRepository } from './template-repository.ts';
export interface PublishedCatalogRepository {
  listProducts(): Promise<PublishedProduct[]>;
  browseSellableProducts(): Promise<PublishedProduct[]>;
  resolveProductById(id: string): Promise<CatalogProduct | null>;
  resolveVariantById(id: string): Promise<CatalogVariant | null>;
  listVariants(productId?: ProductId): Promise<PublishedVariant[]>;
  listTemplates(productId?: ProductId): Promise<PublishedTemplate[]>;
  listPublishedTemplates(productId?: ProductId): Promise<PublishedTemplate[]>;
  browseAvailableTemplates?(options?: BrowseAvailableTemplatesOptions): Promise<TemplatePage>;
  resolveTemplateVersionById?(
    versionId: string,
    access?: { role?: string; userId?: string | null; projectId?: string | null },
  ): Promise<TemplateVersionPayload>;
  listFonts(): Promise<PublishedFont[]>;
  listPublishedFonts(): Promise<PublishedFont[]>;
  listStickers(category?: string): Promise<PublishedSticker[]>;
  listPublishedStickers(category?: string): Promise<PublishedSticker[]>;
}
export class CatalogRepository implements PublishedCatalogRepository {
  private readonly client: SupabaseClient | null;
  private readonly templateRepo: TemplateRepository | null;
  readonly configured: boolean;

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
    this.templateRepo = this.client ? new TemplateRepository(this.client) : null;
    this.configured = this.client !== null;
  }
  async browseSellableProducts(): Promise<PublishedProduct[]> {
    if (!this.client) return [];
    const [productsResult, variantsResult, versionsResult, rulesResult, tiersResult] = await Promise.all([
      this.client.from('products').select('*').order('id'),
      this.client.from('product_variants').select('*').order('id'),
      this.client.from('product_commercial_config_versions').select('*').order('version_number'),
      this.client.from('commercial_variant_rules').select('*'),
      this.client.from('commercial_pricing_tiers').select('*'),
    ]);
    if (productsResult.error || variantsResult.error) return [];
    const products = productsResult.data as DatabaseProductRow[];
    const variants = variantsResult.data as DatabaseVariantRow[];
    if (versionsResult.error || rulesResult.error || tiersResult.error) return [];
    if (versionsResult.data.length === 0 && products.every((row) => !row.status && row.current_commercial_config_version_id === undefined)) {
      return products.filter((row) => row.active).map((row) => ({
        ...mapProductRow(row),
        variants: variants.filter((variant) => variant.product_id === row.id && variant.active).map(mapVariantRow),
      }));
    }
    const versions = versionsResult.data as Array<Record<string, unknown>>;
    const rules = rulesResult.data as Array<Record<string, unknown>>;
    const tiers = tiersResult.data as Array<Record<string, unknown>>;
    return products.flatMap((row) => {
      const status = row.status ?? (row.active ? 'active' : 'draft');
      if (status !== 'active' || !row.current_commercial_config_version_id) return [];
      const version = versions.find((candidate) => candidate.id === row.current_commercial_config_version_id && candidate.product_id === row.id);
      if (!version) return [];
      const activeVariants = variants.filter((variant) => variant.product_id === row.id && (variant.status ?? (variant.active ? 'active' : 'draft')) === 'active' && variant.definition_key);
      const sellableVariants = activeVariants.filter((variant) => rules.some((rule) => rule.version_id === version.id && rule.variant_id === variant.id && tiers.some((tier) => tier.rule_id === rule.id)));
      if (sellableVariants.length === 0) return [];
      return [{ ...mapProductRow(row), variants: sellableVariants.map(mapVariantRow) }];
    });
  }

  async resolveProductById(id: string): Promise<CatalogProduct | null> {
    if (!this.client || !id.trim()) return null;
    const { data, error } = await this.client.from('products').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const variants = await this.client.from('product_variants').select('*').eq('product_id', id).order('id');
    const row = data as DatabaseProductRow;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      productType: row.product_type,
      status: row.status ?? (row.active ? 'active' : 'draft'),
      revision: Number(row.revision ?? 1),
      currentCommercialConfigVersionId: row.current_commercial_config_version_id ?? null,
      variants: variants.data ? (variants.data as DatabaseVariantRow[]).map((variant) => ({
        id: variant.id,
        productId: variant.product_id,
        name: variant.name,
        price: Number(variant.price),
        status: variant.status ?? (variant.active ? 'active' : 'draft'),
        revision: Number(variant.revision ?? 1),
        definitionKey: variant.definition_key ?? null,
        metadata: variant.metadata ?? undefined,
      })) : [],
      metadata: row.metadata ?? undefined,
    };
  }

  async resolveVariantById(id: string): Promise<CatalogVariant | null> {
    if (!this.client || !id.trim()) return null;
    const { data, error } = await this.client.from('product_variants').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const row = data as DatabaseVariantRow;
    return {
      id: row.id,
      productId: row.product_id,
      name: row.name,
      price: Number(row.price),
      status: row.status ?? (row.active ? 'active' : 'draft'),
      revision: Number(row.revision ?? 1),
      definitionKey: row.definition_key ?? null,
      metadata: row.metadata ?? undefined,
    };
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
    if (!this.client) return [];
    // Database-only catalog query: status = 'published' (published boolean dropped in 0009)
    let query = this.client
      .from('templates')
      .select('*')
      .eq('status', 'published');
    if (productId) {
      query = query.or(`product_id.eq.${productId},product_id.is.null`);
    }
    const { data, error } = await query.order('id');
    if (error) {
      throw new Error(`Failed to query published templates: ${error.message}`);
    }
    if (!data) return [];
    const rows = (data as DatabaseTemplateRow[]).map(mapTemplateRow);
    if (!productId) return rows;
    return rows.filter((tpl) => !tpl.productId || tpl.productId === productId);
  }

  async browseAvailableTemplates(
    options: BrowseAvailableTemplatesOptions = {},
  ): Promise<TemplatePage> {
    if (this.templateRepo) {
      return this.templateRepo.browseAvailableTemplates(options);
    }
    return { items: [], nextCursor: null };
  }

  async resolveTemplateVersionById(
    versionId: string,
    access?: { role?: string; userId?: string | null; projectId?: string | null },
  ): Promise<TemplateVersionPayload> {
    if (this.templateRepo) {
      return this.templateRepo.resolveTemplateVersionById(versionId, access);
    }
    throw new Error('Template repository is unconfigured');
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
    if (!this.client) return this.getStaticFonts();
    const { data, error } = await this.client.from('fonts').select('*').eq('published', true).order('id');
    if (error) throw error;
    if (data === null || data === undefined) throw new Error('Font catalog returned no data');
    return (data as DatabaseFontRow[]).map(mapFontRow);
  }

  async listPublishedStickers(category?: string): Promise<PublishedSticker[]> {
    if (!this.client) return [];
    let query = this.client.from('sticker_assets').select('*').eq('published', true);
    if (category) query = query.eq('category', category);
    const { data, error } = await query.order('id');
    if (error) throw error;
    if (data === null || data === undefined) throw new Error('Sticker catalog returned no data');
    return (data as DatabaseStickerRow[]).map(mapStickerRow);
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
