import Link from 'next/link';
import type { AdminOrderDetail } from '@/lib/domain/order';
import { OrderStatusChip } from './order-status-chip';
import { OrderNextActionCard } from './order-next-action-card';
import { OrderPaymentCard } from './order-payment-card';
import { OrderHoldBanner } from './order-hold-banner';
import { OrderMoreMenu } from './order-more-menu';
import { OrderDesignCard } from './order-design-card';
import { OrderSummarySections } from './order-summary-sections';
import { OrderActivityTimeline } from './order-activity-timeline';
import { ArrowLeft } from 'lucide-react';

export interface OrderDetailProps {
  detail: AdminOrderDetail;
  canMutate: boolean;
  isSubmitting: boolean;
  returnTo?: string;
  onConfirmPaymentIntent: () => void;
  onHoldIntent: () => void;
  onReleaseHoldIntent: () => void;
}

export function OrderDetail({
  detail,
  canMutate,
  isSubmitting,
  returnTo,
  onConfirmPaymentIntent,
  onHoldIntent,
  onReleaseHoldIntent,
}: OrderDetailProps) {
  const safeReturnTo =
    returnTo && returnTo.startsWith('/admin/orders') ? returnTo : '/admin/orders';

  const isTerminal =
    detail.fulfillmentStatus === 'completed' ||
    detail.fulfillmentStatus === 'cancelled' ||
    detail.paymentStatus === 'cancelled';

  const canHold = canMutate && !detail.activeHold && !isTerminal;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <header className="border-b border-neutral-200 pb-5 space-y-3">
        <div>
          <Link
            href={safeReturnTo}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Danh sách đơn hàng</span>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                #{detail.publicOrderCode}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5">
                <OrderStatusChip type="payment" status={detail.paymentStatus} />
                <OrderStatusChip type="design" status={detail.designStatus} />
                <OrderStatusChip type="fulfillment" status={detail.fulfillmentStatus} />
              </div>
            </div>

            <p className="text-xs text-neutral-500 flex flex-wrap items-center gap-2">
              <span>Tạo lúc: {new Date(detail.createdAt).toLocaleString('vi-VN')}</span>
              <span>•</span>
              <span>
                {detail.product.name} × {detail.product.quantity}
              </span>
              <span>•</span>
              <span className="font-semibold text-neutral-700">
                {detail.product.total.toLocaleString('vi-VN')} {detail.product.currency}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <OrderMoreMenu canHold={canHold} onHoldIntent={onHoldIntent} />
          </div>
        </div>
      </header>

      {/* Main Grid: Responsive 1 col on mobile, 2 cols (main + side) on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Column */}
        <main className="lg:col-span-2 space-y-6">
          {/* 1. Next Action Card */}
          <OrderNextActionCard
            nextAction={detail.nextAction}
            orderId={detail.id}
            canMutate={canMutate}
            onConfirmPaymentIntent={onConfirmPaymentIntent}
            onReleaseHoldIntent={onReleaseHoldIntent}
          />

          {/* 2. Active Hold Banner */}
          {detail.activeHold && (
            <OrderHoldBanner
              activeHold={detail.activeHold}
              canReleaseHold={canMutate}
              isSubmitting={isSubmitting}
              onReleaseIntent={onReleaseHoldIntent}
            />
          )}

          {/* 3. Payment Card */}
          <OrderPaymentCard
            orderCode={detail.publicOrderCode}
            payment={detail.payment}
            canConfirmPayment={canMutate}
            isSubmitting={isSubmitting}
            onConfirmIntent={onConfirmPaymentIntent}
          />

          {/* 4. Design Card */}
          <OrderDesignCard
            orderId={detail.id}
            designStatus={detail.designStatus}
            approvedDesign={detail.approvedDesign}
          />

          {/* Mobile only: Product & Customer info in single column priority flow */}
          <div className="block lg:hidden">
            <OrderSummarySections
              product={detail.product}
              customer={detail.customer}
              delivery={detail.delivery}
              fulfillmentStatus={detail.fulfillmentStatus}
            />
          </div>

          {/* 5. Activity Timeline */}
          <OrderActivityTimeline
            orderId={detail.id}
            initialEvents={detail.recentEvents}
            initialCursor={detail.nextEventCursor}
          />
        </main>

        {/* Desktop Side Column */}
        <aside className="hidden lg:block space-y-6">
          <OrderSummarySections
            product={detail.product}
            customer={detail.customer}
            delivery={detail.delivery}
            fulfillmentStatus={detail.fulfillmentStatus}
          />
        </aside>
      </div>
    </div>
  );
}
