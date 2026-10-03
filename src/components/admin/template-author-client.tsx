'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { TemplateRecord, TemplateDraftRecord } from '@/lib/domain/template';
import type { TemplateAuthorEditorContext } from '@/lib/editor-context';
import { useTemplateDraftSession } from '@/lib/use-template-draft-session';
import { CustomizerShell } from '@/components/customizer/customizer-shell';

export interface TemplateAuthorClientProps {
  template: TemplateRecord;
  initialDraft: TemplateDraftRecord;
  currentStaff: {
    userId: string;
    role: 'admin' | 'editor';
    name?: string;
  };
}

export function TemplateAuthorClient({
  template,
  initialDraft,
  currentStaff,
}: TemplateAuthorClientProps) {
  const router = useRouter();
  const [sessionId] = useState(() => crypto.randomUUID());
  const [leaseEpoch, setLeaseEpoch] = useState(() => Number(initialDraft.leaseEpoch ?? 0));
  const [isReadOnly, setIsReadOnly] = useState(() =>
    Boolean(
      initialDraft.editorUserId &&
      initialDraft.editorUserId !== currentStaff.userId &&
      initialDraft.leaseExpiresAt &&
      new Date(initialDraft.leaseExpiresAt) > new Date()
    )
  );
  const [leaseConflict, setLeaseConflict] = useState<string | null>(null);

  // Acquire lease via POST on mount
  useEffect(() => {
    let mounted = true;
    async function acquireLease() {
      try {
        const res = await fetch(
          `/api/admin/content/templates/${encodeURIComponent(template.id)}/draft/lease`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              draftId: initialDraft.id,
              sessionId,
            }),
          }
        );
        const data = await res.json();
        if (!mounted) return;
        if (res.ok && data.ok && data.draft) {
          setLeaseEpoch(Number(data.draft.leaseEpoch ?? 0));
          setIsReadOnly(false);
          setLeaseConflict(null);
        } else if (!res.ok) {
          setIsReadOnly(true);
          setLeaseConflict(data.error?.message || 'Bản nháp đang được sửa bởi người khác.');
        }
      } catch {
        // network issue - retain current read-only/lease state
      }
    }
    acquireLease();
    return () => {
      mounted = false;
    };
  }, [template.id, initialDraft.id, sessionId]);

  const draftSession = useTemplateDraftSession({
    templateId: template.id,
    draftId: initialDraft.id,
    initialRevision: initialDraft.draftRevision,
    sessionId,
    epoch: leaseEpoch,
    readOnly: isReadOnly,
  });

  const authorContext = useMemo<TemplateAuthorEditorContext>(() => ({
    type: 'template-author',
    templateId: template.id,
    draftId: initialDraft.id,
    initialDocument: initialDraft.designDocument,
    readOnly: isReadOnly,
    saveStatus: draftSession.saveStatus,
    leaseEpoch,
    sessionId,
    draftRevision: draftSession.currentRevision,
    onSave: async (doc) => {
      draftSession.enqueueChange(doc);
    },
    onExit: () => {
      router.push('/admin/content/templates');
    },
    onPublish: async () => {
      await draftSession.flushSave();
    },
  }), [template.id, initialDraft.id, initialDraft.designDocument, isReadOnly, leaseEpoch, sessionId, draftSession, router]);

  const activeConflict = draftSession.conflictDetails?.message || leaseConflict;

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-[#F8F3E8]">
      {/* Lease or revision conflict notification banner */}
      {activeConflict && (
        <div
          role="alert"
          className="bg-[#B3535D] text-white px-4 py-2 text-xs sm:text-sm font-medium flex items-center justify-between z-50 sticky top-0 shadow-md select-none"
        >
          <div className="flex items-center gap-2">
            <span>{activeConflict}</span>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-1 rounded bg-white text-[#B3535D] font-semibold text-xs hover:bg-[#F8F3E8] transition-colors"
          >
            Tải phiên bản mới
          </button>
        </div>
      )}

      <div className="flex-1 relative">
        <CustomizerShell context={authorContext} />
      </div>
    </div>
  );
}
