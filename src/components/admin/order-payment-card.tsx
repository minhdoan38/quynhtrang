import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OrderStatusChip } from './order-status-chip';
import type { AdminOrderDetail } from '@/lib/domain/order';
import { CreditCard, Check, Clock } from 'lucide-react';

export interface OrderPaymentCardProps {
  orderCode: string;
  payment: AdminOrderDetail['payment'];
  canConfirmPayment: boolean;
  isSubmitting: boolean;
  onConfirmIntent: () => void;
}

export function OrderPaymentCard({
  payment,
  canConfirmPayment,
  isSubmitting,
  onConfirmIntent,
}: OrderPaymentCardProps) {
  const isPaid = payment.status === 'paid';
  const canConfirm = canConfirmPayment && (payment.status === 'pending_payment' || payment.status === 'payment_reported');

  return (
    <Card className="p-6 bg-white border-neutral-200 shadow-xs space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CreditCard className="w-5 h-5 text-neutral-500" />
          <h3 className="text-base font-semibold text-neutral-900">Thông tin thanh toán</h3>
        </div>
        <OrderStatusChip type="payment" status={payment.status} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 border-y border-neutral-100">
        <div>
          <span className="text-xs text-neutral-500 uppercase tracking-wider">Số tiền cần thanh toán</span>
          <p className="text-xl font-bold text-neutral-900 mt-0.5">
            {payment.amount.toLocaleString('vi-VN')} {payment.currency}
          </p>
        </div>
        <div>
          <span className="text-xs text-neutral-500 uppercase tracking-wider">Mã tham chiếu / Nội dung</span>
          <p className="text-sm font-medium font-mono text-neutral-800 mt-1">
            {payment.reference || '—'}
          </p>
        </div>
      </div>

      <div className="space-y-2 text-sm text-neutral-600">
        {payment.customerReportedAt && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Khách báo chuyển khoản: {new Date(payment.customerReportedAt).toLocaleString('vi-VN')}
            </span>
          </div>
        )}

        {isPaid && payment.confirmedAt && (
          <div className="flex items-center gap-2 text-emerald-700">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Đã xác nhận lúc: {new Date(payment.confirmedAt).toLocaleString('vi-VN')}
              {payment.confirmedBy?.displayName && ` bởi ${payment.confirmedBy.displayName}`}
            </span>
          </div>
        )}
      </div>

      {canConfirm && (
        <div className="pt-2">
          <Button
            onClick={onConfirmIntent}
            disabled={isSubmitting}
            className="w-full sm:w-auto h-11 px-5 bg-neutral-900 hover:bg-neutral-800 text-white font-medium"
          >
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận đã nhận tiền'}
          </Button>
        </div>
      )}
    </Card>
  );
}
