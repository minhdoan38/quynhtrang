'use client';

import React from 'react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Check, AlertTriangle, ZoomOut, RefreshCw, X } from 'lucide-react';
import type { ImageQualityReport } from '@/lib/image-quality';

export interface ImageQualitySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ImageQualityReport | null;
  onScaleDown?: (recommendedScale: number) => void;
  onReplaceImage?: () => void;
}

export function ImageQualitySheet({
  open,
  onOpenChange,
  report,
  onScaleDown,
  onReplaceImage,
}: ImageQualitySheetProps) {
  if (!open) return null;

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleScaleDown = () => {
    if (report?.recommendedScale && onScaleDown) {
      onScaleDown(report.recommendedScale);
    }
    handleClose();
  };

  const handleReplaceImage = () => {
    if (onReplaceImage) {
      onReplaceImage();
    }
    handleClose();
  };

  const isGood = report?.level === 'good';
  const isWarning = report?.level === 'warning';

  const badgeBadgeClass = isGood
    ? 'bg-[#EBF3ED] text-[#2D5A3A] border-[#C2DEC9]'
    : isWarning
      ? 'bg-[#FEF6E7] text-[#9A6214] border-[#F4DCB0]'
      : 'bg-[#FDF0ED] text-[#A63626] border-[#F5C7C0]';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-md mx-auto bg-[#FFFDF8] border-t border-[#ECE6DC] text-[#2E3338] px-4 pb-6 pt-3 rounded-t-2xl shadow-xl">
        <div className="space-y-4 text-[#2E3338]" data-testid="image-quality-sheet">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#ECE6DC] pb-2">
            <h2 className="text-sm font-semibold text-[#2E3338]">Chất lượng in ảnh</h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Đóng bảng chất lượng ảnh"
              className="p-1 rounded-lg text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {report && (
            <div className="space-y-3">
              {/* Badge */}
              <div className="flex items-center gap-2">
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badgeBadgeClass}`}
                >
                  {isGood ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  <span>{report.badgeLabel}</span>
                </div>
              </div>

              {/* Title & Description */}
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[#2E3338]">{report.title}</h3>
                <p className="text-xs text-[#666A6D] leading-relaxed">{report.description}</p>
              </div>

              {/* Advice */}
              {report.advice && (
                <div className="p-3 rounded-xl bg-[#F8F3E8]/80 border border-[#ECE6DC] text-xs text-[#2E3338] leading-relaxed">
                  <span className="font-semibold">Lời khuyên: </span>
                  <span>{report.advice}</span>
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[#ECE6DC]">
            {report?.canScaleDown && Boolean(report.recommendedScale) && (
              <button
                type="button"
                onClick={handleScaleDown}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#315F86] text-white hover:bg-[#244A69] active:scale-98 transition-all text-xs font-semibold shadow-xs"
              >
                <ZoomOut className="w-4 h-4" />
                <span>Thu nhỏ ảnh</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleReplaceImage}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#315F86] text-[#315F86] bg-white hover:bg-[#DCEBF4]/30 active:scale-98 transition-all text-xs font-semibold"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thay ảnh</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-medium text-[#666A6D]"
            >
              <span>Đã hiểu</span>
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
