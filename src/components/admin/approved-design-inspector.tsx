import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PreflightSummary } from '@/lib/domain/order';
import type { DesignState } from '@/lib/product-state';
import { ArrowLeft, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';

export interface ApprovedDesignInspectorProps {
  orderId: string;
  publicOrderCode: string;
  versionNumber: number;
  source: string;
  designDocument: DesignState;
  preflight: PreflightSummary;
}

export function ApprovedDesignInspector({
  orderId,
  publicOrderCode,
  versionNumber,
  source,
  designDocument,
  preflight,
}: ApprovedDesignInspectorProps) {
  const isCustomerApproved = source === 'customer_approved';
  const label = isCustomerApproved
    ? `Phiên bản khách duyệt v${versionNumber}`
    : `Bản chỉnh sửa v${versionNumber}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <Link
            href={`/admin/orders/${orderId}`}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'h-8 px-2 text-xs text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1.5 mb-2'
            )}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Về chi tiết đơn #{publicOrderCode}</span>
          </Link>

          <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2.5">
            <span>Kiểm tra file thiết kế: #{publicOrderCode}</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-800 border border-neutral-200">
              {label}
            </span>
          </h1>
        </div>
      </div>

      {/* Preflight Summary */}
      <Card className="p-5 bg-white border-neutral-200 shadow-xs space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider">
          Kết quả tiền kiểm in (Preflight)
        </h2>

        <div className="flex items-center gap-2">
          {preflight.warningCount > 0 ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>{preflight.warningCount} cảnh báo khách đã chấp nhận</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Tất cả tiêu chuẩn tiền kiểm đều đạt</span>
            </div>
          )}
        </div>

        {preflight.checks.length > 0 && (
          <div className="space-y-2 pt-2">
            {preflight.checks.map((check) => (
              <div
                key={check.id}
                className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900">{check.label}</span>
                  <span className="text-xs uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">
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
          </div>
        )}
      </Card>

      {/* Design Document Raw Specification Inspector */}
      <Card className="p-5 bg-white border-neutral-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-neutral-500" />
          <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider">
            Chi tiết cấu trúc file in (Read-only)
          </h2>
        </div>

        <div className="rounded-lg bg-neutral-900 p-4 overflow-x-auto text-neutral-100 font-mono text-xs leading-relaxed max-h-[500px]">
          <pre>{JSON.stringify(designDocument, null, 2)}</pre>
        </div>
      </Card>
    </div>
  );
}
