'use client';

import React, { useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

export interface TextEditOverlayProps {
  value: string;
  placeholder?: string;
  selectAllOnFocus: boolean;
  onChange: (value: string) => void;
  onCompositionChange: (isComposing: boolean) => void;
  onDone: () => void;
}

export function TextEditOverlay({
  value,
  placeholder = 'Nhập nội dung...',
  selectAllOnFocus,
  onChange,
  onCompositionChange,
  onDone,
}: TextEditOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    if (selectAllOnFocus) {
      el.select();
    }
  }, [selectAllOnFocus]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm sm:justify-center sm:items-center sm:p-4 touch-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onDone();
        }
      }}
    >
      <div className="w-full max-w-lg bg-[#FFFDF8] rounded-t-2xl sm:rounded-2xl border border-[#ECE6DC] shadow-2xl p-4 flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:pb-4 animate-in fade-in slide-in-from-bottom-4 duration-150">
        <div className="flex items-center justify-between pb-2 border-b border-[#ECE6DC]">
          <label htmlFor="active-text-edit-textarea" className="text-xs font-semibold text-[#2E3338]">
            Nội dung chữ
          </label>
          <button
            type="button"
            onClick={onDone}
            className="flex items-center gap-1 min-h-[44px] min-w-[64px] px-3.5 py-2 rounded-lg bg-[#315F86] text-white text-xs font-semibold hover:bg-[#244A69] active:scale-95 transition-all justify-center shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Xong</span>
          </button>
        </div>

        <textarea
          ref={textareaRef}
          id="active-text-edit-textarea"
          aria-label="Nội dung chữ"
          value={value}
          placeholder={placeholder}
          rows={3}
          inputMode="text"
          enterKeyHint="done"
          className="w-full p-3 rounded-xl border border-[#ECE6DC] bg-white text-[#2E3338] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#315F86] resize-none leading-relaxed"
          onChange={(e) => onChange(e.target.value)}
          onCompositionStart={() => onCompositionChange(true)}
          onCompositionEnd={() => onCompositionChange(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onDone();
            }
          }}
        />
      </div>
    </div>
  );
}
