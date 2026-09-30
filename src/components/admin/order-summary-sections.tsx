import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OrderStatusChip } from './order-status-chip';
import type { AdminOrderDetail } from '@/lib/domain/order';
import { Package, User, MapPin, Copy, Check } from 'lucide-react';

export interface OrderSummarySectionsProps {
  product: AdminOrderDetail['product'];
  customer: AdminOrderDetail['customer'];
  delivery: AdminOrderDetail['delivery'];
  fulfillmentStatus: string;
}

export function OrderSummarySections({
  product,
  customer,
  delivery,
  fulfillmentStatus,
}: OrderSummarySectionsProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (field: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField((curr) => (curr === field ? null : curr));
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Product & Fulfillment */}
      <Card className="p-6 bg-white border-neutral-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-neutral-500" />
            <h3 className="text-base font-semibold text-neutral-900">Sản phẩm & Sản xuất</h3>
          </div>
          <OrderStatusChip type="fulfillment" status={fulfillmentStatus} />
        </div>

        <div className="space-y-3 pt-1">
          <div>
            <p className="text-base font-semibold text-neutral-900 leading-snug">
              {product.name}
            </p>
            {product.variant && (
              <p className="text-sm text-neutral-600 mt-0.5">Phân loại: {product.variant}</p>
            )}
          </div>

          {product.configuration.length > 0 && (
            <div className="space-y-1 py-2 border-y border-neutral-100 text-xs">
              {product.configuration.map((c, i) => (
                <div key={i} className="flex justify-between text-neutral-600">
                  <span>{c.label}:</span>
                  <span className="font-medium text-neutral-900">{c.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5 pt-1 text-sm">
            <div className="flex justify-between text-neutral-600">
              <span>Số lượng:</span>
              <span className="font-semibold text-neutral-900">{product.quantity} cái</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Đơn giá:</span>
              <span>{product.unitPrice.toLocaleString('vi-VN')} {product.currency}</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Tạm tính:</span>
              <span>{product.subtotal.toLocaleString('vi-VN')} {product.currency}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-neutral-900 pt-2 border-t border-neutral-200">
              <span>Tổng cộng:</span>
              <span>{product.total.toLocaleString('vi-VN')} {product.currency}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Customer Info */}
      <Card className="p-6 bg-white border-neutral-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-neutral-500" />
          <h3 className="text-base font-semibold text-neutral-900">Khách hàng</h3>
        </div>

        <div className="space-y-3">
          <div>
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Họ và tên</span>
            <p className="text-sm font-semibold text-neutral-900 mt-0.5">
              {customer.fullName || '—'}
            </p>
          </div>

          <div>
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Số điện thoại</span>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-sm font-mono font-medium text-neutral-900">
                {customer.phone || '—'}
              </p>
              {customer.phone && (
                <Button
                  onClick={() => handleCopy('phone', customer.phone)}
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs text-neutral-600 hover:text-neutral-900"
                  aria-label="Sao chép số điện thoại"
                >
                  {copiedField === 'phone' ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      <span className="text-emerald-700 font-medium">Đã sao chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      <span>Sao chép</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Delivery Info */}
      <Card className="p-6 bg-white border-neutral-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-neutral-500" />
          <h3 className="text-base font-semibold text-neutral-900">Giao hàng</h3>
        </div>

        <div>
          <span className="text-xs text-neutral-500 uppercase tracking-wider">Địa chỉ giao hàng</span>
          <p className="text-sm text-neutral-800 leading-relaxed mt-1">
            {delivery.shippingAddress || 'Chưa cung cấp địa chỉ'}
          </p>

          {delivery.shippingAddress && (
            <div className="pt-2">
              <Button
                onClick={() => handleCopy('address', delivery.shippingAddress)}
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs text-neutral-600 hover:text-neutral-900"
                aria-label="Sao chép địa chỉ"
              >
                {copiedField === 'address' ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    <span className="text-emerald-700 font-medium">Đã sao chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    <span>Sao chép địa chỉ</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
