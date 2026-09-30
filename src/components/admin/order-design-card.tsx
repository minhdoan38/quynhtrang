import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { OrderStatusChip } from './order-status-chip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { AdminOrderDetail } from '@/lib/domain/order';
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Eye,
  FileImage,
} from 'lucide-react';

export interface OrderDesignCardProps {
  orderId: string;
  designStatus: string;
  approvedDesign: AdminOrderDetail['approvedDesign'];
}

export function OrderDesignCard({
  orderId,
  designStatus,
  approvedDesign,
}: OrderDesignCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { preflight } = approvedDesign;
  const hasWarnings = preflight.warningCount > 0;

  return (
    <Card className="p-6 bg-white border-neutral-200 shadow-xs space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <FileImage className="w-5 h-5 text-neutral-500" />
          <h3 className="text-base font-semibold text-neutral-900">Thiết kế & Tiền kiểm in</h3>
        </div>
        <OrderStatusChip type="design" status={designStatus} />
      </div>

      <div className="flex flex-col sm:flex-row gap-5 items-start">
        {/* Thumbnail Preview */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-lg border border-neutral-200 bg-neutral-50 flex items-center justify-center overflow-hidden shrink-0">
          {approvedDesign.thumbnailUrl ? (
            <img
              src={approvedDesign.thumbnailUrl}
              alt={approvedDesign.label}
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-neutral-400 p-2 text-center">
              <FileImage className="w-8 h-8 mb-1" />
              <span className="text-xs leading-tight">Chưa có ảnh xem trước</span>
            </div>
          )}
        </div>

        {/* Info & Preflight Summary */}
        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Phiên bản file in
            </span>
            <p className="text-base font-semibold text-neutral-900 mt-0.5">
              {approvedDesign.label}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">
              Duyệt lúc: {new Date(approvedDesign.createdAt).toLocaleString('vi-VN')}
            </p>
          </div>

          {/* Preflight Badge */}
          <div className="flex items-center gap-2 pt-1">
            {hasWarnings ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{preflight.warningCount} cảnh báo khách đã chấp nhận</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Tiền kiểm file đạt chuẩn in</span>
              </div>
            )}
          </div>

          <div className="pt-1">
            <Link
              href={`/admin/orders/${orderId}/design`}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'border-neutral-300 text-neutral-800 hover:bg-neutral-50 inline-flex items-center gap-1.5 h-9 font-medium'
              )}
            >
              <Eye className="w-4 h-4" />
              <span>Xem & kiểm tra</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Preflight Details Collapsible */}
      {hasWarnings && preflight.checks.length > 0 && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-t border-neutral-100 pt-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium text-neutral-600 hover:text-neutral-900 py-1 cursor-pointer">
            <span>Chi tiết các lưu ý tiền kiểm ({preflight.checks.length})</span>
            <ChevronDown
              className={cn('w-4 h-4 transition-transform duration-200', isOpen && 'rotate-180')}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2.5 pt-2">
            {preflight.checks.map((check) => (
              <div
                key={check.id}
                className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900">{check.label}</span>
                  <span className="text-xs uppercase tracking-wider text-neutral-500 font-mono px-1.5 py-0.5 rounded bg-neutral-200/60">
                    {check.category}
                  </span>
                </div>
                {check.description && (
                  <p className="text-neutral-600">{check.description}</p>
                )}
                {check.advice && (
                  <p className="text-neutral-500 italic">Khuyến nghị: {check.advice}</p>
                )}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}
