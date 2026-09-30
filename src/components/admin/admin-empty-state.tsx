'use client';

import * as React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AdminEmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function AdminEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className,
}: AdminEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-[#DDD6CC] bg-[#FFFDF8]/70 text-[#2E3338]',
        className
      )}
      data-slot="admin-empty-state"
    >
      <div className="w-12 h-12 rounded-full bg-[#F8F3E8] border border-[#DDD6CC] flex items-center justify-center text-[#666A6D] mb-3.5">
        {icon ?? <PackageOpen className="w-6 h-6 text-[#315F86]" />}
      </div>

      <h3 className="text-base font-semibold text-[#2E3338] tracking-tight">{title}</h3>

      {description && (
        <p className="mt-1 text-sm text-[#666A6D] max-w-sm leading-relaxed">{description}</p>
      )}

      {actionLabel && onAction && (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAction}
            className="border-[#DDD6CC] bg-white text-[#2E3338] hover:bg-[#F8F3E8] hover:text-[#315F86] text-xs font-medium"
          >
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
