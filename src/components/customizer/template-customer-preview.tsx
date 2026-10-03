'use client';

import { useMemo, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import type { DesignState } from '@/lib/product-state';
import { CustomizerShell } from './customizer-shell';

export interface TemplateCustomerPreviewProps {
  initialDocument: DesignState;
  onExit: () => void;
  templateId?: string;
}

export function TemplateCustomerPreview({
  initialDocument,
  onExit,
  templateId,
}: TemplateCustomerPreviewProps) {
  // Deep clone initial document on sandbox entry to ensure complete isolation
  const isolatedDocument = useMemo(() => {
    try {
      return structuredClone(initialDocument);
    } catch {
      return JSON.parse(JSON.stringify(initialDocument));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trap escape key inside customer preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onExit]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chế độ xem như khách"
      className="fixed inset-0 z-50 bg-[#F8F3E8] flex flex-col overflow-hidden"
    >
      {/* Top Sandbox Notice Banner */}
      <div className="bg-[#2E3338] text-white px-3 py-1.5 flex items-center justify-between z-40 text-xs shrink-0 select-none shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#315F86] text-white text-[10px] font-semibold tracking-wide uppercase">
            <Sparkles className="w-3 h-3" />
            Sandbox
          </span>
          <span className="font-medium truncate text-white/90">
            Chế độ xem như khách — Dùng thử tự do, không ghi đè bản nháp mẫu
          </span>
        </div>

        <button
          type="button"
          onClick={onExit}
          aria-label="Đóng chế độ xem như khách"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-semibold text-white transition-all shrink-0 ml-2"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Đóng chế độ xem như khách</span>
        </button>
      </div>

      {/* Editor surface running in true template-preview mode */}
      <div className="flex-1 relative overflow-hidden">
        <CustomizerShell
          context={{
            type: 'template-preview',
            templateId,
            initialDocument: isolatedDocument,
            onExit,
          }}
        />
      </div>
    </div>
  );
}
