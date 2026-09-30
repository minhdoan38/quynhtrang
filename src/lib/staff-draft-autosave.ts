import type { DesignState } from './product-state.ts';
import type { SaveStaffDraftInput, RevisionResult } from './domain/design-revision.ts';

export type SaveStatus =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error'
  | 'stopped';

export interface SaveQueueOptions {
  draftId: string;
  initialRevision: number;
  expectedProductionVersionId: string;
  sessionId: string;
  epoch: number;
  debounceMs?: number;
  maxWaitMs?: number;
  saveTransport: (
    input: SaveStaffDraftInput
  ) => Promise<RevisionResult<{ revision: number; updatedAt: string; requestId: string }>>;
  onStatusChange?: (
    status: SaveStatus,
    details?: { code?: string; message?: string; revision?: number }
  ) => void;
  now?: () => number;
  timer?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (id: unknown) => void;
  };
}

export class StaffDraftSaveQueue {
  private readonly draftId: string;
  private readonly expectedProductionVersionId: string;
  private readonly sessionId: string;
  private readonly epoch: number;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly saveTransport: (
    input: SaveStaffDraftInput
  ) => Promise<RevisionResult<{ revision: number; updatedAt: string; requestId: string }>>;
  private readonly onStatusChange?: (
    status: SaveStatus,
    details?: { code?: string; message?: string; revision?: number }
  ) => void;
  private readonly now: () => number;
  private readonly timer: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (id: unknown) => void;
  };

  private revision: number;
  private status: SaveStatus = 'idle';
  private latestDocument: DesignState | null = null;
  private pendingDocument: DesignState | null = null;
  private inFlightPromise: Promise<void> | null = null;
  private debounceTimer: unknown = null;
  private firstDirtyAt: number | null = null;
  private reqCounter = 0;
  private flushResolvers: Array<() => void> = [];

  constructor(options: SaveQueueOptions) {
    this.draftId = options.draftId;
    this.revision = options.initialRevision;
    this.expectedProductionVersionId = options.expectedProductionVersionId;
    this.sessionId = options.sessionId;
    this.epoch = options.epoch;
    this.debounceMs = options.debounceMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 5000;
    this.saveTransport = options.saveTransport;
    this.onStatusChange = options.onStatusChange;
    this.now = options.now ?? (() => Date.now());
    this.timer = options.timer ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as NodeJS.Timeout),
    };
  }

  enqueue(document: DesignState): void {
    if (this.status === 'conflict' || this.status === 'stopped') {
      return;
    }

    this.latestDocument = document;
    this.pendingDocument = document;

    const currentTime = this.now();
    if (this.firstDirtyAt === null) {
      this.firstDirtyAt = currentTime;
    }

    this.setStatus('dirty');

    if (this.debounceTimer !== null) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const elapsed = currentTime - this.firstDirtyAt;
    const remainingMaxWait = this.maxWaitMs - elapsed;

    if (remainingMaxWait <= 0) {
      this.triggerSave();
    } else {
      const waitTime = Math.min(this.debounceMs, remainingMaxWait);
      this.debounceTimer = this.timer.setTimeout(() => {
        this.debounceTimer = null;
        this.triggerSave();
      }, waitTime);
    }
  }

  async flush(): Promise<void> {
    if (this.status === 'conflict' || this.status === 'stopped') {
      return;
    }

    if (this.debounceTimer !== null) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pendingDocument !== null) {
      this.triggerSave();
    }

    if (this.inFlightPromise !== null) {
      await this.inFlightPromise;
    }
  }

  stop(reason?: string): void {
    if (this.debounceTimer !== null) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.setStatus('stopped', { message: reason });
  }

  getRevision(): number {
    return this.revision;
  }

  getStatus(): SaveStatus {
    return this.status;
  }

  getLatestDocument(): DesignState | null {
    return this.latestDocument;
  }

  dispose(): void {
    if (this.debounceTimer !== null) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private setStatus(
    status: SaveStatus,
    details?: { code?: string; message?: string; revision?: number }
  ): void {
    this.status = status;
    this.onStatusChange?.(status, details);
  }

  private triggerSave(): void {
    if (this.inFlightPromise !== null || this.pendingDocument === null) {
      return;
    }

    const docToSave = this.pendingDocument;
    this.pendingDocument = null;
    this.firstDirtyAt = null;

    const expectedRev = this.revision;
    const reqId = `${this.draftId}:${expectedRev}:${this.now()}:${++this.reqCounter}`;

    const input: SaveStaffDraftInput = {
      draftId: this.draftId,
      expectedRevision: expectedRev,
      expectedProductionVersionId: this.expectedProductionVersionId,
      lease: {
        sessionId: this.sessionId,
        epoch: this.epoch,
      },
      requestId: reqId,
      document: docToSave,
    };

    this.setStatus('saving');

    const savePromise = (async () => {
      try {
        const res = await this.saveTransport(input);
        if (res.ok) {
          this.revision = res.value.revision;
          if (this.pendingDocument !== null) {
            this.inFlightPromise = null;
            this.triggerSave();
          } else {
            this.setStatus('saved', { revision: this.revision });
          }
        } else {
          if (
            res.code === 'REVISION_CONFLICT' ||
            res.code === 'LEASE_LOST' ||
            res.code === 'ORDER_LOCKED' ||
            res.code === 'PRODUCTION_CHANGED'
          ) {
            this.pendingDocument = docToSave;
            this.setStatus('conflict', { code: res.code, message: res.message });
          } else {
            this.pendingDocument = docToSave;
            this.setStatus('error', { code: res.code, message: res.message });
          }
        }
      } catch (err: unknown) {
        this.pendingDocument = docToSave;
        const msg = err instanceof Error ? err.message : 'Lỗi kết nối khi lưu bản nháp';
        this.setStatus('error', { message: msg });
      } finally {
        this.inFlightPromise = null;
        const resolvers = this.flushResolvers;
        this.flushResolvers = [];
        for (const resolve of resolvers) {
          resolve();
        }
      }
    })();

    this.inFlightPromise = savePromise;
  }
}
