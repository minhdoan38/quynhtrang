import test from 'node:test';
import assert from 'node:assert/strict';
import { StaffDraftSaveQueue } from '../lib/staff-draft-autosave.ts';
import type { SaveStaffDraftInput, RevisionResult } from '../lib/domain/design-revision.ts';
import type { DesignState } from '../lib/product-state.ts';

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

test('StaffDraftSaveQueue debounces and saves single queued state', async () => {
  const clock = createMockTimer();
  const savedRequests: SaveStaffDraftInput[] = [];

  const queue = new StaffDraftSaveQueue({
    draftId: 'draft-1',
    initialRevision: 1,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    now: clock.now,
    timer: clock.timer,
    saveTransport: async (input: SaveStaffDraftInput) => {
      savedRequests.push(input);
      return {
        ok: true,
        value: { revision: input.expectedRevision + 1, updatedAt: '2026-09-30T16:00:00Z', requestId: input.requestId },
      };
    },
  });

  const doc1 = { text: 'Hello' } as unknown as DesignState;
  queue.enqueue(doc1);
  assert.equal(queue.getStatus(), 'dirty');
  assert.equal(savedRequests.length, 0);

  // Advance less than debounce
  await clock.advance(400);
  assert.equal(savedRequests.length, 0);

  // Advance past 800ms
  await clock.advance(450);
  assert.equal(savedRequests.length, 1);
  assert.equal(savedRequests[0].expectedRevision, 1);
  assert.equal(queue.getRevision(), 2);
  assert.equal(queue.getStatus(), 'saved');

  queue.dispose();
});

test('StaffDraftSaveQueue ensures single-flight and chains new revision', async () => {
  const clock = createMockTimer();
  const savedRequests: SaveStaffDraftInput[] = [];

  let resolver: ((res: RevisionResult<{ revision: number; updatedAt: string; requestId: string }>) => void) | null = null;

  const queue = new StaffDraftSaveQueue({
    draftId: 'draft-1',
    initialRevision: 1,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    now: clock.now,
    timer: clock.timer,
    saveTransport: (input: SaveStaffDraftInput) => {
      savedRequests.push(input);
      const { promise, resolve } = Promise.withResolvers<RevisionResult<{ revision: number; updatedAt: string; requestId: string }>>();
      resolver = resolve;
      return promise;
    },
  });

  const doc1 = { text: 'First' } as unknown as DesignState;
  const doc2 = { text: 'Second' } as unknown as DesignState;
  const doc3 = { text: 'Third' } as unknown as DesignState;

  queue.enqueue(doc1);
  await clock.advance(850);
  assert.equal(savedRequests.length, 1);
  assert.equal(savedRequests[0].expectedRevision, 1);
  assert.equal(queue.getStatus(), 'saving');
  assert.equal(queue.isInFlight(), true);

  // Enqueue while first is in flight
  queue.enqueue(doc2);
  queue.enqueue(doc3);
  await clock.advance(1000);
  assert.equal(savedRequests.length, 1);

  // Resolve first save with revision 2
  resolver!({
    ok: true,
    value: { revision: 2, updatedAt: '2026-09-30T16:01:00Z', requestId: savedRequests[0].requestId },
  });

  // Microtask tick
  await Promise.resolve();

  assert.equal(queue.isInFlight(), true);
  assert.equal(savedRequests.length, 2);
  assert.equal(savedRequests[1].expectedRevision, 2);
  assert.deepEqual(savedRequests[1].document, doc3);

  // Resolve second save with revision 3
  resolver!({
    ok: true,
    value: { revision: 3, updatedAt: '2026-09-30T16:02:00Z', requestId: savedRequests[1].requestId },
  });

  await Promise.resolve();
  assert.equal(queue.getRevision(), 3);
  assert.equal(queue.getStatus(), 'saved');
  assert.equal(queue.isInFlight(), false);

  queue.dispose();
});

test('StaffDraftSaveQueue halts on REVISION_CONFLICT without discarding local state', async () => {
  const clock = createMockTimer();
  const queue = new StaffDraftSaveQueue({
    draftId: 'draft-1',
    initialRevision: 1,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    now: clock.now,
    timer: clock.timer,
    saveTransport: async () => ({
      ok: false,
      code: 'REVISION_CONFLICT',
      message: 'Bản nháp đã có phiên bản chỉnh sửa mới hơn',
    }),
  });

  const doc = { text: 'Conflict test' } as unknown as DesignState;
  queue.enqueue(doc);
  await clock.advance(850);

  assert.equal(queue.getStatus(), 'conflict');
  assert.deepEqual(queue.getLatestDocument(), doc);

  // Further enqueues are rejected when halted
  queue.enqueue({ text: 'Ignored' } as unknown as DesignState);
  assert.equal(queue.getStatus(), 'conflict');

  queue.dispose();
});

test('StaffDraftSaveQueue flush propagates revision conflict and keeps pending draft', async () => {
  const clock = createMockTimer();
  const doc = { text: 'Unsynced conflict edit' } as unknown as DesignState;
  const queue = new StaffDraftSaveQueue({
    draftId: 'draft-1',
    initialRevision: 1,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    now: clock.now,
    timer: clock.timer,
    saveTransport: async () => ({
      ok: false,
      code: 'REVISION_CONFLICT',
      message: 'Thiết kế đã được cập nhật ở nơi khác.',
    }),
  });

  queue.enqueue(doc);
  await assert.rejects(queue.flush(), (error: unknown) => {
    assert.ok(error && typeof error === 'object' && 'code' in error);
    assert.equal(error.code, 'REVISION_CONFLICT');
    return true;
  });
  assert.equal(queue.getStatus(), 'conflict');
  assert.deepEqual(queue.getLatestDocument(), doc);

  queue.dispose();
});

