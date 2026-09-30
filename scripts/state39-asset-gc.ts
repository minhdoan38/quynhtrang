import { createPrivilegedSupabaseClient } from '../src/lib/supabase/admin.ts';

export async function runAssetGc(options: { dryRun?: boolean } = {}) {
  const isDryRun = options.dryRun !== false;
  const supabase = createPrivilegedSupabaseClient();

  console.log(`[AssetGC] Starting asset garbage collection (${isDryRun ? 'DRY RUN' : 'DELETE MODE'})...`);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find discarded drafts closed more than 7 days ago
  const { data: discardedDrafts, error: draftsError } = await supabase
    .from('design_revision_drafts')
    .select('id')
    .eq('status', 'discarded')
    .lte('updated_at', sevenDaysAgo);

  if (draftsError || !discardedDrafts || discardedDrafts.length === 0) {
    console.log('[AssetGC] No discarded drafts eligible for GC.');
    return;
  }

  const draftIds = discardedDrafts.map((d: { id: string }) => d.id);

  // Find candidate assets attached to these drafts
  const { data: draftAssets, error: assetsError } = await supabase
    .from('design_draft_assets')
    .select('asset_id, draft_id')
    .in('draft_id', draftIds);

  if (assetsError || !draftAssets || draftAssets.length === 0) {
    console.log('[AssetGC] No draft assets found for eligible discarded drafts.');
    return;
  }

  const assetIds = draftAssets.map((da: { asset_id: string }) => da.asset_id);

  // Filter out any asset still referenced in design_version_assets
  const { data: versionAssets } = await supabase
    .from('design_version_assets')
    .select('asset_id')
    .in('asset_id', assetIds);

  const referencedIds = new Set((versionAssets || []).map((va: { asset_id: string }) => va.asset_id));
  const candidateIds = assetIds.filter((id: string) => !referencedIds.has(id));

  console.log(`[AssetGC] Identified ${candidateIds.length} candidate asset(s) for removal.`);

  if (candidateIds.length === 0) {
    return;
  }

  if (isDryRun) {
    console.log('[AssetGC] Dry run complete. Assets to remove:', candidateIds);
    return;
  }

  // Actual deletion
  for (const assetId of candidateIds) {
    const { data: asset } = await supabase
      .from('assets')
      .select('storage_bucket, storage_path')
      .eq('id', assetId)
      .single();

    if (asset?.storage_path) {
      await supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);
    }

    await supabase.from('design_draft_assets').delete().eq('asset_id', assetId);
    await supabase.from('assets').delete().eq('id', assetId);

    console.log(`[AssetGC] Deleted asset ${assetId}`);
  }
}

if (process.argv[1]?.endsWith('state39-asset-gc.ts')) {
  const isDelete = process.argv.includes('--delete');
  runAssetGc({ dryRun: !isDelete }).catch((err) => {
    console.error('[AssetGC] Error running asset GC:', err);
    process.exit(1);
  });
}
