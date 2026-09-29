'use client';

import React from 'react';
import {
  CARD_SURFACES,
  getCardSurfaceLabel,
  type CardSurface,
} from '@/lib/product-state';

export interface CardSurfaceSwitcherProps {
  value: CardSurface;
  onChange: (surface: CardSurface) => void;
  className?: string;
}

export function CardSurfaceSwitcher({
  value,
  onChange,
  className,
}: CardSurfaceSwitcherProps): React.JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="Chọn mặt thiệp"
      className={`inline-flex items-center gap-0.5 rounded-full border border-border/40 bg-muted/60 p-0.5 shadow-xs ${className ?? ''}`.trim()}
    >
      {CARD_SURFACES.map((surface) => {
        const isSelected = value === surface;

        return (
          <button
            key={surface}
            type="button"
            role="tab"
            aria-selected={value === surface}
            tabIndex={value === surface ? 0 : -1}
            onClick={() => onChange(surface)}
            className={`min-h-9 rounded-full px-3 py-1 text-sm text-muted-foreground transition-[background-color,box-shadow,color] duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${isSelected ? 'bg-background font-medium text-foreground shadow-xs' : 'hover:bg-background/60 hover:text-foreground'}`}
          >
            {getCardSurfaceLabel(surface)}
          </button>
        );
      })}
    </div>
  );
}