test('StaffDraftSaveQueue flush propagates network failure and keeps draft dirty for retry', async () => {
  const clock = createMockTimer();
  const doc = { text: 'Unsynced network edit' } as unknown as DesignState;
  const queue = new StaffDraftSaveQueue({
    draftId: 'draft-1',
    initialRevision: 1,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    now: clock.now,
    timer: clock.timer,
    saveTransport: async () => {
      throw new Error('Connection lost');
    },
  });

  queue.enqueue(doc);
  await assert.rejects(queue.flush(), (error: unknown) => {
    assert.ok(error && typeof error === 'object' && 'code' in error);
    assert.equal(error.code, 'NETWORK_ERROR');
    return true;
  });
  assert.equal(queue.getStatus(), 'error');
  assert.deepEqual(queue.getLatestDocument(), doc);

  queue.dispose();
});

test('StaffDraftSaveQueue does not acknowledge an older response as the latest local snapshot', async () => {
  const clock = createMockTimer();
  const statuses: string[] = [];
  const resolvers: Array<(res: RevisionResult<{ revision: number; updatedAt: string; requestId: string }>) => void> = [];
  const requests: SaveStaffDraftInput[] = [];
  const queue = new StaffDraftSaveQueue({
    draftId: 'draft-1',
    initialRevision: 1,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    now: clock.now,
    timer: clock.timer,
    onStatusChange: (status) => statuses.push(status),
    saveTransport: (input) => {
      requests.push(input);
      const { promise, resolve } = Promise.withResolvers<RevisionResult<{ revision: number; updatedAt: string; requestId: string }>>();
      resolvers.push(resolve);
      return promise;
    },
  });

  queue.enqueue({ text: 'First' } as unknown as DesignState);
  await clock.advance(850);
  queue.enqueue({ text: 'Newer' } as unknown as DesignState);
  resolvers[0]({ ok: true, value: { revision: 2, updatedAt: '2026-10-06T00:00:00Z', requestId: requests[0].requestId } });
  await Promise.resolve();

  assert.equal(queue.getStatus(), 'saving');
  assert.equal(statuses.includes('saved'), false);
  assert.deepEqual(requests[1].document, { text: 'Newer' });

  resolvers[1]({ ok: true, value: { revision: 3, updatedAt: '2026-10-06T00:00:01Z', requestId: requests[1].requestId } });
  await Promise.resolve();
  assert.equal(queue.getStatus(), 'saved');

  queue.dispose();
});

test('StaffDraftSaveQueue ignores semantically identical enqueues when saved', async () => {
  const clock = createMockTimer();
  const savedRequests: SaveStaffDraftInput[] = [];
  const doc = { text: 'Initial' } as unknown as DesignState;

  const queue = new StaffDraftSaveQueue({
    draftId: 'draft-1',
    initialRevision: 1,
    initialDocument: doc,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    now: clock.now,
    timer: clock.timer,
    saveTransport: async (input: SaveStaffDraftInput) => {
      savedRequests.push(input);
      return {
        ok: true,
        value: { revision: input.expectedRevision + 1, updatedAt: '2026-09-30T16:00:00Z', requestId: input.requestId },
      };
    },
  });

  // Enqueue identical doc to what is already saved
  queue.enqueue({ text: 'Initial' } as unknown as DesignState);
  assert.equal(queue.getStatus(), 'idle');
  await clock.advance(1000);
  assert.equal(savedRequests.length, 0);

  // Enqueue changed doc
  queue.enqueue({ text: 'Changed' } as unknown as DesignState);
  assert.equal(queue.getStatus(), 'dirty');

  // Enqueue identical doc to pending
  queue.enqueue({ text: 'Changed' } as unknown as DesignState);
  await clock.advance(850);
  assert.equal(savedRequests.length, 1);
  assert.equal(queue.getStatus(), 'saved');

  // Enqueue identical doc to newly saved
  queue.enqueue({ text: 'Changed' } as unknown as DesignState);
  assert.equal(queue.getStatus(), 'saved');
  await clock.advance(1000);
  assert.equal(savedRequests.length, 1);

  queue.dispose();
});

test('StaffDraftSaveQueue restores saved status when reverting edit during error state', async () => {
  const clock = createMockTimer();
  let failSave = true;
  const initialDoc = { text: 'Initial' } as unknown as DesignState;

  const queue = new StaffDraftSaveQueue({
    draftId: 'draft-1',
    initialRevision: 1,
    initialDocument: initialDoc,
    expectedProductionVersionId: 'ver-1',
    sessionId: 'session-1',
    epoch: 1,
    now: clock.now,
    timer: clock.timer,
    saveTransport: async (input: SaveStaffDraftInput) => {
      if (failSave) {
        throw new Error('Connection timed out');
      }
      return {
        ok: true,
        value: { revision: input.expectedRevision + 1, updatedAt: '2026-09-30T16:00:00Z', requestId: input.requestId },
      };
    },
  });

  queue.enqueue({ text: 'Broken edit' } as unknown as DesignState);
  await clock.advance(850);
  assert.equal(queue.getStatus(), 'error');
  assert.equal(queue.isInFlight(), false);

  // Revert back to initial saved state
  queue.enqueue(initialDoc);
  assert.equal(queue.getStatus(), 'saved');
  assert.equal(queue.isInFlight(), false);

  // Flush succeeds cleanly
  await queue.flush();
  assert.equal(queue.getStatus(), 'saved');
  assert.equal(queue.getRevision(), 1);

  queue.dispose();
});
