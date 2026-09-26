'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, Check } from 'lucide-react';
import type { DesignState, DesignSummary } from '@/lib/product-state';
import { DesignCanvas } from './design-canvas';

interface EditorPreviewModeProps {
  state: DesignState;
  summary: DesignSummary;
  onBackToEdit: () => void;
  onDoneToPreflight: () => void;
}

export function EditorPreviewMode({
  state,
  summary,
  onBackToEdit,
  onDoneToPreflight,
}: EditorPreviewModeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
            gsap.set('.preview-mockup-wrap', { opacity: 1, scale: 1 });
            return;
          }

          gsap.fromTo(
            '.preview-mockup-wrap',
            { opacity: 0, scale: 0.94 },
            {
              opacity: 1,
              scale: 1,
              duration: 0.35,
              ease: 'power2.out',
              clearProps: 'transform',
            }
          );
        }
      );
      return () => mm.revert();
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-[#F8F3E8] text-[#2E3338]"
    >
      {/* Top Header */}
      <header className="h-[52px] border-b border-[#DDD6CC] bg-[#FFFDF8]/90 px-4 flex items-center justify-between backdrop-blur-sm">
        <button
          type="button"
          onClick={onBackToEdit}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs sm:text-sm font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Tiếp tục chỉnh</span>
        </button>

        <div className="text-center">
          <h1 className="font-serif text-sm sm:text-base font-bold text-[#2E3338]">
            Xem thử thành phẩm
          </h1>
          <p className="text-[11px] text-[#666A6D]">
            {summary.product} · {summary.variant}
          </p>
        </div>

        <button
          type="button"
          onClick={onDoneToPreflight}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#315F86] px-3.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-95"
        >
          <span>Xong</span>
          <Check size={16} aria-hidden="true" />
        </button>
      </header>

      {/* Main Physical Mockup Stage */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 overflow-hidden select-none">
        <div className="preview-mockup-wrap flex flex-col items-center justify-center w-full max-w-lg bg-[#FFFDF8] rounded-2xl border border-[#DDD6CC] p-6 shadow-md">
          <div className="scale-95 sm:scale-105 transform transition-transform">
            <DesignCanvas
              productId={state.productId}
              text={state.text}
              color={state.color}
              backgroundColor={state.backgroundColor}
              image={state.image}
              productOptions={state.productOptions}
              isMockup={true}
            />
          </div>

          <div className="mt-6 text-center space-y-1">
            <p className="text-xs font-semibold text-[#2E3338]">
              Mô phỏng mẫu thực tế khi in ấn
            </p>
            <p className="text-[11px] text-[#666A6D]">
              Màu sắc và vị trí hiển thị gần đúng nhất với sản phẩm hoàn thiện.
            </p>
          </div>
        </div>
      </main>

      {/* Bottom Action Footer */}
      <footer className="p-4 border-t border-[#DDD6CC] bg-[#FFFDF8] flex items-center justify-between max-w-lg mx-auto w-full gap-3">
        <button
          type="button"
          onClick={onBackToEdit}
          className="flex-1 h-11 inline-flex items-center justify-center rounded-xl border border-[#DDD6CC] bg-white text-xs sm:text-sm font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
        >
          Tiếp tục chỉnh
        </button>
        <button
          type="button"
          onClick={onDoneToPreflight}
          className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98]"
        >
          <span>Xong (Kiểm tra file)</span>
          <Check size={16} />
        </button>
      </footer>
    </div>
  );
}
