'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, MapPin, Calendar } from 'lucide-react';
import { DesignCanvas } from '@/components/customizer/design-canvas';
import { getCustomerFacingStatusText } from '@/lib/domain/order.ts';
import type { DesignState } from '@/lib/product-state.ts';

export interface CustomerOrderDetailData {
  id: string;
  public_order_code: string;
  quantity: number;
  total: number;
  currency: string;
  created_at: string;
  recipient_name: string;
  shipping_address: string;
  customer_status: string;
  approved_design: {
    version_id: string;
    document: DesignState;
  };
}

export function CustomerOrderDetailView({ order }: { order: CustomerOrderDetailData }) {
  const statusText = getCustomerFacingStatusText(order.customer_status);
  const doc = order.approved_design.document;

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 select-none">
      <Link
        href="/my-orders"
        className="inline-flex items-center gap-1.5 text-xs text-[#666A6D] hover:text-[#2E3338] font-medium transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Danh sách đơn hàng của tôi</span>
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-[#ECE6DC] bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#ECE6DC] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[#315F86]" />
              <h1 className="text-lg font-bold text-[#2E3338]">Đơn hàng #{order.public_order_code}</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#666A6D] mt-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Đặt ngày {new Date(order.created_at).toLocaleString('vi-VN')}</span>
            </div>
          </div>

          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#FAF6EE] text-[#A86E22] border border-[#F2DFA0]">
            {statusText}
          </div>
        </div>

        {/* Delivery details */}
        <div className="space-y-2 text-xs text-[#666A6D]">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-[#315F86] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#2E3338]">{order.recipient_name}</p>
              <p>{order.shipping_address}</p>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-[#ECE6DC] flex items-center justify-between text-xs font-semibold">
          <span className="text-[#666A6D]">Số lượng: {order.quantity} sản phẩm</span>
          <span className="text-[#315F86] text-base font-bold">
            Tổng cộng: {Number(order.total).toLocaleString('vi-VN')} {order.currency || 'đ'}
          </span>
        </div>
      </div>

      {/* Design Snapshot */}
      <div className="rounded-2xl border border-[#ECE6DC] bg-white p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-sm font-bold text-[#2E3338] uppercase tracking-wider">
            Bản thiết kế đã duyệt
          </h2>
          <p className="text-xs text-[#666A6D] mt-0.5">
            Bản in tiêu chuẩn đã được bạn xác nhận đặt in.
          </p>
        </div>

        <div className="w-full aspect-square max-w-md mx-auto rounded-xl bg-[#F8F3E8] border border-[#ECE6DC] overflow-hidden flex items-center justify-center relative">
          <div className="scale-[0.6] sm:scale-[0.7] transform origin-center pointer-events-none">
            <DesignCanvas
              productId={doc.productId}
              text={doc.text}
              color={doc.color}
              backgroundColor={doc.backgroundColor}
              image={doc.image}
              productOptions={doc.productOptions}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
