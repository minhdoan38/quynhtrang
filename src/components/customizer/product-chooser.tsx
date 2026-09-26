import React from 'react';
import { PRODUCTS, type ProductId } from '@/lib/product-state';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ProductChooserProps {
  productId: ProductId;
  variantId: string;
  onSelectProduct?: (id: ProductId) => void;
  onSelectVariant?: (id: string) => void;
  onChangeSetup?: () => void;
}

export function ProductChooser({
  productId,
  variantId,
  onSelectProduct,
  onSelectVariant,
  onChangeSetup,
}: ProductChooserProps) {
  const currentProduct = PRODUCTS[productId] ?? PRODUCTS.wrapping;
  const currentVariant =
    currentProduct.variants.find((v) => v.id === variantId) ?? currentProduct.variants[0];

  if (onChangeSetup) {
    return (
      <div className="p-3.5 rounded-xl bg-white border border-[#DDD6CC] flex items-center justify-between gap-3 shadow-2xs">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#666A6D]">
            Sản phẩm & Quy cách
          </span>
          <div className="text-sm font-bold text-[#2E3338] mt-0.5">
            {currentProduct.name}
            {currentProduct.variants.length > 1 && currentVariant ? ` · ${currentVariant.name}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onChangeSetup}
          data-action="change-setup"
          className="text-xs font-semibold text-[#315F86] hover:underline px-2.5 py-1.5 rounded-md hover:bg-[#DCEBF4]/40 transition-colors"
        >
          Đổi quy cách
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          1. Chọn sản phẩm
        </h2>
        <div id="product-choices" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {(Object.values(PRODUCTS) as typeof PRODUCTS[ProductId][]).map((item) => {
            const lowest = Math.min(...item.variants.map((v) => v.price));
            const isSelected = item.id === productId;
            return (
              <Card
                key={item.id}
                role="button"
                tabIndex={0}
                data-action="select-product"
                data-value={item.id}
                onClick={() => onSelectProduct?.(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectProduct?.(item.id);
                  }
                }}
                className={`cursor-pointer p-3 transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary bg-primary/5 shadow-sm'
                    : 'hover:border-stone-400 bg-card'
                }`}
              >
                <span className="font-semibold text-sm">{item.name}</span>
                <span className="text-xs text-muted-foreground mt-1">
                  Từ {new Intl.NumberFormat('vi-VN').format(lowest)}&nbsp;₫
                </span>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Khổ / Loại
        </Label>
        <RadioGroup
          id="variant-choices"
          value={variantId}
          onValueChange={(val) => onSelectVariant?.(val)}
          className="flex flex-wrap gap-3"
        >
          {currentProduct.variants.map((v) => (
            <div key={v.id} className="flex items-center space-x-2">
              <RadioGroupItem value={v.id} id={`variant-${v.id}`} />
              <Label htmlFor={`variant-${v.id}`} className="cursor-pointer text-sm font-medium">
                {v.name} ({new Intl.NumberFormat('vi-VN').format(v.price)}&nbsp;₫)
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
