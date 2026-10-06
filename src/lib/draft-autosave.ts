export type SaveStatus =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error'
  | 'stopped';

export class DraftAutosaveError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DraftAutosaveError';
    this.code = code;
  }
}

export interface DraftSaveTransportResult {
  revision: number;
  updatedAt?: string;
  requestId?: string;
}

export type DraftSaveResult =
  | { ok: true; value: DraftSaveTransportResult }
  | { ok: false; code?: string; message?: string };

export type DraftTimerId = NodeJS.Timeout | number | unknown;

export interface DraftAutosaveOptions<TDocument> {
  initialRevision: number;
  initialDocument?: TDocument;
  debounceMs?: number;
  maxWaitMs?: number;
  documentsEqual?: (a: TDocument, b: TDocument) => boolean;
  saveTransport: (input: {
    document: TDocument;
    expectedRevision: number;
    requestId: string;
  }) => Promise<DraftSaveResult>;
  onStatusChange?: (
    status: SaveStatus,
    details?: { code?: string; message?: string; revision?: number }
  ) => void;
  now?: () => number;
  timer?: {
    setTimeout: (cb: () => void, ms: number) => DraftTimerId;
    clearTimeout: (id: DraftTimerId) => void;
  };
  generateRequestId?: (expectedRevision: number) => string;
}

interface FlushWaiter {
  resolve: (res: { revision: number }) => void;
  reject: (err: Error) => void;
}

export class DraftAutosaveQueue<TDocument> {
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly saveTransport: (input: {
    document: TDocument;
    expectedRevision: number;
    requestId: string;
  }) => Promise<DraftSaveResult>;
  private readonly onStatusChange?: (
    status: SaveStatus,
    details?: { code?: string; message?: string; revision?: number }
  ) => void;
  private readonly now: () => number;
  private readonly timer: {
    setTimeout: (cb: () => void, ms: number) => DraftTimerId;
    clearTimeout: (id: DraftTimerId) => void;
  };
  private readonly generateRequestId?: (expectedRevision: number) => string;
  private readonly documentsEqual: (a: TDocument, b: TDocument) => boolean;

