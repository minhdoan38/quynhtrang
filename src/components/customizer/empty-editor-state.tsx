'use client';

import { ImagePlus, Type, Sparkles } from 'lucide-react';

interface EmptyEditorStateProps {
  onAddImage: () => void;
  onAddText: () => void;
  onChooseTemplate: () => void;
}

export function EmptyEditorState({
  onAddImage,
  onAddText,
  onChooseTemplate,
}: EmptyEditorStateProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-10">
      <div className="max-w-[280px] w-full p-4 rounded-2xl bg-[#FFFDF8]/90 backdrop-blur-xs border border-[#ECE6DC] shadow-xs pointer-events-auto space-y-3">
        <div>
          <span className="font-serif text-sm font-bold text-[#2E3338]">Bắt đầu thiết kế</span>
          <p className="text-[11px] text-[#666A6D] mt-0.5">Chọn một cách nhanh nhất để khởi tạo tác phẩm của bạn</p>
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          <button
            type="button"
            onClick={onAddImage}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] active:scale-98 transition-all text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-[#DCEBF4] text-[#315F86] flex items-center justify-center shrink-0">
              <ImagePlus className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-[#2E3338]">Thêm ảnh</span>
          </button>

          <button
            type="button"
            onClick={onAddText}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] active:scale-98 transition-all text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-[#F8F3E8] text-[#2E3338] flex items-center justify-center shrink-0">
              <Type className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-[#2E3338]">Thêm chữ</span>
          </button>

          <button
            type="button"
            onClick={onChooseTemplate}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] active:scale-98 transition-all text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-[#F2DFA0]/50 text-[#A86E22] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-[#2E3338]">Chọn mẫu có sẵn</span>
          </button>
        </div>
      </div>
    </div>
  );
}
