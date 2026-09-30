'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { StaffDraftSaveQueue, type SaveStatus } from './staff-draft-autosave.ts';
import { saveDraftAction, heartbeatAction } from '@/app/admin/orders/[id]/design/actions.ts';
import type { DesignState } from './product-state.ts';

export interface UseStaffDraftSessionOptions {
  draftId: string;
  initialRevision: number;
  expectedProductionVersionId: string;
  sessionId: string;
  epoch: number;
  orderId: string;
  readOnly?: boolean;
}

export function useStaffDraftSession(options: UseStaffDraftSessionOptions) {
  const {
    draftId,
    initialRevision,
    expectedProductionVersionId,
    sessionId,
    epoch,
    readOnly = false,
  } = options;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [conflictDetails, setConflictDetails] = useState<{ code?: string; message?: string } | null>(null);
  const [currentRevision, setCurrentRevision] = useState(initialRevision);

  const queueRef = useRef<StaffDraftSaveQueue | null>(null);

  useEffect(() => {
    if (readOnly) return;

    const queue = new StaffDraftSaveQueue({
      draftId,
      initialRevision,
      expectedProductionVersionId,
      sessionId,
      epoch,
      saveTransport: async (input) => {
        return saveDraftAction(input);
      },
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
  }, [draftId, initialRevision, expectedProductionVersionId, sessionId, epoch, readOnly]);

  // Heartbeat every 30 seconds while tab is visible
  useEffect(() => {
    if (readOnly) return;

    let heartbeatTimer: NodeJS.Timeout | undefined;

    const runHeartbeat = async () => {
      if (document.visibilityState !== 'visible') return;

      try {
        const res = await heartbeatAction(draftId, sessionId, epoch);
        if (!res.ok) {
          if (res.code === 'LEASE_LOST') {
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

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [draftId, sessionId, epoch, readOnly]);

  // Warn on tab close if there are unsaved changes
  useEffect(() => {
    if (readOnly) return;

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

  const enqueueChange = useCallback((document: DesignState) => {
    if (readOnly) return;
    queueRef.current?.enqueue(document);
  }, [readOnly]);

  const flushSave = useCallback(async () => {
    if (readOnly) return;
    await queueRef.current?.flush();
  }, [readOnly]);

  return {
    saveStatus,
    conflictDetails,
    currentRevision,
    enqueueChange,
    flushSave,
  };
}
