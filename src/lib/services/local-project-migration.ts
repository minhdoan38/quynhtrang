import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '../supabase/browser.ts';
import {
  getRecentProjects,
  markProjectMigrated,
  RECENT_PROJECT_RETENTION_MS,
} from '../storage.ts';
import type { DesignState } from '../product-state.ts';
import { readDesignDocument } from '../design-document.ts';
import { rehydrateDesignImages } from '../browser-storage/guest-project-store.ts';
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

      // Reconstruct document preserving customerLocked and provenance
      let doc: DesignState;
      if (local.design) {
        try {
          const schemaVer = typeof local.design.documentSchemaVersion === 'number' ? local.design.documentSchemaVersion : 0;
          doc = readDesignDocument(local.design, schemaVer);
        } catch {
          doc = structuredClone(local.design);
        }
      } else {
        doc = {
          productId: (local.productId as DesignState['productId']) || 'wrapping',
          variantId: local.variantId ?? '',
          templateId: local.templateId ?? null,
          text: local.text ?? '',
          color: local.color ?? '',
          backgroundColor: local.backgroundColor ?? '',
          image: (local.image ?? null) as DesignState['image'],
          productOptions: local.productOptions || {},
          elements: (local.elements as DesignState['elements']) || [],
          quantity: 1,
          documentSchemaVersion: 1,
        };
      }

      // Rehydrate any transient blob: URLs from durable data or cached assets
      doc = await rehydrateDesignImages(doc);

      // Check if dead blob: URLs remain without backing bytes
      const hasDeadBlob = Boolean(
        (typeof doc.image?.src === 'string' && doc.image.src.startsWith('blob:')) ||
        doc.elements?.some(
          (el) =>
            el.type === 'image' &&
            typeof (el.data as Record<string, unknown> | undefined)?.src === 'string' &&
            ((el.data as Record<string, unknown>).src as string).startsWith('blob:')
        )
      );
      if (hasDeadBlob) {
        throw new Error('Ảnh cục bộ không còn khả dụng trong bộ nhớ tạm. Hãy chọn lại ảnh trước khi chuyển đổi.');
      }

      // Verify provenance against database before assigning FK columns
      let sourceTemplateId: string | null = null;
      let sourceTemplateVersionId: string | null = null;
      const candTmplId = doc.sourceTemplate?.templateId;
      const candVerId = doc.sourceTemplate?.templateVersionId;

      if (candTmplId && candVerId) {
        try {
          const { data: verRow } = await supabase
            .from('template_versions')
            .select('id, template_id')
            .eq('id', candVerId)
            .eq('template_id', candTmplId)
            .maybeSingle();

          if (verRow) {
            sourceTemplateId = verRow.template_id;
            sourceTemplateVersionId = verRow.id;
          }
        } catch {
          // Table might be unavailable or unqueryable; keep null
        }
      }

      // 2. Insert into cloud projects
      const { data: createdProject, error: insertError } = await supabase
        .from('projects')
        .insert({
          owner_user_id: authenticatedUserId,
          origin_local_project_id: local.id,
          product_id: doc.productId || local.productId,
          variant_id: doc.variantId || local.variantId,
          status: 'editing',
          current_working_revision: 1,
          working_document: doc,
          source_template_id: sourceTemplateId,
          source_template_version_id: sourceTemplateVersionId,
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
