import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createTemplateTarget } from '../src/lib/template-target.ts';
import { readDesignDocument } from '../src/lib/design-document.ts';
import type { ProductId, FixedStickerShape } from '../src/lib/product-state.ts';
import type { TemplateTarget } from '../src/lib/domain/template.ts';
import { createPrivilegedSupabaseClient } from '../src/lib/supabase/admin.ts';
import { getSupabaseSecretKey } from '../src/lib/supabase/config.ts';

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = path.dirname(currentFilename);

export interface LegacyTargetItem {
  targetKey: string;
  productId: ProductId;
  variantId: string;
  mode: 'pattern' | 'full-sheet' | null;
  shape: string | null;
  surfaces?: Array<{ id: string; widthMm: number; heightMm: number }>;
  geometryKey?: string;
  isCanonical: boolean;
  deterministicSuccessorId: string;
}

export interface LegacyTemplateEntry {
  legacyId: string;
  slug: string;
  name: string;
  category: string;
  source: string;
  aliases: string[];
  previewHint?: string;
  canonicalTarget: {
    productId: ProductId;
    variantId: string;
    mode: 'pattern' | 'full-sheet' | null;
    shape: string | null;
    surfaces?: Array<{ id: string; widthMm: number; heightMm: number }>;
    geometryKey?: string;
  };
  targets: LegacyTargetItem[];
  sql?: {
    id: string;
    productId?: string | null;
    slug?: string | null;
    name: string;
    published?: boolean;
    thumbnailPath?: string | null;
    metadata?: Record<string, unknown>;
    seededVersion?: number;
    designDocument?: Record<string, unknown>;
  };
  staticConfig?: {
    name: string;
    category: string;
    productIds?: string[] | null;
    variantIds?: string[] | null;
    text: string;
    color: string;
    backgroundColor: string;
    previewHint?: string;
    productOptions?: Record<string, unknown>;
    elements?: unknown[] | null;
  };
}

export interface LegacyTemplatesManifest {
  manifestVersion: string;
  state: string;
  createdAt: string;
  description: string;
  summary: Record<string, unknown>;
  entries: LegacyTemplateEntry[];
}

export interface MigrateTemplatesOptions {
  mode: 'inventory' | 'prepare' | 'verify' | 'seed';
  manifest?: LegacyTemplatesManifest;
  client?: SupabaseClient;
  logger?: {
    log: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
  };
}

export interface MigrationResult {
  mode: 'inventory' | 'prepare' | 'verify' | 'seed';
  success: boolean;
  totalTemplates: number;
  totalTargets: number;
  mappedCount: number;
  createdTemplates: number;
  createdVersions: number;
  errors: string[];
  summary?: Record<string, unknown>;
}

export function loadDefaultManifest(): LegacyTemplatesManifest {
  const fixturePath = path.resolve(currentDirname, 'fixtures/state43-legacy-templates.json');
  const raw = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(raw) as LegacyTemplatesManifest;
}

