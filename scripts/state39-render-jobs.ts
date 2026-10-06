import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DesignState } from '../src/lib/product-state.ts';
import { renderDocument } from '../src/lib/services/document-renderer.ts';
import { createPrivilegedSupabaseClient } from '../src/lib/supabase/admin.ts';

interface RenderJobRow {
  id: string;
  version_id: string;
  order_id: string;
  attempts: number;
}
function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}


export interface ProcessRenderJobsOptions {
  once?: boolean;
  workerId?: string;
  leaseSeconds?: number;
  client?: SupabaseClient;
}
export async function processRenderJobs(options: ProcessRenderJobsOptions = {}) {
  const supabase = options.client ?? createPrivilegedSupabaseClient();
  const once = options.once ?? false;
  const workerId = options.workerId ?? `worker-${process.pid}-${randomUUID()}`;
  const leaseSeconds = options.leaseSeconds ?? 300;

  console.log(`[RenderWorker] Starting render jobs processing (worker=${workerId})...`);

  do {
    // Atomically claim next eligible job using SKIP LOCKED and lease fencing
    const { data: claimedData, error: fetchError } = await supabase.rpc('claim_next_render_job', {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });

    if (fetchError) {
      console.error('[RenderWorker] Failed to query render jobs:', fetchError.message);
      if (once) break;
      await delay(5000);
      continue;
    }

    const jobs: RenderJobRow[] = Array.isArray(claimedData)
      ? (claimedData as RenderJobRow[])
      : claimedData
        ? [claimedData as RenderJobRow]
        : [];

    if (jobs.length === 0) {
      if (once) {
        console.log('[RenderWorker] No pending jobs. Exiting (--once).');
        break;
      }
      await delay(5000);
      continue;
    }

    for (const job of jobs) {
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

        // Record in design_version_renders with idempotent upsert
        const { error: recordError } = await supabase
          .from('design_version_renders')
          .upsert(
            {
              version_id: job.version_id,
              storage_path: storagePath,
              checksum: rendered.sha256,
            },
            { onConflict: 'version_id' }
          );

        if (recordError) {
          throw new Error(`Failed to record render: ${recordError.message}`);
        }

        // Update authoritative thumbnail pointer on design_versions
        await supabase
          .from('design_versions')
          .update({
            approved_thumbnail_path: storagePath,
          })
          .eq('id', job.version_id);

        // Mark completed fenced by workerId and claimed attempt token
        const { data: updatedJob } = await supabase
          .from('design_render_jobs')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
          .eq('claimed_by', workerId)
          .eq('attempts', job.attempts)
          .select()
          .maybeSingle();

        if (!updatedJob) {
          console.warn(`[RenderWorker] Job ${job.id} lease expired or reclaimed by another worker.`);
        } else {
          console.log(`[RenderWorker] Rendered version ${job.version_id} -> ${storagePath}`);
        }
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
          .eq('id', job.id)
          .eq('claimed_by', workerId)
          .eq('attempts', job.attempts);
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
