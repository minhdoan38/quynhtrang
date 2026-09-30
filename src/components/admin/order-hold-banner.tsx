import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ActiveOrderHold } from '@/lib/domain/order';
import { AlertTriangle } from 'lucide-react';

export interface OrderHoldBannerProps {
  activeHold: ActiveOrderHold;
  canReleaseHold: boolean;
  isSubmitting: boolean;
  onReleaseIntent: () => void;
}

export function OrderHoldBanner({
  activeHold,
  canReleaseHold,
  isSubmitting,
  onReleaseIntent,
}: OrderHoldBannerProps) {
  return (
    <Card className="p-5 border-amber-300 bg-amber-50/70 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 shrink-0 text-amber-700">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-amber-200/80 text-amber-900 border border-amber-300">
                Đơn đang tạm giữ
              </span>
            </div>
            <p className="text-sm font-semibold text-neutral-900">
              Lý do: {activeHold.reason}
            </p>
            <p className="text-xs text-neutral-600">
              Tạm giữ bởi {activeHold.heldBy.displayName} lúc {new Date(activeHold.heldAt).toLocaleString('vi-VN')}
            </p>
          </div>
        </div>

        {canReleaseHold && (
          <div className="sm:self-center shrink-0">
            <Button
              onClick={onReleaseIntent}
              disabled={isSubmitting}
              variant="outline"
              className="w-full sm:w-auto h-10 px-4 border-amber-400 bg-white hover:bg-amber-100 text-amber-950 font-medium"
            >
              {isSubmitting ? 'Đang mở giữ...' : 'Bỏ tạm giữ'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
