import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogProduct, CatalogVariant, CommercialDraft } from '../domain/catalog.ts';
import type { CatalogStatus, CommercialConfigVersion } from '../domain/commercial-config.ts';
import type { PriceQuote } from '../services/price-quote-service.ts';
import { listProductDefinitionCapabilities, resolveProductDefinitionKey } from '../product-definition-registry.ts';
import type { ProductDefinitionCapabilities } from '../product-definition-registry.ts';

export interface AdminProduct extends CatalogProduct {
  currentCommercialConfigVersionId?: string | null;
  currentConfig?: CommercialConfigVersion | null;
}

export interface CatalogMutationResult {
  ok: boolean;
  code?: string;
  message?: string;
  productId?: string;
  variantId?: string;
  status?: CatalogStatus;
  revision?: number;
}

export interface ProductMetadataPatch {
  name?: string;
  description?: string;
  thumbnail?: string | null;
  sortOrder?: number;
}

export interface AdminCatalogListOptions {
  status?: CatalogStatus | 'all';
}

export interface CommercialAuditEvent {
  event: string;
  productId: string;
  requestId: string;
}

export class AdminCatalogRepository {
  private readonly client: SupabaseClient | null;
  private readonly products = new Map<string, AdminProduct>();
  private readonly variants = new Map<string, CatalogVariant>();
  private readonly versions = new Map<string, CommercialConfigVersion>();
  private readonly drafts = new Map<string, CommercialDraft>();
  private readonly quotes = new Map<string, PriceQuote>();
  private readonly events: CommercialAuditEvent[] = [];
  private readonly publishedRequests = new Map<string, { productId: string; draftId: string; draftRevision: number; productRevision: number; version: CommercialConfigVersion }>();

  constructor(client: SupabaseClient | null = null) {
    this.client = client;
  }

  seedProduct(product: Omit<AdminProduct, 'variants'> & { variants?: CatalogVariant[] }): void {
    const value: AdminProduct = { ...product, variants: product.variants ?? [] };
    this.products.set(product.id, structuredClone(value));
    for (const variant of value.variants) this.seedVariant(variant);
  }

  seedVariant(variant: CatalogVariant): void {
    this.variants.set(variant.id, structuredClone(variant));
  }

  seedCommercialVersion(version: CommercialConfigVersion): void {
    this.versions.set(version.id, structuredClone(version));
  }

  seedCommercialDraft(draft: CommercialDraft): void {
    this.drafts.set(draft.productId, structuredClone(draft));
  }