export async function migrateTemplates(options: MigrateTemplatesOptions): Promise<MigrationResult> {
  const logger = options.logger ?? console;
  const manifest = options.manifest ?? loadDefaultManifest();
  const mode = options.mode;

  if (mode === 'inventory') {
    let canonicalCount = 0;
    let expandedCount = 0;
    for (const entry of manifest.entries) {
      for (const t of entry.targets) {
        if (t.isCanonical) canonicalCount++;
        else expandedCount++;
      }
    }

    const inventorySummary = {
      manifestVersion: manifest.manifestVersion,
      totalLegacyTemplates: manifest.entries.length,
      totalTargets: canonicalCount + expandedCount,
      canonicalTargetsCount: canonicalCount,
      expandedTargetsCount: expandedCount,
      categories: Array.from(new Set(manifest.entries.map((e) => e.category))),
      readyForCutover: true,
    };

    logger.log('[State43Migrate] Legacy Template Inventory:', JSON.stringify(inventorySummary, null, 2));

    return {
      mode: 'inventory',
      success: true,
      totalTemplates: manifest.entries.length,
      totalTargets: canonicalCount + expandedCount,
      mappedCount: canonicalCount + expandedCount,
      createdTemplates: 0,
      createdVersions: 0,
      errors: [],
      summary: inventorySummary,
    };
  }

  // Ensure DB client for prepare / verify / seed
  let client = options.client;
  if (!client) {
    const hasSecretKey = Boolean(getSupabaseSecretKey());
    const hasUrl = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      process.env.SUPABASE_URL?.trim()
    );
    if (!hasSecretKey || !hasUrl) {
      if (mode === 'verify') {
        console.error('Error: Database verification requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. Cannot verify live database.');
        process.exit(1);
      }
      throw new Error('Supabase secret key is missing. Set SUPABASE_SECRET_KEY to run template migration.');
    }
    try {
      client = createPrivilegedSupabaseClient();
    } catch (err: unknown) {
      if (mode === 'verify') {
        console.error('Error: Database verification requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. Cannot verify live database.');
        process.exit(1);
      }
      throw err;
    }
  }

  if (mode === 'verify') {
    const errors: string[] = [];
    let mappedCount = 0;
    let totalTargets = 0;

    for (const entry of manifest.entries) {
      for (const target of entry.targets) {
        totalTargets++;
        const { data: legacyRow } = await client
          .from('template_legacy_targets')
          .select('template_id, version_id')
          .eq('legacy_id', entry.legacyId)
          .eq('target_key', target.targetKey)
          .maybeSingle();

        if (!legacyRow) {
          errors.push(`Missing legacy mapping for ${entry.legacyId} -> ${target.targetKey}`);
          continue;
        }

        const { data: templateRow } = await client
          .from('templates')
          .select('id, status, product_id, variant_id, current_published_version_id')
          .eq('id', legacyRow.template_id)
          .maybeSingle();

        if (!templateRow || templateRow.status !== 'published') {
          errors.push(`Successor template ${legacyRow.template_id} is not published`);
          continue;
        }

        if (!templateRow.product_id || !templateRow.variant_id) {
          errors.push(`Successor template ${legacyRow.template_id} has null target product/variant`);
          continue;
        }

        const { data: versionRow } = await client
          .from('template_versions')
          .select('id, document_schema_version, target_snapshot')
          .eq('id', legacyRow.version_id)
          .maybeSingle();

        if (!versionRow || (versionRow.document_schema_version ?? 0) < 1 || !versionRow.target_snapshot) {
          errors.push(`Successor version ${legacyRow.version_id} lacks valid target or schema version`);
          continue;
        }

        mappedCount++;
      }
    }

    const success = errors.length === 0;
    logger.log(`[State43Migrate] Verify complete. Mapped: ${mappedCount}/${totalTargets}. Errors: ${errors.length}`);
    return {
      mode: 'verify',
      success,
      totalTemplates: manifest.entries.length,
      totalTargets,
      mappedCount,
      createdTemplates: 0,
      createdVersions: 0,
      errors,
    };
  }

  // mode === 'prepare' || mode === 'seed'
  let createdTemplates = 0;
  let createdVersions = 0;
  let mappedCount = 0;
  let totalTargets = 0;
  const errors: string[] = [];

  for (const entry of manifest.entries) {
    for (const targetItem of entry.targets) {
      totalTargets++;
      const targetSnapshot: TemplateTarget = createTemplateTarget({
        productId: targetItem.productId,
        variantId: targetItem.variantId,
        mode: targetItem.mode,
        shape: targetItem.shape as FixedStickerShape | null,
      });

      // 1. Check if mapping already exists in template_legacy_targets
      const { data: existingMapping } = await client
        .from('template_legacy_targets')
        .select('template_id, version_id')
        .eq('legacy_id', entry.legacyId)
        .eq('target_key', targetItem.targetKey)
        .maybeSingle();

      if (existingMapping) {
        // Validate successor exists
        const { data: existingTpl } = await client
          .from('templates')
          .select('id, current_published_version_id')
          .eq('id', existingMapping.template_id)
          .maybeSingle();

        const { data: existingVer } = await client
          .from('template_versions')
          .select('id')
          .eq('id', existingMapping.version_id)
          .maybeSingle();

        if (existingTpl && existingVer) {
          // Already completely migrated for this target; idempotent skip!
          mappedCount++;
          continue;
        }
      }

      // 2. Identify successor template ID
      const successorId = targetItem.isCanonical
        ? entry.legacyId
        : targetItem.deterministicSuccessorId;

      // 3. Check if template exists in public.templates
      const { data: existingTemplate } = await client
        .from('templates')
        .select('*')
        .eq('id', successorId)
        .maybeSingle();

      let targetVersionId: string;

      const rawDoc = entry.sql?.designDocument ?? {
        text: entry.staticConfig?.text ?? '',
        color: entry.staticConfig?.color ?? '#111827',
        backgroundColor: entry.staticConfig?.backgroundColor ?? '#ffffff',
        elements: entry.staticConfig?.elements ?? [],
        productOptions: entry.staticConfig?.productOptions ?? {},
      };
      const normalizedDoc = readDesignDocument(rawDoc, 0, targetSnapshot);

      if (existingTemplate) {
        // Find existing versions for this template
        const { data: existingVersions } = await client
          .from('template_versions')
          .select('id, version, document_schema_version, target_snapshot')
          .eq('template_id', successorId)
          .order('version', { ascending: false });

        const validSuccessor = existingVersions?.find(
          (v) => (v.document_schema_version ?? 0) >= 1 && v.target_snapshot,
        );

        if (validSuccessor) {
          targetVersionId = validSuccessor.id;
        } else {
          // Incomplete legacy v1 retained as schema 0; insert next version number as successor
          const nextVersion = (existingVersions?.[0]?.version ?? 0) + 1;
          targetVersionId = crypto.randomUUID();

          const { error: verErr } = await client.from('template_versions').insert({
            id: targetVersionId,
            template_id: successorId,
            version: nextVersion,
            design_document: normalizedDoc,
            document_schema_version: 1,
            target_snapshot: targetSnapshot,
            dependency_snapshot: [],
            asset_manifest: [],
            preflight_snapshot: { valid: true },
            published_at: new Date().toISOString(),
            revision_note: 'Migrated validated legacy successor version',
          });

          if (verErr) {
            errors.push(`Failed to insert version for ${successorId}: ${verErr.message}`);
            continue;
          }
          createdVersions++;
        }

        // Update template to published with target snapshot and current version
        const { error: tplErr } = await client
          .from('templates')
          .update({
            product_id: targetItem.productId,
            variant_id: targetItem.variantId,
            product_mode: targetItem.mode,
            fixed_sticker_shape: targetItem.shape,
            status: 'published',
            target_snapshot: targetSnapshot,
            current_published_version_id: targetVersionId,
            ever_published_at: existingTemplate.ever_published_at ?? new Date().toISOString(),
            category_id: entry.category,
            metadata: entry.sql?.metadata ?? existingTemplate.metadata ?? {},
            updated_at: new Date().toISOString(),
          })
          .eq('id', successorId);

        if (tplErr) {
          errors.push(`Failed to update template ${successorId}: ${tplErr.message}`);
          continue;
        }
      } else {
        // Create new template and version 1
        targetVersionId = crypto.randomUUID();

        const { error: insTplErr } = await client.from('templates').insert({
          id: successorId,
          slug: successorId,
          name: entry.name,
          product_id: targetItem.productId,
          variant_id: targetItem.variantId,
          product_mode: targetItem.mode,
          fixed_sticker_shape: targetItem.shape,
          status: 'published',
          category_id: entry.category,
          target_snapshot: targetSnapshot,
          metadata: entry.sql?.metadata ?? {},
          ever_published_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (insTplErr) {
          errors.push(`Failed to insert template ${successorId}: ${insTplErr.message}`);
          continue;
        }
        createdTemplates++;

        const { error: insVerErr } = await client.from('template_versions').insert({
          id: targetVersionId,
          template_id: successorId,
          version: 1,
          design_document: normalizedDoc,
          document_schema_version: 1,
          target_snapshot: targetSnapshot,
          dependency_snapshot: [],
          asset_manifest: [],
          preflight_snapshot: { valid: true },
          published_at: new Date().toISOString(),
          revision_note: 'Migrated validated legacy successor version',
        });

        if (insVerErr) {
          errors.push(`Failed to insert version for ${successorId}: ${insVerErr.message}`);
          continue;
        }
        createdVersions++;

        await client
          .from('templates')
          .update({ current_published_version_id: targetVersionId })
          .eq('id', successorId);
      }

      // 4. Record alias mapping in template_legacy_targets
      const { error: mapErr } = await client.from('template_legacy_targets').insert({
        legacy_id: entry.legacyId,
        target_key: targetItem.targetKey,
        template_id: successorId,
        version_id: targetVersionId,
        verified_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      if (mapErr) {
        // If conflict on duplicate, ignore
        if (!mapErr.message.includes('duplicate') && !mapErr.message.includes('unique')) {
          errors.push(`Failed to map legacy target ${entry.legacyId} -> ${targetItem.targetKey}: ${mapErr.message}`);
          continue;
        }
      }

      // Also record geometryKey alias if different from targetKey
      if (targetSnapshot.geometryKey && targetSnapshot.geometryKey !== targetItem.targetKey) {
        try {
          await client.from('template_legacy_targets').insert({
            legacy_id: entry.legacyId,
            target_key: targetSnapshot.geometryKey,
            template_id: successorId,
            version_id: targetVersionId,
            verified_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        } catch {
          // ignore duplicate alias
        }
      }

      mappedCount++;
    }
  }

  logger.log(
    `[State43Migrate] Migration ${mode} complete. Templates created: ${createdTemplates}, versions created: ${createdVersions}, targets mapped: ${mappedCount}/${totalTargets}`,
  );

  return {
    mode,
    success: errors.length === 0,
    totalTemplates: manifest.entries.length,
    totalTargets,
    mappedCount,
    createdTemplates,
    createdVersions,
    errors,
  };
}

// CLI entrypoint
if (process.argv[1]?.endsWith('state43-template-migrate.ts')) {
  const args = process.argv.slice(2);
  const isInventory = args.includes('--inventory') || args.includes('--manifest');
  const isPrepare = args.includes('--prepare');
  const isVerify = args.includes('--verify');
  const isSeed = args.includes('--seed');

  const count = [isInventory, isPrepare, isVerify, isSeed].filter(Boolean).length;
  if (count !== 1) {
    console.error('Usage: node scripts/state43-template-migrate.ts <--inventory | --manifest | --prepare | --verify | --seed>');
    process.exit(1);
  }

  const mode = isInventory ? 'inventory' : isPrepare ? 'prepare' : isVerify ? 'verify' : 'seed';

  migrateTemplates({ mode })
    .then((result) => {
      if (!result.success) {
        console.error('[State43Migrate] Execution completed with errors:', result.errors);
        process.exit(1);
      }
      console.log(`[State43Migrate] Successfully finished ${mode}.`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('[State43Migrate] Fatal error:', err);
      process.exit(1);
    });
}
