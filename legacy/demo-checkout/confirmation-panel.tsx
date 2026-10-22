import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, QrCode } from 'lucide-react';
import type { DesignSummary } from '@/lib/product-state';

export interface DemoOrder {
  id: string;
  status: string;
  paymentStatus: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    note?: string;
  };
  summary: DesignSummary;
  createdAt: string;
}

interface ConfirmationPanelProps {
  order: DemoOrder | null;
  onStartOver: () => void;
}

export function ConfirmationPanel({ order, onStartOver }: ConfirmationPanelProps) {
  if (!order) return null;

  return (
    <div
      id="confirmation"
      className="p-6 bg-card border rounded-xl text-center space-y-4 max-w-md mx-auto"
    >
      <div className="flex justify-center text-emerald-600">
        <CheckCircle2 className="w-12 h-12" />
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Đã ghi nhận
        </p>
        <h2 id="confirmation-title" className="text-lg font-bold">
          Đơn hàng demo đã tạo
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Quét mã để xem thông tin minh họa. Mã này chưa xác nhận thanh toán.
        </p>
      </div>

      <div className="flex justify-center py-2">
        <div
          id="qr-demo"
          className="qr-placeholder w-32 h-32 bg-stone-100 dark:bg-stone-800 border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-lg flex flex-col items-center justify-center gap-1.5 shadow-inner"
          role="img"
          aria-label="Mã QR minh họa, trạng thái thanh toán: unverified"
        >
          <QrCode className="w-10 h-10 text-stone-500" />
          <span className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">
            QR UNVERIFIED
          </span>
        </div>
      </div>

      <div className="text-xs text-left bg-stone-50 dark:bg-stone-900/50 p-3 rounded-lg border space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Mã đơn:</span>
          <span className="font-mono font-medium">{order.id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Khách hàng:</span>
          <span className="font-medium">{order.customer.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Số điện thoại:</span>
          <span className="font-medium">{order.customer.phone}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Địa chỉ:</span>
          <span className="font-medium truncate max-w-[200px]">{order.customer.address}</span>
        </div>
        <div className="flex justify-between pt-1 border-t text-sm font-bold">
          <span>Tổng tiền:</span>
          <span>{order.summary.priceLabel}</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        data-action="start-over"
        onClick={onStartOver}
        className="w-full"
      >
        Tạo thiết kế mới
      </Button>
    </div>
  );
}
