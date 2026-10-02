import type { SupabaseClient } from '@supabase/supabase-js';

import { FONT_REGISTRY } from '../src/lib/fonts.ts';
import { createPrivilegedSupabaseClient } from '../src/lib/supabase/admin.ts';
import { getSupabaseSecretKey } from '../src/lib/supabase/config.ts';
export interface MigrationOptions {
  apply?: boolean;
  client?: SupabaseClient;
  logger?: {
    log: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
}

export interface MigrationManifest {
  totalFamilies: number;
  unmigratedFamilies: number;
  totalFaces: number;
  missingFaces: number;
  totalStickers: number;
  unmigratedStickers: number;
  distinctDesignFontReferences: string[];
  distinctDesignStickerReferences: string[];
  appliedUpdates: number;
}

export async function runMigration(options: MigrationOptions = {}): Promise<MigrationManifest> {
  const isApply = options.apply === true;
  const logger = options.logger ?? console;
  if (!options.client && !getSupabaseSecretKey()) {
    if (!isApply) {
      logger.log('[LibraryMigrate] Supabase environment unconfigured. Generating manifest from static registry:');
      const staticManifest: MigrationManifest = {
        totalFamilies: FONT_REGISTRY.length,
        unmigratedFamilies: FONT_REGISTRY.filter((f) => f.status === 'published').length,
        totalFaces: 0,
        missingFaces: FONT_REGISTRY.length,
        totalStickers: 0,
        unmigratedStickers: 0,
        distinctDesignFontReferences: [],
        distinctDesignStickerReferences: [],
        appliedUpdates: 0,
      };
      logger.log('[LibraryMigrate] Manifest:', JSON.stringify(staticManifest, null, 2));
      return staticManifest;
    }
    throw new Error('Supabase secret key is missing. Set SUPABASE_SECRET_KEY to apply migration.');
  }

  const supabase = options.client ?? createPrivilegedSupabaseClient();
  logger.log(`[LibraryMigrate] Starting State 42 library migration (${isApply ? 'APPLY' : 'DRY RUN'})...`);

  // 1. Scan fonts
  const { data: fontsData, error: fontsError } = await supabase
    .from('fonts')
    .select('id, family_name, status, revision, ever_published_at, published, metadata');

  if (fontsError) {
    throw new Error(`Failed to query fonts: ${fontsError.message}`);
  }

  const allFonts = (fontsData ?? []) as {
    id: string;
    family_name: string;
    status?: string | null;
    revision?: number | string | null;
    ever_published_at?: string | null;
    published?: boolean | null;
    metadata?: Record<string, unknown> | null;
  }[];

  const unmigratedFamilies = allFonts.filter((f) => !f.status || f.status === 'draft' && f.published === true);

  // 2. Scan font_faces
  const { data: facesData, error: facesError } = await supabase
    .from('font_faces')
    .select('id, family_id, status');

  const allFaces = facesError ? [] : ((facesData ?? []) as { id: string; family_id: string; status: string }[]);
  const familyIdsWithFaces = new Set(allFaces.map((f) => f.family_id));
  const missingFaces = allFonts.filter((f) => !familyIdsWithFaces.has(f.id)).length;

  // 3. Scan sticker_assets
  const { data: stickersData, error: stickersError } = await supabase
    .from('sticker_assets')
    .select('id, status, revision, ever_published_at, published, checksum');

  if (stickersError) {
    throw new Error(`Failed to query sticker_assets: ${stickersError.message}`);
  }

  const allStickers = (stickersData ?? []) as {
    id: string;
    status?: string | null;
    revision?: number | string | null;
    ever_published_at?: string | null;
    published?: boolean | null;
    checksum?: string | null;
  }[];

  const unmigratedStickers = allStickers.filter((s) => !s.status || s.status === 'draft' && s.published === true);

  // 4. Scan design_versions (read-only inventory)
  const { data: versionsData } = await supabase
    .from('design_versions')
    .select('design_document')
    .limit(100);

  const fontRefs = new Set<string>();
  const stickerRefs = new Set<string>();

  for (const v of versionsData ?? []) {
    const doc = v.design_document as { elements?: { type: string; data?: Record<string, unknown> }[] } | null;
    if (doc?.elements && Array.isArray(doc.elements)) {
      for (const el of doc.elements) {
        if (el.type === 'text' && el.data?.fontFamily) {
          fontRefs.add(String(el.data.fontFamily));
        }
        if (el.type === 'sticker' && el.data?.libraryAssetId) {
          stickerRefs.add(String(el.data.libraryAssetId));
        }
      }
    }
  }

  let appliedUpdates = 0;

  if (isApply) {
    logger.log('[LibraryMigrate] Applying migration updates...');

    // Backfill fonts
    for (const font of unmigratedFamilies) {
      const isPublished = font.published === true;
      const metaStatus = font.metadata?.status as string | undefined;
      const targetStatus = isPublished ? 'published' : metaStatus === 'archived' ? 'archived' : 'draft';
      const everPublished = isPublished ? new Date().toISOString() : null;

      const { error: updateError } = await supabase
        .from('fonts')
        .update({
          status: targetStatus,
          revision: Number(font.revision ?? 1),
          ever_published_at: everPublished,
          updated_at: new Date().toISOString(),
        })
        .eq('id', font.id);

      if (!updateError) appliedUpdates++;
    }

    // Backfill sticker_assets
    for (const sticker of unmigratedStickers) {
      const isPublished = sticker.published === true;
      const targetStatus = isPublished ? 'published' : 'draft';
      const everPublished = isPublished ? new Date().toISOString() : null;

      const { error: updateError } = await supabase
        .from('sticker_assets')
        .update({
          status: targetStatus,
          revision: Number(sticker.revision ?? 1),
          ever_published_at: everPublished,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sticker.id);

      if (!updateError) appliedUpdates++;
    }
  }

  const manifest: MigrationManifest = {
    totalFamilies: allFonts.length,
    unmigratedFamilies: unmigratedFamilies.length,
    totalFaces: allFaces.length,
    missingFaces,
    totalStickers: allStickers.length,
    unmigratedStickers: unmigratedStickers.length,
    distinctDesignFontReferences: Array.from(fontRefs),
    distinctDesignStickerReferences: Array.from(stickerRefs),
    appliedUpdates,
  };

  logger.log('[LibraryMigrate] Manifest:', JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1]?.endsWith('state42-library-migrate.ts')) {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run');

  if (isApply && isDryRun) {
    console.error('Error: Choose either --dry-run or --apply, not both.');
    process.exit(1);
  }

  runMigration({ apply: isApply })
    .then((manifest) => {
      console.log(`[LibraryMigrate] Completed successfully. Total families: ${manifest.totalFamilies}, total stickers: ${manifest.totalStickers}`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('[LibraryMigrate] Failed:', err);
      process.exit(1);
    });
}
