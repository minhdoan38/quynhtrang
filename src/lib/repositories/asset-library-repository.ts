import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  FontCategory,
  FontFaceRecord,
  FontFormat,
  LibraryKind,
  LibraryRecord,
  LibraryStatus,
  LicenseAcknowledgement,
  ValidationReceipt,
} from '../domain/asset-library.ts';

export interface FontFamilyRecord {
  id: string;
  familyName: string;
  displayName: string | null;
  status: LibraryStatus;
  revision: number;
  everPublishedAt: string | null;
  category: FontCategory | null;
  tags: string[];
  searchKeywords: string[];
  description: string | null;
  sampleText: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StickerRecord extends LibraryRecord {
  width: number | null;
  height: number | null;
}

export interface ListQuery {
  status?: LibraryStatus;
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

interface DatabaseFamilyRow {
  id: string;
  family_name: string;
  display_name: string | null;
  status: string;
  revision: number | string;
  ever_published_at: string | null;
  category: string | null;
  tags: string[] | null;
  search_keywords: string[] | null;
  description: string | null;
  sample_text: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface DatabaseFaceRow {
  id: string;
  family_id: string;
  css_family: string;
  format: string;
  weight_min: number;
  weight_max: number;
  style: string;
  internal_family: string;
  postscript_name: string;
  storage_bucket: string;
  storage_path: string;
  checksum: string;
  byte_size: number | string;
  mime_type: string;
  status: string;
  revision: number | string;
  ever_published_at: string | null;
  license: unknown;
  validation_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface DatabaseStickerRow {
  id: string;
  category: string;
  tags: string[] | null;
  storage_path: string;
  thumbnail_path: string | null;
  status: string;
  revision: number | string;
  ever_published_at: string | null;
  display_name: string | null;
  search_keywords: string[] | null;
  description: string | null;
  checksum: string | null;
  mime_type: string | null;
  byte_size: number | string | null;
  width: number | null;
  height: number | null;
  license: unknown;
  validation_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown> | null;
}

interface DatabaseValidationRow {
  id: string;
  kind: string;
  asset_id: string;
  revision: number | string;
  checksum: string;
  validator_version: string;
  engine_fingerprint: string;
  passed: boolean;
  failures: unknown;
  missing_codepoints: number[] | null;
  browser_proof_hash: string | null;
  production_proof_hash: string | null;
}

export function mapFamilyRow(row: DatabaseFamilyRow): FontFamilyRecord {
  return {
    id: String(row.id),
    familyName: String(row.family_name),
    displayName: row.display_name ? String(row.display_name) : null,
    status: (row.status ?? 'draft') as LibraryStatus,
    revision: Number(row.revision ?? 1),
    everPublishedAt: row.ever_published_at ? String(row.ever_published_at) : null,
    category: (row.category ?? null) as FontCategory | null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    searchKeywords: Array.isArray(row.search_keywords) ? row.search_keywords : [],
    description: row.description ? String(row.description) : null,
    sampleText: row.sample_text ? String(row.sample_text) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapFaceRow(row: DatabaseFaceRow): FontFaceRecord {
  const checksum = String(row.checksum ?? '');
  return {
    ref: { kind: 'font-face', id: String(row.id), checksum },
    familyId: String(row.family_id),
    cssFamily: String(row.css_family),
    format: row.format as FontFormat,
    weightMin: Number(row.weight_min),
    weightMax: Number(row.weight_max),
    style: (row.style === 'italic' ? 'italic' : 'normal'),
    internalFamily: String(row.internal_family),
    postscriptName: String(row.postscript_name),
    status: (row.status ?? 'draft') as LibraryStatus,
    revision: Number(row.revision ?? 1),
    everPublishedAt: row.ever_published_at ? String(row.ever_published_at) : null,
    binary: {
      bucket: (row.storage_bucket ?? 'library-drafts') as 'library-drafts' | 'fonts' | 'sticker-library',
      key: String(row.storage_path),
      checksum,
      byteSize: Number(row.byte_size ?? 0),
      mimeType: String(row.mime_type ?? 'font/woff2'),
    },
    thumbnail: null,
    displayName: String(row.internal_family || row.postscript_name),
    category: '',
    tags: [],
    searchKeywords: [],
    description: '',
    sampleText: null,
    license: (row.license && typeof row.license === 'object' ? row.license as LicenseAcknowledgement : null),
    validationId: row.validation_id ? String(row.validation_id) : null,
  };
}

export function mapStickerRow(row: DatabaseStickerRow): StickerRecord {
  const checksum = String(row.checksum ?? '');
  const isDraft = (row.status ?? 'draft') === 'draft';
  const bucket = isDraft ? 'library-drafts' : 'sticker-library';
  return {
    ref: { kind: 'sticker', id: String(row.id), checksum },
    status: (row.status ?? 'draft') as LibraryStatus,
    revision: Number(row.revision ?? 1),
    everPublishedAt: row.ever_published_at ? String(row.ever_published_at) : null,
    binary: {
      bucket,
      key: String(row.storage_path),
      checksum,
      byteSize: Number(row.byte_size ?? 0),
      mimeType: String(row.mime_type ?? 'image/svg+xml'),
    },
    thumbnail: row.thumbnail_path
      ? {
        bucket,
        key: String(row.thumbnail_path),
        checksum: '',
        byteSize: 0,
        mimeType: 'image/png',
      }
      : null,
    displayName: String(row.display_name ?? row.id),
    category: String(row.category ?? ''),
    tags: Array.isArray(row.tags) ? row.tags : [],
    searchKeywords: Array.isArray(row.search_keywords) ? row.search_keywords : [],
    description: String(row.description ?? ''),
    sampleText: null,
    license: (row.license && typeof row.license === 'object' ? row.license as LicenseAcknowledgement : null),
    validationId: row.validation_id ? String(row.validation_id) : null,
    width: row.width !== null && row.width !== undefined ? Number(row.width) : null,
    height: row.height !== null && row.height !== undefined ? Number(row.height) : null,
  };
}

export function mapValidationRow(row: DatabaseValidationRow): ValidationReceipt {
  return {
    id: String(row.id),
    ref: { kind: row.kind as LibraryKind, id: String(row.asset_id), checksum: String(row.checksum) },
    revision: Number(row.revision),
    validatorVersion: String(row.validator_version),
    engineFingerprint: String(row.engine_fingerprint),
    passed: Boolean(row.passed),
    failures: Array.isArray(row.failures) ? (row.failures as { code: string; detail: string }[]) : [],
    missingCodepoints: Array.isArray(row.missing_codepoints) ? row.missing_codepoints.map(Number) : [],
    browserProofHash: row.browser_proof_hash ? String(row.browser_proof_hash) : null,
    productionProofHash: row.production_proof_hash ? String(row.production_proof_hash) : null,
  };
}

export class AssetLibraryRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async listFontFamilies(query: ListQuery = {}): Promise<{ items: FontFamilyRecord[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    let q = this.client.from('fonts').select('*', { count: 'exact' });
    if (query.status) q = q.eq('status', query.status);
    if (query.category) q = q.eq('category', query.category);

    const { data, count, error } = await q
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DatabaseFamilyRow[];
    return { items: rows.map(mapFamilyRow), total: count ?? rows.length };
  }

  async getFontFamily(id: string): Promise<FontFamilyRecord | null> {
    const { data, error } = await this.client
      .from('fonts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapFamilyRow(data as unknown as DatabaseFamilyRow);
  }

  async listFontFaces(familyId: string, status?: LibraryStatus): Promise<FontFaceRecord[]> {
    let q = this.client
      .from('font_faces')
      .select('*')
      .eq('family_id', familyId);

    if (status) q = q.eq('status', status);

    const { data, error } = await q
      .order('weight_min', { ascending: true })
      .order('style', { ascending: true });

    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as DatabaseFaceRow[]).map(mapFaceRow);
  }

  async getFontFace(id: string): Promise<FontFaceRecord | null> {
    const { data, error } = await this.client
      .from('font_faces')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapFaceRow(data as unknown as DatabaseFaceRow);
  }

  async listStickers(query: ListQuery = {}): Promise<{ items: StickerRecord[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    let q = this.client.from('sticker_assets').select('*', { count: 'exact' });
    if (query.status) q = q.eq('status', query.status);
    if (query.category) q = q.eq('category', query.category);

    const { data, count, error } = await q
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DatabaseStickerRow[];
    return { items: rows.map(mapStickerRow), total: count ?? rows.length };
  }

  async getSticker(id: string): Promise<StickerRecord | null> {
    const { data, error } = await this.client
      .from('sticker_assets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapStickerRow(data as unknown as DatabaseStickerRow);
  }

  async listValidationRuns(kind: LibraryKind, assetId: string): Promise<ValidationReceipt[]> {
    const { data, error } = await this.client
      .from('library_validation_runs')
      .select('*')
      .eq('kind', kind)
      .eq('asset_id', assetId)
      .order('revision', { ascending: false });

    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as DatabaseValidationRow[]).map(mapValidationRow);
  }

  async createDraft(actor: string, request: string, kind: LibraryKind, id: string, payload: unknown): Promise<unknown> {
    const { data, error } = await this.client.rpc('library_create_draft', {
      p_actor: actor,
      p_request: request,
      p_kind: kind,
      p_id: id,
      p_payload: payload,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async patchMetadata(
    actor: string,
    request: string,
    kind: LibraryKind,
    id: string,
    revision: number,
    patch: unknown,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc('library_patch_metadata', {
      p_actor: actor,
      p_request: request,
      p_kind: kind,
      p_id: id,
      p_revision: revision,
      p_patch: patch,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async publish(
    actor: string,
    request: string,
    kind: LibraryKind,
    id: string,
    revision: number,
    validation: string,
    publicObjects: unknown,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc('library_publish', {
      p_actor: actor,
      p_request: request,
      p_kind: kind,
      p_id: id,
      p_revision: revision,
      p_validation: validation,
      p_public_objects: publicObjects,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async archive(
    actor: string,
    request: string,
    kind: LibraryKind,
    id: string,
    revision: number,
    reason: string,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc('library_archive', {
      p_actor: actor,
      p_request: request,
      p_kind: kind,
      p_id: id,
      p_revision: revision,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async prepareDelete(
    actor: string,
    request: string,
    kind: LibraryKind,
    id: string,
    revision: number,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc('library_prepare_delete', {
      p_actor: actor,
      p_request: request,
      p_kind: kind,
      p_id: id,
      p_revision: revision,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async finishDelete(actor: string, intent: string): Promise<unknown> {
    const { data, error } = await this.client.rpc('library_finish_delete', {
      p_actor: actor,
      p_intent: intent,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async createFamily(actor: string, request: string, id: string, payload: unknown): Promise<unknown> {
    const { data, error } = await this.client.rpc('library_create_family', {
      p_actor: actor,
      p_request: request,
      p_id: id,
      p_payload: payload,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async patchFamily(actor: string, request: string, id: string, revision: number, patch: unknown): Promise<unknown> {
    const { data, error } = await this.client.rpc('library_patch_family', {
      p_actor: actor,
      p_request: request,
      p_id: id,
      p_revision: revision,
      p_patch: patch,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async setFamilyStatus(
    actor: string,
    request: string,
    id: string,
    revision: number,
    status: LibraryStatus,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc('library_set_family_status', {
      p_actor: actor,
      p_request: request,
      p_id: id,
      p_revision: revision,
      p_status: status,
    });
    if (error) throw new Error(error.message);
    return data;
  }
}