  private revision: number;
  private status: SaveStatus = 'idle';
  private latestDocument: TDocument | null = null;
  private pendingDocument: TDocument | null = null;
  private lastSavedDocument: TDocument | null = null;
  private inFlightDocument: TDocument | null = null;
  private inFlightPromise: Promise<void> | null = null;
  private debounceTimer: DraftTimerId = null;
  private firstDirtyAt: number | null = null;
  private reqCounter = 0;
  private flushWaiters: FlushWaiter[] = [];
  private lastErrorDetails?: { code?: string; message?: string };
  private documentGeneration = 0;
  constructor(options: DraftAutosaveOptions<TDocument>) {
    this.revision = options.initialRevision;
    this.debounceMs = options.debounceMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 5000;
    this.saveTransport = options.saveTransport;
    this.onStatusChange = options.onStatusChange;
    this.now = options.now ?? Date.now;
    this.timer = options.timer ?? {
      setTimeout: (cb, ms) => setTimeout(cb, ms),
      clearTimeout: (id) => clearTimeout(id as NodeJS.Timeout),
    };
    this.generateRequestId = options.generateRequestId;
    this.documentsEqual = options.documentsEqual ?? ((a: TDocument, b: TDocument): boolean => {
      if (a === b) return true;
      if (a === null || a === undefined || b === null || b === undefined) return false;
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return false;
      }
    });
    if (options.initialDocument !== undefined) {
      this.lastSavedDocument = options.initialDocument;
      this.latestDocument = options.initialDocument;
    }
  }

  enqueue(document: TDocument): void {
    if (this.status === 'conflict' || this.status === 'stopped') {
      return;
    }

    // Semantic debounce: if incoming document matches pending document, ignore redundant call
    if (this.pendingDocument !== null && this.documentsEqual(this.pendingDocument, document)) {
      this.latestDocument = document;
      return;
    }

    // If queue is not dirty (idle/saved) and document matches latest saved/idle state, do not mark dirty or debounce
    if (
      (this.status === 'saved' || this.status === 'idle') &&
      this.pendingDocument === null &&
      this.latestDocument !== null &&
      this.documentsEqual(this.latestDocument, document)
    ) {
      this.latestDocument = document;
      return;
    }

    // If currently saving identical state and no other edit pending, do not trigger redundant debounce
    if (
      this.inFlightDocument !== null &&
      this.pendingDocument === null &&
      this.documentsEqual(this.inFlightDocument, document)
    ) {
      this.latestDocument = document;
      return;
    }

    // If edit reverted back to last saved state while pending edit was debouncing, cancel debounce
    if (
      this.inFlightDocument === null &&
      this.lastSavedDocument !== null &&
      this.documentsEqual(this.lastSavedDocument, document)
    ) {
      this.latestDocument = document;
      this.pendingDocument = null;
      this.firstDirtyAt = null;
      if (this.debounceTimer !== null) {
        this.timer.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.lastErrorDetails = undefined;
      if (this.status === 'dirty' || this.status === 'error') {
        this.setStatus('saved', { revision: this.revision });
      }
      return;
    }

    this.documentGeneration++;
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

  async flush(): Promise<{ revision: number }> {
    if (this.status === 'conflict' || this.status === 'stopped') {
      const code = this.lastErrorDetails?.code ?? this.status;
      const msg = this.lastErrorDetails?.message ?? `Draft queue is halted (${this.status})`;
      throw new DraftAutosaveError(msg, code);
    }

    if (this.debounceTimer !== null) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pendingDocument !== null && this.inFlightPromise === null) {
      this.triggerSave();
    }

    if (this.inFlightPromise === null && this.pendingDocument === null) {
      if (this.status === 'error') {
        const code = this.lastErrorDetails?.code ?? 'SAVE_ERROR';
        const msg = this.lastErrorDetails?.message ?? 'Draft save failed';
        throw new DraftAutosaveError(msg, code);
      }
      return { revision: this.revision };
    }

    const { promise, resolve, reject } = Promise.withResolvers<{ revision: number }>();
    this.flushWaiters.push({ resolve, reject });
    return promise;
  }

  stop(reason?: string): void {
    if (this.debounceTimer !== null) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.lastErrorDetails = { code: 'STOPPED', message: reason };
    this.setStatus('stopped', { message: reason });
    this.drainFlushWaiters(new DraftAutosaveError(reason ?? 'Queue stopped', 'STOPPED'));
  }

  getRevision(): number {
    return this.revision;
  }

  getStatus(): SaveStatus {
    return this.status;
  }

  getLatestDocument(): TDocument | null {
    return this.latestDocument;
  }

  isInFlight(): boolean {
    return this.inFlightPromise !== null;
  }

  getInFlightPromise(): Promise<void> | null {
    return this.inFlightPromise;
  }

  dispose(): void {
    if (this.debounceTimer !== null) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.drainFlushWaiters(new DraftAutosaveError('Queue disposed', 'DISPOSED'));
  }

  private setStatus(
    status: SaveStatus,
    details?: { code?: string; message?: string; revision?: number }
  ): void {
    this.status = status;
    this.onStatusChange?.(status, details);
  }

  private drainFlushWaiters(err?: Error): void {
    const waiters = this.flushWaiters;
    this.flushWaiters = [];
    for (const waiter of waiters) {
      if (err) {
        waiter.reject(err);
      } else {
        waiter.resolve({ revision: this.revision });
      }
    }
  }

  private triggerSave(): void {
    if (this.inFlightPromise !== null || this.pendingDocument === null) {
      return;
    }
    if (this.status === 'conflict' || this.status === 'stopped') {
      return;
    }

    if (this.debounceTimer !== null) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const { promise, resolve } = Promise.withResolvers<void>();
    this.inFlightPromise = promise;

    (async () => {
      let currentDocToSave: TDocument | null = null;
      try {
        while (
          this.pendingDocument !== null &&
          this.status !== 'conflict' &&
          this.status !== 'stopped'
        ) {
          if (this.debounceTimer !== null) {
            this.timer.clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
          }

          const docToSave = this.pendingDocument;
          currentDocToSave = docToSave;
          this.pendingDocument = null;
          this.firstDirtyAt = null;
          this.inFlightDocument = docToSave;
          this.setStatus('saving');
          const expectedRev = this.revision;
          const reqId = this.generateRequestId
            ? this.generateRequestId(expectedRev)
            : `req:${expectedRev}:${this.now()}:${++this.reqCounter}`;

          const res = await this.saveTransport({
            document: docToSave,
            expectedRevision: expectedRev,
            requestId: reqId,
          });

          if (res.ok) {
            this.revision = Math.max(this.revision, res.value.revision);
            this.lastSavedDocument = docToSave;
            currentDocToSave = null;
            if ((this.status as SaveStatus) !== 'stopped' && (this.status as SaveStatus) !== 'conflict') {
              this.lastErrorDetails = undefined;
              if (
                this.pendingDocument !== null &&
                this.documentsEqual(this.lastSavedDocument, this.pendingDocument)
              ) {
                this.pendingDocument = null;
                this.firstDirtyAt = null;
              }
              // ponytail: pendingDocument === null guarantees current state matches saved snapshot
              if (this.pendingDocument === null) {
                this.setStatus('saved', { revision: this.revision });
                this.drainFlushWaiters();
              }
            }
          } else {
            if ((this.status as SaveStatus) !== 'stopped') {
              this.lastErrorDetails = { code: res.code, message: res.message };
              const isConflict =
                res.code === 'REVISION_CONFLICT' ||
                res.code === 'LEASE_LOST' ||
                res.code === 'LEASE_CONFLICT' ||
                res.code === 'LEASE_EXPIRED' ||
                res.code === 'ORDER_LOCKED' ||
                res.code === 'PRODUCTION_CHANGED';

              if (this.pendingDocument === null) {
                this.pendingDocument = docToSave;
              }
              if (isConflict) {
                this.setStatus('conflict', { code: res.code, message: res.message });
              } else {
                this.setStatus('error', { code: res.code, message: res.message });
              }

              const err = new DraftAutosaveError(
                res.message ?? `Save failed with code ${res.code}`,
                res.code,
              );
              this.drainFlushWaiters(err);
            }
            break;
          }
        }
      } catch (err: unknown) {
        if ((this.status as SaveStatus) !== 'stopped') {
          const msg = err instanceof Error ? err.message : 'Save connection failure';
          this.lastErrorDetails = { code: 'NETWORK_ERROR', message: msg };
          if (currentDocToSave !== null && this.pendingDocument === null) {
            this.pendingDocument = currentDocToSave;
          }
          this.setStatus('error', { message: msg });

          const errorObj = new DraftAutosaveError(msg, 'NETWORK_ERROR');
          this.drainFlushWaiters(errorObj);
        }
      } finally {
        this.inFlightPromise = null;
        this.inFlightDocument = null;
        resolve();
      }
    })();
  }
  // ponyfill/ponytail: skip deep structural diff engine, add when fine-grained path diffing needed
}
