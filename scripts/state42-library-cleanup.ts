import type { SupabaseClient } from '@supabase/supabase-js';

import { createPrivilegedSupabaseClient } from '../src/lib/supabase/admin.ts';

export interface CleanupOptions {
  apply?: boolean;
  client?: SupabaseClient;
  logger?: {
    log: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
}

export interface CleanupResult {
  found: number;
  eligible: number;
  cleaned: number;
  skipped: number;
}

export async function runCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
  const isApply = options.apply === true;
  const logger = options.logger ?? console;
  const supabase = options.client ?? createPrivilegedSupabaseClient();

  logger.log(`[LibraryCleanup] Starting library cleanup (${isApply ? 'APPLY' : 'DRY RUN'})...`);

  const { data: uploadsData, error: uploadsError } = await supabase
    .from('library_uploads')
    .select('*')
    .in('state', ['cleanup_pending', 'pending', 'uploaded']);

  if (uploadsError) {
    throw new Error(`Failed to query library_uploads: ${uploadsError.message}`);
  }

  const allUploads = (uploadsData ?? []) as {
    id: string;
    kind: 'sticker' | 'font-face';
    asset_id: string;
    bucket?: string;
    storage_path?: string;
    state: string;
    expires_at?: string;
  }[];

  const now = Date.now();
  const candidates = allUploads.filter((upload) => {
    if (upload.state === 'cleanup_pending') return true;
    if (upload.expires_at) {
      return new Date(upload.expires_at).getTime() <= now;
    }
    return false;
  });

  const found = candidates.length;
  let eligible = 0;
  let cleaned = 0;
  let skipped = 0;

  for (const upload of candidates) {
    const table = upload.kind === 'sticker' ? 'sticker_assets' : 'font_faces';
    const { data: assetData } = await supabase
      .from(table)
      .select('status, ever_published_at, storage_path, thumbnail_path')
      .eq('id', upload.asset_id)
      .maybeSingle();

    const asset = assetData as {
      status?: string;
      ever_published_at?: string | null;
      storage_path?: string;
      thumbnail_path?: string | null;
    } | null;

    if (asset && (asset.ever_published_at !== null || asset.status === 'published')) {
      logger.log(`[LibraryCleanup] Skipping ever-published asset ${upload.asset_id} for upload ${upload.id}`);
      skipped++;
      continue;
    }

    eligible++;

    const bucket = upload.bucket ?? 'library-drafts';
    const keys = new Set<string>();

    if (upload.storage_path && upload.storage_path.includes('/')) {
      keys.add(upload.storage_path);
    }
    if (asset?.storage_path) {
      keys.add(asset.storage_path);
    }
    if (asset?.thumbnail_path) {
      keys.add(asset.thumbnail_path);
    }

    const keyList = Array.from(keys);

    if (isApply) {
      if (keyList.length > 0) {
        const { error: removeError } = await supabase.storage.from(bucket).remove(keyList);
        if (removeError) {
          logger.error?.(`[LibraryCleanup] Failed to remove storage keys for ${upload.id}: ${removeError.message}`);
          throw new Error(`Storage remove failed: ${removeError.message}`);
        }
      }
      const { error: updateError } = await supabase
        .from('library_uploads')
        .update({ state: 'cleaned' })
        .eq('id', upload.id);

      if (updateError) {
        throw new Error(`Failed to update upload state: ${updateError.message}`);
      }
      cleaned++;
      logger.log(`[LibraryCleanup] Cleaned upload ${upload.id} (keys: ${keyList.join(', ')})`);
    } else {
      logger.log(`[LibraryCleanup] [DRY RUN] Would clean upload ${upload.id} (keys: ${keyList.join(', ')})`);
    }
  }

  const result: CleanupResult = { found, eligible, cleaned, skipped };
  logger.log(`[LibraryCleanup] Finished: ${JSON.stringify(result)}`);
  return result;
}

if (process.argv[1]?.endsWith('state42-library-cleanup.ts')) {
  const isApply = process.argv.includes('--apply');
  const isDryRun = process.argv.includes('--dry-run');

  if (isApply && isDryRun) {
    console.error('Cannot specify both --apply and --dry-run');
    process.exit(1);
  }

  runCleanup({ apply: isApply && !isDryRun }).catch((err) => {
    console.error('[LibraryCleanup] Fatal error:', err);
    process.exit(1);
  });
}
