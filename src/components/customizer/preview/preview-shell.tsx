'use client';

import { ArrowLeft } from 'lucide-react';
import type { PreviewShellProps } from './preview-types';

export function PreviewShell({
  productTitle,
  variantTitle,
  activeView,
  availableViews,
  onViewChange,
  onBackToEdit,
  onDoneToPreflight,
  children,
}: PreviewShellProps) {
  const subtitle = variantTitle ? `${productTitle} · ${variantTitle}` : productTitle;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F8F3E8] text-[#2E3338]">
      <header className="flex min-h-[64px] items-center justify-between border-b border-[#DDD6CC] bg-[#FFFDF8] px-4 py-2 sm:px-6">
        <button
          type="button"
          onClick={onBackToEdit}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#2E3338] transition-colors hover:bg-[#F8F3E8] sm:text-sm"
          aria-label="Tiếp tục chỉnh"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Tiếp tục chỉnh</span>
        </button>

        <div className="text-center">
          <h1 className="font-serif text-sm font-bold text-[#2E3338] sm:text-base">Xem thử</h1>
          <p className="text-[11px] text-[#666A6D]">{subtitle}</p>
        </div>

        <div className="w-10 sm:w-28" aria-hidden="true" />
      </header>

      {availableViews && availableViews.length > 1 && (
        <nav
          aria-label="Chọn góc xem"
          className="flex justify-center border-b border-[#DDD6CC] bg-[#FFFDF8] px-4 py-2"
        >
          <div className="inline-flex rounded-full border border-[#DDD6CC] bg-[#F8F3E8] p-1">
            {availableViews.map((view) => {
              const isActive = activeView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => onViewChange?.(view.id)}
                  aria-pressed={isActive}
                  className={`rounded-full px-3 py-1.5 text-xs transition-colors ${isActive
                    ? 'bg-white shadow-xs text-[#2E3338] font-semibold'
                    : 'text-[#666A6D] hover:text-[#2E3338]'
                    }`}
                >
                  {view.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main className="flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-8">
        {children}
      </main>

      <footer className="flex w-full gap-3 border-t border-[#DDD6CC] bg-[#FFFDF8] p-4 sm:px-6">
        <button
          type="button"
          onClick={onBackToEdit}
          className="h-11 flex-1 rounded-xl border border-[#DDD6CC] bg-white text-xs font-semibold text-[#2E3338] transition-colors hover:bg-[#F8F3E8] sm:text-sm"
        >
          Tiếp tục chỉnh
        </button>
        <button
          type="button"
          onClick={onDoneToPreflight}
          className="h-11 flex-1 rounded-xl bg-[#315F86] text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#244A69] sm:text-sm"
        >
          Xong
        </button>
      </footer>
    </div>
  );
}
