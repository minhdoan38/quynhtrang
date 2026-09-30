import type { SupabaseClient } from '@supabase/supabase-js';

export interface AssetRecord {
  id: string;
  projectId?: string | null;
  kind: string;
  storageBucket: string;
  storagePath: string;
  originalName?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  pixelWidth?: number | null;
  pixelHeight?: number | null;
  checksum?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CreateAssetInput {
  projectId?: string | null;
  kind: string;
  storageBucket: string;
  storagePath: string;
  originalName?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  pixelWidth?: number | null;
  pixelHeight?: number | null;
  checksum?: string | null;
  metadata?: Record<string, unknown>;
}

export class AssetRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async create(input: CreateAssetInput): Promise<AssetRecord> {
    const payload = {
      project_id: input.projectId ?? null,
      kind: input.kind,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      original_name: input.originalName ?? null,
      mime_type: input.mimeType ?? null,
      byte_size: input.byteSize ?? null,
      pixel_width: input.pixelWidth ?? null,
      pixel_height: input.pixelHeight ?? null,
      checksum: input.checksum ?? null,
      metadata: input.metadata ?? {},
    };

    const { data, error } = await this.client
      .from('assets')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create asset record: ${error?.message ?? 'unknown'}`);
    }

    return this.mapRow(data);
  }

  async getById(id: string): Promise<AssetRecord | null> {
    const { data, error } = await this.client
      .from('assets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  async listByProject(projectId: string): Promise<AssetRecord[]> {
    const { data, error } = await this.client
      .from('assets')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error || !data || !Array.isArray(data)) return [];
    return data.map((row) => this.mapRow(row));
  }

  private mapRow(row: unknown): AssetRecord {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      projectId: (r.project_id as string | null) ?? null,
      kind: String(r.kind),
      storageBucket: String(r.storage_bucket),
      storagePath: String(r.storage_path),
      originalName: (r.original_name as string | null) ?? null,
      mimeType: (r.mime_type as string | null) ?? null,
      byteSize: typeof r.byte_size === 'number' ? r.byte_size : null,
      pixelWidth: typeof r.pixel_width === 'number' ? r.pixel_width : null,
      pixelHeight: typeof r.pixel_height === 'number' ? r.pixel_height : null,
      checksum: (r.checksum as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: String(r.created_at),
    };
  }
}
