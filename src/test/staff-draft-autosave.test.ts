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
