'use client';

import { useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { getAllCatalogProducts, type CatalogProduct } from '@/lib/product-catalog';
import { PRODUCTS, type ProductId } from '@/lib/product-state';
import { DesignCanvas } from '@/components/customizer/design-canvas';
import { Card } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';

function ProductMockupIllustration({ productId }: { productId: ProductId }) {
  const product = PRODUCTS[productId];
  const defaultOptions = (product?.defaultOptions || {}) as Record<string, unknown>;

  if (productId === 'wrapping') {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#F7E9B7] p-2.5">
        <div className="pointer-events-none h-24 w-32 shadow-[0_6px_16px_rgba(52,51,56,0.12)] rotate-[-2deg] rounded-sm overflow-hidden border border-[#DED7CD] bg-[#FFFDF8]">
          <DesignCanvas
            productId="wrapping"
            text=""
            color="#315F86"
            backgroundColor="#FFFDF8"
            image={null}
            productOptions={defaultOptions}
            isMockup
          />
        </div>
      </div>
    );
  }

  if (productId === 'card') {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#F4DCE2] p-2.5">
        <div className="pointer-events-none h-22 w-28 shadow-[0_8px_18px_rgba(52,51,56,0.14)] [perspective:800px] [transform:rotateY(-12deg)_rotate(-2deg)] rounded-sm overflow-hidden border border-[#DED7CD] bg-[#FFFDF8]">
          <DesignCanvas
            productId="card"
            text="Gửi yêu thương"
            color="#315F86"
            backgroundColor="#FFFDF8"
            image={null}
            productOptions={defaultOptions}
            isMockup
          />
        </div>
      </div>
    );
  }

  if (productId === 'sticker') {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#DDECF2] p-2.5">
        <div className="pointer-events-none h-22 w-22 shadow-[0_6px_14px_rgba(52,51,56,0.12)] rotate-[6deg] rounded-2xl overflow-hidden border border-[#DED7CD] bg-[#FFFDF8]">
          <DesignCanvas
            productId="sticker"
            text=""
            color="#315F86"
            backgroundColor="#FFFDF8"
            image={null}
            productOptions={defaultOptions}
            isMockup
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#DCE7D8] p-2.5">
      <div className="pointer-events-none h-26 w-20 shadow-[0_8px_18px_rgba(52,51,56,0.14)] rotate-[3deg] rounded-xs overflow-hidden border border-[#DED7CD] bg-[#FFFDF8]">
        <DesignCanvas
          productId="notebook"
          text=""
          color="#315F86"
          backgroundColor="#FFFDF8"
          image={null}
          productOptions={defaultOptions}
          isMockup
        />
      </div>
    </div>
  );
}

function ProductCardItem({ product }: { product: CatalogProduct }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]/40"
      aria-label={`${product.cardTitle}, ${product.variantSummary}`}
    >
      <Card className="product-card overflow-hidden rounded-[16px] border border-[#EBE5DC] bg-white shadow-[0_2px_8px_rgba(52,51,56,0.04)] transition-all duration-200 group-hover:border-[#DED7CD] group-hover:shadow-[0_8px_20px_rgba(52,51,56,0.08)] group-active:scale-[0.985]">
        {/* Mockup Container */}
        <AspectRatio ratio={4 / 3}>
          <ProductMockupIllustration productId={product.id} />
        </AspectRatio>

        {/* Card Copy */}
        <div className="p-3.5 pt-3">
          <h2 className="font-serif text-base sm:text-lg font-bold text-[#343338] leading-tight group-hover:text-[#315F86] transition-colors">
            {product.cardTitle}
          </h2>
          <div className="mt-1 flex items-center justify-between text-xs text-[#71706F]">
            <span className="truncate pr-1">{product.variantSummary}</span>
            <ArrowUpRight
              size={14}
              className="shrink-0 text-[#315F86] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden="true"
            />
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function ProductsCatalogView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const products = getAllCatalogProducts();

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      gsap.fromTo(
        '.stagger-product-item',
        { y: reduceMotion ? 0 : 14, autoAlpha: reduceMotion ? 1 : 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: reduceMotion ? 0 : 0.5,
          stagger: reduceMotion ? 0 : 0.06,
          ease: 'power3.out',
        }
      );
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#FFFDF8] text-[#343338] font-sans pb-16"
    >
      {/* 1. Header with back link to launcher */}
      <header className="sticky top-0 z-30 border-b border-[#EBE5DC] bg-[#FFFDF8]/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg py-1.5 pr-2.5 text-sm font-semibold text-[#343338] hover:text-[#315F86] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]/30"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Sản phẩm</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-6 sm:pt-8">
        {/* 2. Soft Paper Studio Title */}
        <section className="mb-6 sm:mb-8">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#343338] leading-tight">
            Chọn món bạn muốn
            <br />
            tự thiết kế
          </h1>
        </section>

        {/* 3. 2-column mobile, 4-column desktop product grid */}
        <section
          aria-labelledby="product-grid-heading"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
        >
          <h2 id="product-grid-heading" className="sr-only">
            Danh sách sản phẩm in ấn
          </h2>
          {products.map((product) => (
            <div key={product.id} className="stagger-product-item">
              <ProductCardItem product={product} />
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
