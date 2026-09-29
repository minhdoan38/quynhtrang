'use client';

import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, Check, Sparkles, PenTool, Layout, FileText, Smartphone, Scissors } from 'lucide-react';
import { PRODUCTS, type ProductId, type WrappingPaperMode, type FixedStickerShape } from '@/lib/product-state';

interface ProductSetupProps {
 productId: ProductId;
 variantId: string;
 onSelectVariant: (variantId: string) => void;
 onStartWithTemplate: () => void;
 onStartBlank: (modeOrShape?: WrappingPaperMode | FixedStickerShape) => void;
 onBack: () => void;
}

const PRODUCT_TAGLINES: Record<ProductId, string> = {
 wrapping: 'Giấy gói quà cao cấp',
 card: 'Thiệp gập lời chúc ý nghĩa',
 sticker: 'Nhãn dán chống nước sắc nét',
 notebook: 'Bìa sổ tay cá nhân hóa',
};

function getVariantVisualIcon(productId: ProductId, variantId: string) {
 if (productId === 'wrapping') {
  return <FileText className="w-5 h-5 text-[#315F86]" aria-hidden="true" />;
 }
 if (productId === 'card') {
  return variantId === 'horizontal' ? (
   <div className="w-6 h-4 border-2 border-[#315F86] rounded-xs flex items-center justify-center">
    <span className="w-0.5 h-full bg-[#315F86]/40" />
   </div>
  ) : (
   <div className="w-4 h-6 border-2 border-[#315F86] rounded-xs flex flex-col items-center justify-center">
    <span className="w-full h-0.5 bg-[#315F86]/40" />
   </div>
  );
 }
 if (productId === 'sticker') {
  if (variantId === 'die-cut') {
   return <Scissors className="w-5 h-5 text-[#315F86]" aria-hidden="true" />;
  }
  if (variantId === 'phone') {
   return <Smartphone className="w-5 h-5 text-[#315F86]" aria-hidden="true" />;
  }
  return <Layout className="w-5 h-5 text-[#315F86]" aria-hidden="true" />;
 }
 return <Layout className="w-5 h-5 text-[#315F86]" aria-hidden="true" />;
}

