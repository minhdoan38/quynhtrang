'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, Search, Sparkles, X, Check } from 'lucide-react';
import {
  type ProductId,
  type TemplateCategory,
  type TemplateConfig,
  PRODUCTS,
  getCompatibleTemplates,
} from '@/lib/product-state';
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
  const [previewItem, setPreviewItem] = useState<{ id: string; template: TemplateConfig } | null>(null);

  const handleBack = useCallback(() => {
    if (previewItem !== null) {
      setPreviewItem(null);
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

  const product = PRODUCTS[productId];
  const variant = product?.variants.find((v) => v.id === variantId) ?? product?.variants[0];

  const templates = useMemo(() => {
    return getCompatibleTemplates({
      productId,
      variantId,
      category: selectedCategory,
      searchQuery,
    });
  }, [productId, variantId, selectedCategory, searchQuery]);

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
            }
          );
        }
      );

      return () => mm.revert();
    },
    { dependencies: [selectedCategory, searchQuery, productId, variantId], scope: gridRef }
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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#666A6D] hover:text-[#2E3338]"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 3. Lightweight Horizontal Category Chips */}
        <nav aria-label="Danh mục mẫu" className="mb-5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  aria-pressed={active}
                  className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3.5 text-xs font-medium transition-all ${active
                    ? 'bg-[#315F86] text-white shadow-xs'
                    : 'bg-[#F8F3E8] text-[#2E3338] hover:bg-[#ECE6DC]'
                    }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* 4. Visual Template Grid (2 columns on mobile, large thumbnails, minimal metadata) */}
        <div ref={gridRef}>
          {templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#DDD6CC] bg-[#F8F3E8]/60 p-8 text-center">
              <Sparkles size={24} className="mx-auto text-[#666A6D] mb-2" aria-hidden="true" />
              <p className="text-sm font-semibold text-[#2E3338]">Không tìm thấy mẫu phù hợp</p>
              <p className="mt-1 text-xs text-[#666A6D]">
                Thử đổi từ khóa hoặc chọn danh mục khác nhé.
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
              {templates.map(({ id, template }) => {
                const previewOptions = {
                  ...(template.productOptions[productId] || {}),
                };

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreviewItem({ id, template })}
                    className="template-card group flex flex-col overflow-hidden rounded-2xl border border-[#DDD6CC] bg-white p-2 text-left shadow-xs transition-all hover:border-[#315F86] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86] active:scale-[0.98]"
                  >
                    {/* Thumbnail container */}
                    <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-[#F8F3E8]">
                      <div className="scale-75 transform transition-transform group-hover:scale-80">
                        <DesignCanvas
                          productId={productId}
                          text={template.text}
                          color={template.color}
                          backgroundColor={template.backgroundColor}
                          image={null}
                          productOptions={previewOptions}
                        />
                      </div>
                    </div>

                    {/* Minimal metadata: name only */}
                    <div className="px-1.5 py-2">
                      <span className="block truncate text-xs sm:text-sm font-semibold text-[#2E3338]">
                        {template.name}
                      </span>
                    </div>
                  </button>
                );
              })}
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
                  {previewItem.template.name}
                </h2>
                <p className="text-xs text-[#666A6D]">
                  {product?.name} · {variant?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                aria-label="Đóng xem trước"
                className="rounded-lg p-2 text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body: Large preview */}
            <div className="flex flex-1 flex-col items-center justify-center bg-[#F8F3E8] p-6 min-h-[260px]">
              <div className="scale-90 transform sm:scale-100">
                <DesignCanvas
                  productId={productId}
                  text={previewItem.template.text}
                  color={previewItem.template.color}
                  backgroundColor={previewItem.template.backgroundColor}
                  image={null}
                  productOptions={previewItem.template.productOptions[productId] || {}}
                />
              </div>
              {previewItem.template.previewHint && (
                <p className="mt-4 text-center text-xs text-[#666A6D]">
                  {previewItem.template.previewHint}
                </p>
              )}
            </div>

            {/* Modal footer: Single primary CTA */}
            <div className="border-t border-[#ECE6DC] p-4 bg-white">
              <button
                type="button"
                onClick={() => {
                  const selectedId = previewItem.id;
                  setPreviewItem(null);
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