  getProduct(id: string): AdminProduct | null {
    const product = this.products.get(id);
    if (!product) return null;
    const currentConfig = product.currentCommercialConfigVersionId ? this.getCommercialVersion(product.currentCommercialConfigVersionId) : null;
    return structuredClone({ ...product, variants: this.listVariants(id), currentConfig });
  }
  async listProducts(options: AdminCatalogListOptions = {}): Promise<AdminProduct[]> {
    if (this.client) {
      const [productsResult, variantsResult, draftsResult] = await Promise.all([
        this.client.from('products').select('*').order('id'),
        this.client.from('product_variants').select('*').order('id'),
        this.client.from('product_commercial_drafts').select('*'),
      ]);
      if (productsResult.error || variantsResult.error || draftsResult.error || !productsResult.data || !variantsResult.data || !draftsResult.data) {
        throw new Error('CATALOG_READ_FAILED');
      }
      const products = productsResult.data as Record<string, unknown>[];
      const variants = variantsResult.data as Record<string, unknown>[];
      const drafts = draftsResult.data as Record<string, unknown>[];
      const versionIds = [...new Set(products.map((row) => row.current_commercial_config_version_id).filter((id): id is string => typeof id === 'string'))];
      let versions: Record<string, unknown>[] = [];
      let rules: Record<string, unknown>[] = [];
      let tiers: Record<string, unknown>[] = [];
      if (versionIds.length) {
        const versionsResult = await this.client.from('product_commercial_config_versions').select('*').in('id', versionIds);
        if (versionsResult.error || !versionsResult.data) throw new Error('CATALOG_READ_FAILED');
        versions = versionsResult.data as Record<string, unknown>[];
        const rulesResult = await this.client.from('commercial_variant_rules').select('*').in('version_id', versionIds);
        if (rulesResult.error || !rulesResult.data) throw new Error('CATALOG_READ_FAILED');
        rules = rulesResult.data as Record<string, unknown>[];
        const ruleIds = rules.map((rule) => String(rule.id));
        if (ruleIds.length) {
          const tiersResult = await this.client.from('commercial_pricing_tiers').select('*').in('rule_id', ruleIds).order('minimum_quantity');
          if (tiersResult.error || !tiersResult.data) throw new Error('CATALOG_READ_FAILED');
          tiers = tiersResult.data as Record<string, unknown>[];
        }
      }
      this.products.clear();
      this.variants.clear();
      this.versions.clear();
      this.drafts.clear();
      for (const row of variants) this.seedVariant({
        id: String(row.id), productId: String(row.product_id), name: String(row.name), price: Number(row.price),
        status: row.status as CatalogStatus, revision: Number(row.revision),
        definitionKey: typeof row.definition_key === 'string' ? row.definition_key : null,
        definition: typeof row.definition_key === 'string' ? resolveProductDefinitionKey(row.definition_key) : null,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      });
      for (const row of versions) this.seedCommercialVersion({
        id: String(row.id), productId: String(row.product_id), versionNumber: Number(row.version_number), currency: 'VND',
        paymentPolicy: row.payment_policy as CommercialConfigVersion['paymentPolicy'],
        variantRules: rules.filter((rule) => rule.version_id === row.id).map((rule) => ({
          variantId: String(rule.variant_id), minimumQuantity: Number(rule.minimum_quantity), quantityStep: Number(rule.quantity_step),
          maximumQuantity: rule.maximum_quantity === null ? null : Number(rule.maximum_quantity),
          tiers: tiers.filter((tier) => tier.rule_id === rule.id).map((tier) => ({ minimumQuantity: Number(tier.minimum_quantity), unitPrice: Number(tier.unit_price) })),
        })),
      });
      for (const row of products) this.seedProduct({
        id: String(row.id), slug: String(row.slug), name: String(row.name), productType: String(row.product_type),
        status: row.status as CatalogStatus, revision: Number(row.revision),
        currentCommercialConfigVersionId: row.current_commercial_config_version_id as string | null,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      });
      for (const row of drafts) this.seedCommercialDraft({
        id: String(row.id), productId: String(row.product_id), baseVersionId: row.base_version_id as string | null,
        revision: Number(row.revision), payload: row.payload as CommercialDraft['payload'], authorId: row.author_id as string | null,
      });
    }
    return [...this.products.keys()].map((id) => this.getProduct(id)!)
      .filter((product) => !options.status || options.status === 'all' || product.status === options.status)
      .sort((a, b) => Number(a.metadata?.sortOrder ?? 0) - Number(b.metadata?.sortOrder ?? 0) || a.name.localeCompare(b.name, 'vi'));
  }

  async getProductById(id: string): Promise<AdminProduct | null> {
    if (this.client) await this.listProducts();
    return this.getProduct(id);
  }

  getAvailableDefinitions(productId: string): readonly ProductDefinitionCapabilities[] {
    const configured = new Set(this.listVariants(productId).map((variant) => variant.definitionKey).filter(Boolean));
    return listProductDefinitionCapabilities().filter((definition) => definition.productId === productId && !configured.has(definition.definitionKey) && !this.variants.has(definition.variantId));
  }

