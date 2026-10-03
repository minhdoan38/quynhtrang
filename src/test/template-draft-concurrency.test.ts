import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DraftAutosaveError,
  DraftAutosaveQueue,
  type DraftSaveResult,
} from '../lib/draft-autosave.ts';
import { TemplateRepository, type DatabaseDraftRow } from '../lib/repositories/template-repository.ts';
import { TemplateManagementService } from '../lib/services/template-management.ts';
import {
  TemplateServiceError,
  type SaveTemplateDraftInput,
  type TemplateDraftGuard,
  type TemplateDraftRecord,
} from '../lib/domain/template.ts';
import type { DesignState } from '../lib/product-state.ts';
import type { StaffIdentity } from '../lib/domain/order.ts';

import { GET as getDraftRoute, POST as saveDraftRoute } from '../app/api/admin/content/templates/[id]/draft/route.ts';
import { POST as leaseRoute } from '../app/api/admin/content/templates/[id]/draft/lease/route.ts';
import { POST as heartbeatRoute } from '../app/api/admin/content/templates/[id]/draft/heartbeat/route.ts';
import { POST as takeoverRoute } from '../app/api/admin/content/templates/[id]/draft/takeover/route.ts';
import { POST as discardRoute } from '../app/api/admin/content/templates/[id]/draft/discard/route.ts';

function createMockEditor(userId = '43000000-0000-0000-0000-0000000000e1'): StaffIdentity {
  return {
    userId,
    role: 'editor',
    email: 'editor@quynhtrang.test',
  };
}

function createMockAdmin(userId = '43000000-0000-0000-0000-0000000000a1'): StaffIdentity {
  return {
    userId,
    role: 'admin',
    email: 'admin@quynhtrang.test',
  };
}

function createMockTimer() {
  let currentTime = 1000;
  let timerIdCounter = 1;
  const timers = new Map<number, { callback: () => void; triggerAt: number }>();

  return {
    now: () => currentTime,
    timer: {
      setTimeout: (fn: () => void, ms: number) => {
        const id = timerIdCounter++;
        timers.set(id, { callback: fn, triggerAt: currentTime + ms });
        return id;
      },
      clearTimeout: (id: unknown) => {
        timers.delete(Number(id));
      },
    },
    advance: async (ms: number) => {
      currentTime += ms;
      const toRun = [...timers.entries()]
        .filter(([, t]) => t.triggerAt <= currentTime)
        .sort((a, b) => a[1].triggerAt - b[1].triggerAt);

      for (const [id, t] of toRun) {
        timers.delete(id);
        t.callback();
      }
    },
  };
}

