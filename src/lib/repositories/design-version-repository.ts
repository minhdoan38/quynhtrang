import type { SupabaseClient } from '@supabase/supabase-js';

import type { DesignState } from '../product-state.ts';

export interface DesignVersionRecord {
  id: string;
  projectId: string;
  versionNumber: number;
  source: string;
  designDocument: DesignState;
  productSnapshot: Record<string, unknown>;
  preflightSnapshot: Record<string, unknown>;
  preflightRevision?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface CreateDesignVersionInput {
  projectId: string;
  versionNumber: number;
  source?: string;
  designDocument: DesignState;
  productSnapshot?: Record<string, unknown>;
  preflightSnapshot?: Record<string, unknown>;
  preflightRevision?: string | null;
  createdBy?: string | null;
}

export class DesignVersionRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async createVersion(input: CreateDesignVersionInput): Promise<DesignVersionRecord> {
    const payload = {
      project_id: input.projectId,
      version_number: input.versionNumber,
      source: input.source ?? 'customizer',
      design_document: input.designDocument,
      product_snapshot: input.productSnapshot ?? {},
      preflight_snapshot: input.preflightSnapshot ?? {},
      preflight_revision: input.preflightRevision ?? null,
      created_by: input.createdBy ?? null,
    };

    const { data, error } = await this.client
      .from('design_versions')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create design version: ${error?.message ?? 'unknown'}`);
    }

    return this.mapRow(data);
  }

  async getById(id: string): Promise<DesignVersionRecord | null> {
    const { data, error } = await this.client
      .from('design_versions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  async getLatestForProject(projectId: string): Promise<DesignVersionRecord | null> {
    const { data, error } = await this.client
      .from('design_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  private mapRow(row: unknown): DesignVersionRecord {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      versionNumber: Number(r.version_number),
      source: String(r.source ?? 'customizer'),
      designDocument: (r.design_document as DesignState) ?? {},
      productSnapshot: (r.product_snapshot as Record<string, unknown>) ?? {},
      preflightSnapshot: (r.preflight_snapshot as Record<string, unknown>) ?? {},
      preflightRevision: (r.preflight_revision as string | null) ?? null,
      createdBy: (r.created_by as string | null) ?? null,
      createdAt: String(r.created_at),
    };
  }
}
