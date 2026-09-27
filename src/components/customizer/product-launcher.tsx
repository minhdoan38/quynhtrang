'use client';

import { useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import type { DesignState, ProductId } from '@/lib/product-state';
import type { RecentProject } from '@/lib/storage';
import { PRODUCTS } from '@/lib/product-state';
import { DesignCanvas } from './design-canvas';

interface ProductLauncherProps {
  recentProjects: RecentProject[];
  onSelectProduct: (productId: ProductId) => void;
  onResumeProject: (project: RecentProject) => void;
}

const PRODUCT_DETAILS: Record<ProductId, { description: string; tone: string }> = {
  wrapping: { description: 'Gói quà mang dấu ấn riêng', tone: 'bg-[#DCEBF4]' },
  card: { description: 'Gửi lời chúc thành hình', tone: 'bg-[#F6E2E3]' },
  sticker: { description: 'Cắt theo hình bạn muốn', tone: 'bg-[#F7EBC5]' },
  notebook: { description: 'Bìa sổ kể chuyện của bạn', tone: 'bg-[#DDE8D8]' },
};

function previewState(project: RecentProject): DesignState {
  return {
    productId: project.productId,
    variantId: project.variantId,
    templateId: project.templateId,
    text: project.text,
    color: project.color,
    backgroundColor: project.backgroundColor,
    image: project.image,
    quantity: 1,
    productOptions: project.productOptions,
  };
}

function ProductCard({
  productId,
  onSelect,
}: {
  productId: ProductId;
  onSelect: (productId: ProductId) => void;
}) {
  const product = PRODUCTS[productId];
  const detail = PRODUCT_DETAILS[productId];

  return (
    <button
      type="button"
      className={`launcher-card group ${detail.tone}`}
      onClick={() => onSelect(productId)}
      aria-label={`Tạo ${product.name}`}
    >
      <span className="launcher-card__art" aria-hidden="true">
        <DesignCanvas
          productId={productId}
          text={productId === 'card' ? 'Gửi yêu thương' : ''}
          color="#315F86"
          backgroundColor={productId === 'card' ? '#FFFDF8' : '#F8F3E8'}
          image={null}
          productOptions={product.defaultOptions as Record<string, unknown>}
          isMockup
        />
        {productId === 'sticker' && <span className="launcher-card__sticker-shine" />}
      </span>
      <span className="launcher-card__copy">
        <span className="launcher-card__name">{product.name}</span>
        <span className="launcher-card__description">{detail.description}</span>
        <ArrowUpRight className="launcher-card__arrow" aria-hidden="true" strokeWidth={1.8} />
      </span>
    </button>
  );
}

export function ProductLauncher({
  recentProjects,
  onSelectProduct,
  onResumeProject,
}: ProductLauncherProps) {
  const launcherRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      gsap.fromTo(
        '.launcher-intro, .launcher-card, .recent-project',
        { y: reduceMotion ? 0 : 18, autoAlpha: reduceMotion ? 1 : 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: reduceMotion ? 0 : 0.65,
          stagger: reduceMotion ? 0 : 0.07,
          ease: 'power3.out',
        }
      );
    },
    { scope: launcherRef }
  );

  return (
    <div ref={launcherRef} className="launcher-shell">
      <header className="launcher-header">
        <div className="launcher-brand" aria-label="Quỳnh Trang">
          <span className="launcher-brand__mark"><Sparkles size={15} strokeWidth={2.2} /></span>
          <span>quỳnh trang</span>
        </div>
        <Link
          href="/products"
          className="text-xs font-semibold text-[#315F86] hover:underline px-2.5 py-1.5 rounded-lg hover:bg-[#DCEBF4]/40 transition-colors"
        >
          Xem toàn bộ danh mục & mẫu →
        </Link>
      </header>

      <main className="launcher-main">
        <section className="launcher-intro" aria-labelledby="launcher-title">
          <p className="launcher-intro__eyebrow">Bắt đầu từ điều bạn muốn làm</p>
          <h1 id="launcher-title">Bạn muốn tạo gì hôm nay?</h1>
          <p>Chọn một sản phẩm để bắt đầu thiết kế.</p>
        </section>

        <section className="launcher-products" aria-labelledby="products-title">
          <h2 id="products-title" className="sr-only">Chọn sản phẩm</h2>
          {(Object.keys(PRODUCTS) as ProductId[]).map((productId) => (
            <ProductCard
              key={productId}
              productId={productId}
              onSelect={onSelectProduct}
            />
          ))}
        </section>

        {recentProjects.length > 0 && (
          <section className="launcher-recent" aria-labelledby="recent-title">
            <div className="launcher-section-heading">
              <h2 id="recent-title">Dự án gần đây</h2>
              <span>{recentProjects.length}/3</span>
            </div>
            <div className="recent-projects">
              {recentProjects.slice(0, 3).map((project) => {
                const state = previewState(project);
                return (
                  <button
                    key={project.id}
                    type="button"
                    className="recent-project"
                    onClick={() => onResumeProject(project)}
                    aria-label={`Tiếp tục ${PRODUCTS[project.productId].name}`}
                  >
                    <span className="recent-project__preview" aria-hidden="true">
                      <DesignCanvas
                        productId={state.productId}
                        text={state.text}
                        color={state.color}
                        backgroundColor={state.backgroundColor}
                        image={state.image}
                        productOptions={state.productOptions}
                        isMockup
                      />
                    </span>
                    <span className="recent-project__meta">
                      <span>{PRODUCTS[project.productId].name}</span>
                      <span>Tiếp tục <ArrowUpRight size={13} aria-hidden="true" /></span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
