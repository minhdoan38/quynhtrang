'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, Search, Plus, X, Sparkles, AlertCircle } from 'lucide-react';
import type { CatalogProduct } from '@/lib/product-catalog';
import type { ProductId } from '@/lib/product-state';
import type { TemplateCard } from '@/lib/domain/template';
import { useTemplateCatalog } from '@/lib/use-template-catalog';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ResponsiveTemplatePreview } from './responsive-template-preview';

interface ProductDetailCatalogViewProps {
  product: CatalogProduct;
}

const HEADER_TINTS: Record<ProductId, string> = {
  wrapping: 'bg-[#FDF8E8]',
  card: 'bg-[#FCF0F3]',
  sticker: 'bg-[#F2F7FA]',
  notebook: 'bg-[#F3F7F2]',
};

const SEARCH_PLACEHOLDERS: Record<ProductId, string> = {
  wrapping: 'Tìm mẫu giấy gói...',
  card: 'Tìm mẫu thiệp...',
  sticker: 'Tìm mẫu sticker...',
  notebook: 'Tìm mẫu bìa vở...',
};

const VARIANT_FILTER_LABELS: Record<string, string> = {
  a1: 'A1',
  a2: 'A2',
  horizontal: 'Ngang',
  vertical: 'Đứng',
  'die-cut': 'Cắt rời',
  phone: 'Ốp lưng',
  'fixed-shape': 'Hình dạng có sẵn',
  standard: 'Tiêu chuẩn',
};

const MOOD_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'birthday', label: 'Sinh nhật' },
  { id: 'cute', label: 'Dễ thương' },
  { id: 'floral', label: 'Hoa lá' },
  { id: 'minimal', label: 'Tối giản' },
  { id: 'love', label: 'Tình yêu' },
  { id: 'thanks', label: 'Cảm ơn' },
  { id: 'vintage', label: 'Cổ điển' },
  { id: 'modern', label: 'Hiện đại' },
];

function getTemplateAspectRatio(productId: ProductId, variantId: string): number {
  if (productId === 'card') {
    return variantId === 'vertical' ? 3 / 4 : 4 / 3;
  }
  if (productId === 'notebook') {
    return 3 / 4;
  }
  if (productId === 'wrapping') {
    return 4 / 5;
  }
  return 1;
}