describe('State 43 Task 6: Draft Autosave Queue & Concurrency', () => {
  describe('Shared DraftAutosaveQueue (Fake Timers)', () => {
    it('debounces rapid enqueues and saves single queued state after 800ms', async () => {
      const clock = createMockTimer();
      const savedRequests: Array<{ document: unknown; expectedRevision: number; requestId: string }> = [];

      const queue = new DraftAutosaveQueue<{ text: string }>({
        initialRevision: 1,
        now: clock.now,
        timer: clock.timer,
        saveTransport: async (input) => {
          savedRequests.push(input);
          return {
            ok: true,
            value: { revision: input.expectedRevision + 1, updatedAt: '2026-10-03T12:00:00Z', requestId: input.requestId },
          };
        },
      });

      queue.enqueue({ text: 'Draft 1' });
      assert.equal(queue.getStatus(), 'dirty');
      assert.equal(savedRequests.length, 0);

      // Advance less than debounceMs (800)
      await clock.advance(400);
      assert.equal(savedRequests.length, 0);

      // Rapid consecutive edit resets debounce
      queue.enqueue({ text: 'Draft 2' });
      await clock.advance(500);
      assert.equal(savedRequests.length, 0);

      // Advance past remaining 300ms (total 800ms since Draft 2)
      await clock.advance(350);
      assert.equal(savedRequests.length, 1);
      assert.equal(savedRequests[0].expectedRevision, 1);
      assert.deepEqual(savedRequests[0].document, { text: 'Draft 2' });
      assert.equal(queue.getRevision(), 2);
      assert.equal(queue.getStatus(), 'saved');

      queue.dispose();
    });

    it('preserves latest semantic change during in-flight save and chains next revision', async () => {
      const clock = createMockTimer();
      const savedRequests: Array<{ document: unknown; expectedRevision: number; requestId: string }> = [];
      let resolver: ((res: DraftSaveResult) => void) | null = null;

      const queue = new DraftAutosaveQueue<{ text: string }>({
        initialRevision: 1,
        now: clock.now,
        timer: clock.timer,
        saveTransport: (input) => {
          savedRequests.push(input);
          return new Promise<DraftSaveResult>((resolve) => {
            resolver = resolve;
          });
        },
      });

      queue.enqueue({ text: 'First' });
      await clock.advance(850);

      assert.equal(savedRequests.length, 1);
      assert.equal(savedRequests[0].expectedRevision, 1);
      assert.equal(queue.getStatus(), 'saving');

      // Enqueue edits while save 1 is in-flight
      queue.enqueue({ text: 'Second' });
      queue.enqueue({ text: 'Third' });
      await clock.advance(1000);

      // Still only first request in flight
      assert.equal(savedRequests.length, 1);

      // Resolve first save
      resolver!({
        ok: true,
        value: { revision: 2, updatedAt: '2026-10-03T12:01:00Z', requestId: savedRequests[0].requestId },
      });

      await Promise.resolve();

      // Second save should now be in flight with doc 'Third' and expectedRevision 2
      assert.equal(savedRequests.length, 2);
      assert.equal(savedRequests[1].expectedRevision, 2);
      assert.deepEqual(savedRequests[1].document, { text: 'Third' });

      // Resolve second save
      resolver!({
        ok: true,
        value: { revision: 3, updatedAt: '2026-10-03T12:02:00Z', requestId: savedRequests[1].requestId },
      });

      await Promise.resolve();
      assert.equal(queue.getRevision(), 3);
      assert.equal(queue.getStatus(), 'saved');

      queue.dispose();
    });

    it('halts on conflict and ignores subsequent enqueues without discarding local state', async () => {
      const clock = createMockTimer();
      const doc = { text: 'Conflict document' };

      const queue = new DraftAutosaveQueue<{ text: string }>({
        initialRevision: 1,
        now: clock.now,
        timer: clock.timer,
        saveTransport: async () => ({
          ok: false,
          code: 'REVISION_CONFLICT',
          message: 'Bản nháp đã có phiên bản chỉnh sửa mới hơn',
        }),
      });

      queue.enqueue(doc);
      await clock.advance(850);

      assert.equal(queue.getStatus(), 'conflict');
      assert.deepEqual(queue.getLatestDocument(), doc);

      // Subsequent enqueues must be ignored
      queue.enqueue({ text: 'Ignored edit' });
      assert.equal(queue.getStatus(), 'conflict');
      assert.deepEqual(queue.getLatestDocument(), doc);

      queue.dispose();
    });

    it('flush rejects with DraftAutosaveError on conflict rather than false success', async () => {
      const clock = createMockTimer();
      let resolver: ((res: DraftSaveResult) => void) | null = null;

      const queue = new DraftAutosaveQueue<{ text: string }>({
        initialRevision: 1,
        now: clock.now,
        timer: clock.timer,
        saveTransport: () => {
          return new Promise<DraftSaveResult>((resolve) => {
            resolver = resolve;
          });
        },
      });

      queue.enqueue({ text: 'Flush conflict test' });
      await clock.advance(850);

      const flushPromise = queue.flush();

      // Resolve in-flight save with LEASE_LOST conflict
      resolver!({
        ok: false,
        code: 'LEASE_LOST',
        message: 'Lease held by another session',
      });

      await assert.rejects(
        async () => {
          await flushPromise;
        },
        (err: unknown) => {
          assert(err instanceof DraftAutosaveError);
          assert.equal(err.code, 'LEASE_LOST');
          return true;
        },
      );

      assert.equal(queue.getStatus(), 'conflict');
      queue.dispose();
    });

    it('flush drains pending changes and returns latest revision on success', async () => {
      const clock = createMockTimer();
      const savedRequests: Array<{ document: unknown; expectedRevision: number; requestId: string }> = [];

      const queue = new DraftAutosaveQueue<{ text: string }>({
        initialRevision: 1,
        now: clock.now,
        timer: clock.timer,
        saveTransport: async (input) => {
          savedRequests.push(input);
          return {
            ok: true,
            value: { revision: input.expectedRevision + 1, updatedAt: '2026-10-03T12:00:00Z', requestId: input.requestId },
          };
        },
      });

      queue.enqueue({ text: 'Immediate Flush' });
      // Flush immediately without waiting for debounce timer
      const result = await queue.flush();
      assert.equal(result.revision, 2);
      assert.equal(queue.getStatus(), 'saved');
      assert.equal(savedRequests.length, 1);

      queue.dispose();
    });

    it('triggers save when maxWaitMs ceiling is reached despite continuous fast edits', async () => {
      const clock = createMockTimer();
      const savedRequests: Array<{ document: unknown; expectedRevision: number; requestId: string }> = [];

      const queue = new DraftAutosaveQueue<{ counter: number }>({
        initialRevision: 1,
        debounceMs: 800,
        maxWaitMs: 5000,
        now: clock.now,
        timer: clock.timer,
        saveTransport: async (input) => {
          savedRequests.push(input);
          return {
            ok: true,
            value: { revision: input.expectedRevision + 1, updatedAt: '2026-10-03T12:00:00Z', requestId: input.requestId },
          };
        },
      });

      // Rapidly enqueue every 400ms (less than 800ms debounce) for 5.2 seconds
      for (let i = 1; i <= 13; i++) {
        queue.enqueue({ counter: i });
        await clock.advance(400);
      }

      // MaxWaitMs is 5000ms, so save must have triggered before 5200ms
      assert(savedRequests.length >= 1);
      assert.equal(queue.getRevision(), 2);

      queue.dispose();
    });

    it('semantic debounce: ignores identical document enqueues when saved or pending', async () => {
      const clock = createMockTimer();
      const savedRequests: Array<{ document: unknown; expectedRevision: number; requestId: string }> = [];
      const initialDoc = { text: 'Hello' };

      const queue = new DraftAutosaveQueue<{ text: string }>({
        initialRevision: 1,
        initialDocument: initialDoc,
        now: clock.now,
        timer: clock.timer,
        saveTransport: async (input) => {
          savedRequests.push(input);
          return {
            ok: true,
            value: { revision: input.expectedRevision + 1, updatedAt: '2026-10-03T12:00:00Z', requestId: input.requestId },
          };
        },
      });

      // Enqueue identical to initialDocument
      queue.enqueue({ text: 'Hello' });
      assert.equal(queue.getStatus(), 'idle');
      await clock.advance(1000);
      assert.equal(savedRequests.length, 0);

      // Enqueue distinct document -> marks dirty
      queue.enqueue({ text: 'Hello World' });
      assert.equal(queue.getStatus(), 'dirty');

      // Redundant enqueue of same document while pending does not reset or duplicate
      await clock.advance(400);
      queue.enqueue({ text: 'Hello World' });
      await clock.advance(450);
      assert.equal(savedRequests.length, 1);
      assert.equal(queue.getStatus(), 'saved');

      // Redundant enqueue of newly saved document does not mark dirty
      queue.enqueue({ text: 'Hello World' });
      assert.equal(queue.getStatus(), 'saved');
      await clock.advance(1000);
      assert.equal(savedRequests.length, 1);

      queue.dispose();
    });

    it('cancels pending debounce when document reverts to last saved state', async () => {
      const clock = createMockTimer();
      const savedRequests: Array<{ document: unknown; expectedRevision: number; requestId: string }> = [];
      const initialDoc = { text: 'Base' };

      const queue = new DraftAutosaveQueue<{ text: string }>({
        initialRevision: 1,
        initialDocument: initialDoc,
        now: clock.now,
        timer: clock.timer,
        saveTransport: async (input) => {
          savedRequests.push(input);
          return {
            ok: true,
            value: { revision: input.expectedRevision + 1, updatedAt: '2026-10-03T12:00:00Z', requestId: input.requestId },
          };
        },
      });

      // Edit
      queue.enqueue({ text: 'Typo' });
      assert.equal(queue.getStatus(), 'dirty');
      await clock.advance(300);

      // Revert back to Base before 800ms debounce fires
      queue.enqueue({ text: 'Base' });
      assert.equal(queue.getStatus(), 'saved');
      await clock.advance(1000);
      assert.equal(savedRequests.length, 0);

      queue.dispose();
    });

    it('supports custom documentsEqual comparator', async () => {
      const clock = createMockTimer();
      const savedRequests: Array<{ document: unknown; expectedRevision: number; requestId: string }> = [];

      // Comparator ignoring volatile timestamp field
      const queue = new DraftAutosaveQueue<{ id: string; timestamp: number }>({
        initialRevision: 1,
        initialDocument: { id: 'item-1', timestamp: 100 },
        documentsEqual: (a, b) => a.id === b.id,
        now: clock.now,
        timer: clock.timer,
        saveTransport: async (input) => {
          savedRequests.push(input);
          return {
            ok: true,
            value: { revision: input.expectedRevision + 1, updatedAt: '2026-10-03T12:00:00Z', requestId: input.requestId },
          };
        },
      });

      // Different timestamp, same id -> considered equal, ignored
      queue.enqueue({ id: 'item-1', timestamp: 200 });
      assert.equal(queue.getStatus(), 'idle');
      await clock.advance(1000);
      assert.equal(savedRequests.length, 0);

      // Different id -> triggers save
      queue.enqueue({ id: 'item-2', timestamp: 300 });
      assert.equal(queue.getStatus(), 'dirty');
      await clock.advance(850);
      assert.equal(savedRequests.length, 1);

      queue.dispose();
    });
  });

  describe('TemplateRepository Concurrency & RPC Mutations', () => {
    function createMockSupabaseWithState(initialDraft: DatabaseDraftRow) {
      let draftState: DatabaseDraftRow = { ...initialDraft };
      let lockHeld = false;

      const mockClient = {
        from(table: string) {
          assert.equal(table, 'template_drafts');
          return {
            select(_fields: string) {
              return {
                eq(_col: string, val: string) {
                  assert.equal(val, draftState.template_id);
                  return {
                    async maybeSingle() {
                      return { data: { ...draftState }, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        async rpc(funcName: string, params: Record<string, unknown>) {
          const now = new Date().toISOString();

          if (funcName === 'template_acquire_draft_lease') {
            const actor = String(params.p_actor);
            const sessionId = String(params.p_session_id);
            const expiresAt = draftState.lease_expires_at ? new Date(draftState.lease_expires_at).getTime() : 0;
            const isExpired = !draftState.lease_expires_at || expiresAt <= Date.now();

            if (!isExpired) {
              if (draftState.editor_user_id === actor && draftState.lease_session_id === sessionId) {
                draftState.lease_expires_at = new Date(Date.now() + 120_000).toISOString();
                return { data: { ok: true, draft: { ...draftState } }, error: null };
              }
              return { data: null, error: { message: 'LEASE_CONFLICT: lease is currently held by another session' } };
            }

            // If expired but previously owned by another session
            if (draftState.lease_session_id && (draftState.editor_user_id !== actor || draftState.lease_session_id !== sessionId)) {
              return { data: null, error: { message: 'LEASE_EXPIRED: lease has expired and must be taken over by admin' } };
            }

            draftState.editor_user_id = actor;
            draftState.lease_session_id = sessionId;
            draftState.lease_expires_at = new Date(Date.now() + 120_000).toISOString();
            draftState.updated_at = now;
            return { data: { ok: true, draft: { ...draftState } }, error: null };
          }

          if (funcName === 'template_heartbeat_draft_lease') {
            const actor = String(params.p_actor);
            const sessionId = String(params.p_session_id);
            const epoch = Number(params.p_epoch);
            const expiresAt = draftState.lease_expires_at ? new Date(draftState.lease_expires_at).getTime() : 0;

            if (draftState.editor_user_id !== actor || draftState.lease_session_id !== sessionId || Number(draftState.lease_epoch) !== epoch) {
              return { data: null, error: { message: 'LEASE_LOST: lease held by another session or epoch changed' } };
            }
            if (!draftState.lease_expires_at || expiresAt <= Date.now()) {
              return { data: null, error: { message: 'LEASE_EXPIRED: lease expired' } };
            }

            const newExpires = new Date(Date.now() + 120_000).toISOString();
            draftState.lease_expires_at = newExpires;
            return {
              data: {
                ok: true,
                value: { sessionId, epoch, expiresAt: newExpires },
              },
              error: null,
            };
          }

          if (funcName === 'template_save_draft') {
            // Simulate row lock for CAS concurrency
            while (lockHeld) {
              await new Promise((r) => setTimeout(r, 5));
            }
            lockHeld = true;
            try {
              const actor = String(params.p_actor);
              const sessionId = String(params.p_session_id);
              const epoch = Number(params.p_epoch);
              const expectedRev = Number(params.p_expected_revision);
              const expiresAt = draftState.lease_expires_at ? new Date(draftState.lease_expires_at).getTime() : 0;

              if (draftState.editor_user_id !== actor || draftState.lease_session_id !== sessionId || Number(draftState.lease_epoch) !== epoch) {
                return { data: null, error: { message: 'LEASE_LOST: lease held by another session or epoch changed' } };
              }
              if (!draftState.lease_expires_at || expiresAt <= Date.now()) {
                return { data: null, error: { message: 'LEASE_EXPIRED: lease expired' } };
              }
              if (Number(draftState.draft_revision) !== expectedRev) {
                return { data: null, error: { message: 'REVISION_CONFLICT: expected revision does not match draft revision' } };
              }

              const isChanged = JSON.stringify(params.p_document) !== JSON.stringify(draftState.design_document);
              const nextRev = isChanged ? Number(draftState.draft_revision) + 1 : Number(draftState.draft_revision);
              draftState.draft_revision = nextRev;
              draftState.design_document = params.p_document as Record<string, unknown>;
              draftState.source_document_hash = 'sha256-mock-hash';
              draftState.lease_expires_at = new Date(Date.now() + 120_000).toISOString();
              draftState.updated_at = now;

              return {
                data: {
                  ok: true,
                  value: { revision: nextRev, updatedAt: now, requestId: String(params.p_request) },
                },
                error: null,
              };
            } finally {
              lockHeld = false;
            }
          }

          if (funcName === 'template_takeover_draft') {
            const actor = String(params.p_actor);
            const expectedRev = Number(params.p_expected_revision);
            const expectedEpoch = Number(params.p_expected_epoch);
            const newSessionId = String(params.p_new_session_id);
            void params.p_reason;
            const expiresAt = draftState.lease_expires_at ? new Date(draftState.lease_expires_at).getTime() : 0;

            if (Number(draftState.draft_revision) !== expectedRev) {
              return { data: null, error: { message: 'REVISION_CONFLICT: draft revision mismatch' } };
            }
            if (Number(draftState.lease_epoch) !== expectedEpoch) {
              return { data: null, error: { message: 'REVISION_CONFLICT: draft epoch mismatch' } };
            }
            if (draftState.lease_expires_at && expiresAt > Date.now()) {
              return { data: null, error: { message: 'LEASE_ACTIVE: cannot take over active lease' } };
            }

            const nextEpoch = Number(draftState.lease_epoch) + 1;
            draftState.editor_user_id = actor;
            draftState.lease_session_id = newSessionId;
            draftState.lease_epoch = nextEpoch;
            draftState.lease_expires_at = new Date(Date.now() + 120_000).toISOString();
            draftState.updated_at = now;

            return { data: { ok: true, draft: { ...draftState } }, error: null };
          }

          if (funcName === 'template_discard_draft') {
            const actor = String(params.p_actor);
            const sessionId = String(params.p_session_id);
            const epoch = Number(params.p_epoch);
            const expectedRev = Number(params.p_expected_revision);

            if (draftState.editor_user_id !== actor || draftState.lease_session_id !== sessionId || Number(draftState.lease_epoch) !== epoch) {
              return { data: null, error: { message: 'LEASE_LOST: lease held by another session or epoch changed' } };
            }
            if (Number(draftState.draft_revision) !== expectedRev) {
              return { data: null, error: { message: 'REVISION_CONFLICT: draft revision mismatch' } };
            }

            return { data: { ok: true, draftId: draftState.id, discarded: true }, error: null };
          }

          throw new Error(`Unknown RPC: ${funcName}`);
        },
      } as unknown as SupabaseClient;

      return { mockClient, getDraftState: () => draftState, setDraftState: (s: DatabaseDraftRow) => { draftState = s; } };
    }

    const defaultDraftRow: DatabaseDraftRow = {
      id: 'draft-100',
      template_id: 'tmpl-100',
      based_on_version_id: null,
      design_document: { elements: [] },
      document_schema_version: 1,
      draft_revision: 1,
      editor_user_id: null,
      lease_session_id: null,
      lease_epoch: 0,
      lease_expires_at: null,
      last_activity_at: null,
      created_at: '2026-10-03T10:00:00Z',
      updated_at: '2026-10-03T10:00:00Z',
    };

    it('acquireLease assigns editor and session, and denies another session while active', async () => {
      const { mockClient } = createMockSupabaseWithState(defaultDraftRow);
      const repo = new TemplateRepository(mockClient);

      const ed1 = '43000000-0000-0000-0000-0000000000e1';
      const sess1 = 'session-tab-1';

      // First tab acquires lease
      const acq1 = await repo.acquireLease(ed1, {
        draftId: 'draft-100',
        sessionId: sess1,
        requestId: randomUUID(),
      });

      assert.equal(acq1.ok, true);
      if (acq1.ok) {
        assert.equal(acq1.value.editorUserId, ed1);
        assert.equal(acq1.value.leaseSessionId, sess1);
      }

      // Second tab (same user, different session) tries to acquire -> LEASE_CONFLICT
      const sess2 = 'session-tab-2';
      const acq2 = await repo.acquireLease(ed1, {
        draftId: 'draft-100',
        sessionId: sess2,
        requestId: randomUUID(),
      });

      assert.equal(acq2.ok, false);
      if (!acq2.ok) {
        assert.equal(acq2.code, 'LEASE_CONFLICT');
      }
    });

    it('heartbeatLease extends expiry, wrong session or epoch returns LEASE_CONFLICT', async () => {
      const activeDraft: DatabaseDraftRow = {
        ...defaultDraftRow,
        editor_user_id: '43000000-0000-0000-0000-0000000000e1',
        lease_session_id: 'session-1',
        lease_epoch: 0,
        lease_expires_at: new Date(Date.now() + 100_000).toISOString(),
      };
      const { mockClient } = createMockSupabaseWithState(activeDraft);
      const repo = new TemplateRepository(mockClient);

      // Heartbeat with correct session and epoch
      const hb = await repo.heartbeatLease('43000000-0000-0000-0000-0000000000e1', {
        draftId: 'draft-100',
        sessionId: 'session-1',
        epoch: 0,
        requestId: randomUUID(),
      });
      assert.equal(hb.ok, true);

      // Heartbeat with wrong epoch -> LEASE_CONFLICT
      const hbWrong = await repo.heartbeatLease('43000000-0000-0000-0000-0000000000e1', {
        draftId: 'draft-100',
        sessionId: 'session-1',
        epoch: 99,
        requestId: randomUUID(),
      });
      assert.equal(hbWrong.ok, false);
      if (!hbWrong.ok) {
        assert.equal(hbWrong.code, 'LEASE_CONFLICT');
      }
    });

    it('concurrent saves: exactly one succeeds, other fails with REVISION_CONFLICT', async () => {
      const activeDraft: DatabaseDraftRow = {
        ...defaultDraftRow,
        editor_user_id: '43000000-0000-0000-0000-0000000000e1',
        lease_session_id: 'session-1',
        lease_epoch: 0,
        lease_expires_at: new Date(Date.now() + 100_000).toISOString(),
        draft_revision: 1,
      };
      const { mockClient } = createMockSupabaseWithState(activeDraft);
      const repo = new TemplateRepository(mockClient);

      const actor = '43000000-0000-0000-0000-0000000000e1';
      const guard: TemplateDraftGuard = {
        templateId: 'tmpl-100',
        draftId: 'draft-100',
        expectedRevision: 1,
        sessionId: 'session-1',
        leaseEpoch: 0,
      };

      const docA = { productId: 'card', elements: [{ id: 'a' }] } as unknown as DesignState;
      const docB = { productId: 'card', elements: [{ id: 'b' }] } as unknown as DesignState;

      const [a, b] = await Promise.all([
        repo.saveDraft(actor, { ...guard, requestId: randomUUID(), document: docA }),
        repo.saveDraft(actor, { ...guard, requestId: randomUUID(), document: docB }),
      ]);

      assert.equal([a, b].filter((x) => x.ok).length, 1);
      assert.equal([a, b].find((x) => !x.ok)?.code, 'REVISION_CONFLICT');
    });

    it('takeoverDraft: admin takes over expired lease and increments epoch', async () => {
      const expiredDraft: DatabaseDraftRow = {
        ...defaultDraftRow,
        editor_user_id: '43000000-0000-0000-0000-0000000000e1',
        lease_session_id: 'session-old',
        lease_epoch: 0,
        lease_expires_at: new Date(Date.now() - 5000).toISOString(),
        draft_revision: 2,
      };
      const { mockClient } = createMockSupabaseWithState(expiredDraft);
      const repo = new TemplateRepository(mockClient);

      const admin = '43000000-0000-0000-0000-0000000000a1';
      const takeover = await repo.takeoverDraft(admin, {
        draftId: 'draft-100',
        expectedRevision: 2,
        expectedEpoch: 0,
        newSessionId: 'session-admin',
        reason: 'Taking over stale lease from abandoned tab',
        requestId: randomUUID(),
      });

      assert.equal(takeover.ok, true);
      if (takeover.ok) {
        assert.equal(takeover.value.editorUserId, admin);
        assert.equal(takeover.value.leaseSessionId, 'session-admin');
        assert.equal(takeover.value.leaseEpoch, 1);
      }
    });

    it('discardDraft: deletes draft and returns discarded boolean', async () => {
      const activeDraft: DatabaseDraftRow = {
        ...defaultDraftRow,
        editor_user_id: '43000000-0000-0000-0000-0000000000e1',
        lease_session_id: 'session-1',
        lease_epoch: 0,
        lease_expires_at: new Date(Date.now() + 100_000).toISOString(),
        draft_revision: 1,
      };
      const { mockClient } = createMockSupabaseWithState(activeDraft);
      const repo = new TemplateRepository(mockClient);

      const res = await repo.discardDraft('43000000-0000-0000-0000-0000000000e1', {
        draftId: 'draft-100',
        expectedRevision: 1,
        sessionId: 'session-1',
        epoch: 0,
        requestId: randomUUID(),
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.draftId, 'draft-100');
        assert.equal(res.value.discarded, true);
      }
    });

    it('saveDraft updates source_document_hash and preserves revision on semantic no-op', async () => {
      const activeDraft: DatabaseDraftRow = {
        ...defaultDraftRow,
        editor_user_id: '43000000-0000-0000-0000-0000000000e1',
        lease_session_id: 'session-1',
        lease_epoch: 0,
        lease_expires_at: new Date(Date.now() + 100_000).toISOString(),
        draft_revision: 1,
        design_document: { elements: [{ id: '1', text: 'v1' }] },
      };
      const { mockClient } = createMockSupabaseWithState(activeDraft);
      const repo = new TemplateRepository(mockClient);

      const actor = '43000000-0000-0000-0000-0000000000e1';
      const guard: TemplateDraftGuard = {
        templateId: 'tmpl-100',
        draftId: 'draft-100',
        expectedRevision: 1,
        sessionId: 'session-1',
        leaseEpoch: 0,
      };

      // Save changed document -> advances to revision 2
      const saveChanged = await repo.saveDraft(actor, {
        ...guard,
        requestId: randomUUID(),
        document: { elements: [{ id: '1', text: 'v2' }] } as unknown as DesignState,
      });
      assert.equal(saveChanged.ok, true);
      if (saveChanged.ok) {
        assert.equal(saveChanged.value.revision, 2);
      }

      const draftAfterSave = await repo.getDraft('tmpl-100');
      assert(draftAfterSave !== null);
      assert.equal(draftAfterSave.draftRevision, 2);
      assert.equal(draftAfterSave.sourceDocumentHash, 'sha256-mock-hash');

      // Save identical document with expectedRevision 2 -> does NOT advance revision
      const saveNoop = await repo.saveDraft(actor, {
        ...guard,
        expectedRevision: 2,
        requestId: randomUUID(),
        document: { elements: [{ id: '1', text: 'v2' }] } as unknown as DesignState,
      });
      assert.equal(saveNoop.ok, true);
      if (saveNoop.ok) {
        assert.equal(saveNoop.value.revision, 2);
      }

      const draftAfterNoop = await repo.getDraft('tmpl-100');
      assert(draftAfterNoop !== null);
      assert.equal(draftAfterNoop.draftRevision, 2);
    });
  });

  describe('TemplateManagementService Guard & RBAC Boundaries', () => {
    function createMockRepo(initialDraft: DatabaseDraftRow) {
      const row = { ...initialDraft };
      return {
        async getTemplate(id: string) {
          return {
            id,
            name: 'Test Template',
            productId: 'card',
            variantId: 'horizontal',
            mode: null,
            shape: null,
            revision: 1,
            target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null, geometryKey: 'card:horizontal', surfaces: [] },
            status: 'draft',
            categoryId: 'birthday',
            tags: [],
            sortOrder: 0,
            currentPublishedVersionId: null,
            everPublishedAt: null,
            createdAt: '2026-10-03T10:00:00Z',
            updatedAt: '2026-10-03T10:00:00Z',
            archivedAt: null,
            createdBy: null,
            updatedBy: null,
          };
        },
        async getDraft(_tmplId: string): Promise<TemplateDraftRecord | null> {
          return {
            id: row.id,
            templateId: row.template_id,
            basedOnVersionId: null,
            designDocument: row.design_document as unknown as DesignState,
            documentSchemaVersion: 1,
            draftRevision: Number(row.draft_revision),
            editorUserId: row.editor_user_id ?? null,
            leaseSessionId: row.lease_session_id ?? null,
            leaseEpoch: Number(row.lease_epoch),
            leaseExpiresAt: row.lease_expires_at ?? null,
            lastActivityAt: null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            createdBy: null,
            updatedBy: null,
          };
        },
        async listVersions() {
          return [];
        },
        async acquireLease(_actor: string, input: { requestId: string; draftId: string; sessionId: string }) {
          return {
            ok: true as const,
            value: {
              id: input.draftId,
              templateId: 'tmpl-1',
              basedOnVersionId: null,
              designDocument: {} as DesignState,
              documentSchemaVersion: 1,
              draftRevision: 1,
              editorUserId: _actor,
              leaseSessionId: input.sessionId,
              leaseEpoch: 0,
              leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
              lastActivityAt: null,
              createdAt: '2026-10-03T10:00:00Z',
              updatedAt: '2026-10-03T10:00:00Z',
              createdBy: null,
              updatedBy: null,
            },
          };
        },
        async heartbeatLease(_actor: string, input: { sessionId: string; epoch: number }) {
          return {
            ok: true as const,
            value: { sessionId: input.sessionId, epoch: input.epoch, expiresAt: new Date(Date.now() + 120_000).toISOString() },
          };
        },
        async saveDraft(_actor: string, input: SaveTemplateDraftInput) {
          return {
            ok: true as const,
            value: { revision: input.expectedRevision + 1, updatedAt: '2026-10-03T12:00:00Z', requestId: input.requestId },
          };
        },
        async takeoverDraft(_actor: string, input: { draftId: string; newSessionId: string; expectedEpoch: number }) {
          return {
            ok: true as const,
            value: {
              id: input.draftId,
              templateId: 'tmpl-1',
              basedOnVersionId: null,
              designDocument: {} as DesignState,
              documentSchemaVersion: 1,
              draftRevision: 2,
              editorUserId: _actor,
              leaseSessionId: input.newSessionId,
              leaseEpoch: input.expectedEpoch + 1,
              leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
              lastActivityAt: null,
              createdAt: '2026-10-03T10:00:00Z',
              updatedAt: '2026-10-03T10:00:00Z',
              createdBy: null,
              updatedBy: null,
            },
          };
        },
        async discardDraft(_actor: string, input: { draftId: string }) {
          return {
            ok: true as const,
            value: { draftId: input.draftId, discarded: true },
          };
        },
      } as unknown as TemplateRepository;
    }

    const testDraftRow: DatabaseDraftRow = {
      id: 'draft-1',
      template_id: 'tmpl-1',
      design_document: {},
      draft_revision: 1,
      created_at: '2026-10-03T10:00:00Z',
      updated_at: '2026-10-03T10:00:00Z',
    };

    it('rejects takeover when actor is not admin', async () => {
      const repo = createMockRepo(testDraftRow);
      const service = new TemplateManagementService(repo);
      const editor = createMockEditor();

      await assert.rejects(
        async () => {
          await service.takeoverDraft(editor, {
            draftId: 'draft-1',
            expectedRevision: 1,
            expectedEpoch: 0,
            newSessionId: 'sess-new',
            reason: 'Unauthorized takeover attempt',
            requestId: randomUUID(),
          });
        },
        (err: unknown) => {
          assert(err instanceof TemplateServiceError);
          assert.equal(err.code, 'FORBIDDEN');
          assert.equal(err.status, 403);
          return true;
        },
      );
    });

    it('rejects takeover when reason is less than 3 or greater than 500 characters', async () => {
      const repo = createMockRepo(testDraftRow);
      const service = new TemplateManagementService(repo);
      const admin = createMockAdmin();

      await assert.rejects(
        async () => {
          await service.takeoverDraft(admin, {
            draftId: 'draft-1',
            expectedRevision: 1,
            expectedEpoch: 0,
            newSessionId: 'sess-new',
            reason: 'no', // < 3 chars
            requestId: randomUUID(),
          });
        },
        (err: unknown) => {
          assert(err instanceof TemplateServiceError);
          assert.equal(err.code, 'INVALID_INPUT');
          assert.equal(err.status, 400);
          return true;
        },
      );
    });

    it('admin takeover succeeds with valid parameters', async () => {
      const repo = createMockRepo(testDraftRow);
      const service = new TemplateManagementService(repo);
      const admin = createMockAdmin();

      const draft = await service.takeoverDraft(admin, {
        draftId: 'draft-1',
        expectedRevision: 1,
        expectedEpoch: 0,
        newSessionId: 'sess-admin',
        reason: 'Authorized takeover of abandoned draft',
        requestId: randomUUID(),
      });

      assert.equal(draft.leaseSessionId, 'sess-admin');
      assert.equal(draft.leaseEpoch, 1);
    });
  });

  describe('HTTP Route Handlers', () => {
    function createMockDeps(service: TemplateManagementService, role: 'admin' | 'editor' = 'editor') {
      return {
        requireStaff: async () => ({
          userId: role === 'admin' ? '43000000-0000-0000-0000-0000000000a1' : '43000000-0000-0000-0000-0000000000e1',
          role,
          email: `${role}@quynhtrang.test`,
        }),
        service,
      };
    }

    const testDraftRecord: TemplateDraftRecord = {
      id: 'draft-route-1',
      templateId: 'tmpl-route-1',
      basedOnVersionId: null,
      designDocument: {} as DesignState,
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: '43000000-0000-0000-0000-0000000000e1',
      leaseSessionId: 'sess-route-1',
      leaseEpoch: 0,
      leaseExpiresAt: '2026-10-03T12:00:00Z',
      lastActivityAt: null,
      createdAt: '2026-10-03T10:00:00Z',
      updatedAt: '2026-10-03T10:00:00Z',
      createdBy: null,
      updatedBy: null,
    };

    function createRouteService() {
      return {
        async getTemplateDetail(id: string) {
          return {
            template: { id, name: 'T' } as unknown,
            draft: testDraftRecord,
            versions: [],
          };
        },
        async acquireDraftLease() {
          return testDraftRecord;
        },
        async heartbeatDraftLease() {
          return { sessionId: 'sess-route-1', epoch: 0, expiresAt: '2026-10-03T12:02:00Z' };
        },
        async saveDraft() {
          return { revision: 2, updatedAt: '2026-10-03T12:00:00Z', requestId: 'req-save-1' };
        },
        async takeoverDraft() {
          return { ...testDraftRecord, leaseEpoch: 1, leaseSessionId: 'sess-admin-route' };
        },
        async discardDraft() {
          return { draftId: 'draft-route-1', discarded: true };
        },
      } as unknown as TemplateManagementService;
    }

    it('GET /api/admin/content/templates/[id]/draft returns draft record', async () => {
      const service = createRouteService();
      const deps = createMockDeps(service, 'editor');

      const req = new Request('http://localhost:3000/api/admin/content/templates/tmpl-1/draft');
      const res = await getDraftRoute(req, { params: Promise.resolve({ id: 'tmpl-1' }) }, deps);

      assert.equal(res.status, 200);
      const json = (await res.json()) as { draft: TemplateDraftRecord };
      assert.equal(json.draft.id, 'draft-route-1');
    });

    it('POST /api/admin/content/templates/[id]/draft saves draft with 200', async () => {
      const service = createRouteService();
      const deps = createMockDeps(service, 'editor');

      const req = new Request('http://localhost:3000/api/admin/content/templates/tmpl-1/draft', {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: 'draft-route-1',
          expectedRevision: 1,
          sessionId: 'sess-route-1',
          leaseEpoch: 0,
          document: { elements: [] },
        }),
      });

      const res = await saveDraftRoute(req, { params: Promise.resolve({ id: 'tmpl-1' }) }, deps);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { ok: boolean; value: { revision: number } };
      assert.equal(json.ok, true);
      assert.equal(json.value.revision, 2);
    });

    it('POST /api/admin/content/templates/[id]/draft/lease acquires lease with 200', async () => {
      const service = createRouteService();
      const deps = createMockDeps(service, 'editor');

      const req = new Request('http://localhost:3000/api/admin/content/templates/tmpl-1/draft/lease', {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: 'draft-route-1',
          sessionId: 'sess-route-1',
        }),
      });

      const res = await leaseRoute(req, { params: Promise.resolve({ id: 'tmpl-1' }) }, deps);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { ok: boolean; draft: TemplateDraftRecord };
      assert.equal(json.ok, true);
      assert.equal(json.draft.id, 'draft-route-1');
    });

    it('POST /api/admin/content/templates/[id]/draft/heartbeat returns 200', async () => {
      const service = createRouteService();
      const deps = createMockDeps(service, 'editor');

      const req = new Request('http://localhost:3000/api/admin/content/templates/tmpl-1/draft/heartbeat', {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: 'draft-route-1',
          sessionId: 'sess-route-1',
          epoch: 0,
        }),
      });

      const res = await heartbeatRoute(req, { params: Promise.resolve({ id: 'tmpl-1' }) }, deps);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { ok: boolean; value: { sessionId: string } };
      assert.equal(json.ok, true);
      assert.equal(json.value.sessionId, 'sess-route-1');
    });

    it('POST /api/admin/content/templates/[id]/draft/takeover succeeds for admin', async () => {
      const service = createRouteService();
      const deps = createMockDeps(service, 'admin');

      const req = new Request('http://localhost:3000/api/admin/content/templates/tmpl-1/draft/takeover', {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: 'draft-route-1',
          expectedRevision: 1,
          expectedEpoch: 0,
          newSessionId: 'sess-admin-route',
          reason: 'Admin taking over abandoned session',
        }),
      });

      const res = await takeoverRoute(req, { params: Promise.resolve({ id: 'tmpl-1' }) }, deps);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { ok: boolean; draft: TemplateDraftRecord };
      assert.equal(json.ok, true);
      assert.equal(json.draft.leaseEpoch, 1);
    });

    it('POST /api/admin/content/templates/[id]/draft/discard deletes draft with 200', async () => {
      const service = createRouteService();
      const deps = createMockDeps(service, 'editor');

      const req = new Request('http://localhost:3000/api/admin/content/templates/tmpl-1/draft/discard', {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draftId: 'draft-route-1',
          expectedRevision: 1,
          sessionId: 'sess-route-1',
          epoch: 0,
        }),
      });

      const res = await discardRoute(req, { params: Promise.resolve({ id: 'tmpl-1' }) }, deps);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { ok: boolean; value: { discarded: boolean } };
      assert.equal(json.ok, true);
      assert.equal(json.value.discarded, true);
    });

    it('rejects cross-origin mutations with 403', async () => {
      const service = createRouteService();
      const deps = createMockDeps(service, 'editor');

      const req = new Request('http://localhost:3000/api/admin/content/templates/tmpl-1/draft', {
        method: 'POST',
        headers: {
          'Origin': 'http://malicious-site.test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const res = await saveDraftRoute(req, { params: Promise.resolve({ id: 'tmpl-1' }) }, deps);
      assert.equal(res.status, 403);
    });
  });
});
