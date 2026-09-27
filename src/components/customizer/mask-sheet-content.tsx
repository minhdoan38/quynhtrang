'use client';

import React from 'react';
import { Check, Ban, Square, Circle, Heart } from 'lucide-react';
import { MASK_PRESETS, type MaskType } from '@/lib/image-mask';

interface MaskSheetContentProps {
  currentMask: string | null | undefined;
  onSelectMask: (maskId: MaskType) => void;
  onClose: () => void;
}

export function MaskSheetContent({
  currentMask = null,
  onSelectMask,
  onClose,
}: MaskSheetContentProps) {
  const activeId = currentMask || 'none';

  return (
    <div className="space-y-4 pt-1 pb-2">
      <div className="flex items-center justify-between border-b border-[#ECE6DC] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#2E3338]">Khung hình ảnh (Mask)</h3>
          <p className="text-xs text-[#666A6D] mt-0.5">
            Chọn hình dạng hiển thị cho ảnh đã chọn
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-[#315F86] hover:bg-[#F8F3E8] px-3 py-1.5 rounded-lg active:scale-95 transition-all"
        >
          Xong
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {MASK_PRESETS.map((preset) => {
          const isSelected =
            preset.id === activeId || (preset.id === 'none' && !activeId);

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectMask(preset.id)}
              className={`relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all min-h-[88px] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86] ${isSelected
                  ? 'border-[#315F86] bg-[#DCEBF4]/30 shadow-xs'
                  : 'border-[#ECE6DC] bg-[#FFFDF8] hover:border-[#DDD6CC] hover:bg-[#F8F3E8]'
                }`}
            >
              {/* Check indicator for active item */}
              {isSelected && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#315F86] text-white flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              )}

              {/* Visual shape icon preview */}
              <div className="w-10 h-10 flex items-center justify-center mb-1.5 text-[#2E3338]">
                {preset.id === 'none' && (
                  <Ban className="w-6 h-6 text-[#666A6D]" />
                )}
                {preset.id === 'rectangle' && (
                  <Square className="w-6 h-6 stroke-[1.75]" />
                )}
                {preset.id === 'circle' && (
                  <Circle className="w-6 h-6 stroke-[1.75] fill-[#2E3338]/10" />
                )}
                {preset.id === 'oval' && (
                  <div className="w-8 h-5.5 rounded-full border-2 border-[#2E3338] bg-[#2E3338]/10" />
                )}
                {preset.id === 'rounded' && (
                  <div className="w-7 h-7 rounded-lg border-2 border-[#2E3338] bg-[#2E3338]/10" />
                )}
                {preset.id === 'heart' && (
                  <Heart className="w-6 h-6 stroke-[1.75] fill-[#2E3338]/15 text-[#2E3338]" />
                )}
              </div>

              <span
                className={`text-xs font-semibold ${isSelected ? 'text-[#315F86]' : 'text-[#2E3338]'
                  }`}
              >
                {preset.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