export function ProductDetailCatalogView({ product }: ProductDetailCatalogViewProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // 1. Filter state
  const [selectedVariantId, setSelectedVariantId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 2. Responsive preview drawer/dialog state
  const [previewItem, setPreviewItem] = useState<TemplateCard | null>(null);

  // 3. Database catalog hook
  const {
    items: templates,
    isLoading,
    error,
    reload,
  } = useTemplateCatalog({
    productId: product.id,
    variantId: selectedVariantId !== 'all' ? selectedVariantId : undefined,
    categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
    query: searchQuery,
  });

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      gsap.fromTo(
        '.template-card-cell',
        { y: reduceMotion ? 0 : 12, autoAlpha: reduceMotion ? 1 : 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: reduceMotion ? 0 : 0.4,
          stagger: reduceMotion ? 0 : 0.03,
          ease: 'power2.out',
        },
      );
    },
    { dependencies: [templates, selectedVariantId, selectedCategory, searchQuery], scope: gridRef },
  );

  const startWithBlank = () => {
    const targetVariant =
      selectedVariantId !== 'all' ? selectedVariantId : product.variants[0].id;
    router.push(`/?product=${product.id}&variant=${targetVariant}&template=blank&view=editor`);
  };

  const applyTemplate = (templateId: string) => {
    const targetVariant =
      selectedVariantId !== 'all' ? selectedVariantId : product.variants[0].id;
    router.push(
      `/?product=${product.id}&variant=${targetVariant}&template=${templateId}&view=editor`,
    );
  };

  const headerBgClass = HEADER_TINTS[product.id] || 'bg-[#F8F1E5]';
  const ratio = getTemplateAspectRatio(product.id, selectedVariantId);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#FFFDF8] text-[#343338] font-sans pb-20"
    >
      {/* 1. Header with Back button + large title + short description */}
      <section className={`border-b border-[#EBE5DC] ${headerBgClass} px-4 py-5 sm:py-8`}>
        <div className="mx-auto max-w-4xl">
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2.5 text-xs font-semibold text-[#71706F] hover:text-[#343338] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]/30"
            aria-label="Quay lại danh mục sản phẩm"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Sản phẩm</span>
          </Link>

          <h1 className="mt-3 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#343338] leading-tight">
            {product.cardTitle}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#71706F] max-w-lg leading-relaxed">
            {product.tagline}
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-4xl px-4 pt-4 sm:pt-6 space-y-4">
        {/* 2. Variant Filter: using shadcn ToggleGroup */}
        {product.variants.length > 1 && (
          <div className="space-y-1.5">
            <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ToggleGroup
                type="single"
                value={selectedVariantId}
                onValueChange={(val) => {
                  if (val) setSelectedVariantId(val);
                }}
                className="inline-flex gap-1.5"
              >
                <ToggleGroupItem value="all" size="sm">
                  Tất cả
                </ToggleGroupItem>
                {product.variants.map((v) => (
                  <ToggleGroupItem key={v.id} value={v.id} size="sm">
                    {VARIANT_FILTER_LABELS[v.id] || v.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        )}

        {/* 3. Search Bar */}
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#71706F]"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={SEARCH_PLACEHOLDERS[product.id] || 'Tìm mẫu thiết kế...'}
            aria-label="Tìm kiếm mẫu thiết kế"
            className="h-12 w-full rounded-xl border-[#DED7CD] bg-white pl-10 pr-9 text-sm text-[#343338] placeholder:text-[#71706F] focus-visible:border-[#315F86] focus-visible:ring-2 focus-visible:ring-[#315F86]/20 shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Xóa tìm kiếm"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#71706F] hover:text-[#343338]"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 4. Mood/Category Filter */}
        <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex items-center gap-1.5">
            {MOOD_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  aria-pressed={isSelected}
                  className={`inline-flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-xs font-medium transition-all select-none ${isSelected
                      ? 'border border-[#315F86] bg-[#DCEBF4] font-semibold text-[#315F86] shadow-2xs'
                      : 'border border-[#DED7CD] bg-white text-[#343338] hover:bg-[#F8F1E5]'
                    }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error Alert (distinct from empty) */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50/70 p-6 text-center my-4">
            <AlertCircle size={28} className="mx-auto text-red-500 mb-2" />
            <p className="text-sm font-semibold text-red-800">
              Không thể tải danh sách mẫu thiết kế
            </p>
            <p className="text-xs text-red-600 mt-1 max-w-sm mx-auto">{error.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reload}
              className="mt-3 h-8 border-red-300 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Thử lại
            </Button>
          </div>
        )}

        {/* 5. Template Grid */}
        <div
          ref={gridRef}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 pt-1"
        >
          {/* Item 0: Blank Design Card (Always first) */}
          <div className="template-card-cell">
            <button
              type="button"
              onClick={startWithBlank}
              className="group flex h-full w-full flex-col justify-between overflow-hidden rounded-[14px] border-2 border-dashed border-[#DED7CD] bg-[#FFFDF8] p-3 text-center transition-all duration-200 hover:border-[#315F86] hover:bg-[#F8F1E5] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]/30"
              aria-label="Tự thiết kế từ đầu từ trang trắng"
            >
              <AspectRatio ratio={ratio}>
                <div className="flex h-full w-full flex-col items-center justify-center rounded-lg bg-[#F8F1E5]/70 p-3 transition-colors group-hover:bg-[#DCEBF4]/30">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#315F86] shadow-2xs transition-transform duration-200 group-hover:scale-105">
                    <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
                  </span>
                  <span className="mt-2.5 font-serif text-xs sm:text-sm font-bold text-[#343338]">
                    Tự thiết kế
                  </span>
                  <span className="text-xs text-[#71706F]">từ đầu</span>
                </div>
              </AspectRatio>
            </button>
          </div>

          {/* Skeletons when loading */}
          {isLoading &&
            [1, 2, 3].map((i) => (
              <div key={i} className="template-card-cell">
                <div className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[#EBE5DC] bg-white p-2 animate-pulse">
                  <AspectRatio ratio={ratio}>
                    <div className="h-full w-full rounded-lg bg-[#F8F1E5]" />
                  </AspectRatio>
                  <div className="h-4 w-3/4 bg-[#F8F1E5] rounded mt-2 mx-1" />
                </div>
              </div>
            ))}

          {/* Actual Template Cards */}
          {!isLoading &&
            templates.map((tpl) => (
              <div key={tpl.id} className="template-card-cell">
                <Card
                  onClick={() => setPreviewItem(tpl)}
                  className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[14px] border border-[#EBE5DC] bg-white p-2 shadow-[0_1px_4px_rgba(52,51,56,0.04)] transition-all duration-200 hover:border-[#DED7CD] hover:shadow-[0_6px_16px_rgba(52,51,56,0.08)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]/30"
                  tabIndex={0}
                  role="button"
                  aria-label={`Xem trước mẫu ${tpl.name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPreviewItem(tpl);
                    }
                  }}
                >
                  {/* Artwork Container with AspectRatio */}
                  <AspectRatio ratio={ratio}>
                    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-[#F8F1E5] p-1">
                      {tpl.thumbnailUrl ? (
                        <img
                          src={tpl.thumbnailUrl}
                          alt={tpl.name}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-102"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-2 text-center">
                          <Sparkles size={20} className="text-[#315F86] opacity-60 mb-1" />
                          <span className="text-[11px] font-medium text-[#71706F] line-clamp-2">
                            {tpl.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </AspectRatio>

                  {/* Template Meta */}
                  <div className="p-2 pt-2.5">
                    <h2 className="text-xs sm:text-sm font-semibold text-[#343338] truncate group-hover:text-[#315F86] transition-colors">
                      {tpl.name}
                    </h2>
                    <span className="text-xs text-[#71706F] capitalize">
                      {tpl.categoryId || 'Mẫu thiết kế'}
                    </span>
                  </div>
                </Card>
              </div>
            ))}
        </div>

        {/* 6. Empty State */}
        {!isLoading && !error && templates.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#DED7CD] bg-[#F8F1E5]/60 p-8 sm:p-12 text-center my-6">
            <h2 className="font-serif text-base sm:text-lg font-bold text-[#343338]">
              Không tìm thấy mẫu phù hợp
            </h2>
            <p className="mt-1 text-xs text-[#71706F]">Thử đổi từ khóa hoặc bộ lọc.</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedVariantId('all');
                }}
                className="h-9 rounded-xl border-[#DED7CD] bg-white text-xs font-semibold text-[#343338] hover:bg-[#F8F1E5]"
              >
                Xóa bộ lọc
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* 7. Responsive Template Preview: Drawer on mobile, Dialog on desktop */}
      <ResponsiveTemplatePreview
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
        templateItem={previewItem}
        product={product}
        selectedVariantId={selectedVariantId}
        onApply={applyTemplate}
      />
    </div>
  );
}

// ponytail: basic catalog detail layout with lazy cards → skipped: virtualization windowing, add when > 200 templates on a single product.
