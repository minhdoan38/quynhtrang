'use client';

import { useState } from 'react';
import { FileImage } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OrderThumbnailProps {
  thumbnailUrl?: string | null;
  productName?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function OrderThumbnail({
  thumbnailUrl,
  productName,
  className,
  size = 'md',
}: OrderThumbnailProps) {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    sm: 'w-10 h-10 min-w-10 rounded-md',
    md: 'w-14 h-14 min-w-14 rounded-lg',
    lg: 'w-20 h-20 min-w-20 rounded-xl',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const showImage = Boolean(thumbnailUrl && !hasError);

  return (
    <div
      className={cn(
        'relative bg-[#F8F3E8] border border-[#DDD6CC] flex items-center justify-center overflow-hidden shrink-0 transition-colors',
        sizeClasses[size],
        className
      )}
      data-slot="order-thumbnail"
    >
      {showImage ? (
        <img
          src={thumbnailUrl ?? ''}
          alt={productName ? `Xem trước ${productName}` : 'Xem trước thiết kế'}
          className="w-full h-full object-contain p-0.5"
          onError={() => setHasError(true)}
          loading="lazy"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-[#666A6D]">
          <FileImage className={cn(iconSizes[size], 'opacity-70')} />
          <span className="sr-only">{productName ? `Mẫu ${productName}` : 'Chưa có ảnh'}</span>
        </div>
      )}
    </div>
  );
}
