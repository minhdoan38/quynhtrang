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

function resolveFindingSurface(
  f: { code: string; elementId?: string; surfaceId?: string; message?: string },
  elements: Array<{ id: string; surface?: string }> | undefined,
  productId: string,
): 'front' | 'inside' | 'back' | undefined {
  if (f.surfaceId === 'front' || f.surfaceId === 'inside' || f.surfaceId === 'back') {
    return f.surfaceId;
  }
  if (f.elementId && elements) {
    const el = elements.find((e) => e.id === f.elementId);
    if (el?.surface === 'front' || el?.surface === 'inside' || el?.surface === 'back') {
      return el.surface;
    }
  }
  if (productId === 'card') {
    const msg = (f.message || '').toLowerCase();
    const code = (f.code || '').toLowerCase();
    if (msg.includes('mặt trong') || code.includes('inside')) return 'inside';
    if (msg.includes('mặt sau') || code.includes('back')) return 'back';
    if (msg.includes('mặt trước') || code.includes('front')) return 'front';
  }
  return undefined;
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
    Array<{ code: string; message: string; elementId?: string; surfaceId?: string }>
  >([]);
  const [validationWarnings, setValidationWarnings] = useState<
    Array<{ id: string; code: string; message: string; elementId?: string; surfaceId?: string }>
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

      const bList: Array<{ code: string; message: string; elementId?: string; surfaceId?: string }> = [];
      const wList: Array<{ id: string; code: string; message: string; elementId?: string; surfaceId?: string }> = [];

      if (!receipt.customerPreviewPassed) {
        bList.push({
          code: 'PREVIEW_FAILED',
          message: 'Khung hiển thị khách hàng không đạt yêu cầu kết xuất',
          surfaceId: template.productId === 'card' ? 'front' : undefined,
        });
      }

      const warningSet = new Set(receipt.warningIds || []);
      const draftElements = initialDraft.designDocument?.elements;

      for (const f of receipt.findings || []) {
        const resolvedSurface = resolveFindingSurface(f, draftElements, template.productId);
        if (warningSet.has(f.code) || (f.elementId && warningSet.has(`warning-${f.elementId}`))) {
          wList.push({
            id: f.code,
            code: f.code,
            message: f.message || f.code,
            elementId: f.elementId,
            surfaceId: resolvedSurface,
          });
        } else {
          bList.push({
            code: f.code,
            message: f.message || f.code,
            elementId: f.elementId,
            surfaceId: resolvedSurface,
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
            surfaceId: template.productId === 'card' ? 'front' : undefined,
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

  const handleNavigateSurface = useCallback((surfaceId?: string, elementId?: string) => {
    if (!surfaceId) return;
    setIsPublishOpen(false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('navigate_card_surface', {
          detail: { surface: surfaceId, elementId },
        })
      );
      window.dispatchEvent(
        new CustomEvent('card_surface_changed', {
          detail: { surface: surfaceId },
        })
      );
    }
  }, []);

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
    onNavigateSurface: handleNavigateSurface,
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
    handleNavigateSurface,
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
                <div className="space-y-2 pt-1">
                  {validationBlockers.map((b, idx) => {
                    const surfaceLabel =
                      b.surfaceId === 'front'
                        ? 'Mặt trước'
                        : b.surfaceId === 'inside'
                          ? 'Mặt trong'
                          : b.surfaceId === 'back'
                            ? 'Mặt sau'
                            : b.surfaceId;

                    if (b.surfaceId) {
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleNavigateSurface(b.surfaceId, b.elementId)}
                          className="w-full text-left p-2.5 min-h-[44px] rounded-lg border border-red-200 bg-white hover:bg-red-50 flex items-center justify-between gap-2 transition cursor-pointer group"
                          title={`Bấm để chuyển đến ${surfaceLabel} và sửa lỗi`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                            <span className="text-red-900 font-medium">{b.message || b.code}</span>
                          </div>
                          <span className="shrink-0 text-[11px] font-semibold text-red-700 bg-red-100 px-2 py-1 rounded group-hover:bg-red-200 transition">
                            Đến {surfaceLabel} →
                          </span>
                        </button>
                      );
                    }

                    return (
                      <div key={idx} className="flex items-start gap-2 text-red-800 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                        <span>{b.message || b.code}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPublishOpen(false)}
                  className="min-h-[44px] h-11 px-4 text-xs cursor-pointer"
                >
                  Đóng và sửa lỗi
                </Button>
                <Button
                  type="button"
                  onClick={executeValidation}
                  className="min-h-[44px] h-11 px-4 text-xs bg-stone-900 text-white cursor-pointer"
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
                      const surfaceLabel =
                        w.surfaceId === 'front'
                          ? 'Mặt trước'
                          : w.surfaceId === 'inside'
                            ? 'Mặt trong'
                            : w.surfaceId === 'back'
                              ? 'Mặt sau'
                              : w.surfaceId;

                      return (
                        <div
                          key={w.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg border border-amber-200/80 bg-white/60 min-h-[44px]"
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer text-[11px] leading-tight flex-1 min-h-[44px]">
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
                              className="rounded border-amber-300 text-amber-700 focus:ring-amber-500 cursor-pointer w-4 h-4 shrink-0"
                            />
                            <span>{w.message}</span>
                          </label>
                          {w.surfaceId && (
                            <button
                              type="button"
                              onClick={() => handleNavigateSurface(w.surfaceId, w.elementId)}
                              className="shrink-0 text-[11px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded cursor-pointer transition min-h-[32px] flex items-center"
                              title={`Bấm để chuyển đến ${surfaceLabel}`}
                            >
                              Đến {surfaceLabel} →
                            </button>
                          )}
                        </div>
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
                  className="text-xs min-h-[44px] h-11 bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-stone-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPublishOpen(false)}
                  className="min-h-[44px] h-11 px-4 text-xs cursor-pointer"
                >
                  Hủy
                </Button>
                <Button
                  type="button"
                  disabled={isPublishing || !allWarningsAcknowledged}
                  onClick={executePublish}
                  className="min-h-[44px] h-11 px-4 text-xs bg-[#315F86] hover:bg-[#254b6b] text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
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