  async updateProductMetadata(productId: string, expectedRevision: number, patch: ProductMetadataPatch): Promise<CatalogMutationResult> {
    if (this.client) {
      const { data, error } = await this.client.rpc('catalog_update_product_metadata', { p_product_id: productId, p_expected_revision: expectedRevision, p_patch: patch });
      if (error) return { ok: false, code: 'INTERNAL_ERROR', message: error.message };
      return data as CatalogMutationResult;
    }
    const product = this.products.get(productId);
    if (!product) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm' };
    if (product.revision !== expectedRevision) return { ok: false, code: 'REVISION_CONFLICT', message: 'Phiên bản chỉnh sửa đã thay đổi' };
    if (patch.name !== undefined) product.name = patch.name.trim();
    product.metadata = { ...(product.metadata ?? {}), ...(patch.description === undefined ? {} : { description: patch.description }), ...(patch.thumbnail === undefined ? {} : { thumbnail: patch.thumbnail }), ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }) };
    product.revision += 1;
    this.products.set(productId, product);
    return { ok: true, productId, revision: product.revision, status: product.status };
  }

  async enableVariant(productId: string, definitionKey: string, expectedProductRevision: number): Promise<CatalogMutationResult> {
    const definition = resolveProductDefinitionKey(definitionKey);
    if (!definition || definition.productId !== productId) return { ok: false, code: 'UNKNOWN_DEFINITION_KEY', message: 'Definition_key không thuộc danh mục hỗ trợ' };
    if (this.client) {
      const { data, error } = await this.client.rpc('catalog_enable_variant', { p_product_id: productId, p_definition_key: definition.definitionKey, p_expected_product_revision: expectedProductRevision });
      if (error) return { ok: false, code: 'INTERNAL_ERROR', message: error.message };
      return data as CatalogMutationResult;
    }
    const product = this.products.get(productId);
    if (!product) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm' };
    if (product.revision !== expectedProductRevision) return { ok: false, code: 'REVISION_CONFLICT', message: 'Phiên bản chỉnh sửa đã thay đổi' };
    if (this.variants.has(definition.variantId)) return { ok: false, code: 'ALREADY_CONFIGURED' };
    const variant: CatalogVariant = { id: definition.variantId, productId, name: definition.physicalSummary, price: 0, status: 'draft', revision: 1, definitionKey: definition.definitionKey, definition };
    this.variants.set(variant.id, variant);
    product.revision += 1;
    this.products.set(productId, product);
    return { ok: true, productId, variantId: variant.id, status: variant.status, revision: product.revision };
  }

  getVariant(id: string): CatalogVariant | null {
    const variant = this.variants.get(id);
    return variant ? structuredClone(variant) : null;
  }

  listVariants(productId: string): CatalogVariant[] {
    return [...this.variants.values()].filter((variant) => variant.productId === productId).map((variant) => structuredClone(variant));
  }

  getCommercialVersion(id: string): CommercialConfigVersion | null {
    const version = this.versions.get(id);
    return version ? structuredClone(version) : null;
  }

  getCommercialDraft(productId: string): CommercialDraft | null {
    const draft = this.drafts.get(productId);
    return draft ? structuredClone(draft) : null;
  }
  getCommercialDraftById(id: string): CommercialDraft | null {
    for (const draft of this.drafts.values()) {
      if (draft.id === id) return structuredClone(draft);
    }
    return null;
  }

  async getPriceQuote(id: string): Promise<PriceQuote | null> {
    const quote = this.quotes.get(id);
    if (quote) return structuredClone(quote);
    if (this.client) {
      const { data, error } = await this.client
        .from('price_quotes')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as Record<string, unknown>;
      const loaded: PriceQuote = {
        id: String(row.id), productId: String(row.product_id), variantId: String(row.variant_id),
        productName: typeof row.product_name === 'string' ? row.product_name : undefined,
        variantName: typeof row.variant_name === 'string' ? row.variant_name : undefined,
        definitionKey: typeof row.definition_key === 'string' ? row.definition_key : null,
        commercialConfigVersionId: String(row.commercial_config_version_id), quantity: Number(row.quantity),
        calculation: row.calculation as PriceQuote['calculation'], checkoutKeyHash: String(row.checkout_key_hash),
        createdAt: String(row.created_at), expiresAt: String(row.expires_at),
        consumedOrderId: typeof row.consumed_order_id === 'string' ? row.consumed_order_id : null,
      };
      this.quotes.set(loaded.id, structuredClone(loaded));
      return structuredClone(loaded);
    }
    return null;
  }

  async consumeQuote(quoteId: string, orderId: string): Promise<PriceQuote | null> {
    const quote = await this.getPriceQuote(quoteId);
    if (!quote || (quote.consumedOrderId && quote.consumedOrderId !== orderId)) return null;
    if (this.client) {
      const { data, error } = await this.client.from('price_quotes').update({ consumed_order_id: orderId }).eq('id', quoteId).is('consumed_order_id', null).select('*').maybeSingle();
      if (error) throw new Error(error.message);
      if (data) {
        quote.consumedOrderId = orderId;
        this.quotes.set(quoteId, structuredClone(quote));
        return quote;
      }
      const current = await this.getPriceQuote(quoteId);
      return current?.consumedOrderId === orderId ? current : null;
    }
    quote.consumedOrderId = orderId;
    this.quotes.set(quoteId, structuredClone(quote));
    return quote;
  }

  getAssetEvents(): CommercialAuditEvent[] {
    return structuredClone(this.events);
  }

  async setProductStatus(productId: string, status: CatalogStatus, expectedRevision: number): Promise<CatalogMutationResult> {
    if (this.client) {
      const { data, error } = await this.client.rpc('catalog_set_product_status', {
        p_product_id: productId,
        p_status: status,
        p_expected_revision: expectedRevision,

      });
      if (error) return { ok: false, code: 'INTERNAL_ERROR', message: error.message };
      return data as CatalogMutationResult;
    }
    const product = this.products.get(productId);
    if (!product) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm' };
    if (product.revision !== expectedRevision) return { ok: false, code: 'REVISION_CONFLICT', message: 'Phiên bản chỉnh sửa đã thay đổi' };
    if (status === 'active') {
      if (!product.currentCommercialConfigVersionId) return { ok: false, code: 'MISSING_COMMERCIAL_CONFIG', message: 'Sản phẩm chưa có cấu hình thương mại' };
      if (!this.listVariants(productId).some((variant) => variant.status === 'active' && variant.definitionKey)) {
        return { ok: false, code: 'NO_ACTIVE_VARIANTS', message: 'Sản phẩm phải có ít nhất một biến thể đang kích hoạt với definition_key hợp lệ' };
      }
    }
    product.status = status;
    product.revision += 1;
    this.products.set(productId, product);
    return { ok: true, productId, status, revision: product.revision };
  }

  async setVariantStatus(variantId: string, status: CatalogStatus, expectedRevision: number): Promise<CatalogMutationResult> {
    if (this.client) {
      const { data, error } = await this.client.rpc('catalog_set_variant_status', {
        p_variant_id: variantId,
        p_status: status,
        p_expected_revision: expectedRevision,
      });
      if (error) return { ok: false, code: 'INTERNAL_ERROR', message: error.message };
      return data as CatalogMutationResult;
    }
    const variant = this.variants.get(variantId);
    if (!variant) return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy biến thể' };
    if (variant.revision !== expectedRevision) return { ok: false, code: 'REVISION_CONFLICT', message: 'Phiên bản chỉnh sửa đã thay đổi' };
    if (status === 'active') {
      if (!variant.definitionKey) return { ok: false, code: 'MISSING_DEFINITION_KEY', message: 'Biến thể chưa được gắn definition_key' };
      if (!variant.definitionKey.includes(':')) return { ok: false, code: 'UNKNOWN_DEFINITION_KEY', message: 'Definition_key không thuộc danh mục hỗ trợ' };
    }
    if (status === 'archived') {
      const product = this.products.get(variant.productId);
      const active = this.listVariants(variant.productId).filter((item) => item.status === 'active');
      if (product?.status === 'active' && variant.status === 'active' && active.length === 1) {
        return { ok: false, code: 'LAST_ACTIVE_VARIANT', message: 'Không thể lưu trữ biến thể đang hoạt động cuối cùng của sản phẩm đang bán' };
      }
    }
    variant.status = status;
    variant.revision += 1;
    this.variants.set(variantId, variant);
    return { ok: true, variantId, status, revision: variant.revision };
  }

  async loadDraft(productId: string, staffId: string): Promise<CommercialDraft> {
    if (this.client) {
      const { data, error } = await this.client.rpc('catalog_open_commercial_draft', { p_product_id: productId });
      if (error || !data) throw new Error('DRAFT_CREATE_FAILED');
      if (data.ok === false) throw new Error(String(data.code));
      const row = data.draft;
      const draft: CommercialDraft = {
        id: String(row.id), productId: String(row.product_id), baseVersionId: row.base_version_id,
        revision: Number(row.revision), payload: row.payload, authorId: row.author_id,
      };
      this.seedCommercialDraft(draft);
      return draft;
    }
    const existing = this.drafts.get(productId);
    if (existing) return structuredClone(existing);
    const product = this.products.get(productId);
    if (!product) throw new Error('NOT_FOUND');
    const base = product.currentCommercialConfigVersionId ? this.versions.get(product.currentCommercialConfigVersionId) : null;
    const draft: CommercialDraft = {
      id: `draft-${productId}-${Date.now()}`,
      productId,
      baseVersionId: base?.id ?? null,
      revision: 1,
      payload: base ? structuredClone(base) : {
        id: `draft-${productId}`,
        productId,
        versionNumber: 0,
        currency: 'VND',
        paymentPolicy: { kind: 'full_payment' },
        variantRules: [],
      },
      authorId: staffId,
    };
    this.drafts.set(productId, draft);
    return structuredClone(draft);
  }

  async saveDraft(draftId: string, expectedRevision: number, payload: CommercialConfigVersion): Promise<CommercialDraft> {
    if (this.client) {
      const { data, error } = await this.client.rpc('save_product_commercial_draft', {
        p_draft_id: draftId,
        p_expected_revision: expectedRevision,
        p_payload: payload,
      });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== 'object') throw new Error('DRAFT_SAVE_FAILED');
      const result = data as Record<string, unknown>;
      if (result.ok === false) throw new Error(String(result.code ?? 'DRAFT_SAVE_FAILED'));
      const row = result.draft as Record<string, unknown>;
      return {
        id: String(row.id), productId: String(row.product_id),
        baseVersionId: typeof row.base_version_id === 'string' ? row.base_version_id : null,
        revision: Number(row.revision), payload: row.payload as CommercialDraft['payload'],
        authorId: typeof row.author_id === 'string' ? row.author_id : null,
      };
    }
    const draft = [...this.drafts.values()].find((item) => item.id === draftId);
    if (!draft) throw new Error('NOT_FOUND');
    if (draft.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
    draft.payload = structuredClone(payload);
    draft.revision += 1;
    this.drafts.set(draft.productId, draft);
    return structuredClone(draft);
  }

  async resolvePublishedRequest(productId: string, draftRevision: number, productRevision: number, requestId: string, draftId?: string): Promise<CommercialConfigVersion | null> {
    let saved = this.publishedRequests.get(requestId);
    if (this.client) {
      const { data, error } = await this.client.from('asset_events').select('target_id, metadata_diff').eq('event', 'commercial_config_published').eq('metadata_diff->>requestId', requestId).maybeSingle();
      if (error) throw new Error('PUBLISH_FAILED');
      if (data) {
        const metadata = data.metadata_diff;
        saved = { productId: data.target_id, draftId: metadata.draftId, draftRevision: metadata.draftRevision, productRevision: metadata.productRevision, version: metadata.version };
        if (saved.productId !== productId || saved.draftRevision !== draftRevision || saved.productRevision !== productRevision || (draftId !== undefined && saved.draftId !== draftId)) throw new Error('REVISION_CONFLICT');
        return this.publishDraft(productId, saved.draftId, draftRevision, productRevision, requestId);
      }
    }
    if (!saved) return null;
    if (saved.productId !== productId || saved.draftRevision !== draftRevision || saved.productRevision !== productRevision || (draftId !== undefined && saved.draftId !== draftId)) throw new Error('REVISION_CONFLICT');
    return structuredClone(saved.version);
  }

  async publishDraft(productId: string, draftIdOrExpectedRevision: string | number, expectedDraftRevisionOrProductRevision: number, expectedProductRevisionOrRequestId: number | string, requestIdValue?: string): Promise<CommercialConfigVersion> {
    const draftId = typeof draftIdOrExpectedRevision === 'string' ? draftIdOrExpectedRevision : this.drafts.get(productId)?.id ?? '';
    const expectedDraftRevision = typeof draftIdOrExpectedRevision === 'string' ? expectedDraftRevisionOrProductRevision : draftIdOrExpectedRevision;
    const expectedProductRevision = typeof draftIdOrExpectedRevision === 'string' ? expectedProductRevisionOrRequestId as number : expectedDraftRevisionOrProductRevision;
    const requestId = typeof draftIdOrExpectedRevision === 'string' ? requestIdValue ?? '' : String(expectedProductRevisionOrRequestId);
    if (this.client) {
      const { data, error } = await this.client.rpc('publish_product_commercial_config', {
        p_product_id: productId, p_draft_id: draftId,
        p_expected_draft_revision: expectedDraftRevision,
        p_expected_product_revision: expectedProductRevision,
        p_request_id: requestId,
      });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== 'object') throw new Error('PUBLISH_FAILED');
      const result = data as Record<string, unknown>;
      if (result.ok === false) throw new Error(String(result.code ?? 'PUBLISH_FAILED'));
      const row = result.version as Record<string, unknown>;
      return {
        id: String(row.id), productId: String(row.product_id ?? productId), versionNumber: Number(row.version_number),
        currency: 'VND', paymentPolicy: row.payment_policy as CommercialConfigVersion['paymentPolicy'],
        variantRules: Array.isArray(row.variantRules) ? row.variantRules as CommercialConfigVersion['variantRules'] : [],
      };
    }
    const replay = this.publishedRequests.get(requestId);
    if (replay) {
      if (replay.productId !== productId || replay.draftId !== draftId || replay.draftRevision !== expectedDraftRevision || replay.productRevision !== expectedProductRevision) throw new Error('REVISION_CONFLICT');
      return structuredClone(replay.version);
    }
    const product = this.products.get(productId);
    const draft = this.drafts.get(productId);
    if (!product || !draft) throw new Error('NOT_FOUND');
    if (draft.id !== draftId) throw new Error('NOT_FOUND');
    if (product.revision !== expectedProductRevision || draft.revision !== expectedDraftRevision) throw new Error('REVISION_CONFLICT');
    const previous = [...this.versions.values()].filter((version) => version.productId === productId);
    const version: CommercialConfigVersion = { ...structuredClone(draft.payload), id: `commercial-${productId}-${previous.length + 1}`, productId, versionNumber: previous.length + 1 };
    this.versions.set(version.id, version);
    product.currentCommercialConfigVersionId = version.id;
    product.revision += 1;
    this.products.set(productId, product);
    this.drafts.delete(productId);
    this.events.push({ event: 'commercial_config_published', productId, requestId });
    this.publishedRequests.set(requestId, { productId, draftId, draftRevision: expectedDraftRevision, productRevision: expectedProductRevision, version: structuredClone(version) });
    return structuredClone(version);
  }

  async saveQuote(quote: PriceQuote): Promise<PriceQuote> {
    if (this.client) {
      const { data, error } = await this.client.from('price_quotes').insert({
        id: quote.id, product_id: quote.productId, variant_id: quote.variantId,
        commercial_config_version_id: quote.commercialConfigVersionId, quantity: quote.quantity,
        calculation: quote.calculation, checkout_key_hash: quote.checkoutKeyHash,
        created_at: quote.createdAt, expires_at: quote.expiresAt,
        consumed_order_id: quote.consumedOrderId ?? null,
      }).select('*').single();
      if (error || !data) throw new Error(error?.message ?? 'QUOTE_PERSIST_FAILED');
      const row = data as Record<string, unknown>;
      const saved: PriceQuote = {
        id: String(row.id), productId: String(row.product_id), variantId: String(row.variant_id),
        commercialConfigVersionId: String(row.commercial_config_version_id), quantity: Number(row.quantity),
        calculation: row.calculation as PriceQuote['calculation'], checkoutKeyHash: String(row.checkout_key_hash),
        createdAt: String(row.created_at), expiresAt: String(row.expires_at),
        consumedOrderId: typeof row.consumed_order_id === 'string' ? row.consumed_order_id : null,
      };
      this.quotes.set(saved.id, structuredClone(saved));
      return saved;
    }
    this.quotes.set(quote.id, structuredClone(quote));
    return structuredClone(quote);
  }
}
