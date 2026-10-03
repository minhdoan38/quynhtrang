'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DraftAutosaveQueue, type DraftSaveResult, type SaveStatus } from './draft-autosave.ts';
import type { DesignState } from './product-state.ts';

export interface UseTemplateDraftSessionOptions {
  templateId: string;
  draftId: string;
  initialRevision: number;
  sessionId: string;
  epoch: number;
  readOnly?: boolean;
  saveTransport?: (input: {
    templateId: string;
    draftId: string;
    expectedRevision: number;
    sessionId: string;
    leaseEpoch: number;
    document: DesignState;
    requestId: string;
  }) => Promise<DraftSaveResult>;
  heartbeatTransport?: (input: {
    templateId: string;
    draftId: string;
    sessionId: string;
    epoch: number;
  }) => Promise<{ ok: boolean; code?: string; message?: string }>;
}

export interface TemplateDraftSession {
  saveStatus: SaveStatus;
  conflictDetails: { code?: string; message?: string } | null;
  currentRevision: number;
  enqueueChange: (document: DesignState) => void;
  flushSave: () => Promise<{ revision: number }>;
}

async function defaultSaveTransport(input: {
  templateId: string;
  draftId: string;
  expectedRevision: number;
  sessionId: string;
  leaseEpoch: number;
  document: DesignState;
  requestId: string;
}): Promise<DraftSaveResult> {
  const res = await fetch(`/api/admin/content/templates/${encodeURIComponent(input.templateId)}/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      draftId: input.draftId,
      expectedRevision: input.expectedRevision,
      sessionId: input.sessionId,
      leaseEpoch: input.leaseEpoch,
      document: input.document,
      requestId: input.requestId,
    }),
  });

  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !body.ok) {
    const code = typeof body.code === 'string' ? body.code : `HTTP_${res.status}`;
    const message = typeof body.message === 'string' ? body.message : 'Lỗi khi lưu bản nháp mẫu';
    return { ok: false, code, message };
  }

  const val = body.value as { revision: number; updatedAt?: string; requestId?: string } | undefined;
  return {
    ok: true,
    value: {
      revision: val?.revision ?? input.expectedRevision + 1,
      updatedAt: val?.updatedAt,
      requestId: val?.requestId ?? input.requestId,
    },
  };
}

async function defaultHeartbeatTransport(input: {
  templateId: string;
  draftId: string;
  sessionId: string;
  epoch: number;
}): Promise<{ ok: boolean; code?: string; message?: string }> {
  const res = await fetch(
    `/api/admin/content/templates/${encodeURIComponent(input.templateId)}/draft/heartbeat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftId: input.draftId,
        sessionId: input.sessionId,
        epoch: input.epoch,
      }),
    },
  );

  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !body.ok) {
    const code = typeof body.code === 'string' ? body.code : `HTTP_${res.status}`;
    const message = typeof body.message === 'string' ? body.message : 'Heartbeat failed';
    return { ok: false, code, message };
  }

  return { ok: true };
}

export function useTemplateDraftSession(
  options: UseTemplateDraftSessionOptions,
): TemplateDraftSession {
  const {
    templateId,
    draftId,
    initialRevision,
    sessionId,
    epoch,
    readOnly = false,
    saveTransport = defaultSaveTransport,
    heartbeatTransport = defaultHeartbeatTransport,
  } = options;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [conflictDetails, setConflictDetails] = useState<{
    code?: string;
    message?: string;
  } | null>(null);
  const [currentRevision, setCurrentRevision] = useState(initialRevision);

  const queueRef = useRef<DraftAutosaveQueue<DesignState> | null>(null);

  useEffect(() => {
    if (readOnly) return;

    let reqCounter = 0;
    const queue = new DraftAutosaveQueue<DesignState>({
      initialRevision,
      debounceMs: 800,
      maxWaitMs: 5000,
      generateRequestId: (expectedRev) =>
        `tmpl:${templateId}:${draftId}:${expectedRev}:${Date.now()}:${++reqCounter}`,
      saveTransport: ({ document, expectedRevision, requestId }) =>
        saveTransport({
          templateId,
          draftId,
          expectedRevision,
          sessionId,
          leaseEpoch: epoch,
          document,
          requestId,
        }),
      onStatusChange: (status, details) => {
        setSaveStatus(status);
        if (status === 'conflict') {
          setConflictDetails(details ?? null);
        } else if (status === 'saved' && details?.revision) {
          setCurrentRevision(details.revision);
        }
      },
    });

    queueRef.current = queue;

    return () => {
      queue.dispose();
      queueRef.current = null;
    };
  }, [templateId, draftId, initialRevision, sessionId, epoch, readOnly, saveTransport]);

  // Heartbeat every 30 seconds while tab is visible
  useEffect(() => {
    if (readOnly) return;

    let heartbeatTimer: NodeJS.Timeout | undefined;

    const runHeartbeat = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      try {
        const res = await heartbeatTransport({ templateId, draftId, sessionId, epoch });
        if (!res.ok) {
          if (
            res.code === 'LEASE_LOST' ||
            res.code === 'LEASE_CONFLICT' ||
            res.code === 'LEASE_EXPIRED'
          ) {
            setSaveStatus('conflict');
            setConflictDetails({ code: res.code, message: res.message });
            queueRef.current?.stop('Mất quyền chỉnh sửa');
          }
        }
      } catch {
        // Transient network failure: retry on next interval
      }
    };

    heartbeatTimer = setInterval(runHeartbeat, 30_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runHeartbeat();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(heartbeatTimer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [templateId, draftId, sessionId, epoch, readOnly, heartbeatTransport]);

  // Warn on tab close if there are unsaved changes
  useEffect(() => {
    if (readOnly || typeof window === 'undefined') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'dirty' || saveStatus === 'saving') {
        e.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveStatus, readOnly]);

  const enqueueChange = useCallback(
    (document: DesignState) => {
      if (readOnly) return;
      queueRef.current?.enqueue(document);
    },
    [readOnly],
  );

  const flushSave = useCallback(async () => {
    if (readOnly) return { revision: currentRevision };
    if (!queueRef.current) return { revision: currentRevision };
    return queueRef.current.flush();
  }, [readOnly, currentRevision]);

  return {
    saveStatus,
    conflictDetails,
    currentRevision,
    enqueueChange,
    flushSave,
  };
}
