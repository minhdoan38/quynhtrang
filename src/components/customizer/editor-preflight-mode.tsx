'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import type { DesignState, DesignSummary, PreflightResult } from '@/lib/product-state';

interface EditorPreflightModeProps {
  state: DesignState;
  summary: DesignSummary;
  preflight: PreflightResult;
  onBackToEdit: (focusTarget?: 'image' | 'text') => void;
  onContinueToCheckout: () => void;
}

export function EditorPreflightMode({
  state,
  summary,
  preflight,
  onBackToEdit,
  onContinueToCheckout,
}: EditorPreflightModeProps) {
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
            gsap.set('.preflight-card', { opacity: 1, y: 0 });
            return;
          }

          gsap.fromTo(
            '.preflight-card',
            { opacity: 0, y: 12 },
            {
              opacity: 1,
              y: 0,
              duration: 0.35,
              stagger: 0.06,
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
      className="fixed inset-0 z-50 flex flex-col bg-[#FFFDF8] text-[#2E3338]"
    >
      {/* Top Header */}
      <header className="h-[52px] border-b border-[#DDD6CC] bg-[#FFFDF8] px-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onBackToEdit()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs sm:text-sm font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Quay lại sửa</span>
        </button>

        <div className="text-center">
          <h1 className="font-serif text-sm sm:text-base font-bold text-[#2E3338]">
            Kiểm tra in ấn
          </h1>
          <p className="text-[11px] text-[#666A6D]">
            {summary.product} · {summary.variant}
          </p>
        </div>

        <div className="w-16" aria-hidden="true" />
      </header>

      {/* Main Checklist */}
      <main className="flex-1 max-w-lg mx-auto w-full p-4 sm:p-6 overflow-y-auto">
        <div className="text-center mb-6">
          <h2 className="font-serif text-xl font-bold text-[#2E3338]">
            Thiết kế gần xong rồi!
          </h2>
          <p className="mt-1 text-xs text-[#666A6D]">
            Hệ thống đã tự động rà soát các yếu tố kỹ thuật trước khi chuyển sang đặt in.
          </p>
        </div>

        <div className="space-y-3">
          {/* Check items */}
          {preflight.checks.map((check) => {
            const isWarning = check.level === 'warning';
            const isError = check.level === 'error';

            return (
              <div
                key={check.id}
                className={`preflight-card rounded-2xl border p-4 transition-all ${isWarning || isError
                    ? 'border-[#F2DFA0] bg-[#FFFDF8] shadow-xs'
                    : 'border-[#DDD6CC] bg-[#F8F3E8]/50'
                  }`}
              >
                <div className="flex items-start gap-3">
                  {isWarning || isError ? (
                    <AlertTriangle className="w-5 h-5 text-[#A86E22] shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-[#5F7E67] shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-[#2E3338]">
                      {check.label}
                    </p>
                    {isWarning && (
                      <p className="mt-1 text-[11px] text-[#A86E22]">
                        Ảnh độ phân giải nhỏ hơn tiêu chuẩn có thể hiển thị hạt mờ nhẹ trên thành phẩm in.
                      </p>
                    )}
                  </div>

                  {isWarning && state.image && (
                    <button
                      type="button"
                      onClick={() => onBackToEdit('image')}
                      className="shrink-0 text-xs font-semibold text-[#315F86] hover:underline px-2 py-1 rounded bg-[#DCEBF4]/60"
                    >
                      Sửa ảnh
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Standard Safe Area Check */}
          <div className="preflight-card rounded-2xl border border-[#DDD6CC] bg-[#F8F3E8]/50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#5F7E67] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-[#2E3338]">
                  Nội dung nằm trong vùng an toàn
                </p>
                <p className="mt-1 text-[11px] text-[#666A6D]">
                  Chữ và các chi tiết quan trọng không bị cắt xén sát mép giấy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Sticky CTA */}
      <footer className="p-4 border-t border-[#DDD6CC] bg-[#FFFDF8] max-w-lg mx-auto w-full flex items-center gap-3">
        <button
          type="button"
          onClick={() => onBackToEdit()}
          className="flex-1 h-11 inline-flex items-center justify-center rounded-xl border border-[#DDD6CC] bg-white text-xs sm:text-sm font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
        >
          Quay lại sửa
        </button>
        <button
          type="button"
          onClick={onContinueToCheckout}
          className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98]"
        >
          <span>Tiếp tục đặt in</span>
          <ArrowRight size={16} />
        </button>
      </footer>
    </div>
  );
}
