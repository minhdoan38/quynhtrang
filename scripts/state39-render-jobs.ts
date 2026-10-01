import type { DesignState } from '../src/lib/product-state.ts';
import { renderDocument } from '../src/lib/services/document-renderer.ts';
import { createPrivilegedSupabaseClient } from '../src/lib/supabase/admin.ts';

interface RenderJobRow {
  id: string;
  version_id: string;
  order_id: string;
  attempts: number;
}

export async function processRenderJobs(options: { once?: boolean } = {}) {
  const supabase = createPrivilegedSupabaseClient();
  const once = options.once ?? false;

  console.log('[RenderWorker] Starting render jobs processing...');

  do {
    // Claim a pending job
    const { data: jobs, error: fetchError } = await supabase
      .from('design_render_jobs')
      .select('id, version_id, order_id, attempts')
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', new Date().toISOString())
      .lt('attempts', 3)
      .limit(5);

    if (fetchError) {
      console.error('[RenderWorker] Failed to query render jobs:', fetchError.message);
      if (once) break;
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    if (!jobs || jobs.length === 0) {
      if (once) {
        console.log('[RenderWorker] No pending jobs. Exiting (--once).');
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    for (const job of jobs as RenderJobRow[]) {
      // Mark running
      const { error: claimError } = await supabase
        .from('design_render_jobs')
        .update({
          status: 'running',
          attempts: job.attempts + 1,
          claim_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (claimError) {
        continue;
      }

      try {
        const { data: version, error: versionError } = await supabase
          .from('design_versions')
          .select('id, design_document')
          .eq('id', job.version_id)
          .single();

        if (versionError || !version) {
          throw new Error('Phiên bản thiết kế không tồn tại');
        }

        const rendered = await renderDocument(version.design_document as DesignState);
        const storagePath = `renders/${job.version_id}/${rendered.sha256}.png`;

        await supabase.storage
          .from('approved-renders')
          .upload(storagePath, Buffer.from(rendered.png), {
            contentType: 'image/png',
            upsert: true,
          });

        // Record in design_version_renders
        await supabase
          .from('design_version_renders')
          .insert({
            version_id: job.version_id,
            storage_path: storagePath,
            checksum: rendered.sha256,
            created_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        // Mark completed
        await supabase
          .from('design_render_jobs')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        console.log(`[RenderWorker] Rendered version ${job.version_id} -> ${storagePath}`);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown render error';
        console.error(`[RenderWorker] Job ${job.id} failed:`, errorMsg);
        await supabase
          .from('design_render_jobs')
          .update({
            status: 'failed',
            error_code: errorMsg,
            next_attempt_at: new Date(Date.now() + 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }
    }
  } while (!once);
}

if (process.argv[1]?.endsWith('state39-render-jobs.ts')) {
  const isOnce = process.argv.includes('--once');
  processRenderJobs({ once: isOnce }).catch((err) => {
    console.error('[RenderWorker] Fatal error:', err);
    process.exit(1);
  });
}
