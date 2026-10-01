import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '../supabase/browser.ts';
import {
  getRecentProjects,
  markProjectMigrated,
  RECENT_PROJECT_RETENTION_MS,
} from '../storage.ts';
import type { DesignState } from '../product-state.ts';

export interface LocalProjectItem {
  id: string;
  updatedAt: number;
  syncedCloudProjectId?: string;
  design?: DesignState;
  productId?: string;
  variantId?: string;
  templateId?: string | null;
  text?: string;
  color?: string;
  backgroundColor?: string;
  image?: unknown;
  productOptions?: Record<string, unknown>;
  elements?: unknown[];
}

export interface MigrationSummary {
  total: number;
  migrated: number;
  failed: number;
  errors: string[];
}

export function filterMigratableProjects(
  projects: LocalProjectItem[],
  now: number = Date.now()
): LocalProjectItem[] {
  return projects.filter((p) => {
    if (p.syncedCloudProjectId) return false;
    if (now - p.updatedAt > RECENT_PROJECT_RETENTION_MS) return false;
    return true;
  });
}

export async function migrateLocalProjects(
  authenticatedUserId: string,
  client?: SupabaseClient
): Promise<MigrationSummary> {
  const supabase = client ?? createBrowserSupabaseClient();
  const allProjects = getRecentProjects();
  const migratable = filterMigratableProjects(allProjects);

  const summary: MigrationSummary = {
    total: migratable.length,
    migrated: 0,
    failed: 0,
    errors: [],
  };

  for (const local of migratable) {
    try {
      // 1. Check if project with origin_local_project_id already exists in cloud
      const { data: existingCloud } = await supabase
        .from('projects')
        .select('id, current_working_revision')
        .eq('owner_user_id', authenticatedUserId)
        .eq('origin_local_project_id', local.id)
        .maybeSingle();

      if (existingCloud) {
        markProjectMigrated(local.id, existingCloud.id, existingCloud.current_working_revision || 1);
        summary.migrated++;
        continue;
      }

      // Reconstruct document
      const doc: DesignState = local.design
        ? structuredClone(local.design)
        : {
          productId: local.productId as DesignState['productId'],
          variantId: local.variantId ?? '',
          templateId: local.templateId ?? null,
          text: local.text ?? '',
          color: local.color ?? '',
          backgroundColor: local.backgroundColor ?? '',
          image: (local.image ?? null) as DesignState['image'],
          productOptions: local.productOptions || {},
          elements: local.elements as DesignState['elements'],
          quantity: 1,
        };

      // 2. Insert into cloud projects
      const { data: createdProject, error: insertError } = await supabase
        .from('projects')
        .insert({
          owner_user_id: authenticatedUserId,
          origin_local_project_id: local.id,
          product_id: local.productId,
          variant_id: local.variantId,
          status: 'editing',
          current_working_revision: 1,
          working_document: doc,
          updated_at: new Date().toISOString(),
        })
        .select('id, current_working_revision')
        .single();

      if (insertError || !createdProject) {
        throw new Error(insertError?.message || 'Không thể tạo dự án đám mây');
      }

      markProjectMigrated(local.id, createdProject.id, createdProject.current_working_revision || 1);
      summary.migrated++;
    } catch (err: unknown) {
      summary.failed++;
      const message = err instanceof Error ? err.message : 'Lỗi không xác định khi chuyển đổi dự án';
      summary.errors.push(`Dự án ${local.id}: ${message}`);
    }
  }

  return summary;
}
