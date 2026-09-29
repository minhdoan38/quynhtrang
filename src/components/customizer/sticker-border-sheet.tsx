'use client';

import React, { useRef } from 'react';
import { Check, Scissors, X } from 'lucide-react';
import type { StickerContourResult } from '@/lib/sticker-contour';
import type { StickerOptions } from '@/lib/product-state';

export interface StickerBorderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: StickerOptions;
  contourResult: StickerContourResult;
  onChangeOptions: (patch: Partial<StickerOptions>) => void;
  onCommitOptions: (patch: Partial<StickerOptions>) => void;
  onTriggerBackgroundRemoval?: () => void;
}

const fieldClass = 'flex items-center justify-between gap-3 rounded-xl border border-[#ECE6DC] bg-white px-3.5 py-3';
const switchClass = 'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]';

export function StickerBorderSheet({
  open,
  onOpenChange,
  options,
  contourResult,
  onChangeOptions,
  onCommitOptions,
  onTriggerBackgroundRemoval,
}: StickerBorderSheetProps) {
  const committedSliderValue = useRef<number | null>(null);
  const borderWidth = Math.min(6, Math.max(0, options.borderWidth ?? 2));
  const hasWhiteBorder = Boolean(options.hasWhiteBorder);

  if (!open) return null;

  const commitBorderWidth = (value: number) => {
    const nextValue = Math.min(6, Math.max(0, value));
    if (committedSliderValue.current === nextValue) return;
    committedSliderValue.current = nextValue;
    onCommitOptions({ borderWidth: nextValue });
  };

  const renderStatus = () => {
    if (contourResult.status === 'valid') {
      return (
        <div className="rounded-xl border border-[#B8DCC0] bg-[#EFF9F0] p-3 text-sm text-[#246B35]" role="status">
          <div className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4" aria-hidden="true" />✓ Hình cắt ổn</div>
        </div>
      );
    }
    if (contourResult.status === 'disconnected') {
      return (
        <div className="rounded-xl border border-[#E9D29B] bg-[#FFF8E7] p-3 text-sm text-[#76551A]" role="status">
          <div className="font-semibold">⚠ Một số chi tiết đang tách rời</div>
          <p className="mt-1 text-xs leading-relaxed">Di chuyển chúng gần nhau hơn hoặc tăng viền để tạo thành một sticker.</p>
        </div>
      );
    }
    if (contourResult.status === 'tiny-details') {
      return (
        <div className="rounded-xl border border-[#E9D29B] bg-[#FFF8E7] p-3 text-sm text-[#76551A]" role="status">
          <div className="font-semibold">⚠ Có chi tiết quá nhỏ</div>
          <p className="mt-1 text-xs leading-relaxed">Tăng viền hoặc đơn giản thiết kế.</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4 pb-2 text-[#2E3338]" data-testid="sticker-border-sheet">
      <div className="flex items-center justify-between border-b border-[#ECE6DC] pb-2">
        <h2 className="text-sm font-semibold">Viền sticker</h2>
        <button type="button" onClick={() => onOpenChange(false)} aria-label="Đóng bảng viền sticker" className="rounded-lg p-1 text-[#666A6D] hover:bg-[#F8F3E8]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {renderStatus()}

      {contourResult.hasUnremovedBackground && (
        <div className="space-y-2 rounded-xl border border-[#E9D29B] bg-[#FFF8E7] p-3">
          <p className="text-xs leading-relaxed text-[#76551A]">Muốn sticker cắt theo chủ thể? Hãy xóa nền ảnh trước.</p>
          <button
            type="button"
            onClick={onTriggerBackgroundRemoval}
            className="inline-flex items-center gap-2 rounded-lg bg-[#315F86] px-3 py-2 text-xs font-semibold text-white hover:bg-[#244A69]"
          >
            <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
            Xóa nền ảnh
          </button>
        </div>
      )}

      <div className={fieldClass}>
        <label htmlFor="sticker-white-border" className="text-xs font-semibold">Viền trắng</label>
        <button
          id="sticker-white-border"
          type="button"
          role="switch"
          aria-checked={hasWhiteBorder}
          onClick={() => onChangeOptions({ hasWhiteBorder: !hasWhiteBorder })}
          className={`${switchClass} ${hasWhiteBorder ? 'bg-[#315F86]' : 'bg-[#B9BEC2]'}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${hasWhiteBorder ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {hasWhiteBorder && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="sticker-border-width" className="font-semibold">Độ dày viền</label>
            <span className="font-mono text-[11px] text-[#666A6D]">{borderWidth} mm</span>
          </div>
          <input
            id="sticker-border-width"
            type="range"
            min="0"
            max="6"
            step="0.5"
            value={borderWidth}
            onChange={(event) => {
              const value = Number(event.target.value);
              committedSliderValue.current = null;
              onChangeOptions({ borderWidth: value });
            }}
            onPointerUp={(event) => commitBorderWidth(Number(event.currentTarget.value))}
            onTouchEnd={(event) => commitBorderWidth(Number(event.currentTarget.value))}
            onKeyUp={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                commitBorderWidth(Number(event.currentTarget.value));
              }
            }}
            className="h-2 w-full cursor-pointer rounded-lg bg-[#ECE6DC] accent-[#315F86]"
          />
          <div className="flex justify-between text-[11px] font-medium text-[#666A6D]"><span>Mỏng</span><span>Dày</span></div>
        </div>
      )}

      <div className={fieldClass}>
        <label htmlFor="sticker-cutline" className="text-xs font-semibold">Xem đường cắt</label>
        <button
          id="sticker-cutline"
          type="button"
          role="switch"
          aria-checked={Boolean(options.showCutline)}
          onClick={() => onChangeOptions({ showCutline: !options.showCutline })}
          className={`${switchClass} ${options.showCutline ? 'bg-[#315F86]' : 'bg-[#B9BEC2]'}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${options.showCutline ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}