export function ProductSetup({
 productId,
 variantId,
 onSelectVariant,
 onStartWithTemplate,
 onStartBlank,
 onBack,
}: ProductSetupProps) {
 const containerRef = useRef<HTMLDivElement>(null);
 const [showModePicker, setShowModePicker] = useState(false);
 const [showStickerShapePicker, setShowStickerShapePicker] = useState(false);
 const product = PRODUCTS[productId] ?? PRODUCTS.wrapping;
 const hasMultipleVariants = product.variants.length > 1;

 useGSAP(
  () => {
   const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   if (reduceMotion) return;

   gsap.fromTo(
    '.setup-animate',
    { y: 16, autoAlpha: 0 },
    {
     y: 0,
     autoAlpha: 1,
     duration: 0.45,
     stagger: 0.06,
     ease: 'power2.out',
    }
   );
  },
  { scope: containerRef, dependencies: [productId] }
 );

 return (
  <div ref={containerRef} className="min-h-screen bg-[#F8F3E8] pb-16">
   {/* Header */}
   <header className="sticky top-0 z-30 border-b border-[#ECE6DC] bg-[#FFFDF8]/90 backdrop-blur px-4 py-3">
    <div className="max-w-xl mx-auto flex items-center justify-between">
     <button
      type="button"
      onClick={onBack}
      data-action="back-to-launcher"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#666A6D] hover:text-[#2E3338] transition-colors py-1.5 px-2 rounded-md hover:bg-[#F8F3E8]"
     >
      <ArrowLeft className="w-4 h-4" />
      <span>Chọn sản phẩm khác</span>
     </button>
     <span className="text-xs font-medium text-[#666A6D]">Bước 1 / 2</span>
    </div>
   </header>

   <main className="max-w-xl mx-auto px-4 py-6 sm:py-8 space-y-6">
    {/* Product Identity */}
    <section className="setup-animate text-center space-y-1">
     <p className="text-xs font-semibold tracking-wider uppercase text-[#315F86]">
      {PRODUCT_TAGLINES[productId]}
     </p>
     <h1 className="text-2xl sm:text-3xl font-bold text-[#2E3338] tracking-tight">
      {product.name}
     </h1>
    </section>

    {/* Section 1: Variant Selection (Hidden if only 1 variant available, e.g. Notebook) */}
    {hasMultipleVariants && (
     <section className="setup-animate space-y-3">
      <div className="flex items-center justify-between">
       <h2 className="text-xs font-bold uppercase tracking-wider text-[#666A6D]">
        1. Chọn quy cách / khổ
       </h2>
       <span className="text-[11px] text-[#666A6D]">Nhấn để chọn</span>
      </div>

      <div
       id="variant-options"
       role="radiogroup"
       aria-label="Chọn quy cách sản phẩm"
       className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
      >
       {product.variants.map((v) => {
        const isSelected = v.id === variantId;
        return (
         <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={isSelected}
          data-action="select-variant"
          data-variant-id={v.id}
          onClick={() => onSelectVariant(v.id)}
          className={`relative w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between gap-3 min-h-[58px] ${isSelected
           ? 'border-[#315F86] bg-[#DCEBF4]/40 shadow-xs ring-1 ring-[#315F86]'
           : 'border-[#DDD6CC] bg-white hover:border-[#666A6D]/40 hover:bg-[#FFFDF8]'
           }`}
         >
          <div className="flex items-center gap-3">
           <div className="p-2 rounded-lg bg-[#F8F3E8] shrink-0">
            {getVariantVisualIcon(productId, v.id)}
           </div>
           <div>
            <div className="text-sm font-bold text-[#2E3338]">{v.name}</div>
           </div>
          </div>

          <div
           className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${isSelected
            ? 'border-[#315F86] bg-[#315F86] text-white'
            : 'border-[#DDD6CC] bg-white'
            }`}
          >
           {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
          </div>
         </button>
        );
       })}
      </div>
     </section>
    )}

    {/* Section 2: "Bạn muốn bắt đầu thế nào?" */}
    <section className="setup-animate space-y-3 pt-2">
     <h2 className="text-xs font-bold uppercase tracking-wider text-[#666A6D]">
      {hasMultipleVariants ? '2. Cách bạn muốn bắt đầu' : 'Cách bạn muốn bắt đầu'}
     </h2>

     <div className="space-y-3">
      {/* Option A: "Chọn mẫu" (Recommended path) */}
      <div
       data-action="start-with-template"
       onClick={onStartWithTemplate}
       role="button"
       tabIndex={0}
       onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
         e.preventDefault();
         onStartWithTemplate();
        }
       }}
       className="cursor-pointer group relative p-5 rounded-2xl border-2 border-[#315F86] bg-white hover:bg-[#DCEBF4]/20 transition-all shadow-xs flex flex-col justify-between gap-4"
      >
       <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
         <div className="w-10 h-10 rounded-xl bg-[#DCEBF4] text-[#315F86] flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
         </div>
         <div>
          <div className="flex items-center gap-2">
           <h3 className="text-base font-bold text-[#2E3338]">Chọn mẫu</h3>
           <span className="px-2 py-0.5 rounded-full bg-[#315F86] text-white text-[11px] font-semibold">
            Gợi ý
           </span>
          </div>
          <p className="text-xs text-[#666A6D] mt-0.5">
           Bắt đầu nhanh với các mẫu thiết kế đẹp, chỉ cần thay chữ và ảnh
          </p>
         </div>
        </div>
       </div>

       <div className="pt-2 border-t border-[#ECE6DC] flex items-center justify-end">
        <span className="text-xs font-bold text-[#315F86] group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
         Xem các mẫu có sẵn &rarr;
        </span>
       </div>
      </div>

      <div
       data-action="start-blank"
       onClick={() => {
        if (productId === 'wrapping') {
         setShowModePicker(true);
         return;
        }
        if (productId === 'sticker' && variantId === 'fixed-shape') {
         setShowStickerShapePicker(true);
         return;
        }
        onStartBlank();
       }}
       role="button"
       tabIndex={0}
       onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
         e.preventDefault();
         if (productId === 'wrapping') {
          setShowModePicker(true);
          return;
         }
         if (productId === 'sticker' && variantId === 'fixed-shape') {
          setShowStickerShapePicker(true);
          return;
         }
         onStartBlank();
        }
       }}
       className="cursor-pointer group relative p-5 rounded-2xl border border-[#DDD6CC] bg-[#FFFDF8] hover:border-[#666A6D] hover:bg-white transition-all shadow-2xs flex flex-col justify-between gap-4"
      >
       <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
         <div className="w-10 h-10 rounded-xl bg-[#ECE6DC] text-[#666A6D] flex items-center justify-center shrink-0">
          <PenTool className="w-5 h-5" />
         </div>
         <div>
          <h3 className="text-base font-bold text-[#2E3338]">Tự thiết kế</h3>
          <p className="text-xs text-[#666A6D] mt-0.5">
           Tạo trang trắng với đúng kích thước đã chọn để thỏa sức sáng tạo
          </p>
         </div>
        </div>
       </div>

       <div className="pt-2 border-t border-[#ECE6DC] flex items-center justify-end">
        <span className="text-xs font-semibold text-[#666A6D] group-hover:text-[#2E3338] group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
         Bắt đầu trang trắng &rarr;
        </span>
       </div>
      </div>
     </div>
    </section>
   </main>

   {showModePicker && productId === 'wrapping' && (
    <div
     className="fixed inset-0 z-40 flex items-end justify-center bg-[#2E3338]/35 p-4 sm:items-center"
     role="dialog"
     aria-modal="true"
     aria-labelledby="wrapping-mode-picker-title"
    >
     <div className="w-full max-w-xl rounded-2xl border border-[#DDD6CC] bg-[#FFFDF8] p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4">
       <div>
        <h2 id="wrapping-mode-picker-title" className="text-lg font-bold text-[#2E3338]">
         Bạn muốn thiết kế kiểu nào?
        </h2>
        <p className="mt-1 text-xs text-[#666A6D]">Chọn cách phù hợp với ý tưởng của bạn.</p>
       </div>
       <button
        type="button"
        onClick={() => setShowModePicker(false)}
        className="rounded-lg px-2 py-1 text-sm font-semibold text-[#666A6D] hover:bg-[#F8F3E8]"
        aria-label="Đóng"
       >
        ×
       </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
       {([
        {
         mode: 'pattern' as const,
         title: 'Lặp họa tiết',
         description: 'Thiết kế một cụm và lặp lại trên toàn bộ giấy.',
        },
        {
         mode: 'full-sheet' as const,
         title: 'Toàn tờ',
         description: 'Thiết kế trực tiếp trên toàn bộ tờ giấy.',
        },
       ]).map((choice) => (
        <button
         key={choice.mode}
         type="button"
         data-mode={choice.mode}
         onClick={() => {
          console.log('wrapping_mode_selected', { mode: choice.mode });
          if (choice.mode === 'full-sheet') {
           console.log('wrapping_full_sheet_started');
          }
          setShowModePicker(false);
          onStartBlank(choice.mode);
         }}
         className="rounded-xl border-2 border-[#DDD6CC] bg-white p-4 text-left transition-colors hover:border-[#315F86] hover:bg-[#DCEBF4]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
         <span className="block text-sm font-bold text-[#2E3338]">{choice.title}</span>
         <span className="mt-1 block text-xs leading-5 text-[#666A6D]">{choice.description}</span>
        </button>
       ))}
      </div>
     </div>
    </div>
   )}

   {showStickerShapePicker && productId === 'sticker' && (
    <div
     className="fixed inset-0 z-40 flex items-end justify-center bg-[#2E3338]/35 p-4 sm:items-center"
     role="dialog"
     aria-modal="true"
     aria-labelledby="sticker-shape-picker-title"
    >
     <div className="w-full max-w-xl rounded-2xl border border-[#DDD6CC] bg-[#FFFDF8] p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4">
       <div>
        <h2 id="sticker-shape-picker-title" className="text-lg font-bold text-[#2E3338]">
         Bạn muốn sticker hình gì?
        </h2>
        <p className="mt-1 text-xs text-[#666A6D]">Chọn hình dạng phù hợp cho nhãn dán của bạn.</p>
       </div>
       <button
        type="button"
        onClick={() => setShowStickerShapePicker(false)}
        className="rounded-lg px-2 py-1 text-sm font-semibold text-[#666A6D] hover:bg-[#F8F3E8]"
        aria-label="Đóng"
       >
        ×
       </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
       {([
        {
         shape: 'circle' as const,
         label: 'Tròn',
         previewClass: 'w-8 h-8 border-2 border-current rounded-full',
        },
        {
         shape: 'square' as const,
         label: 'Vuông',
         previewClass: 'w-8 h-8 border-2 border-current rounded-none',
        },
        {
         shape: 'rectangle' as const,
         label: 'Chữ nhật',
         previewClass: 'w-10 h-7 border-2 border-current rounded-none',
        },
        {
         shape: 'oval' as const,
         label: 'Oval',
         previewClass: 'w-10 h-7 border-2 border-current rounded-[50%]',
        },
        {
         shape: 'rounded-rectangle' as const,
         label: 'Bo góc',
         previewClass: 'w-10 h-7 border-2 border-current rounded-lg',
        },
       ]).map((choice) => (
        <button
         key={choice.shape}
         type="button"
         data-shape={choice.shape}
         onClick={() => {
          setShowStickerShapePicker(false);
          onStartBlank(choice.shape);
         }}
         className="rounded-xl border-2 border-[#DDD6CC] bg-white p-3.5 text-center transition-colors hover:border-[#315F86] hover:bg-[#DCEBF4]/20 flex flex-col items-center justify-center gap-2 text-[#315F86] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
         <div className="flex h-10 items-center justify-center text-[#315F86]">
          <span className={choice.previewClass} />
         </div>
         <span className="text-sm font-bold text-[#2E3338]">{choice.label}</span>
        </button>
       ))}
      </div>
     </div>
    </div>
   )}
  </div>
 );
}
