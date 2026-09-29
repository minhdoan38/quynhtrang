'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  type DesignState,
  getDesignSummary,
  PRODUCTS,
} from '@/lib/product-state';
import { DesignCanvas } from '@/components/customizer/design-canvas';

export interface OrderSummaryCardProps {
  design: DesignState;
  onEditDesign: () => void;
  onOpenPreview?: () => void;
}

export function getFriendlyProductName(design: DesignState): string {
  switch (design.productId) {
    case 'wrapping':
      return 'Giấy bọc quà';
    case 'card':
      return 'Thiệp chúc mừng';
    case 'notebook':
      return 'Bìa sổ tay';
    case 'sticker':
      return design.productOptions?.shape === 'circle'
        ? 'Sticker tròn'
        : 'Sticker die-cut';
    default: {
      const prod = (PRODUCTS as Record<string, { name?: string }>)[design.productId];
      return prod?.name ?? 'Sản phẩm in';
    }
  }
}

export function getFriendlyVariant(design: DesignState): string {
  const options = design.productOptions || {};

  switch (design.productId) {
    case 'wrapping': {
      const variantUpper = (design.variantId || 'a1').toUpperCase();
      const modeText = options.mode === 'full-sheet' ? 'Toàn tờ' : 'Lặp họa tiết';
      return `${variantUpper} • ${modeText}`;
    }
    case 'card': {
      return options.orientation === 'vertical' ? 'Dọc' : 'Ngang';
    }
    case 'sticker': {
      return design.variantId === 'die-cut' ? 'Cắt rời (Die-cut)' : 'Hình chuẩn';
    }
    case 'notebook': {
      return 'Khổ A5 (148 × 210 mm)';
    }
    default: {
      const summary = getDesignSummary(design);
      return summary.variant;
    }
  }
}

export function getThumbnailShapeClass(design: DesignState): string {
  if (design.productId === 'sticker' && design.productOptions?.shape === 'circle') {
    return 'rounded-full aspect-square';
  }
  if (design.productId === 'card') {
    return design.productOptions?.orientation === 'vertical'
      ? 'aspect-[105/148] rounded-md'
      : 'aspect-[148/105] rounded-md';
  }
  if (design.productId === 'notebook') {
    return 'aspect-[148/210] rounded-sm';
  }
  return 'rounded-xl aspect-square';
}

export function OrderSummaryCard({
  design,
  onEditDesign,
  onOpenPreview,
}: OrderSummaryCardProps): React.JSX.Element {
  const summary = getDesignSummary(design);
  const productName = getFriendlyProductName(design);
  const variantText = getFriendlyVariant(design);
  const shapeClass = getThumbnailShapeClass(design);

  const handleThumbnailClick = () => {
    if (onOpenPreview) {
      onOpenPreview();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onOpenPreview) {
      e.preventDefault();
      onOpenPreview();
    }
  };

  return (
    <div
      data-testid="order-summary-card"
      className="rounded-2xl border border-[#DDD6CC] bg-white p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row gap-4 items-start sm:items-center"
    >
      {/* Thumbnail Frame */}
      <div
        data-testid="thumbnail-container"
        data-product={design.productId}
        role={onOpenPreview ? 'button' : undefined}
        tabIndex={onOpenPreview ? 0 : undefined}
        onClick={handleThumbnailClick}
        onKeyDown={handleKeyDown}
        className={`relative w-24 h-24 overflow-hidden bg-[#F8F3E8] border border-[#ECE6DC] flex items-center justify-center shrink-0 ${shapeClass} ${onOpenPreview ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
          }`}
        title={onOpenPreview ? 'Nhấn để xem trước thiết kế' : undefined}
      >
        <div className="scale-[0.4] transform origin-center pointer-events-none select-none">
          <DesignCanvas
            productId={design.productId}
            variantId={design.variantId}
            text={design.text}
            color={design.color}
            backgroundColor={design.backgroundColor}
            image={design.image}
            productOptions={design.productOptions}
            elements={design.elements}
            isMockup={false}
          />
        </div>
      </div>

      {/* Details Area */}
      <div className="flex-1 min-w-0 flex flex-col items-start">
        {/* Verification badge */}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EBF3ED] text-[#2D5A3A] border border-[#C2DEC9]">
          <CheckCircle2 className="w-3 h-3" />
          Thiết kế đã được kiểm tra
        </span>

        {/* Product title */}
        <h2
          data-testid="product-title"
          className="mt-1.5 text-base font-bold text-[#2E3338] truncate w-full"
        >
          {productName}
        </h2>

        {/* Variant text */}
        <p data-testid="variant-text" className="text-xs text-[#666A6D]">
          {variantText}
        </p>

        {/* Unit & quantity summary info */}
        <div className="mt-1 flex items-center gap-2 text-xs text-[#666A6D]">
          <span>Số lượng: {summary.quantity}</span>
          <span>•</span>
          <span className="font-medium text-[#2E3338]">{summary.priceLabel}</span>
        </div>

        {/* Edit design action */}
        <button
          type="button"
          data-testid="edit-design-button"
          onClick={onEditDesign}
          className="mt-2 text-xs font-semibold text-[#315F86] hover:underline flex items-center gap-1"
        >
          Chỉnh sửa thiết kế
        </button>
      </div>
    </div>
  );
}
