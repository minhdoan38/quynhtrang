'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  UploadCloud,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import type { TemplateRecord, TemplateDraftRecord, TemplateValidationReceipt } from '@/lib/domain/template';
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

  // Publish Dialog States
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationBlockers, setValidationBlockers] = useState<
    Array<{ code: string; message: string; elementId?: string }>
  >([]);
  const [validationWarnings, setValidationWarnings] = useState<
    Array<{ id: string; code: string; message: string }>
  >([]);
  const [acknowledgedWarningIds, setAcknowledgedWarningIds] = useState<string[]>([]);
  const [validationReceipt, setValidationReceipt] = useState<TemplateValidationReceipt | null>(null);
  const [revisionNote, setRevisionNote] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

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

  // Reset acknowledgements when draft modified
  useEffect(() => {
    if (draftSession.saveStatus === 'dirty') {
      setAcknowledgedWarningIds([]);
      setValidationReceipt(null);
    }
  }, [draftSession.saveStatus]);

  // Execute validation
  const executeValidation = useCallback(async () => {
    setIsValidating(true);
    setValidationBlockers([]);
    setValidationWarnings([]);
    setAcknowledgedWarningIds([]);
    setPublishError(null);
    try {
      const res = await fetch(
        `/api/admin/content/templates/${encodeURIComponent(template.id)}/validate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId: initialDraft.id,
            expectedRevision: draftSession.currentRevision,
            sessionId,
            leaseEpoch,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setValidationBlockers([
          {
            code: data.error?.code || 'VALIDATION_FAILED',
            message: data.error?.message || 'Kiểm tra mẫu thất bại',
          },
        ]);
        return;
      }

      const receipt: TemplateValidationReceipt = data.receipt;
      setValidationReceipt(receipt);

      const bList: Array<{ code: string; message: string; elementId?: string }> = [];
      const wList: Array<{ id: string; code: string; message: string }> = [];

      if (!receipt.customerPreviewPassed) {
        bList.push({
          code: 'PREVIEW_FAILED',
          message: 'Khung hiển thị khách hàng không đạt yêu cầu kết xuất',
        });
      }

      const warningSet = new Set(receipt.warningIds || []);
      for (const f of receipt.findings || []) {
        if (warningSet.has(f.code) || (f.elementId && warningSet.has(`warning-${f.elementId}`))) {
          wList.push({
            id: f.code,
            code: f.code,
            message: f.message || f.code,
          });
        } else {
          bList.push({
            code: f.code,
            message: f.message || f.code,
            elementId: f.elementId,
          });
        }
      }

      for (const wId of receipt.warningIds || []) {
        if (!wList.some((w) => w.id === wId)) {
          wList.push({
            id: wId,
            code: wId,
            message:
              wId === 'template-no-editable-elements'
                ? 'Mẫu không có phần tử nào cho phép khách chỉnh sửa'
                : `Cảnh báo kiểm duyệt: ${wId}`,
          });
        }
      }

      setValidationBlockers(bList);
      setValidationWarnings(wList);
    } catch (err: unknown) {
      setValidationBlockers([
        {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ khi kiểm tra mẫu',
        },
      ]);
    } finally {
      setIsValidating(false);
    }
  }, [template.id, initialDraft.id, draftSession.currentRevision, sessionId, leaseEpoch]);

  // Execute publish
  const executePublish = async () => {
    if (!validationReceipt || validationBlockers.length > 0) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(
        `/api/admin/content/templates/${encodeURIComponent(template.id)}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId: initialDraft.id,
            expectedRevision: draftSession.currentRevision,
            expectedCatalogRevision: template.revision,
            sessionId,
            leaseEpoch,
            validationId: validationReceipt.id,
            requestId: crypto.randomUUID(),
            acknowledgedWarningIds,
            revisionNote: revisionNote.trim() || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Xuất bản mẫu thất bại');
      }

      setIsPublishOpen(false);
      router.push(`/admin/content/templates/${template.id}`);
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleOpenPublish = useCallback(async () => {
    if (isReadOnly) return;
    await draftSession.flushSave();
    setIsPublishOpen(true);
    executeValidation();
  }, [isReadOnly, draftSession, executeValidation]);

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
    onPublish: handleOpenPublish,
  }), [
    template.id,
    initialDraft.id,
    initialDraft.designDocument,
    isReadOnly,
    leaseEpoch,
    sessionId,
    draftSession,
    router,
    handleOpenPublish,
  ]);

  const activeConflict = draftSession.conflictDetails?.message || leaseConflict;
  const hasBlockers = validationBlockers.length > 0;
  const allWarningsAcknowledged =
    validationWarnings.length === 0 ||
    validationWarnings.every((w) => acknowledgedWarningIds.includes(w.id));

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
            className="px-3 py-1 rounded bg-white text-[#B3535D] font-semibold text-xs hover:bg-[#F8F3E8] transition-colors cursor-pointer"
          >
            Tải phiên bản mới
          </button>
        </div>
      )}

      <div className="flex-1 relative">
        <CustomizerShell context={authorContext} />
      </div>

      {/* Publish Dialog */}
      <Dialog open={isPublishOpen} onOpenChange={setIsPublishOpen}>
        <DialogContent className="max-w-md bg-[#FFFDF8] border-stone-200 text-stone-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-stone-900 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-[#315F86]" />
              <span>Xuất bản mẫu thiết kế</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Kiểm duyệt độ an toàn và xuất bản phiên bản mới lên hệ thống.
            </DialogDescription>
          </DialogHeader>

          {isValidating ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-stone-600 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-[#315F86]" />
              <span className="font-medium">Đang kiểm tra mẫu và tạo ảnh xem trước...</span>
            </div>
          ) : hasBlockers ? (
            /* Blockers State: "Mẫu chưa thể đăng." */
            <div className="space-y-4 py-2">
              <div
                role="alert"
                aria-live="polite"
                className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs space-y-2"
              >
                <div className="flex items-center gap-2 font-bold text-red-900 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>Mẫu chưa thể đăng.</span>
                </div>
                <p className="text-red-700">
                  Phát hiện các vấn đề cần phải sửa trước khi có thể xuất bản:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-red-800">
                  {validationBlockers.map((b, idx) => (
                    <li key={idx}>{b.message || b.code}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPublishOpen(false)}
                  className="h-9 text-xs"
                >
                  Đóng và sửa lỗi
                </Button>
                <Button
                  type="button"
                  onClick={executeValidation}
                  className="h-9 text-xs bg-stone-900 text-white"
                >
                  Kiểm tra lại
                </Button>
              </div>
            </div>
          ) : (
            /* Warnings or Ready State */
            <div className="space-y-4 py-2 text-xs">
              {publishError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{publishError}</span>
                </div>
              )}

              {/* Ready banner */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">Bản nháp đã vượt qua kiểm tra an toàn xuất bản.</span>
              </div>

              {/* Warnings requiring acknowledgement */}
              {validationWarnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-amber-900">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Cảnh báo cần xác nhận trước khi đăng:</span>
                  </div>
                  <div className="space-y-2 pt-1">
                    {validationWarnings.map((w) => {
                      const isChecked = acknowledgedWarningIds.includes(w.id);
                      return (
                        <label
                          key={w.id}
                          className="flex items-start gap-2.5 cursor-pointer text-[11px] leading-tight"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAcknowledgedWarningIds((prev) => [...prev, w.id]);
                              } else {
                                setAcknowledgedWarningIds((prev) =>
                                  prev.filter((id) => id !== w.id)
                                );
                              }
                            }}
                            className="mt-0.5 rounded border-amber-300 text-amber-700 focus:ring-amber-500 cursor-pointer"
                          />
                          <span>{w.message}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Revision note input */}
              <div className="space-y-1.5">
                <Label htmlFor="revision-note" className="text-xs font-medium text-stone-700">
                  Ghi chú phiên bản (tùy chọn)
                </Label>
                <Input
                  id="revision-note"
                  placeholder="VD: Cập nhật font chữ tiêu đề, sửa khung hình..."
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  className="text-xs h-9 bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-stone-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPublishOpen(false)}
                  className="h-9 text-xs"
                >
                  Hủy
                </Button>
                <Button
                  type="button"
                  disabled={isPublishing || !allWarningsAcknowledged}
                  onClick={executePublish}
                  className="h-9 text-xs bg-[#315F86] hover:bg-[#254b6b] text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang xuất bản...</span>
                    </>
                  ) : (
                    <span>Xác nhận đăng mẫu</span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
