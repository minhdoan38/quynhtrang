'use client';

import React, { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DesignReviewView } from '@/components/admin/design-review.tsx';
import { CustomizerShell } from '@/components/customizer/customizer-shell.tsx';
import { useStaffDraftSession } from '@/lib/use-staff-draft-session.ts';
import {
  CreateRevisionDialog,
  DiscardDraftDialog,
  TakeoverDraftDialog,
  ConflictDialog,
} from '@/components/admin/design-revision-dialogs.tsx';
import {
  createDraftAction,
  discardDraftAction,
  takeoverDraftAction,
  approveCustomerAsIsAction,
} from './actions.ts';
import type {
  StaffDraftSummary,
  StaffDesignDraft,
  DesignVersionListItem,
  DesignReviewMode,
} from '@/lib/domain/design-revision.ts';
import type { DesignState } from '@/lib/product-state.ts';

export interface DesignReviewClientProps {
  orderId: string;
  publicOrderCode: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  designStatus: string;
  currentUserId: string;
  currentUserRole: string;
  customerVersionNumber: number;
  productionVersionNumber: number;
  initialVersions: DesignVersionListItem[];
  initialActiveDraft: StaffDraftSummary | null;
  initialSelectedDocument: DesignState;
  initialFullDraft: StaffDesignDraft | null;
}

