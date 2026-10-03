'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, Search, Sparkles, X, Check, AlertCircle } from 'lucide-react';
import {
  type ProductId,
  type TemplateCategory,
  PRODUCTS,
} from '@/lib/product-state';
import type { TemplateCard, TemplateVersionPayload } from '@/lib/domain/template';
import { useTemplateCatalog } from '@/lib/use-template-catalog';
import { DesignCanvas } from './design-canvas';

interface TemplateBrowserProps {
  productId: ProductId;
  variantId: string;
  onBack: () => void;
  onApplyTemplate: (templateId: string) => void;
}

const CATEGORIES: Array<{ id: TemplateCategory; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'birthday', label: 'Sinh nhật' },
  { id: 'cute', label: 'Cute' },
  { id: 'floral', label: 'Hoa' },
  { id: 'minimal', label: 'Tối giản' },
  { id: 'love', label: 'Tình yêu' },
  { id: 'thanks', label: 'Cảm ơn' },
];

export function TemplateBrowser({
  productId,
  variantId,
  onBack,
  onApplyTemplate,
}: TemplateBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('all');
  const [previewItem, setPreviewItem] = useState<TemplateCard | null>(null);
  const [previewPayload, setPreviewPayload] = useState<TemplateVersionPayload | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const {
    items: templates,
    isLoading,
    error,
    reload,
  } = useTemplateCatalog({
    productId,
    variantId: variantId !== 'all' ? variantId : undefined,
    categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
    query: searchQuery,
  });

  const handleBack = useCallback(() => {
    if (previewItem !== null) {
      setPreviewItem(null);
      setPreviewPayload(null);
      return;
    }
    onBack();
  }, [previewItem, onBack]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBack]);

  // Lazy-load version payload when previewItem opens
  useEffect(() => {
    if (!previewItem?.currentVersionId) {
      setPreviewPayload(null);
      return;
    }

    let isMounted = true;
    setIsLoadingPreview(true);

    fetch(`/api/templates/versions/${previewItem.currentVersionId}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Không thể tải chi tiết phiên bản mẫu');
        }
        return res.json() as Promise<TemplateVersionPayload>;
      })
      .then((data) => {
        if (isMounted) {
          setPreviewPayload(data);
          setIsLoadingPreview(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoadingPreview(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [previewItem]);

  const product = PRODUCTS[productId];
  const variant = product?.variants.find((v) => v.id === variantId) ?? product?.variants[0];

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (context) => {
          const { reduceMotion } = (context.conditions ?? {}) as { reduceMotion?: boolean };

          if (reduceMotion) {
            gsap.set('.template-card', { opacity: 1, y: 0 });
            return;
          }

          gsap.fromTo(
            '.template-card',
            { opacity: 0, y: 14 },
            {
              opacity: 1,
              y: 0,
              duration: 0.35,
              stagger: 0.04,
              ease: 'power2.out',
              clearProps: 'transform',
            },
          );
        },
      );

      return () => mm.revert();
    },
    { dependencies: [templates, selectedCategory, searchQuery, productId, variantId], scope: gridRef },
  );

  return (
    <div ref={containerRef} className="min-h-screen bg-[#FFFDF8] text-[#2E3338] pb-16">
      {/* 1. Simple Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#DDD6CC] bg-[#FFFDF8]/90 px-4 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={handleBack}
          data-action="template-back"
          aria-label="Quay lại"
          className="inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#2E3338] transition-colors hover:bg-[#F8F3E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span>Quay lại</span>
        </button>

        <div className="text-center">
          <h1 className="font-serif text-lg font-bold tracking-tight text-[#2E3338]">
            Chọn mẫu
          </h1>
          <p className="text-xs text-[#666A6D]">
            {product?.name} · {variant?.name}
          </p>
        </div>

        <div className="w-16" aria-hidden="true" />
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4">
        {/* 2. Search Input */}
        <div className="relative mb-3">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#666A6D]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm mẫu..."
            aria-label="Tìm mẫu thiết kế"
            className="h-11 w-full rounded-xl border border-[#DDD6CC] bg-white pl-10 pr-9 text-sm text-[#2E3338] placeholder:text-[#666A6D] focus:border-[#315F86] focus:outline-none focus:ring-2 focus:ring-[#315F86]/20 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Xóa tìm kiếm"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338]"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 3. Category Filter Pills */}
        <div
          role="tablist"
          aria-label="Danh mục mẫu"
          className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto pb-1"
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={isSelected}
                data-action="category-pill"
                data-category={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`inline-flex h-9 shrink-0 items-center rounded-lg px-3.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86] ${isSelected
                  ? 'bg-[#315F86] text-white shadow-xs'
                  : 'border border-[#DDD6CC] bg-white text-[#2E3338] hover:bg-[#F8F3E8]'
                  }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* 4. Template Grid / Empty / Error */}
        <div ref={gridRef}>
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center">
              <AlertCircle size={32} className="mx-auto text-red-500 mb-2" />
              <p className="text-sm font-semibold text-red-800">
                Không thể tải danh sách mẫu thiết kế
              </p>
              <p className="text-xs text-red-600 mt-1 max-w-sm mx-auto">
                {error.message}
              </p>
              <button
                type="button"
                onClick={reload}
                className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 shadow-xs"
              >
                Thử lại
              </button>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex flex-col overflow-hidden rounded-2xl border border-[#DDD6CC] bg-white p-2 animate-pulse"
                >
                  <div className="aspect-square w-full rounded-xl bg-[#F8F3E8]" />
                  <div className="h-4 w-2/3 bg-[#F8F3E8] rounded mt-2.5 mx-1" />
                </div>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#DDD6CC] bg-[#F8F3E8]/60 p-8 text-center">
              <Sparkles size={28} className="mx-auto text-[#666A6D] opacity-40 mb-2" />
              <p className="text-sm font-semibold text-[#2E3338]">
                Không tìm thấy mẫu phù hợp
              </p>
              <p className="text-xs text-[#666A6D] mt-1">
                Thử tìm với từ khóa khác hoặc chuyển sang danh mục khác.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-[#DDD6CC] bg-white px-3 text-xs font-semibold text-[#2E3338] hover:bg-[#F8F3E8]"
              >
                Xem tất cả mẫu
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setPreviewItem(tpl)}
                  className="template-card group flex flex-col overflow-hidden rounded-2xl border border-[#DDD6CC] bg-white p-2 text-left shadow-xs transition-all hover:border-[#315F86] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86] active:scale-[0.98]"
                >
                  <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-[#F8F3E8]">
                    {tpl.thumbnailUrl ? (
                      <img
                        src={tpl.thumbnailUrl}
                        alt={tpl.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-102"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-3 text-center">
                        <Sparkles size={22} className="text-[#315F86] opacity-60 mb-1" />
                        <span className="text-[11px] font-medium text-[#666A6D] line-clamp-2">
                          {tpl.name}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="px-1.5 py-2">
                    <span className="block truncate text-xs sm:text-sm font-semibold text-[#2E3338]">
                      {tpl.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 5. Template Preview Modal with Single Primary CTA: 'Dùng mẫu này' */}
      {previewItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[#DDD6CC] bg-[#FFFDF8] shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[#ECE6DC] px-4 py-3">
              <div>
                <h2 id="preview-title" className="font-serif text-base font-bold text-[#2E3338]">
                  {previewItem.name}
                </h2>
                <p className="text-xs text-[#666A6D]">
                  {product?.name} · {variant?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewItem(null);
                  setPreviewPayload(null);
                }}
                aria-label="Đóng xem trước"
                className="rounded-lg p-2 text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body: Large preview */}
            <div className="flex flex-1 flex-col items-center justify-center bg-[#F8F3E8] p-6 min-h-[260px]">
              {isLoadingPreview ? (
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#315F86] border-t-transparent" />
                  <span className="text-xs text-[#666A6D]">Đang tải mẫu thiết kế...</span>
                </div>
              ) : previewItem.thumbnailUrl ? (
                <img
                  src={previewItem.thumbnailUrl}
                  alt={previewItem.name}
                  className="max-h-[280px] w-full rounded-xl object-contain shadow-sm"
                />
              ) : (
                <div className="scale-90 transform sm:scale-100">
                  <DesignCanvas
                    productId={productId}
                    text={previewPayload?.document?.text ?? previewItem.name}
                    color={previewPayload?.document?.color ?? '#2E3338'}
                    backgroundColor={previewPayload?.document?.backgroundColor ?? '#FFFFFF'}
                    image={previewPayload?.document?.image ?? null}
                    productOptions={previewPayload?.document?.productOptions ?? {}}
                  />
                </div>
              )}
            </div>

            {/* Modal footer: Single primary CTA */}
            <div className="border-t border-[#ECE6DC] p-4 bg-white">
              <button
                type="button"
                onClick={() => {
                  const selectedId = previewItem.id;
                  setPreviewItem(null);
                  setPreviewPayload(null);
                  onApplyTemplate(selectedId);
                }}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#315F86] px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#244A69] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86] active:scale-[0.98]"
              >
                <Check size={18} />
                <span>Dùng mẫu này</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ponytail: basic preview dialog without 3D rotation → skipped: interactive canvas pan/zoom inside modal, add when full preview viewport is requested.
