import type { SupabaseClient } from '@supabase/supabase-js';

import { TemplateRepository } from '../src/lib/repositories/template-repository.ts';
import { canCollectTemplateAsset, extractTemplateAssetManifest } from '../src/lib/services/template-assets.ts';
import { createPrivilegedSupabaseClient } from '../src/lib/supabase/admin.ts';

export interface TemplateCleanupOptions {
  apply?: boolean;
  client?: SupabaseClient;
  repo?: TemplateRepository;
  actorUserId?: string;
  graceHours?: number;
  logger?: {
    log: (msg: string) => void;
    error?: (msg: string) => void;
  };
}
export interface TemplateCleanupResult {
  found: number;
  eligible: number;
  cleaned: number;
  skipped: number;
}

export async function runTemplateCleanup(options: TemplateCleanupOptions = {}): Promise<TemplateCleanupResult> {
  const isApply = options.apply === true;
  const logger = options.logger ?? console;
  const graceHours = options.graceHours ?? 24;
  const actorUserId = options.actorUserId ?? '43000000-0000-0000-0000-0000000000a1';

  logger.log(`[TemplateCleanup] Starting template cleanup (${isApply ? 'APPLY' : 'DRY RUN'}, graceHours: ${graceHours})...`);

  let supabase: SupabaseClient | null = null;
  try {
    supabase = options.client ?? createPrivilegedSupabaseClient();
  } catch {
    supabase = options.client ?? null;
  }

  if (!supabase) {
    logger.log('[TemplateCleanup] No Supabase client available, exiting.');
    return { found: 0, eligible: 0, cleaned: 0, skipped: 0 };
  }

  const repo = options.repo ?? new TemplateRepository(supabase);

  // Query un-published assets
  const { data: assetsData, error: assetsError } = await supabase
    .from('template_assets')
    .select('*')
    .eq('is_published', false);

  if (assetsError) {
    if (assetsError.message.includes('Could not find the table') || assetsError.message.includes('does not exist')) {
      logger.log('[TemplateCleanup] Table public.template_assets not found in database. Exiting.');
      return { found: 0, eligible: 0, cleaned: 0, skipped: 0 };
    }
    throw new Error(`Failed to query template_assets: ${assetsError.message}`);
  }

  const assets = (assetsData ?? []) as Array<{
    id: string;
    template_id: string;
    draft_id: string | null;
    storage_bucket: string;
    storage_path: string;
    is_published: boolean;
    upload_status: string;
    created_at: string;
  }>;

  // Query all active drafts to extract currently referenced assets
  const { data: draftsData, error: draftsError } = await supabase
    .from('template_drafts')
    .select('id, template_id, design_document');

  if (draftsError) {
    if (draftsError.message.includes('Could not find the table') || draftsError.message.includes('does not exist')) {
      logger.log('[TemplateCleanup] Table public.template_drafts not found in database. Exiting.');
      return { found: 0, eligible: 0, cleaned: 0, skipped: 0 };
    }
    throw new Error(`Failed to query template_drafts: ${draftsError.message}`);
  }

  const activeReferencedAssetIds = new Set<string>();
  for (const draft of (draftsData ?? []) as Array<{ id: string; template_id: string; design_document: unknown }>) {
    if (draft.design_document && typeof draft.design_document === 'object') {
      const manifest = extractTemplateAssetManifest(draft.design_document as never);
      for (const ref of manifest) {
        activeReferencedAssetIds.add(ref.assetId.toLowerCase());
      }
    }
  }

  // Query version asset joins to be double sure no published versions reference these assets
  const { data: versionAssetsData, error: versionAssetsError } = await supabase
    .from('template_version_assets')
    .select('asset_id');

  if (versionAssetsError) {
    if (versionAssetsError.message.includes('Could not find the table') || versionAssetsError.message.includes('does not exist')) {
      logger.log('[TemplateCleanup] Table public.template_version_assets not found in database. Exiting.');
      return { found: 0, eligible: 0, cleaned: 0, skipped: 0 };
    }
    throw new Error(`Failed to query template_version_assets: ${versionAssetsError.message}`);
  }

  const versionReferencedAssetIds = new Set<string>();
  for (const va of (versionAssetsData ?? []) as Array<{ asset_id: string }>) {
    versionReferencedAssetIds.add(va.asset_id.toLowerCase());
  }

  const now = Date.now();
  const found = assets.length;
  let eligible = 0;
  let cleaned = 0;
  let skipped = 0;

  for (const asset of assets) {
    const assetIdLower = asset.id.toLowerCase();
    const isReferencedInDraft = activeReferencedAssetIds.has(assetIdLower);
    const isReferencedInVersion = versionReferencedAssetIds.has(assetIdLower);
    const ageHours = (now - new Date(asset.created_at).getTime()) / (1000 * 60 * 60);

    const collectible = canCollectTemplateAsset({
      everPublished: asset.is_published || isReferencedInVersion,
      referenced: isReferencedInDraft || isReferencedInVersion,
      pendingOperation: asset.upload_status === 'pending',
      ageHours,
    });

    if (!collectible) {
      skipped++;
      continue;
    }

    eligible++;

    if (isApply) {
      const cleanupRes = await repo.cleanupDraftAsset(actorUserId, asset.id, {
        maxAgeHours: graceHours,
      });

      if (!cleanupRes.success) {
        logger.log(`[TemplateCleanup] Skipped asset ${asset.id}: ${cleanupRes.reason}`);
        skipped++;
        continue;
      }

      const storageBucket = cleanupRes.storageBucket ?? asset.storage_bucket;
      const storagePath = cleanupRes.storagePath ?? asset.storage_path;

      if (storagePath) {
        const { error: removeError } = await supabase.storage
          .from(storageBucket)
          .remove([storagePath]);
        if (removeError) {
          logger.error?.(`[TemplateCleanup] Failed to remove storage object ${storageBucket}/${storagePath}: ${removeError.message}`);
        }
      }

      cleaned++;
      logger.log(`[TemplateCleanup] Cleaned asset ${asset.id} (${storageBucket}/${storagePath})`);
    } else {
      logger.log(`[TemplateCleanup] [DRY RUN] Would clean asset ${asset.id} (${asset.storage_bucket}/${asset.storage_path})`);
    }
  }

  const result: TemplateCleanupResult = { found, eligible, cleaned, skipped };
  logger.log(`[TemplateCleanup] Finished: ${JSON.stringify(result)}`);
  return result;
}
if (process.argv[1]?.endsWith('state43-template-cleanup.ts')) {
  const isApply = process.argv.includes('--apply');
  const isDryRun = process.argv.includes('--dry-run') || !isApply;

  if (isApply && process.argv.includes('--dry-run')) {
    console.error('Cannot specify both --apply and --dry-run');
    process.exit(1);
  }

  runTemplateCleanup({ apply: isApply && !isDryRun }).catch((err) => {
    console.error('[TemplateCleanup] Fatal error:', err);
    process.exit(1);
  });
}