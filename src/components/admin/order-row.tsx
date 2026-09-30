'use client';

import Link from 'next/link';
import { ChevronRight, Phone, AlertCircle } from 'lucide-react';
import { OrderThumbnail } from './order-thumbnail';
import { OrderStatusChip } from './order-status-chip';
import { formatVnd, buildOrderDetailUrl, type InboxQueryParams } from '@/lib/admin/inbox-query';
import type { OrderInboxRow, AttentionReason } from '@/lib/domain/order';
import { cn } from '@/lib/utils';

export interface OrderRowProps {
  order: OrderInboxRow;
  currentQuery: InboxQueryParams;
  className?: string;
}

function getAttentionBadge(reason: AttentionReason) {
  switch (reason) {
    case 'PAYMENT_REPORTED':
      return {
        label: 'Khách báo đã chuyển',
        className: 'bg-amber-50 text-amber-900 border-amber-200/80',
      };
    case 'PAYMENT_FAILED':
      return {
        label: 'Thanh toán lỗi',
        className: 'bg-rose-50 text-rose-800 border-rose-200/80',
      };
    case 'DESIGN_REVIEW':
      return {
        label: 'Cần duyệt thiết kế',
        className: 'bg-blue-50 text-blue-900 border-blue-200/80',
      };
    case 'DESIGN_CHANGES':
      return {
        label: 'Cần sửa thiết kế',
        className: 'bg-amber-50 text-amber-900 border-amber-200/80',
      };
    case 'READY_FOR_PRODUCTION':
      return {
        label: 'Sẵn sàng sản xuất',
        className: 'bg-teal-50 text-teal-900 border-teal-200/80',
      };
    default:
      return null;
  }
}

export function OrderRow({ order, currentQuery, className }: OrderRowProps) {
  const detailHref = buildOrderDetailUrl(order.id, currentQuery);
  const createdDate = new Date(order.createdAt).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Link
      href={detailHref}
      className={cn(
        'order-row-item block group rounded-xl border border-[#DDD6CC] bg-white hover:border-[#315F86]/60 hover:shadow-xs transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]/30',
        className
      )}
      data-slot="order-row"
      data-order-id={order.id}
    >
      {/* ================= MOBILE CARD VIEW (< md) ================= */}
      <div className="flex md:hidden flex-col p-3.5 gap-2.5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <OrderThumbnail
              thumbnailUrl={order.approvedDesignVersion ? null : null}
              productName={order.product.name}
              size="sm"
            />
            <div className="min-w-0">
              <span className="font-bold text-sm tracking-tight text-[#2E3338] group-hover:text-[#315F86] transition-colors truncate block">
                #{order.publicOrderCode}
              </span>
              <span className="text-xs text-[#666A6D] block">{createdDate}</span>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <span className="font-semibold text-sm text-[#2E3338]">
              {formatVnd(order.total)}
            </span>
            <ChevronRight className="w-4 h-4 text-[#666A6D] group-hover:text-[#315F86] group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[#2E3338] pt-1 border-t border-[#DDD6CC]/40">
          <div className="truncate max-w-[55%]">
            <span className="font-medium text-[#2E3338]">{order.customerFullName}</span>
            {order.customerPhone && (
              <span className="text-[#666A6D] text-xs block">{order.customerPhone}</span>
            )}
          </div>
          <div className="text-right truncate max-w-[45%]">
            <span className="text-xs text-[#666A6D]">
              {order.product.name} <strong className="text-[#2E3338]">× {order.quantity}</strong>
            </span>
          </div>
        </div>

        {/* Status Chips & Attention Badges */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <OrderStatusChip type="payment" status={order.paymentStatus} />
          <OrderStatusChip type="design" status={order.designStatus} />
          <OrderStatusChip type="fulfillment" status={order.fulfillmentStatus} />

          {order.attentionReasons.map((reason) => {
            const badge = getAttentionBadge(reason);
            if (!badge) return null;
            return (
              <span
                key={reason}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border',
                  badge.className
                )}
              >
                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                <span>{badge.label}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ================= DESKTOP ROW VIEW (>= md) ================= */}
      <div className="hidden md:grid grid-cols-12 gap-3 items-center px-4 py-3">
        {/* Col 1: Thumbnail & Code & Date (4 cols) */}
        <div className="col-span-4 flex items-center gap-3 min-w-0">
          <OrderThumbnail
            thumbnailUrl={order.approvedDesignVersion ? null : null}
            productName={order.product.name}
            size="md"
          />
          <div className="min-w-0">
            <span className="font-bold text-sm tracking-tight text-[#2E3338] group-hover:text-[#315F86] transition-colors truncate block">
              #{order.publicOrderCode}
            </span>
            <span className="text-xs text-[#666A6D] block mt-0.5">{createdDate}</span>
          </div>
        </div>

        {/* Col 2: Customer (3 cols) */}
        <div className="col-span-3 min-w-0">
          <span className="text-xs font-semibold text-[#2E3338] block truncate">
            {order.customerFullName}
          </span>
          <span className="text-xs text-[#666A6D] flex items-center gap-1 mt-0.5 truncate">
            <Phone className="w-3 h-3 shrink-0 opacity-70" />
            <span>{order.customerPhone}</span>
          </span>
        </div>

        {/* Col 3: Product & Total (2 cols) */}
        <div className="col-span-2 min-w-0">
          <span className="text-xs font-medium text-[#2E3338] block truncate">
            {order.product.name}
          </span>
          <span className="text-xs text-[#666A6D] block mt-0.5">
            Số lượng: <strong className="text-[#2E3338]">{order.quantity}</strong>
          </span>
          <span className="text-xs font-bold text-[#315F86] block mt-0.5">
            {formatVnd(order.total)}
          </span>
        </div>

        {/* Col 4: Status Chips & Badges (3 cols) */}
        <div className="col-span-3 flex items-center justify-between gap-2 min-w-0">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1">
              <OrderStatusChip type="payment" status={order.paymentStatus} />
              <OrderStatusChip type="design" status={order.designStatus} />
            </div>

            {order.attentionReasons.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {order.attentionReasons.map((reason) => {
                  const badge = getAttentionBadge(reason);
                  if (!badge) return null;
                  return (
                    <span
                      key={reason}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border',
                        badge.className
                      )}
                    >
                      <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                      <span>{badge.label}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <ChevronRight className="w-4 h-4 text-[#666A6D] group-hover:text-[#315F86] group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
        </div>
      </div>
    </Link>
  );
}
