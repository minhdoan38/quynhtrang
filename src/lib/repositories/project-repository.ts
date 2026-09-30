import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProductId } from '../product-state.ts';

export interface ProjectRecord {
  id: string;
  ownerUserId?: string | null;
  guestKeyHash?: string | null;
  productId: ProductId;
  variantId?: string | null;
  status: 'editing' | 'ready' | 'approved' | 'archived';
  currentWorkingRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  productId: ProductId;
  variantId?: string | null;
  ownerUserId?: string | null;
  guestKeyHash?: string | null;
  status?: ProjectRecord['status'];
  currentWorkingRevision?: number;
}

export class ProjectRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const payload = {
      product_id: input.productId,
      variant_id: input.variantId ?? null,
      owner_user_id: input.ownerUserId ?? null,
      guest_key_hash: input.guestKeyHash ?? null,
      status: input.status ?? 'editing',
      current_working_revision: input.currentWorkingRevision ?? 1,
    };

    const { data, error } = await this.client
      .from('projects')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create project: ${error?.message ?? 'unknown'}`);
    }

    return this.mapRow(data);
  }

  async getById(id: string): Promise<ProjectRecord | null> {
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapRow(data);
  }

  async updateRevision(id: string, revision: number, status?: ProjectRecord['status']): Promise<ProjectRecord> {
    const updates: Record<string, unknown> = {
      current_working_revision: revision,
    };
    if (status) updates.status = status;

    const { data, error } = await this.client
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update project revision: ${error?.message ?? 'unknown'}`);
    }

    return this.mapRow(data);
  }

  private mapRow(row: unknown): ProjectRecord {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      ownerUserId: (r.owner_user_id as string | null) ?? null,
      guestKeyHash: (r.guest_key_hash as string | null) ?? null,
      productId: r.product_id as ProductId,
      variantId: (r.variant_id as string | null) ?? null,
      status: (r.status as ProjectRecord['status']) ?? 'editing',
      currentWorkingRevision: Number(r.current_working_revision ?? 1),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }
}
