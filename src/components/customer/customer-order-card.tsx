'use client';

import React from 'react';
import Link from 'next/link';
import { Package, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCustomerFacingStatusText } from '@/lib/domain/order.ts';

export { getCustomerFacingStatusText };

export interface CustomerOrderItem {
  id: string;
  public_order_code: string;
  product_snapshot?: { name?: string; id?: string };
  variant_snapshot?: { name?: string; price?: number };
  quantity: number;
  total: number;
  currency: string;
  created_at: string;
  customer_status: string;
  customer_approved_design_version_id: string;
}

export function CustomerOrderCard({ order }: { order: CustomerOrderItem }) {
  const statusText = getCustomerFacingStatusText(order.customer_status);
  const productName = order.product_snapshot?.name || 'Sản phẩm in';
  const variantName = order.variant_snapshot?.name || '';
  const dateFormatted = new Date(order.created_at).toLocaleDateString('vi-VN');

  let statusBadgeStyle = 'bg-neutral-100 text-neutral-800 border-neutral-200';
  if (order.customer_status === 'waiting_payment') {
    statusBadgeStyle = 'bg-amber-50 text-amber-900 border-amber-200';
  } else if (order.customer_status === 'in_production') {
    statusBadgeStyle = 'bg-blue-50 text-blue-900 border-blue-200';
  } else if (order.customer_status === 'production_completed') {
    statusBadgeStyle = 'bg-emerald-50 text-emerald-900 border-emerald-200';
  } else if (order.customer_status === 'cancelled') {
    statusBadgeStyle = 'bg-red-50 text-red-900 border-red-200';
  }

  return (
    <div className="rounded-2xl border border-[#ECE6DC] bg-white p-5 shadow-xs hover:shadow-md transition-shadow space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#ECE6DC] pb-3">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-[#315F86]" />
          <span className="font-mono font-bold text-sm text-[#2E3338]">#{order.public_order_code}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeStyle}`}>
            {statusText}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="space-y-0.5">
          <h3 className="font-bold text-[#2E3338] text-sm">{productName}</h3>
          {variantName && <p className="text-[#666A6D]">{variantName}</p>}
          <div className="flex items-center gap-1.5 text-[#666A6D] pt-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Ngày đặt: {dateFormatted}</span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs text-[#666A6D]">Số lượng: {order.quantity}</span>
          <p className="font-bold text-sm text-[#315F86]">
            {Number(order.total).toLocaleString('vi-VN')} {order.currency || 'đ'}
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-[#ECE6DC] flex justify-end">
        <Link href={`/my-orders/${order.id}`}>
          <Button
            variant="outline"
            className="h-9 px-4 border-[#DDD6CC] hover:bg-[#F8F3E8] text-[#2E3338] text-xs font-semibold rounded-lg gap-1.5"
          >
            <span>Chi tiết đơn hàng</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
