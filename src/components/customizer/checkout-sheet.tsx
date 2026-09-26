import React, { useState } from 'react';
import type { DesignSummary } from '@/lib/product-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Minus, Plus } from 'lucide-react';
import { ConfirmationPanel, type DemoOrder } from './confirmation-panel';

interface CheckoutSheetProps {
  isOpen: boolean;
  onClose: () => void;
  quantity: number;
  onSetQuantity: (qty: number) => void;
  summary: DesignSummary;
  onSubmitOrder: (customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    note: string;
  }) => void;
  order: DemoOrder | null;
  onStartOver: () => void;
}

export function CheckoutSheet({
  isOpen,
  onClose,
  quantity,
  onSetQuantity,
  summary,
  onSubmitOrder,
  order,
  onStartOver,
}: CheckoutSheetProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !address.trim()) {
      return;
    }
    onSubmitOrder({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      note: note.trim(),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent id="checkout-view" className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle id="checkout-title" className="text-base font-semibold">
            {order ? 'Xác nhận đơn hàng' : 'Thông tin đặt hàng'}
          </DialogTitle>
        </DialogHeader>

        {order ? (
          <ConfirmationPanel order={order} onStartOver={onStartOver} />
        ) : (
          <div className="py-2 space-y-4">
            <div id="order-summary" className="bg-stone-50 dark:bg-stone-900/50 p-3 rounded-lg text-xs space-y-1.5 border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sản phẩm:</span>
                <span className="font-semibold">{summary.product}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Khổ / loại:</span>
                <span className="font-semibold">{summary.variant}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Đơn giá:</span>
                <span className="font-semibold">
                  {new Intl.NumberFormat('vi-VN').format(summary.unitPrice)}&nbsp;₫
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t text-sm font-bold">
                <span>Tổng tạm tính:</span>
                <span>{summary.priceLabel}</span>
              </div>
            </div>

            <form
              id="customer-order-form"
              data-action="submit-order"
              onSubmit={handleSubmit}
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <Label htmlFor="quantity" className="text-xs font-medium">
                  Số lượng đặt in (1-999)
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    data-action="decrease-quantity"
                    onClick={() => onSetQuantity(Math.max(1, quantity - 1))}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    max={999}
                    value={quantity}
                    onChange={(e) => {
                      const val = Number.parseInt(e.target.value, 10);
                      if (Number.isFinite(val)) {
                        onSetQuantity(Math.min(999, Math.max(1, val)));
                      }
                    }}
                    className="w-20 text-center h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    data-action="increase-quantity"
                    onClick={() => onSetQuantity(Math.min(999, quantity + 1))}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-name" className="text-xs font-medium">
                  Họ và tên <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="customer-name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  required
                  className="h-9 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="customer-email" className="text-xs font-medium">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="customer-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    required
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="customer-phone" className="text-xs font-medium">
                    Số điện thoại <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="customer-phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0901234567"
                    required
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-address" className="text-xs font-medium">
                  Địa chỉ nhận hàng <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="customer-address"
                  name="address"
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
                  required
                  className="text-sm resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-note" className="text-xs font-medium">
                  Ghi chú in ấn
                </Label>
                <Input
                  id="customer-note"
                  name="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Yêu cầu thêm nếu có"
                  className="h-9 text-sm"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-action="back-to-editor"
                  onClick={onClose}
                >
                  Quay lại
                </Button>
                <Button type="submit" size="sm">
                  Xác nhận đặt demo
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
