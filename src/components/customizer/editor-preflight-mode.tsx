'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Pencil,
} from 'lucide-react';
import type {
  DesignState,
  DesignSummary,
  PreflightCheck,
  PreflightResult,
} from '@/lib/product-state';

export interface EditorPreflightModeProps {
  state: DesignState;
  summary: DesignSummary;
  preflight: PreflightResult;
  onBackToEdit: (focusTarget?: 'image' | 'text') => void;
  onFix?: (check: PreflightCheck) => void;
  onContinue?: () => void;
  continueLabel?: string;
  onContinueToCheckout?: () => void;
  readOnly?: boolean;
}

export function EditorPreflightMode({
  state,
  summary,
  preflight,
  onBackToEdit,
  onFix,
  onContinue,
  continueLabel,
  onContinueToCheckout,
  readOnly = false,
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
            },
          );
        },
      );
      return () => mm.revert();
    },
    { scope: containerRef },
  );

  const issues = preflight.checks
    .filter((check) => check.level === 'warning' || check.level === 'error')
    .sort((a, b) => (a.level === 'error' && b.level !== 'error' ? -1 : a.level !== 'error' && b.level === 'error' ? 1 : 0));
  const hasErrors = preflight.level === 'error' || preflight.hasErrors;
  const hasWarnings = !hasErrors && (preflight.level === 'warning' || preflight.hasWarnings);

  const status = hasErrors
    ? {
      title: 'Cần sửa trước khi tiếp tục',
      description: 'Vui lòng sửa các điểm dưới đây để đảm bảo chất lượng thành phẩm.',
      className: 'border-red-200 bg-red-50 text-red-700',
    }
    : hasWarnings
      ? {
        title: 'Có một vài chỗ cần kiểm tra',
        description: 'Bạn có thể sửa các chi tiết dưới đây hoặc vẫn tiếp tục nếu thấy ổn.',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      }
      : {
        title: 'Thiết kế đã sẵn sàng',
        description: 'Mọi thứ trông ổn để tiếp tục đặt hàng.',
        className: 'border-[#C8DCCB] bg-[#EEF6EF] text-[#5F7E67]',
      };

  void state;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-[#FFFDF8] text-[#2E3338]"
    >
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
            Kiểm tra thiết kế
          </h1>
          <p className="text-[11px] text-[#666A6D]">
            {summary.product} · {summary.variant}
          </p>
        </div>

        <div className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full p-4 sm:p-6 overflow-y-auto">
        <section className={`preflight-card rounded-2xl border p-4 ${status.className}`}>
          <div className="flex items-start gap-3">
            {hasErrors || hasWarnings ? (
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div>
              <h2 className="text-sm font-bold">{status.title}</h2>
              <p className="mt-1 text-xs">{status.description}</p>
            </div>
          </div>
        </section>

        <div className="mt-4 space-y-3">
          {issues.map((check) => (
            <article
              key={check.id}
              className="preflight-card rounded-2xl border border-[#F2DFA0] bg-[#FFFDF8] p-4 shadow-xs"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#A86E22]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm font-semibold text-[#2E3338]">{check.label}</h3>
                  {check.description && (
                    <p className="mt-1 text-[11px] text-[#666A6D]">{check.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onFix
                      ? onFix(check)
                      : onBackToEdit(check.category === 'image' ? 'image' : undefined)
                  }
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#DCEBF4]/60 px-2 py-1 text-xs font-semibold text-[#315F86] hover:bg-[#DCEBF4]"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sửa</span>
                </button>
              </div>
            </article>
          ))}

          {preflight.passCount > 0 && (
            <div className="rounded-xl border border-[#DDD6CC] bg-[#F8F3E8]/40 p-3 flex items-center gap-2.5 text-xs text-[#5F7E67] font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{preflight.passCount} kiểm tra đã đạt tiêu chuẩn</span>
            </div>
          )}

          <div className="text-[11px] text-[#666A6D] text-center p-2 rounded-lg bg-[#F8F3E8]/30 border border-dashed border-[#DDD6CC]">
            Kiểm tra lại chữ, tên, ngày tháng và thông tin quan trọng trước khi đặt in.
          </div>
        </div>
      </main>

      <footer className="p-4 border-t border-[#DDD6CC] bg-[#FFFDF8] max-w-lg mx-auto w-full flex items-center gap-3">
        <button
          type="button"
          onClick={() => onBackToEdit()}
          className="flex-1 h-11 inline-flex items-center justify-center rounded-xl border border-[#DDD6CC] bg-white text-xs sm:text-sm font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
        >
          Quay lại sửa
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={onContinueToCheckout}
            disabled={hasErrors}
            className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {continueLabel ? <span>{continueLabel}</span> : <span>Tiếp tục đặt in</span>}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </footer>
    </div>
  );
}
