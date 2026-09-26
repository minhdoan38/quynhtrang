import React from 'react';
import type { ProductId, ImageState } from '@/lib/product-state';

interface DesignCanvasProps {
  productId: ProductId;
  text: string;
  color: string;
  backgroundColor: string;
  image: ImageState | null;
  productOptions: Record<string, unknown>;
  isMockup?: boolean;
}

export function DesignCanvas({
  productId,
  text,
  color,
  backgroundColor,
  image,
  productOptions,
  isMockup = false,
}: DesignCanvasProps) {
  const styles: React.CSSProperties & Record<string, string | number | undefined> = {
    backgroundColor,
  };

  const classes: string[] = [
    isMockup ? `mockup mockup--${productId}` : `design-canvas design-canvas--${productId}`,
  ];

  if (productId === 'wrapping') {
    const scale = Number(productOptions.patternScale) || 100;
    const size = Math.round((68 * scale) / 100);
    (styles as Record<string, string | number>)['--pattern-size'] = `${size}px`;
    if (productOptions.mode === 'repeat') classes.push('is-mode-repeat');
  } else if (productId === 'card') {
    if (productOptions.surface === 'inside') classes.push('is-surface-inside');
    if (productOptions.fold === 'flat') classes.push('is-fold-flat');
  } else if (productId === 'sticker') {
    const border = productOptions.hasWhiteBorder
      ? Number.isFinite(Number(productOptions.borderWidth))
        ? Math.max(0, Number(productOptions.borderWidth))
        : 4
      : 0;
    (styles as Record<string, string | number>)['--sticker-border-width'] = `${border}px`;
  } else if (productId === 'notebook') {
    if (productOptions.finish === 'glossy') classes.push('is-finish-glossy');
    else classes.push('is-finish-matte');
  }

  return (
    <div
      id={isMockup ? 'mockup-canvas' : 'design-canvas'}
      className={classes.join(' ')}
      style={styles}
    >
      {image?.src && (
        <img
          src={image.src}
          alt={image.name || 'Ảnh đã tải lên'}
          className="design-image max-h-[70%] max-w-[70%] object-contain pointer-events-none select-none"
        />
      )}
      {text ? (
        <p
          className="design-text px-4 text-center font-bold tracking-tight text-lg md:text-xl break-words"
          style={{ color }}
        >
          {text}
        </p>
      ) : (
        !image?.src && (
          <p className="text-sm text-stone-500 font-medium select-none">
            Thêm nội dung để bắt đầu
          </p>
        )
      )}
    </div>
  );
}
