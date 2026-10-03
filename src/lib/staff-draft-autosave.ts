import type { DesignState } from './product-state.ts';
import type { SaveStaffDraftInput, RevisionResult } from './domain/design-revision.ts';
import { DraftAutosaveQueue, type SaveStatus, type DraftTimerId } from './draft-autosave.ts';

export type { SaveStatus };

export interface SaveQueueOptions {
  draftId: string;
  initialRevision: number;
  initialDocument?: DesignState;
  expectedProductionVersionId: string;
  sessionId: string;
  epoch: number;
  debounceMs?: number;
  maxWaitMs?: number;
  documentsEqual?: (a: DesignState, b: DesignState) => boolean;
  saveTransport: (
    input: SaveStaffDraftInput
  ) => Promise<RevisionResult<{ revision: number; updatedAt: string; requestId: string }>>;
  onStatusChange?: (
    status: SaveStatus,
    details?: { code?: string; message?: string; revision?: number }
  ) => void;
  now?: () => number;
  timer?: {
    setTimeout: (fn: () => void, ms: number) => DraftTimerId;
    clearTimeout: (id: DraftTimerId) => void;
  };
}

export class StaffDraftSaveQueue {
  private readonly inner: DraftAutosaveQueue<DesignState>;
  private reqCounter = 0;

  constructor(options: SaveQueueOptions) {
    const nowFn = options.now ?? Date.now;
    this.inner = new DraftAutosaveQueue<DesignState>({
      initialRevision: options.initialRevision,
      initialDocument: options.initialDocument,
      debounceMs: options.debounceMs,
      maxWaitMs: options.maxWaitMs,
      documentsEqual: options.documentsEqual,
      now: nowFn,
      timer: options.timer,
      generateRequestId: (expectedRev) =>
        `${options.draftId}:${expectedRev}:${nowFn()}:${++this.reqCounter}`,
      saveTransport: ({ document, expectedRevision, requestId }) =>
        options.saveTransport({
          draftId: options.draftId,
          expectedRevision,
          expectedProductionVersionId: options.expectedProductionVersionId,
          lease: {
            sessionId: options.sessionId,
            epoch: options.epoch,
          },
          requestId,
          document,
        }),
      onStatusChange: options.onStatusChange,
    });
  }

  enqueue(document: DesignState): void {
    this.inner.enqueue(document);
  }

  async flush(): Promise<void> {
    try {
      await this.inner.flush();
    } catch {
      // Legacy flush suppresses rejection when stopped or conflicted
    }
  }

  stop(reason?: string): void {
    this.inner.stop(reason);
  }

  getRevision(): number {
    return this.inner.getRevision();
  }

  getStatus(): SaveStatus {
    return this.inner.getStatus();
  }

  getLatestDocument(): DesignState | null {
    return this.inner.getLatestDocument();
  }

  isInFlight(): boolean {
    return this.inner.isInFlight();
  }

  dispose(): void {
    this.inner.dispose();
  }
}
