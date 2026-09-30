import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DesignStatus, FulfillmentStatus, PaymentStatus } from '@/lib/domain/order';

interface OrderStatusChipProps {
  type: 'payment' | 'design' | 'fulfillment';
  status: PaymentStatus | DesignStatus | FulfillmentStatus | string;
  className?: string;
}

export function OrderStatusChip({ type, status, className }: OrderStatusChipProps) {
  let label = status;
  let variantClass = 'bg-neutral-100 text-neutral-800 border-neutral-200';

  if (type === 'payment') {
    switch (status) {
      case 'paid':
        label = 'Đã thanh toán';
        variantClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        break;
      case 'payment_reported':
        label = 'Khách báo đã chuyển';
        variantClass = 'bg-amber-50 text-amber-800 border-amber-200';
        break;
      case 'pending_payment':
        label = 'Chờ thanh toán';
        variantClass = 'bg-neutral-100 text-neutral-700 border-neutral-200';
        break;
      case 'cancelled':
        label = 'Đã hủy';
        variantClass = 'bg-rose-50 text-rose-800 border-rose-200';
        break;
      default:
        label = status;
        break;
    }
  } else if (type === 'design') {
    switch (status) {
      case 'approved':
        label = 'Thiết kế đã duyệt';
        variantClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        break;
      case 'awaiting_review':
        label = 'Chờ duyệt thiết kế';
        variantClass = 'bg-blue-50 text-blue-800 border-blue-200';
        break;
      case 'needs_changes':
        label = 'Cần chỉnh sửa';
        variantClass = 'bg-amber-50 text-amber-800 border-amber-200';
        break;
      case 'editing':
        label = 'Đang chỉnh sửa';
        variantClass = 'bg-purple-50 text-purple-800 border-purple-200';
        break;
      case 'ready':
        label = 'Sẵn sàng duyệt';
        variantClass = 'bg-blue-50 text-blue-800 border-blue-200';
        break;
      default:
        label = status;
        break;
    }
  } else if (type === 'fulfillment') {
    switch (status) {
      case 'ready_for_production':
        label = 'Sẵn sàng sản xuất';
        variantClass = 'bg-teal-50 text-teal-800 border-teal-200';
        break;
      case 'in_production':
        label = 'Đang sản xuất';
        variantClass = 'bg-indigo-50 text-indigo-800 border-indigo-200';
        break;
      case 'completed':
        label = 'Hoàn tất';
        variantClass = 'bg-neutral-100 text-neutral-800 border-neutral-300';
        break;
      case 'unprocessed':
        label = 'Chưa sản xuất';
        variantClass = 'bg-neutral-50 text-neutral-600 border-neutral-200';
        break;
      case 'cancelled':
        label = 'Đã hủy';
        variantClass = 'bg-rose-50 text-rose-800 border-rose-200';
        break;
      default:
        label = status;
        break;
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border tracking-wide',
        variantClass,
        className
      )}
    >
      {label}
    </span>
  );
}
