import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogProduct, CatalogVariant, CommercialDraft } from '../domain/catalog.ts';
import type { CatalogStatus, CommercialConfigVersion } from '../domain/commercial-config.ts';
import type { PriceQuote } from '../services/price-quote-service.ts';

export interface AdminProduct extends CatalogProduct {
  currentCommercialConfigVersionId?: string | null;
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
    return structuredClone({ ...product, variants: this.listVariants(id) });
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

  getPriceQuote(id: string): PriceQuote | null {
    const quote = this.quotes.get(id);
    return quote ? structuredClone(quote) : null;
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
      const existing = await this.client.from('product_commercial_drafts').select('*').eq('product_id', productId).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) {
        const row = existing.data as Record<string, unknown>;
        return {
          id: String(row.id),
          productId: String(row.product_id),
          baseVersionId: typeof row.base_version_id === 'string' ? row.base_version_id : null,
          revision: Number(row.revision ?? 1),
          payload: (row.payload ?? {}) as CommercialDraft['payload'],
          authorId: typeof row.author_id === 'string' ? row.author_id : null,
        };
      }
      const created = await this.client.from('product_commercial_drafts').insert({
        product_id: productId,
        revision: 1,
        payload: { currency: 'VND', paymentPolicy: { kind: 'full_payment' }, variantRules: [] },
        author_id: staffId,
      }).select('*').single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? 'DRAFT_CREATE_FAILED');
      const row = created.data as Record<string, unknown>;
      return {
        id: String(row.id),
        productId: String(row.product_id),
        baseVersionId: typeof row.base_version_id === 'string' ? row.base_version_id : null,
        revision: Number(row.revision ?? 1),
        payload: (row.payload ?? {}) as CommercialDraft['payload'],
        authorId: typeof row.author_id === 'string' ? row.author_id : null,
      };
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
    return structuredClone(version);
  }

  async saveQuote(quote: PriceQuote): Promise<PriceQuote> {
    if (this.client) {
      const { data, error } = await this.client.from('price_quotes').insert({
        id: quote.id, product_id: quote.productId, variant_id: quote.variantId,
        commercial_config_version_id: quote.commercialConfigVersionId, quantity: quote.quantity,
        calculation: quote.calculation, checkout_key_hash: quote.checkoutKeyHash,
        created_at: quote.createdAt, expires_at: quote.expiresAt,
      }).select('*').single();
      if (error || !data) throw new Error(error?.message ?? 'QUOTE_PERSIST_FAILED');
      const row = data as Record<string, unknown>;
      return {
        id: String(row.id), productId: String(row.product_id), variantId: String(row.variant_id),
        commercialConfigVersionId: String(row.commercial_config_version_id), quantity: Number(row.quantity),
        calculation: row.calculation as PriceQuote['calculation'], checkoutKeyHash: String(row.checkout_key_hash),
        createdAt: String(row.created_at), expiresAt: String(row.expires_at),
      };
    }
    this.quotes.set(quote.id, structuredClone(quote));
    return structuredClone(quote);
  }
}
