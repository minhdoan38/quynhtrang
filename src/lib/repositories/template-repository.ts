import type { SupabaseClient } from '@supabase/supabase-js';

import type { DesignState, FixedStickerShape, ProductId } from '../product-state.ts';
import type { LibraryRef } from '../domain/asset-library.ts';
import { createTemplateTarget } from '../template-target.ts';
import type {
  AdminTemplateListQuery,
  AttachTemplateAssetInput,
  DeleteDraftTemplateInput,
  DuplicateTemplateInput,
  CreateTemplateRepoInput,
  DependencyMetadataItem,
  EligibleSourceProject,
  PublishTemplateInput,
  SourceProjectDetail,
  TemplateAssetRecord,
  TemplateAvailability,
  TemplateDraftRecord,
  TemplateErrorCode,
  TemplateCategoryRecord,
  TemplateMetadataPatch,
  TemplateMutation,
  TemplateRecord,
  TemplateRepoResult,
  TemplateStatus,
  TemplateTarget,
  TemplateValidationReceipt,
  TemplateVersionPayload,
  TemplateVersionSummary,
} from '../domain/template.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DatabaseTemplateRow {
  id: string;
  name: string;
  slug?: string | null;
  status?: string | null;
  revision?: number | string | null;
  product_id: string;
  variant_id?: string | null;
  product_mode?: string | null;
  fixed_sticker_shape?: string | null;
  category_id?: string | null;
  tags?: string[] | null;
  sort_order?: number | string | null;
  target_snapshot?: Record<string, unknown> | null;
  current_published_version_id?: string | null;
  ever_published_at?: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface DatabaseDraftRow {
  id: string;
  template_id: string;
  based_on_version_id?: string | null;
  design_document: Record<string, unknown>;
  document_schema_version?: number | string | null;
  draft_revision?: number | string | null;
  source_document_hash?: string | null;
  editor_user_id?: string | null;
  lease_session_id?: string | null;
  lease_epoch?: number | string | null;
  lease_expires_at?: string | null;
  last_activity_at?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface DatabaseVersionRow {
  id: string;
  template_id: string;
  version: number | string;
  design_document: Record<string, unknown>;
  document_schema_version?: number | string | null;
  target_snapshot?: Record<string, unknown> | null;
  dependency_snapshot?: unknown[] | null;
  created_at: string;
  published_at?: string | null;
  published_by?: string | null;
  revision_note?: string | null;
}

export interface DatabaseAssetRow {
  id: string;
  template_id: string;
  draft_id?: string | null;
  storage_bucket: string;
  storage_path: string;
  checksum: string;
  mime_type: string;
  byte_size: number | string;
  pixel_width?: number | null;
  pixel_height?: number | null;
  upload_status?: string | null;
  status?: string;
  ever_published_at?: string | null;
  is_published: boolean;
  created_at: string;
  created_by?: string | null;
}

export interface DatabaseValidationRunRow {
  id: string;
  template_id: string;
  draft_id: string;
  source_revision: number | string;
  lease_session_id: string;
  lease_epoch: number | string;
  source_document_hash: string;
  candidate_document_hash: string;
  target_hash: string;
  dependency_manifest_hash?: string | null;
  findings: unknown;
  warning_ids: string[];
  validator_version: string;
  engine_fingerprint: string;
  customer_preview_passed: boolean;
  thumbnail_asset_id?: string | null;
  thumbnail_checksum?: string | null;
  preview_metadata?: unknown;
  expires_at: string;
  created_at: string;
}

export interface RecordValidationRunInput {
  id?: string;
  templateId: string;
  draftId: string;
  sourceRevision: number;
  leaseSessionId: string;
  leaseEpoch: number;
  sourceDocumentHash: string;
  candidateDocumentHash: string;
  targetHash: string;
  dependencyManifestHash?: string | null;
  findings: Array<{ code: string; elementId?: string; message?: string }>;
  warningIds: string[];
  validatorVersion?: string;
  engineFingerprint: string;
  customerPreviewPassed: boolean;
  thumbnailAssetId?: string | null;
  thumbnailChecksum?: string | null;
  previewMetadata?: Record<string, unknown>;
  expiresAt: string;
}

function mapValidationRunRow(row: DatabaseValidationRunRow): TemplateValidationReceipt {
  return {
    id: row.id,
    templateId: row.template_id,
    draftId: row.draft_id,
    sourceRevision: typeof row.source_revision === 'string' ? parseInt(row.source_revision, 10) : Number(row.source_revision),
    leaseEpoch: typeof row.lease_epoch === 'string' ? parseInt(row.lease_epoch, 10) : Number(row.lease_epoch),
    sessionId: row.lease_session_id,
    sourceDocumentHash: row.source_document_hash,
    candidateDocumentHash: row.candidate_document_hash,
    targetHash: row.target_hash,
    findings: Array.isArray(row.findings) ? row.findings : [],
    warningIds: Array.isArray(row.warning_ids) ? row.warning_ids : [],
    engineFingerprint: row.engine_fingerprint,
    customerPreviewPassed: Boolean(row.customer_preview_passed),
    thumbnail: {
      assetId: row.thumbnail_asset_id ?? '',
      sha256: row.thumbnail_checksum ?? '',
    },
    expiresAt: row.expires_at,
  };
}

function mapAssetRow(row: DatabaseAssetRow): TemplateAssetRecord {
  return {
    id: row.id,
    templateId: row.template_id,
    draftId: row.draft_id ?? null,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_path,
    storagePath: row.storage_path,
    checksum: row.checksum,
    mimeType: row.mime_type,
    byteSize: typeof row.byte_size === 'string' ? parseInt(row.byte_size, 10) : Number(row.byte_size),
    widthPx: row.pixel_width ?? undefined,
    heightPx: row.pixel_height ?? undefined,
    uploadStatus: row.upload_status ?? undefined,
    status: (row.status as 'draft' | 'published' | 'archived' | 'cleaned') ?? 'draft',
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  };
}

export function mapTemplateRow(row: DatabaseTemplateRow): TemplateRecord {
  const productId = (row.product_id ?? 'wrapping') as ProductId;
  const variantId = row.variant_id ?? 'default';
  const mode = (row.product_mode ?? null) as 'pattern' | 'full-sheet' | null;
  const shape = (row.fixed_sticker_shape ?? null) as FixedStickerShape | null;

  let target;
  try {
    target = createTemplateTarget({
      productId,
      variantId,
      mode,
      shape,
    });
  } catch {
    target = {
      productId,
      variantId,
      mode,
      shape,
      geometryKey: `${productId}:${variantId}`,
      surfaces: [],
    };
  }

  return {
    id: String(row.id),
    name: String(row.name),
    slug: row.slug ? String(row.slug) : undefined,
    status: (row.status ?? 'draft') as TemplateStatus,
    revision: Number(row.revision ?? 1),
    productId,
    variantId,
    mode,
    shape,
    target,
    categoryId: row.category_id ? String(row.category_id) : '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    sortOrder: Number(row.sort_order ?? 0),
    currentPublishedVersionId: row.current_published_version_id
      ? String(row.current_published_version_id)
      : null,
    everPublishedAt: row.ever_published_at ? String(row.ever_published_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
  };
}

export function mapDraftRow(row: DatabaseDraftRow): TemplateDraftRecord {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    basedOnVersionId: row.based_on_version_id ? String(row.based_on_version_id) : null,
    designDocument: (row.design_document ?? {}) as unknown as DesignState,
    documentSchemaVersion: Number(row.document_schema_version ?? 1),
    draftRevision: Number(row.draft_revision ?? 1),
    sourceDocumentHash: row.source_document_hash ? String(row.source_document_hash) : null,
    editorUserId: row.editor_user_id ? String(row.editor_user_id) : null,
    leaseSessionId: row.lease_session_id ? String(row.lease_session_id) : null,
    leaseEpoch: Number(row.lease_epoch ?? 0),
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null,
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
  };
}

export function mapVersionRow(row: DatabaseVersionRow): TemplateVersionPayload {
  const target = (row.target_snapshot as unknown as TemplateTarget) ?? {
    productId: 'wrapping' as ProductId,
    variantId: 'default',
    mode: null,
    shape: null,
    geometryKey: 'wrapping:default',
    surfaces: [],
  };

  return {
    versionId: String(row.id),
    templateId: String(row.template_id),
    version: Number(row.version),
    documentSchemaVersion: Number(row.document_schema_version ?? 0),
    document: (row.design_document ?? {}) as unknown as DesignState,
    target,
    dependencies: Array.isArray(row.dependency_snapshot) ? (row.dependency_snapshot as unknown as LibraryRef[]) : [],
  };
}
export function mapVersionSummary(row: DatabaseVersionRow): TemplateVersionSummary {
  return {
    id: String(row.id),
    version: Number(row.version),
    publishedAt: row.published_at ? String(row.published_at) : String(row.created_at),
    publishedBy: row.published_by ? String(row.published_by) : null,
    revisionNote: row.revision_note ? String(row.revision_note) : null,
  };
}

function parseRpcError(error: unknown): { code: TemplateErrorCode | string; message: string } {
  let msg = 'Database RPC error';
  if (error instanceof Error) {
    msg = error.message;
  } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    msg = error.message;
  }
  if (msg.includes('OPERATION_CONFLICT') || msg.includes('REVISION_CONFLICT')) {
    return { code: 'REVISION_CONFLICT', message: msg };
  }
  if (msg.includes('LEASE_CONFLICT') || msg.includes('LEASE_LOST')) {
    return { code: 'LEASE_CONFLICT', message: msg };
  }
  if (msg.includes('LEASE_EXPIRED')) {
    return { code: 'LEASE_EXPIRED', message: msg };
  }
  if (msg.includes('LEASE_ACTIVE')) {
    return { code: 'FORBIDDEN', message: msg };
  }
  if (msg.includes('UNAUTHENTICATED')) {
    return { code: 'UNAUTHENTICATED', message: msg };
  }
  if (msg.includes('FORBIDDEN')) {
    return { code: 'FORBIDDEN', message: msg };
  }
  if (msg.includes('NOT_FOUND')) {
    return { code: 'NOT_FOUND', message: msg };
  }
  if (msg.includes('VALIDATION_FAILED') || msg.includes('UNACKNOWLEDGED_WARNINGS')) {
    return { code: 'VALIDATION_FAILED', message: msg };
  }
  if (msg.includes('ARCHIVED_DEPENDENCY') || msg.includes('UNPUBLISHED_DEPENDENCY') || msg.includes('MISSING_DEPENDENCY') || msg.includes('DEPENDENCY_UNRESOLVED')) {
    return { code: 'DEPENDENCY_UNRESOLVED', message: msg };
  }
  if (msg.includes('TEMPLATE_ARCHIVED')) {
    return { code: 'TEMPLATE_ARCHIVED', message: msg };
  }
  if (msg.includes('IMMUTABLE_VERSION')) {
    return { code: 'IMMUTABLE_VERSION', message: msg };
  }
  if (msg.includes('INVALID_INPUT') || msg.includes('INVALID_CATEGORY') || msg.includes('INVALID_REQUEST_ID')) {
    return { code: 'INVALID_INPUT', message: msg };
  }
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return { code: 'REVISION_CONFLICT', message: 'Resource already exists or conflicting write' };
  }
  return { code: 'INTERNAL_ERROR', message: msg };
}

