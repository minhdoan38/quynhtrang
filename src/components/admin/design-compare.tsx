'use client';

import React, { useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, Check, AlertTriangle, CheckCircle2, SplitSquareVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CardSurfaceSwitcher } from '@/components/customizer/card-surface-switcher.tsx';
import { EditorPreviewMode } from '@/components/customizer/editor-preview-mode.tsx';
import type { DesignState, CardSurface, PreflightCheck } from '@/lib/product-state.ts';
import { getDesignSummary } from '@/lib/product-state.ts';
import type { StaffPreflightAssessment } from '@/lib/domain/design-revision.ts';

export interface DesignCompareProps {
  orderId: string;
  publicOrderCode: string;
  baseVersionNumber: number;
  baseDocument: DesignState;
  draftDocument: DesignState;
  draftReason: string;
  assessment: StaffPreflightAssessment;
  onBackToEdit: () => void;
  onApprove: (acknowledgedWarningIds: string[]) => Promise<void>;
  isApproving?: boolean;
}

export function DesignCompare({
  publicOrderCode,
  baseVersionNumber,
  baseDocument,
  draftDocument,
  draftReason,
  assessment,
  onBackToEdit,
  onApprove,
  isApproving = false,
}: DesignCompareProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mobileView, setMobileView] = useState<'before' | 'after'>('after');
  const [activeCardSurface, setActiveCardSurface] = useState<CardSurface>('front');
  const [acknowledgedWarningIds, setAcknowledgedWarningIds] = useState<string[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const baseSummary = getDesignSummary(baseDocument);
  const draftSummary = getDesignSummary(draftDocument);

  const warnings = assessment.findings.checks.filter((c: PreflightCheck) => c.level === 'warning');
  const allWarningsAcknowledged = warnings.every((w: PreflightCheck) =>
    acknowledgedWarningIds.includes(w.id)
  );

  // Synchronize surface for card on both documents
  const synchronizedBaseDoc = React.useMemo(() => {
    if (baseDocument.productId === 'card') {
      return {
        ...baseDocument,
        productOptions: { ...baseDocument.productOptions, surface: activeCardSurface },
      };
    }
    return baseDocument;
  }, [baseDocument, activeCardSurface]);

  const synchronizedDraftDoc = React.useMemo(() => {
    if (draftDocument.productId === 'card') {
      return {
        ...draftDocument,
        productOptions: { ...draftDocument.productOptions, surface: activeCardSurface },
      };
    }
    return draftDocument;
  }, [draftDocument, activeCardSurface]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };
          if (reduceMotion) {
            gsap.set('.compare-pane', { opacity: 1 });
            return;
          }
          gsap.fromTo(
            '.compare-pane',
            { opacity: 0.7 },
            { opacity: 1, duration: 0.15, ease: 'power2.out' }
          );
        }
      );
    },
    { dependencies: [mobileView], scope: containerRef }
  );

  const handleToggleWarning = (warningId: string) => {
    setAcknowledgedWarningIds((prev) =>
      prev.includes(warningId) ? prev.filter((id) => id !== warningId) : [...prev, warningId]
    );
  };

  const handleConfirmApprove = async () => {
    setConfirmDialogOpen(false);
    await onApprove(acknowledgedWarningIds);
  };

  return (
    <div ref={containerRef} className="flex flex-col h-screen w-full bg-[#FFFDF8] overflow-hidden select-none">
      {/* Header */}
      <header className="h-[54px] px-4 border-b border-[#ECE6DC] bg-[#FFFDF8]/95 backdrop-blur-md flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToEdit}
            className="h-9 px-2 text-xs font-semibold text-[#666A6D] hover:text-[#2E3338] gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Sửa tiếp</span>
          </Button>

          <div className="h-4 w-px bg-[#ECE6DC]" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#2E3338]">#{publicOrderCode}</span>
            <span className="text-xs text-[#666A6D] hidden sm:inline">• So sánh & duyệt sản xuất</span>
          </div>
        </div>

        {/* Mobile View Toggle */}
        <div className="flex lg:hidden items-center p-0.5 rounded-lg bg-[#ECE6DC]/60 border border-[#DDD6CC]">
          <button
            type="button"
            onClick={() => setMobileView('before')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${mobileView === 'before'
                ? 'bg-white text-[#2E3338] shadow-xs'
                : 'text-[#666A6D] hover:text-[#2E3338]'
              }`}
          >
            Bản trước (v{baseVersionNumber})
          </button>
          <button
            type="button"
            onClick={() => setMobileView('after')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${mobileView === 'after'
                ? 'bg-[#315F86] text-white shadow-xs'
                : 'text-[#666A6D] hover:text-[#2E3338]'
              }`}
          >
            Bản sửa (mới)
          </button>
        </div>

        {/* Action Button */}
        <div>
          <Button
            type="button"
            disabled={!allWarningsAcknowledged || isApproving}
            onClick={() => setConfirmDialogOpen(true)}
            className="h-9 px-4 bg-[#4A7251] hover:bg-[#3D5E43] text-white text-xs font-semibold gap-1.5 shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Duyệt bản sửa</span>
          </Button>
        </div>
      </header>

      {/* Surface switcher for Card if applicable */}
      {baseDocument.productId === 'card' && (
        <div className="w-full flex justify-center py-2 bg-[#F8F3E8]/60 border-b border-[#ECE6DC] z-20 shrink-0">
          <CardSurfaceSwitcher
            value={activeCardSurface}
            onChange={(surface) => setActiveCardSurface(surface)}
          />
        </div>
      )}

      {/* Comparison Workspace */}
      <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#ECE6DC] overflow-hidden">
        {/* Left Side: Before (vBase) */}
        <div
          className={`compare-pane flex flex-col h-full overflow-hidden bg-neutral-50/50 ${mobileView === 'after' ? 'hidden lg:flex' : 'flex'
            }`}
        >
          <div className="h-8 px-4 border-b border-[#ECE6DC] bg-white flex items-center justify-between text-xs shrink-0">
            <span className="font-semibold text-neutral-600">Bản trước • v{baseVersionNumber}</span>
            <span className="text-[11px] text-neutral-400">Phiên bản ban đầu</span>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <EditorPreviewMode
              state={synchronizedBaseDoc}
              summary={baseSummary}
              onBackToEdit={() => { }}
              onDoneToPreflight={() => { }}
            />
          </div>
        </div>

        {/* Right Side: After (Draft Revision) */}
        <div
          className={`compare-pane flex flex-col h-full overflow-hidden bg-white ${mobileView === 'before' ? 'hidden lg:flex' : 'flex'
            }`}
        >
          <div className="h-8 px-4 border-b border-[#ECE6DC] bg-[#EBF3ED]/60 flex items-center justify-between text-xs shrink-0">
            <span className="font-semibold text-[#4A7251]">Bản sửa mới • Chờ duyệt</span>
            <span className="text-[11px] text-[#4A7251] font-mono">Lý do: &quot;{draftReason}&quot;</span>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <EditorPreviewMode
              state={synchronizedDraftDoc}
              summary={draftSummary}
              onBackToEdit={() => { }}
              onDoneToPreflight={() => { }}
            />
          </div>
        </div>
      </div>

      {/* Warnings & Acknowledgement Drawer / Bottom bar if warnings exist */}
      {warnings.length > 0 && (
        <div className="border-t border-[#ECE6DC] bg-[#FFFDF8] p-3 sm:px-6 z-20 shrink-0">
          <div className="max-w-4xl mx-auto space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Cần xác nhận các cảnh báo in trước khi phê duyệt:</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {warnings.map((w: PreflightCheck) => {
                const isChecked = acknowledgedWarningIds.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleToggleWarning(w.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${isChecked
                        ? 'bg-[#EBF3ED] border-[#D5E6D9] text-[#4A7251]'
                        : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100/60'
                      }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${isChecked
                          ? 'bg-[#4A7251] border-[#4A7251] text-white'
                          : 'border-amber-400 bg-white'
                        }`}
                    >
                      {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <span>{w.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md bg-[#FFFDF8] border-[#ECE6DC] p-6">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-[#EBF3ED] flex items-center justify-center text-[#4A7251] mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#2E3338]">
              Dùng bản chỉnh sửa này để sản xuất?
            </DialogTitle>
            <DialogDescription className="text-sm text-[#666A6D] mt-2 space-y-2">
              <p>• Bản khách duyệt ban đầu v1 vẫn được giữ nguyên không đổi.</p>
              <p>• Bản chỉnh sửa này sẽ trở thành phiên bản sản xuất chính thức của đơn hàng.</p>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex sm:justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              disabled={isApproving}
              className="h-11 px-4 text-xs font-semibold"
            >
              Xem lại
            </Button>
            <Button
              type="button"
              onClick={handleConfirmApprove}
              disabled={isApproving}
              className="h-11 px-5 bg-[#4A7251] hover:bg-[#3D5E43] text-white text-xs font-semibold"
            >
              {isApproving ? 'Đang duyệt...' : 'Xác nhận duyệt sản xuất'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
