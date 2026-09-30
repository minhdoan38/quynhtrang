'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Factory, PackageCheck } from 'lucide-react';
import { validateRevisionReason } from '@/lib/domain/design-revision.ts';

interface StartProductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderCode: string;
  quantity: number;
  versionLabel?: string;
  isSubmitting?: boolean;
  onConfirm: () => Promise<void>;
}

export function StartProductionDialog({
  open,
  onOpenChange,
  orderCode,
  quantity,
  versionLabel = 'Phiên bản sản xuất',
  isSubmitting = false,
  onConfirm,
}: StartProductionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#FFFDF8] border-[#ECE6DC] p-6">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-[#EBF3ED] flex items-center justify-center text-[#4A7251] mb-2">
            <Factory className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-[#2E3338]">
            Đưa đơn #{orderCode} vào sản xuất?
          </DialogTitle>
          <DialogDescription className="text-sm text-[#666A6D] mt-2 space-y-2">
            <p>• Số lượng sản xuất: <span className="font-semibold text-[#2E3338]">{quantity} sản phẩm</span>.</p>
            <p>• File in sử dụng: <span className="font-semibold text-[#2E3338]">{versionLabel}</span>.</p>
            <p className="text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2">
              Sau khi bắt đầu sản xuất, file thiết kế của đơn hàng sẽ bị khóa hoàn toàn và không thể chỉnh sửa thêm.
            </p>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex sm:justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-11 px-4 text-xs font-semibold"
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="h-11 px-5 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold"
          >
            {isSubmitting ? 'Đang chuyển...' : 'Bắt đầu sản xuất'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CompleteProductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderCode: string;
  customerName?: string;
  shippingAddress?: string;
  isSubmitting?: boolean;
  onConfirm: () => Promise<void>;
}

export function CompleteProductionDialog({
  open,
  onOpenChange,
  orderCode,
  customerName,
  shippingAddress,
  isSubmitting = false,
  onConfirm,
}: CompleteProductionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#FFFDF8] border-[#ECE6DC] p-6">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-[#EBF3ED] flex items-center justify-center text-[#4A7251] mb-2">
            <PackageCheck className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-[#2E3338]">
            Hoàn tất sản xuất đơn #{orderCode}?
          </DialogTitle>
          <DialogDescription className="text-sm text-[#666A6D] mt-2 space-y-1">
            <p>Xác nhận xưởng in đã hoàn tất sản xuất và đơn hàng sẵn sàng để đóng gói, giao khách.</p>
            {customerName && (
              <p className="pt-1">• Người nhận: <span className="font-semibold text-[#2E3338]">{customerName}</span></p>
            )}
            {shippingAddress && (
              <p>• Địa chỉ: <span className="font-semibold text-[#2E3338]">{shippingAddress}</span></p>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex sm:justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-11 px-4 text-xs font-semibold"
          >
            Xem lại
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="h-11 px-5 bg-[#4A7251] hover:bg-[#3D5E43] text-white text-xs font-semibold"
          >
            {isSubmitting ? 'Đang hoàn tất...' : 'Hoàn tất sản xuất'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderCode: string;
  isSubmitting?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderCode,
  isSubmitting = false,
  onConfirm,
}: CancelOrderDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const charCount = Array.from(reason.trim()).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateRevisionReason(reason);
    if (!validation.valid) {
      setError(validation.reason || 'Lý do không hợp lệ');
      return;
    }
    setError(null);
    await onConfirm(reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#FFFDF8] border-red-200 p-6">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-2">
              <AlertCircle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#2E3338]">
              Hủy đơn hàng #{orderCode}?
            </DialogTitle>
            <DialogDescription className="text-sm text-[#666A6D] mt-1">
              Thao tác này sẽ hủy tiến trình xử lý đơn hàng, hủy bỏ tạm giữ và các bản nháp đang chỉnh sửa.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-2">
            <label htmlFor="cancel-reason" className="block text-xs font-semibold text-[#2E3338]">
              Lý do hủy đơn <span className="text-red-500">*</span>
            </label>
            <textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="VD: Khách đổi ý không muốn in nữa, sai thông tin không liên lạc được..."
              className="w-full rounded-lg border border-[#DDD6CC] bg-white p-2.5 text-sm text-[#2E3338] placeholder:text-[#9EA2A6] focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <div className="flex items-center justify-between text-xs">
              <span className={error ? 'text-red-600 font-medium' : 'text-[#666A6D]'}>
                {error || 'Tối thiểu 3 ký tự, tối đa 500 ký tự'}
              </span>
              <span className={`font-mono ${charCount > 500 ? 'text-red-600' : 'text-[#9EA2A6]'}`}>
                {charCount}/500
              </span>
            </div>
          </div>

          <DialogFooter className="flex sm:justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-11 px-4 text-xs font-semibold"
            >
              Không hủy
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || charCount < 3 || charCount > 500}
              className="h-11 px-5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
            >
              {isSubmitting ? 'Đang hủy...' : 'Xác nhận hủy đơn'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
