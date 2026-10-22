'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { Minus, Plus, ArrowLeft, ArrowRight, CheckCircle2, QrCode } from 'lucide-react';
import { ConfirmationPanel, type DemoOrder } from './confirmation-panel';
import type { CheckoutStep } from '@/lib/navigation';

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
  onStepChange?: (step: CheckoutStep) => void;
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
  onStepChange,
}: CheckoutSheetProps) {
  const [step, setStep] = useState<CheckoutStep>('summary');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');

  // Sync initial step when order exists or when dialog opens
  useEffect(() => {
    if (order) {
      setStep('confirmation');
    } else {
      setStep('summary');
    }
  }, [isOpen, order]);

  // Notify parent of step change for global Back resolver
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // Step-aware Back navigation
  const handleBack = useCallback(() => {
    if (step === 'confirmation') {
      onClose();
      return;
    }
    if (step === 'qr') {
      // Back to customer info does NOT delete order (requirement 15)
      setStep('customer');
      return;
    }
    if (step === 'customer') {
      // Back to order summary keeps customer input intact (requirement 14)
      setStep('summary');
      return;
    }
    // At summary: exit checkout back to editor
    onClose();
  }, [step, onClose]);

  // Handle Escape key for step-aware back
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, handleBack]);

  const handleSubmitCustomer = (e: React.FormEvent) => {
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
    setStep('qr');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleBack()}>
      <DialogContent id="checkout-view" className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-[#ECE6DC]">
          <div className="flex items-center gap-2">
            {step !== 'confirmation' && step !== 'summary' && (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Quay lại bước trước"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <DialogTitle id="checkout-title" className="text-base font-semibold text-[#2E3338]">
              {step === 'summary' && '1. Chi tiết đơn in'}
              {step === 'customer' && '2. Thông tin nhận hàng'}
              {step === 'qr' && '3. Quét mã thanh toán demo'}
              {step === 'confirmation' && 'Xác nhận đơn hàng'}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* STEP 4: ORDER CONFIRMATION */}
        {step === 'confirmation' && (
          <div className="py-2 space-y-4">
            <ConfirmationPanel order={order} onStartOver={onStartOver} />
            <div className="pt-2 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="w-full text-xs font-semibold"
              >
                Đóng & Xem lại thiết kế
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: DEMO QR PAYMENT */}
        {step === 'qr' && (
          <div className="py-2 space-y-4 text-center">
            <div className="p-4 bg-[#F8F3E8] rounded-xl border border-[#DDD6CC] space-y-2">
              <span className="text-xs uppercase font-bold tracking-wider text-[#666A6D]">
                Thanh toán thử nghiệm (Demo)
              </span>
              <p className="text-xs text-[#2E3338]">
                Quét mã bên dưới để xem ví dụ chuyển khoản. Đơn hàng sẽ giữ trạng thái demo unverified.
              </p>
              <div className="flex justify-center py-2">
                <div
                  id="qr-demo"
                  className="w-36 h-36 bg-white border-2 border-dashed border-[#315F86]/40 rounded-xl flex flex-col items-center justify-center gap-1.5 shadow-sm"
                  role="img"
                  aria-label="Mã QR thanh toán demo unverified"
                >
                  <QrCode className="w-12 h-12 text-[#315F86]" />
                  <span className="text-xs font-bold text-[#315F86] uppercase tracking-wider">
                    QR DEMO
                  </span>
                </div>
              </div>
              <p className="text-sm font-bold text-[#2E3338]">
                Số tiền: {summary.priceLabel}
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-action="back-to-customer"
                onClick={() => setStep('customer')}
              >
                Sửa thông tin
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[#315F86] hover:bg-[#244A69] text-white"
                data-action="confirm-qr-done"
                onClick={() => setStep('confirmation')}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Hoàn tất đơn demo
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: CUSTOMER INFORMATION */}
        {step === 'customer' && (
          <form
            id="customer-order-form"
            data-action="submit-order"
            onSubmit={handleSubmitCustomer}
            className="py-2 space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="customer-name" className="text-xs font-medium text-[#2E3338]">
                Họ và tên <span className="text-red-500">*</span>
              </Label>
              <Input
                id="customer-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Văn A"
                required
                className="h-10 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="customer-email" className="text-xs font-medium text-[#2E3338]">
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
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-phone" className="text-xs font-medium text-[#2E3338]">
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
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer-address" className="text-xs font-medium text-[#2E3338]">
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
              <Label htmlFor="customer-note" className="text-xs font-medium text-[#2E3338]">
                Ghi chú in ấn
              </Label>
              <Input
                id="customer-note"
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Yêu cầu thêm nếu có"
                className="h-10 text-sm"
              />
            </div>

            <div className="pt-3 flex justify-between items-center gap-2 border-t border-[#ECE6DC]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-action="back-to-summary"
                onClick={() => setStep('summary')}
              >
                Quay lại
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-[#315F86] hover:bg-[#244A69] text-white"
              >
                Tiếp tục tạo đơn
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </form>
        )}

        {/* STEP 1: ORDER SUMMARY & QUANTITY */}
        {step === 'summary' && (
          <div className="py-2 space-y-4">
            <div id="order-summary" className="bg-[#FFFDF8] p-4 rounded-xl text-xs space-y-2 border border-[#DDD6CC]">
              <div className="flex justify-between">
                <span className="text-[#666A6D]">Sản phẩm:</span>
                <span className="font-semibold text-[#2E3338]">{summary.product}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666A6D]">Khổ / loại:</span>
                <span className="font-semibold text-[#2E3338]">{summary.variant}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666A6D]">Đơn giá:</span>
                <span className="font-semibold text-[#2E3338]">
                  {new Intl.NumberFormat('vi-VN').format(summary.unitPrice)}&nbsp;₫
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#ECE6DC] text-sm font-bold text-[#2E3338]">
                <span>Tổng tạm tính:</span>
                <span className="text-[#315F86]">{summary.priceLabel}</span>
              </div>
            </div>

            <div className="space-y-1.5 p-3 rounded-xl bg-[#F8F3E8] border border-[#DDD6CC]">
              <Label htmlFor="quantity" className="text-xs font-semibold text-[#2E3338]">
                Số lượng đặt in (1-999)
              </Label>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 bg-white"
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
                  className="w-24 text-center h-9 text-sm font-semibold bg-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 bg-white"
                  data-action="increase-quantity"
                  onClick={() => onSetQuantity(Math.min(999, quantity + 1))}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center gap-2 border-t border-[#ECE6DC]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-action="back-to-editor"
                onClick={onClose}
              >
                Quay lại chỉnh sửa
              </Button>
              <Button
                type="button"
                size="sm"
                data-action="proceed-to-customer"
                className="bg-[#315F86] hover:bg-[#244A69] text-white"
                onClick={() => setStep('customer')}
              >
                Nhập thông tin giao hàng
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
