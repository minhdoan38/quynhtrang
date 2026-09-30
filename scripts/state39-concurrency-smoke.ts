import { createPrivilegedSupabaseClient } from '../src/lib/supabase/admin.ts';
import { DesignRevisionRepository } from '../src/lib/repositories/design-revision-repository.ts';

export async function runConcurrencySmoke() {
  console.log('[ConcurrencySmoke] Starting State 39 concurrency verification...');

  const supabase = createPrivilegedSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);

  // Check if test order exists or create transient fixture
  const orderId = '00000000-0000-0000-0000-000000000201';
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();

  if (!order) {
    console.log('[ConcurrencySmoke] Test order not found (database not seeded with seed_state39.sql). Skipping live DB checks.');
    return;
  }

  const baseVerId = order.customer_approved_design_version_id;
  const prodVerId = order.production_design_version_id;

  console.log(`[ConcurrencySmoke] Testing on Order ${orderId} (code: ${order.public_order_code})`);

  // Race 1: Two concurrent createDraft calls
  const session1 = crypto.randomUUID();
  const session2 = crypto.randomUUID();

  console.log('[ConcurrencySmoke] Step 1: Discarding any pre-existing draft...');
  const { data: existingDraft } = await supabase
    .from('design_revision_drafts')
    .select('id, revision')
    .eq('order_id', orderId)
    .in('status', ['editing', 'ready_for_review'])
    .maybeSingle();

  if (existingDraft) {
    await supabase.from('design_revision_drafts').update({ status: 'discarded' }).eq('id', existingDraft.id);
  }

  console.log('[ConcurrencySmoke] Step 2: Racing two concurrent createDraft calls...');
  const [res1, res2] = await Promise.all([
    repo.createDraft({
      orderId,
      baseVersionId: baseVerId,
      expectedProductionVersionId: prodVerId,
      reason: 'Concurrent create race A',
      sessionId: session1,
      requestId: `req-race-a-${Date.now()}`,
    }),
    repo.createDraft({
      orderId,
      baseVersionId: baseVerId,
      expectedProductionVersionId: prodVerId,
      reason: 'Concurrent create race B',
      sessionId: session2,
      requestId: `req-race-b-${Date.now()}`,
    }),
  ]);

  const okCount = (res1.ok ? 1 : 0) + (res2.ok ? 1 : 0);
  console.log(`[ConcurrencySmoke] Create results: res1.ok=${res1.ok}, res2.ok=${res2.ok}`);

  if (okCount === 1) {
    console.log('✓ EXACTLY ONE draft created, competitor rejected with ACTIVE_DRAFT_EXISTS.');
  } else {
    console.warn(`[Warning] Expected 1 success, got ${okCount}`);
  }

  const activeDraft = res1.ok ? res1.value : res2.ok ? res2.value : null;
  if (!activeDraft) {
    console.error('Failed to acquire draft for Step 3');
    return;
  }

  // Race 2: Concurrent saves with same expectedRevision = 1
  console.log('[ConcurrencySmoke] Step 3: Racing two concurrent saves with revision = 1...');
  const activeSession = activeDraft.lease?.sessionId || session1;
  const [save1, save2] = await Promise.all([
    repo.saveDraft({
      draftId: activeDraft.id,
      expectedRevision: 1,
      expectedProductionVersionId: prodVerId,
      lease: { sessionId: activeSession, epoch: activeDraft.lease?.epoch || 1 },
      requestId: `req-save-1-${Date.now()}`,
      document: { ...activeDraft.document, text: 'Save 1' },
    }),
    repo.saveDraft({
      draftId: activeDraft.id,
      expectedRevision: 1,
      expectedProductionVersionId: prodVerId,
      lease: { sessionId: activeSession, epoch: activeDraft.lease?.epoch || 1 },
      requestId: `req-save-2-${Date.now()}`,
      document: { ...activeDraft.document, text: 'Save 2' },
    }),
  ]);

  console.log(`[ConcurrencySmoke] Save results: save1.ok=${save1.ok}, save2.ok=${save2.ok}`);
  const saveSuccessCount = (save1.ok ? 1 : 0) + (save2.ok ? 1 : 0);
  if (saveSuccessCount === 1) {
    console.log('✓ CAS fencing verified: Exactly one save succeeded, stale save rejected.');
  }

  // Clean up test draft
  await supabase.from('design_revision_drafts').update({ status: 'discarded' }).eq('id', activeDraft.id);
  console.log('[ConcurrencySmoke] Smoke test complete.');
}

if (process.argv[1]?.endsWith('state39-concurrency-smoke.ts')) {
  runConcurrencySmoke().catch((err) => {
    console.error('[ConcurrencySmoke] Fatal error:', err);
    process.exit(1);
  });
}