export class TemplateRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async getTemplate(id: string): Promise<TemplateRecord | null> {
    const { data, error } = await this.client
      .from('templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapTemplateRow(data as DatabaseTemplateRow);
  }

  async getDraft(templateId: string): Promise<TemplateDraftRecord | null> {
    const { data, error } = await this.client
      .from('template_drafts')
      .select('*')
      .eq('template_id', templateId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapDraftRow(data as DatabaseDraftRow);
  }

  async getVersion(id: string): Promise<TemplateVersionPayload | null> {
    const { data, error } = await this.client
      .from('template_versions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapVersionRow(data as DatabaseVersionRow);
  }

  async listVersions(templateId: string): Promise<TemplateVersionSummary[]> {
    const { data, error } = await this.client
      .from('template_versions')
      .select('id, version, published_at, published_by, revision_note, created_at')
      .eq('template_id', templateId)
      .order('version', { ascending: false });

    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as DatabaseVersionRow[]).map(mapVersionSummary);
  }

  async listAdminTemplates(
    query: AdminTemplateListQuery = {},
  ): Promise<{ items: TemplateRecord[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    let q = this.client.from('templates').select('*', { count: 'exact' });
    if (query.status) q = q.eq('status', query.status);
    if (query.productId) q = q.eq('product_id', query.productId);
    if (query.categoryId) q = q.eq('category_id', query.categoryId);
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      q = q.or(`name.ilike.%${term}%,id.ilike.%${term}%`);
    }

    const { data, count, error } = await q
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DatabaseTemplateRow[];
    return {
      items: rows.map(mapTemplateRow),
      total: count ?? rows.length,
    };
  }

  async listCategories(): Promise<TemplateCategoryRecord[]> {
    const { data, error } = await this.client
      .from('template_categories')
      .select('id, name, sort_order')
      .order('sort_order', { ascending: true });
    if (error) {
      // Fallback standard categories if table or query unavailable
      return [
        { id: 'all', name: 'Tất cả', sortOrder: 0 },
        { id: 'birthday', name: 'Sinh nhật', sortOrder: 1 },
        { id: 'cute', name: 'Cute', sortOrder: 2 },
        { id: 'floral', name: 'Hoa', sortOrder: 3 },
        { id: 'minimal', name: 'Tối giản', sortOrder: 4 },
        { id: 'love', name: 'Tình yêu', sortOrder: 5 },
        { id: 'thanks', name: 'Cảm ơn', sortOrder: 6 },
      ];
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      sortOrder: Number(row.sort_order ?? 0),
    }));
  }

  async createTemplate(
    actor: string,
    input: CreateTemplateRepoInput,
  ): Promise<TemplateRepoResult<{ template: TemplateRecord; draft: TemplateDraftRecord }>> {
    try {
      const payload = {
        id: input.id,
        name: input.name,
        productId: input.productId,
        variantId: input.variantId,
        productMode: input.productMode,
        fixedStickerShape: input.fixedStickerShape,
        categoryId: input.categoryId ?? null,
        tags: input.tags ?? [],
        sortOrder: input.sortOrder ?? 0,
        targetSnapshot: input.targetSnapshot,
        initialDocument: input.initialDocument,
      };

      const { data, error } = await this.client.rpc('template_create', {
        p_actor: actor,
        p_request: input.requestId,
        p_payload: payload,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to create template';
        return {
          ok: false,
          code: errCode,
          message: errMsg,
        };
      }

      const tmplRow = resp.template as DatabaseTemplateRow;
      const draftRow = resp.draft as DatabaseDraftRow;

      return {
        ok: true,
        value: {
          template: mapTemplateRow(tmplRow),
          draft: mapDraftRow(draftRow),
        },
      };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async createDraft(
    actor: string,
    mutation: TemplateMutation,
    expectedBaseVersionId?: string | null,
  ): Promise<TemplateRepoResult<TemplateDraftRecord>> {
    try {
      const { data, error } = await this.client.rpc('template_create_draft', {
        p_actor: actor,
        p_request: mutation.requestId,
        p_template_id: mutation.templateId,
        p_expected_catalog_revision: mutation.expectedCatalogRevision,
        p_expected_base_version_id: expectedBaseVersionId ?? null,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to create draft';
        return {
          ok: false,
          code: errCode,
          message: errMsg,
        };
      }

      const draftRow = resp.draft as DatabaseDraftRow;
      return {
        ok: true,
        value: mapDraftRow(draftRow),
      };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async patchMetadata(
    actor: string,
    mutation: TemplateMutation,
    patch: TemplateMetadataPatch,
  ): Promise<TemplateRepoResult<TemplateRecord>> {
    try {
      const { data, error } = await this.client.rpc('template_patch_metadata', {
        p_actor: actor,
        p_request: mutation.requestId,
        p_template_id: mutation.templateId,
        p_expected_revision: mutation.expectedCatalogRevision,
        p_patch: patch,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to patch template metadata';
        return {
          ok: false,
          code: errCode,
          message: errMsg,
        };
      }

      const tmplRow = resp.template as DatabaseTemplateRow;
      return {
        ok: true,
        value: mapTemplateRow(tmplRow),
      };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async acquireLease(
    actor: string,
    input: { requestId: string; draftId: string; sessionId: string },
  ): Promise<TemplateRepoResult<TemplateDraftRecord>> {
    try {
      const { data, error } = await this.client.rpc('template_acquire_draft_lease', {
        p_actor: actor,
        p_request: input.requestId,
        p_draft_id: input.draftId,
        p_session_id: input.sessionId,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok || !resp.draft) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to acquire lease';
        return { ok: false, code: errCode, message: errMsg };
      }

      const draftRow = resp.draft as DatabaseDraftRow;
      return { ok: true, value: mapDraftRow(draftRow) };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async heartbeatLease(
    actor: string,
    input: { requestId: string; draftId: string; sessionId: string; epoch: number },
  ): Promise<TemplateRepoResult<{ sessionId: string; epoch: number; expiresAt: string }>> {
    try {
      const { data, error } = await this.client.rpc('template_heartbeat_draft_lease', {
        p_actor: actor,
        p_request: input.requestId,
        p_draft_id: input.draftId,
        p_session_id: input.sessionId,
        p_epoch: input.epoch,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok || !resp.value) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to heartbeat lease';
        return { ok: false, code: errCode, message: errMsg };
      }

      const val = resp.value as { sessionId: string; epoch: number; expiresAt: string };
      return { ok: true, value: val };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async saveDraft(
    actor: string,
    input: {
      requestId: string;
      draftId: string;
      expectedRevision: number;
      sessionId: string;
      leaseEpoch: number;
      document: DesignState;
    },
  ): Promise<TemplateRepoResult<{ revision: number; updatedAt: string; requestId: string }>> {
    try {
      const { data, error } = await this.client.rpc('template_save_draft', {
        p_actor: actor,
        p_request: input.requestId,
        p_draft_id: input.draftId,
        p_expected_revision: input.expectedRevision,
        p_session_id: input.sessionId,
        p_epoch: input.leaseEpoch,
        p_document: input.document,
        p_document_schema_version: 1,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok || !resp.value) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to save draft';
        return { ok: false, code: errCode, message: errMsg };
      }

      const val = resp.value as { revision: number; updatedAt: string; requestId: string };
      return { ok: true, value: val };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async takeoverDraft(
    actor: string,
    input: {
      requestId: string;
      draftId: string;
      expectedRevision: number;
      expectedEpoch: number;
      newSessionId: string;
      reason: string;
    },
  ): Promise<TemplateRepoResult<TemplateDraftRecord>> {
    try {
      const { data, error } = await this.client.rpc('template_takeover_draft', {
        p_actor: actor,
        p_request: input.requestId,
        p_draft_id: input.draftId,
        p_expected_revision: input.expectedRevision,
        p_expected_epoch: input.expectedEpoch,
        p_new_session_id: input.newSessionId,
        p_reason: input.reason,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok || !resp.draft) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to take over draft';
        return { ok: false, code: errCode, message: errMsg };
      }

      const draftRow = resp.draft as DatabaseDraftRow;
      return { ok: true, value: mapDraftRow(draftRow) };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async discardDraft(
    actor: string,
    input: {
      requestId: string;
      draftId: string;
      expectedRevision: number;
      sessionId: string;
      epoch: number;
    },
  ): Promise<TemplateRepoResult<{ draftId: string; discarded: boolean }>> {
    try {
      const { data, error } = await this.client.rpc('template_discard_draft', {
        p_actor: actor,
        p_request: input.requestId,
        p_draft_id: input.draftId,
        p_expected_revision: input.expectedRevision,
        p_session_id: input.sessionId,
        p_epoch: input.epoch,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to discard draft';
        return { ok: false, code: errCode, message: errMsg };
      }

      return {
        ok: true,
        value: {
          draftId: String(resp.draftId ?? input.draftId),
          discarded: Boolean(resp.discarded ?? true),
        },
      };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async discardTemplateDraft(
    actor: string,
    input: {
      requestId: string;
      draftId: string;
      expectedRevision: number;
      sessionId: string;
      epoch: number;
    },
  ): Promise<TemplateRepoResult<{ draftId: string; discarded: boolean }>> {
    return this.discardDraft(actor, input);
  }

  async archiveTemplate(
    actor: string,
    input: TemplateMutation,
  ): Promise<TemplateRepoResult<TemplateRecord>> {
    try {
      const { data, error } = await this.client.rpc('template_archive', {
        p_actor: actor,
        p_request: input.requestId,
        p_template_id: input.templateId,
        p_expected_revision: input.expectedCatalogRevision,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to archive template';
        return { ok: false, code: errCode, message: errMsg };
      }

      const tmplRow = resp.template as DatabaseTemplateRow;
      return {
        ok: true,
        value: mapTemplateRow(tmplRow),
      };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async republishTemplate(
    actor: string,
    input: TemplateMutation,
  ): Promise<TemplateRepoResult<TemplateRecord>> {
    try {
      const { data, error } = await this.client.rpc('template_republish', {
        p_actor: actor,
        p_request: input.requestId,
        p_template_id: input.templateId,
        p_expected_revision: input.expectedCatalogRevision,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to republish template';
        return { ok: false, code: errCode, message: errMsg };
      }

      const tmplRow = resp.template as DatabaseTemplateRow;
      return {
        ok: true,
        value: mapTemplateRow(tmplRow),
      };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async duplicateTemplate(
    actor: string,
    input: DuplicateTemplateInput,
  ): Promise<TemplateRepoResult<{ template: TemplateRecord; draft: TemplateDraftRecord }>> {
    try {
      const { data, error } = await this.client.rpc('template_duplicate', {
        p_actor: actor,
        p_request: input.requestId,
        p_source_template_id: input.sourceTemplateId,
        p_new_template_id: input.newTemplateId ?? null,
        p_source_version_id: input.sourceVersionId ?? null,
        p_new_name: input.newName ?? null,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to duplicate template';
        return { ok: false, code: errCode, message: errMsg };
      }

      const tmplRow = resp.template as DatabaseTemplateRow;
      const draftRow = resp.draft as DatabaseDraftRow;
      return {
        ok: true,
        value: {
          template: mapTemplateRow(tmplRow),
          draft: mapDraftRow(draftRow),
        },
      };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async deleteDraftTemplate(
    actor: string,
    input: DeleteDraftTemplateInput,
  ): Promise<TemplateRepoResult<{ templateId: string; deleted: boolean }>> {
    try {
      const { data, error } = await this.client.rpc('template_delete_draft', {
        p_actor: actor,
        p_request: input.requestId,
        p_template_id: input.templateId,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to delete draft template';
        return { ok: false, code: errCode, message: errMsg };
      }

      return {
        ok: true,
        value: {
          templateId: String(resp.templateId ?? input.templateId),
          deleted: Boolean(resp.deleted ?? true),
        },
      };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async publishDraft(
    actor: string,
    input: PublishTemplateInput,
  ): Promise<TemplateRepoResult<TemplateVersionPayload>> {
    try {
      const { data, error } = await this.client.rpc('template_publish_draft', {
        p_actor: actor,
        p_request: input.requestId,
        p_template_id: input.templateId,
        p_draft_id: input.draftId,
        p_expected_draft_revision: input.expectedRevision,
        p_expected_catalog_revision: input.expectedCatalogRevision,
        p_session_id: input.sessionId,
        p_lease_epoch: input.leaseEpoch,
        p_validation_id: input.validationId,
        p_acknowledged_warning_ids: input.acknowledgedWarningIds ?? [],
        p_revision_note: input.revisionNote ?? null,
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Publish failed';
        return { ok: false, code: errCode, message: errMsg };
      }

      const versionRow = resp.version as DatabaseVersionRow;
      if (!versionRow) {
        return { ok: false, code: 'INTERNAL_ERROR', message: 'Publish returned no version' };
      }

      return {
        ok: true,
        value: mapVersionRow(versionRow),
      };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async attachAsset(
    actor: string,
    input: AttachTemplateAssetInput,
  ): Promise<TemplateRepoResult<TemplateAssetRecord>> {
    try {
      const { data, error } = await this.client.rpc('template_attach_asset', {
        p_actor: actor,
        p_template_id: input.templateId,
        p_draft_id: input.draftId ?? null,
        p_storage_bucket: input.storageBucket,
        p_storage_path: input.storagePath,
        p_checksum: input.checksum,
        p_mime_type: input.mimeType,
        p_byte_size: input.byteSize,
        p_pixel_width: input.pixelWidth ?? null,
        p_pixel_height: input.pixelHeight ?? null,
        p_upload_status: input.uploadStatus ?? 'attached',
      });

      if (error) {
        const parsed = parseRpcError(error);
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const resp = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (!resp || !resp.ok || !resp.asset) {
        const errCode = typeof resp?.code === 'string' ? (resp.code as TemplateErrorCode) : 'INTERNAL_ERROR';
        const errMsg = typeof resp?.message === 'string' ? resp.message : 'Failed to attach asset';
        return { ok: false, code: errCode, message: errMsg };
      }

      const raw = resp.asset as Record<string, unknown>;
      const asset: TemplateAssetRecord = {
        id: String(raw.id),
        templateId: String(raw.templateId),
        draftId: raw.draftId ? String(raw.draftId) : null,
        storageBucket: String(raw.storageBucket),
        storageKey: String(raw.storagePath),
        checksum: String(raw.checksum),
        mimeType: String(raw.mimeType),
        byteSize: Number(raw.byteSize),
        widthPx: raw.pixelWidth ? Number(raw.pixelWidth) : undefined,
        heightPx: raw.pixelHeight ? Number(raw.pixelHeight) : undefined,
        uploadStatus: raw.uploadStatus ? String(raw.uploadStatus) : undefined,
        isPublished: Boolean(raw.isPublished),
        createdAt: String(raw.createdAt),
      };

      return { ok: true, value: asset };
    } catch (err: unknown) {
      const parsed = parseRpcError(err);
      return { ok: false, code: parsed.code, message: parsed.message };
    }
  }

  async getAsset(assetId: string): Promise<TemplateAssetRecord | null> {
    const { data, error } = await this.client
      .from('template_assets')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapAssetRow(data as DatabaseAssetRow);
  }

  async listAssetsForTemplate(templateId: string): Promise<TemplateAssetRecord[]> {
    const { data, error } = await this.client
      .from('template_assets')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return ((data ?? []) as DatabaseAssetRow[]).map(mapAssetRow);
  }

  async listEligibleSourceProjects(
    actor: string,
    productId?: string | null,
  ): Promise<EligibleSourceProject[]> {
    const { data, error } = await this.client.rpc('template_list_eligible_source_projects', {
      p_actor: actor,
      p_product_id: productId ?? null,
    });

    if (error) throw new Error(error.message);
    return (data ?? []) as EligibleSourceProject[];
  }

  async getSourceProject(actor: string, projectId: string): Promise<SourceProjectDetail | null> {
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const { data: ordersData, error: ordersError } = await this.client
      .from('orders')
      .select('id')
      .eq('project_id', projectId)
      .limit(1);

    if (ordersError) throw new Error(ordersError.message);
    const hasLinkedOrders = Boolean(ordersData && ordersData.length > 0);
    const eligible = !hasLinkedOrders && data.working_document !== null && data.owner_user_id === actor;
    const blockedReason = hasLinkedOrders
      ? 'HAS_LINKED_ORDERS'
      : (data.working_document === null ? 'NO_DOCUMENT' : null);

    return {
      id: data.id,
      ownerUserId: data.owner_user_id,
      productId: data.product_id,
      variantId: data.variant_id ?? null,
      currentWorkingRevision: data.current_working_revision,
      workingDocument: (data.working_document as Record<string, unknown>) ?? null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      eligible,
      blockedReason,
    };
  }

  async uploadStorageObject(bucket: string, path: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).upload(path, bytes, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) {
      throw new Error(`Failed to upload storage object ${bucket}/${path}: ${error.message}`);
    }
  }

  async downloadStorageObject(bucket: string, path: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client.storage.from(bucket).download(path);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async copyStorageObject(fromBucket: string, fromPath: string, toBucket: string, toPath: string): Promise<void> {
    const bytes = await this.downloadStorageObject(fromBucket, fromPath);
    if (!bytes) {
      throw new Error(`Failed to read source object from ${fromBucket}/${fromPath}`);
    }
    const ext = fromPath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    await this.uploadStorageObject(toBucket, toPath, bytes, mimeType);
  }

  async deleteStorageObject(bucket: string, path: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([path]);
    if (error) {
      throw new Error(`Failed to delete storage object ${bucket}/${path}: ${error.message}`);
    }
  }

  async markAssetPublished(assetId: string): Promise<void> {
    const { error } = await this.client
      .from('template_assets')
      .update({ is_published: true, status: 'published', ever_published_at: new Date().toISOString(), upload_status: 'verified' })
      .eq('id', assetId);

    if (error) throw new Error(error.message);
  }

  async linkVersionAsset(versionId: string, assetId: string): Promise<void> {
    const { error } = await this.client
      .from('template_version_assets')
      .insert({ version_id: versionId, asset_id: assetId });

    if (error && !error.message.includes('duplicate key') && !error.message.includes('unique constraint')) {
      throw new Error(error.message);
    }
  }

  async listUnreferencedDraftAssets(cutoffDate: Date): Promise<TemplateAssetRecord[]> {
    const { data, error } = await this.client
      .from('template_assets')
      .select('*')
      .eq('is_published', false)
      .lt('created_at', cutoffDate.toISOString());

    if (error) throw new Error(error.message);
    return ((data ?? []) as DatabaseAssetRow[]).map(mapAssetRow);
  }

  async deleteAssetRecord(assetId: string): Promise<void> {
    const { error } = await this.client
      .from('template_assets')
      .delete()
      .eq('id', assetId);

    if (error) throw new Error(error.message);
  }

  async cleanupDraftAsset(
    actor: string,
    assetId: string,
    options: { requestId?: string; maxAgeHours?: number } = {},
  ): Promise<{ success: boolean; storagePath?: string; storageBucket?: string; reason?: string }> {
    const { data, error } = await this.client.rpc('template_cleanup_draft_asset', {
      p_actor: actor,
      p_request: options.requestId ?? `cleanup-${Date.now()}`,
      p_asset_id: assetId,
      p_max_age_hours: options.maxAgeHours ?? 24,
    });

    if (error) {
      throw new Error(`Failed to cleanup draft asset: ${error.message}`);
    }

    const resp = data as { success?: boolean; storage_path?: string; storage_bucket?: string; reason?: string } | null;
    return {
      success: Boolean(resp?.success),
      storagePath: resp?.storage_path,
      storageBucket: resp?.storage_bucket,
      reason: resp?.reason,
    };
  }

  async getValidationRun(id: string): Promise<TemplateValidationReceipt | null> {
    const { data, error } = await this.client
      .from('template_validation_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return mapValidationRunRow(data as DatabaseValidationRunRow);
  }

  async recordValidationRun(
    actor: string,
    input: RecordValidationRunInput,
  ): Promise<TemplateRepoResult<TemplateValidationReceipt>> {
    const { data, error } = await this.client.rpc('template_record_validation_run', {
      p_actor_id: actor,
      p_template_id: input.templateId,
      p_draft_id: input.draftId,
      p_source_revision: input.sourceRevision,
      p_lease_session_id: input.leaseSessionId,
      p_lease_epoch: input.leaseEpoch,
      p_source_document_hash: input.sourceDocumentHash,
      p_candidate_document_hash: input.candidateDocumentHash,
      p_target_hash: input.targetHash,
      p_dependency_manifest_hash: input.dependencyManifestHash ?? null,
      p_findings: input.findings,
      p_warning_ids: input.warningIds,
      p_validator_version: input.validatorVersion ?? '1.0.0',
      p_engine_fingerprint: input.engineFingerprint,
      p_customer_preview_passed: input.customerPreviewPassed,
      p_thumbnail_asset_id: input.thumbnailAssetId ?? null,
      p_thumbnail_checksum: input.thumbnailChecksum ?? null,
      p_preview_metadata: input.previewMetadata ?? {},
      p_expires_at: input.expiresAt,
    });

    if (error) {
      const { data: directData, error: directError } = await this.client
        .from('template_validation_runs')
        .insert({
          id: input.id,
          template_id: input.templateId,
          draft_id: input.draftId,
          source_revision: input.sourceRevision,
          lease_session_id: input.leaseSessionId,
          lease_epoch: input.leaseEpoch,
          source_document_hash: input.sourceDocumentHash,
          candidate_document_hash: input.candidateDocumentHash,
          target_hash: input.targetHash,
          dependency_manifest_hash: input.dependencyManifestHash ?? null,
          findings: input.findings,
          warning_ids: input.warningIds,
          validator_version: input.validatorVersion ?? '1.0.0',
          engine_fingerprint: input.engineFingerprint,
          customer_preview_passed: input.customerPreviewPassed,
          thumbnail_asset_id: input.thumbnailAssetId ?? null,
          thumbnail_checksum: input.thumbnailChecksum ?? null,
          preview_metadata: input.previewMetadata ?? {},
          expires_at: input.expiresAt,
        })
        .select('*')
        .single();

      if (directError || !directData) {
        return { ok: false, code: 'VALIDATION_FAILED', message: error.message };
      }

      return { ok: true, value: mapValidationRunRow(directData as DatabaseValidationRunRow) };
    }

    let runId: string | undefined;
    if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'string') {
      runId = data.id;
    }
    if (runId) {
      const receipt = await this.getValidationRun(runId);
      if (receipt) return { ok: true, value: receipt };
    }

    return {
      ok: true,
      value: {
        id: runId ?? input.id ?? 'mock-run-id',
        templateId: input.templateId,
        draftId: input.draftId,
        sourceRevision: input.sourceRevision,
        sourceDocumentHash: input.sourceDocumentHash,
        candidateDocumentHash: input.candidateDocumentHash,
        targetHash: input.targetHash,
        leaseEpoch: input.leaseEpoch,
        sessionId: input.leaseSessionId,
        findings: input.findings,
        warningIds: input.warningIds,
        customerPreviewPassed: input.customerPreviewPassed,
        engineFingerprint: input.engineFingerprint,
        thumbnail: {
          assetId: input.thumbnailAssetId ?? '',
          sha256: input.thumbnailChecksum ?? '',
        },
        expiresAt: input.expiresAt,
      },
    };
  }

  async getBatchDependencies(refs: {
    fontFaces?: string[];
    stickers?: string[];
    fontFamilies?: string[];
  }): Promise<Map<string, DependencyMetadataItem>> {
    const result = new Map<string, DependencyMetadataItem>();
    const faceIds = (refs.fontFaces ?? []).filter(Boolean);
    const familyIds = new Set<string>((refs.fontFamilies ?? []).filter(Boolean));

    const validFaceIds = faceIds.filter((id) => UUID_REGEX.test(id));
    let faces: Array<{
      id: string;
      family_id?: string | null;
      status: 'draft' | 'published' | 'archived';
      checksum?: string | null;
      storage_bucket?: string | null;
      storage_path?: string | null;
      format?: string | null;
      postscript_name?: string | null;
      css_family?: string | null;
    }> = [];

    if (validFaceIds.length > 0) {
      const { data } = await this.client
        .from('font_faces')
        .select('id, family_id, status, checksum, storage_bucket, storage_path, format, postscript_name, css_family')
        .in('id', validFaceIds);

      if (Array.isArray(data)) {
        faces = data as typeof faces;
        for (const face of faces) {
          if (face.family_id) {
            familyIds.add(face.family_id);
          }
        }
      }
    }

    const familyMap = new Map<string, { id: string; name?: string; status: 'draft' | 'published' | 'archived' }>();
    if (familyIds.size > 0) {
      const { data: families } = await this.client
        .from('fonts')
        .select('id, name, display_name, status')
        .in('id', Array.from(familyIds));

      if (Array.isArray(families)) {
        for (const fam of families) {
          const displayName = fam.display_name ?? fam.name;
          familyMap.set(fam.id, {
            id: fam.id,
            name: displayName,
            status: fam.status,
          });
          const famItem: DependencyMetadataItem = {
            id: fam.id,
            kind: 'font-family',
            status: fam.status,
            familyName: displayName,
          };
          result.set(fam.id, famItem);
          result.set(`font-family:${fam.id}`, famItem);
          if (fam.name && fam.name !== fam.id) {
            result.set(fam.name, famItem);
          }
        }
      }
    }

    for (const face of faces) {
      const fam = face.family_id ? familyMap.get(face.family_id) : undefined;
      const item: DependencyMetadataItem = {
        id: face.id,
        kind: 'font-face',
        status: face.status,
        checksum: face.checksum ?? undefined,
        familyId: face.family_id ?? undefined,
        familyName: fam?.name ?? face.css_family ?? undefined,
        familyStatus: fam?.status,
        storageBucket: face.storage_bucket ?? undefined,
        storagePath: face.storage_path ?? undefined,
        format: face.format ?? undefined,
        postscriptName: face.postscript_name ?? undefined,
        cssFamily: face.css_family ?? undefined,
      };
      result.set(face.id, item);
      result.set(`font-face:${face.id}`, item);
    }

    const stickerIds = (refs.stickers ?? []).filter(Boolean);
    if (stickerIds.length > 0) {
      const { data: stickers } = await this.client
        .from('sticker_assets')
        .select('id, status, checksum')
        .in('id', stickerIds);

      if (Array.isArray(stickers)) {
        for (const sticker of stickers) {
          const item: DependencyMetadataItem = {
            id: sticker.id,
            kind: 'sticker',
            status: sticker.status,
            checksum: sticker.checksum ?? undefined,
          };
          result.set(sticker.id, item);
          result.set(`sticker:${sticker.id}`, item);
        }
      }
    }

    return result;
  }

  async getTemplateAvailability(templateId: string): Promise<TemplateAvailability> {
    const { data, error } = await this.client.rpc('get_template_availability', {
      p_template_id: templateId,
    });

    if (error || !data) {
      return {
        available: false,
        blockers: [{ code: 'INTERNAL_ERROR', message: error?.message ?? 'Lỗi kiểm tra tính khả dụng' }],
      };
    }

    return data as TemplateAvailability;
  }
}