export function DesignReviewClient({
  orderId,
  publicOrderCode,
  fulfillmentStatus,
  paymentStatus,
  designStatus,
  currentUserId,
  currentUserRole,
  customerVersionNumber,
  productionVersionNumber,
  initialVersions,
  initialActiveDraft,
  initialSelectedDocument,
  initialFullDraft,
}: DesignReviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<DesignReviewMode>('review');
  const [activeDraft, setActiveDraft] = useState<StaffDraftSummary | null>(initialActiveDraft);
  const [currentDraft, setCurrentDraft] = useState<StaffDesignDraft | null>(initialFullDraft);
  const [selectedDocument, setSelectedDocument] = useState<DesignState>(initialSelectedDocument);
  const [selectedVersionNumber, setSelectedVersionNumber] = useState(productionVersionNumber);
  const [versions, setVersions] = useState<DesignVersionListItem[]>(initialVersions);

  // Dialog controls
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [takeoverDialogOpen, setTakeoverDialogOpen] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);

  // Session ID per tab
  const [sessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`staff_session_${orderId}`);
      if (stored) return stored;
      const created = crypto.randomUUID();
      sessionStorage.setItem(`staff_session_${orderId}`, created);
      return created;
    }
    return crypto.randomUUID();
  });

  const draftSession = useStaffDraftSession({
    draftId: currentDraft?.id || activeDraft?.id || '',
    initialRevision: currentDraft?.revision || activeDraft?.revision || 1,
    expectedProductionVersionId: currentDraft?.expectedProductionDesignVersionId || versions[0]?.id || '',
    sessionId,
    epoch: currentDraft?.lease?.epoch || 1,
    orderId,
    readOnly: mode !== 'staff-edit',
  });

  const handleStartEditing = () => {
    setCreateDialogOpen(true);
  };

  const handleCreateDraftSubmit = async (reason: string) => {
    startTransition(async () => {
      const baseVersion = versions.find((v) => v.versionNumber === selectedVersionNumber) || versions[0];
      const prodVersion = versions.find((v) => v.isProduction) || versions[0];

      const res = await createDraftAction({
        orderId,
        baseVersionId: baseVersion.id,
        expectedProductionVersionId: prodVersion.id,
        reason,
        sessionId,
        requestId: `create-${Date.now()}-${crypto.randomUUID()}`,
      });

      if (res.ok) {
        setCreateDialogOpen(false);
        setCurrentDraft(res.value);
        setActiveDraft({
          id: res.value.id,
          orderId,
          status: 'editing',
          editorUserId: currentUserId,
          reason: res.value.reason,
          revision: res.value.revision,
          leaseExpiresAt: res.value.lease?.expiresAt || null,
          lastActivityAt: res.value.updatedAt,
          createdAt: res.value.createdAt,
        });
        setMode('staff-edit');
      } else {
        alert(res.message);
      }
    });
  };

  const handleResumeDraft = () => {
    if (currentDraft) {
      setMode('staff-edit');
    } else {
      router.refresh();
      setMode('staff-edit');
    }
  };

  const handleDiscardConfirm = async () => {
    if (!activeDraft && !currentDraft) return;
    const draftId = currentDraft?.id || activeDraft?.id || '';
    const rev = currentDraft?.revision || activeDraft?.revision || 1;
    const prodId = currentDraft?.expectedProductionDesignVersionId || versions[0]?.id || '';

    startTransition(async () => {
      const res = await discardDraftAction({
        draftId,
        expectedRevision: rev,
        expectedProductionVersionId: prodId,
        sessionId,
        epoch: currentDraft?.lease?.epoch || 1,
        requestId: `discard-${Date.now()}-${crypto.randomUUID()}`,
      });

      if (res.ok) {
        setDiscardDialogOpen(false);
        setActiveDraft(null);
        setCurrentDraft(null);
        setMode('review');
        router.refresh();
      } else {
        alert(res.message);
      }
    });
  };

  const handleTakeoverConfirm = async () => {
    if (!activeDraft) return;
    startTransition(async () => {
      const res = await takeoverDraftAction({
        draftId: activeDraft.id,
        expectedEpoch: 1,
        sessionId,
        requestId: `takeover-${Date.now()}-${crypto.randomUUID()}`,
      });

      if (res.ok) {
        setTakeoverDialogOpen(false);
        setCurrentDraft(res.value);
        setActiveDraft({
          ...activeDraft,
          editorUserId: currentUserId,
        });
        setMode('staff-edit');
      } else {
        alert(res.message);
      }
    });
  };

  const handleApproveAsIs = async () => {
    const custVer = versions.find((v) => v.isCustomer) || versions[0];
    const prodVer = versions.find((v) => v.isProduction) || versions[0];
    if (!custVer || !prodVer) return;

    if (!confirm('Duyệt bản thiết kế của khách hàng làm phiên bản sản xuất mà không cần chỉnh sửa?')) {
      return;
    }

    startTransition(async () => {
      const res = await approveCustomerAsIsAction({
        orderId,
        expectedCustomerVersionId: custVer.id,
        expectedProductionVersionId: prodVer.id,
        assessmentId: crypto.randomUUID(),
        acknowledgedWarningIds: [],
        requestId: `as-is-${Date.now()}-${crypto.randomUUID()}`,
      });

      if (res.ok) {
        router.push(`/admin/orders/${orderId}`);
      } else {
        alert(res.message);
      }
    });
  };

  const handleSelectVersion = (versionId: string) => {
    const selected = versions.find((v) => v.id === versionId);
    if (selected) {
      setSelectedVersionNumber(selected.versionNumber);
    }
  };

  // When in staff-edit mode: mount CustomizerShell with staff context
  if (mode === 'staff-edit' && currentDraft) {
    return (
      <div className="flex flex-col h-screen w-full bg-[#FFFDF8] overflow-hidden select-none">
        {/* Staff Editing Top Bar */}
        <div className="h-10 px-4 bg-[#2E3338] text-white flex items-center justify-between text-xs z-30 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#DCEBF4]">Bản chỉnh sửa #{publicOrderCode}</span>
            <span className="text-neutral-400 font-mono text-[11px]">• v{currentDraft.revision}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-neutral-300">
              {draftSession.saveStatus === 'saving' && 'Đang lưu...'}
              {draftSession.saveStatus === 'saved' && 'Đã lưu máy chủ'}
              {draftSession.saveStatus === 'dirty' && 'Có thay đổi chưa lưu'}
              {draftSession.saveStatus === 'conflict' && (
                <span className="text-red-300 font-bold">Xung đột phiên bản</span>
              )}
            </span>

            <button
              type="button"
              onClick={async () => {
                await draftSession.flushSave();
                setMode('review');
              }}
              className="px-2.5 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-white font-medium transition-colors"
            >
              Xem lại
            </button>
          </div>
        </div>

        <div className="flex-1 w-full relative overflow-hidden">
          <CustomizerShell
            context={{
              type: 'staff',
              mode: 'staff-edit',
              orderId,
              orderCode: publicOrderCode,
              draftId: currentDraft.id,
              initialDocument: currentDraft.document,
              sessionId,
              onSave: async (doc) => {
                draftSession.enqueueChange(doc);
              },
              onExit: () => {
                setMode('review');
              },
              onComplete: async () => {
                await draftSession.flushSave();
                // Transitions to preflight / compare
                setMode('review-changes');
              },
            }}
          />
        </div>
      </div>
    );
  }

  // REVIEW Mode
  return (
    <>
      <DesignReviewView
        orderId={orderId}
        publicOrderCode={publicOrderCode}
        fulfillmentStatus={fulfillmentStatus}
        paymentStatus={paymentStatus}
        designStatus={designStatus}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        customerVersionNumber={customerVersionNumber}
        selectedVersionNumber={selectedVersionNumber}
        productionVersionNumber={productionVersionNumber}
        isCustomerEqualProduction={customerVersionNumber === productionVersionNumber}
        activeDraft={activeDraft}
        versions={versions}
        selectedDocument={selectedDocument}
        onSelectVersion={handleSelectVersion}
        onApproveAsIs={handleApproveAsIs}
        onStartEditing={handleStartEditing}
        onResumeDraft={handleResumeDraft}
        onDiscardDraft={() => setDiscardDialogOpen(true)}
        onTakeoverDraft={() => setTakeoverDialogOpen(true)}
      />

      <CreateRevisionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        baseVersionNumber={selectedVersionNumber}
        isSubmitting={isPending}
        onSubmit={handleCreateDraftSubmit}
      />

      <DiscardDraftDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        isSubmitting={isPending}
        onConfirm={handleDiscardConfirm}
      />

      <TakeoverDraftDialog
        open={takeoverDialogOpen}
        onOpenChange={setTakeoverDialogOpen}
        previousEditorName={activeDraft?.editorDisplayName}
        isSubmitting={isPending}
        onConfirm={handleTakeoverConfirm}
      />

      <ConflictDialog
        open={conflictDialogOpen || draftSession.saveStatus === 'conflict'}
        message={draftSession.conflictDetails?.message}
        onReload={() => {
          setConflictDialogOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
