'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation.js';
import type { AdminOrderDetail, StaffIdentity } from '@/lib/domain/order.ts';
import { OrderDetail } from '@/components/admin/order-detail.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { Label } from '@/components/ui/label.tsx';
import {
  confirmPaymentAction,
  holdOrderAction,
  releaseHoldAction,
} from './actions.ts';

export interface OrderDetailClientProps {
  initialDetail: AdminOrderDetail;
  staff: StaffIdentity;
  returnTo?: string;
}

export function OrderDetailClient({
  initialDetail,
  staff,
  returnTo,
}: OrderDetailClientProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<AdminOrderDetail>(initialDetail);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog states
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [isHoldDialogOpen, setIsHoldDialogOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [holdError, setHoldError] = useState<string | null>(null);

  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const canMutate = staff.role === 'admin';

  // Authoritative refetch
  const refetchDetail = async () => {
    try {
      const res = await fetch(`/api/admin/orders/${detail.id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.detail) {
          setDetail(json.detail);
        }
      }
    } catch {
      // Keep existing state
    }
    router.refresh();
  };

  // Payment Confirmation
  const handleConfirmPayment = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setPaymentError(null);

    const expectedState = detail.payment.status === 'payment_reported'
      ? 'payment_reported'
      : 'pending_payment';

    const result = await confirmPaymentAction({
      orderId: detail.id,
      expectedState,
    });

    if (result.ok) {
      await refetchDetail();
      setIsPaymentDialogOpen(false);
      setNoticeMessage('Đã xác nhận thanh toán thành công.');
      setTimeout(() => setNoticeMessage(null), 4000);
    } else {
      setPaymentError(result.message);
      if (result.code === 'state_conflict' || result.code === 'already_paid') {
        await refetchDetail();
      }
    }
    setIsSubmitting(false);
  };

  // Hold Order
  const handleHoldOrder = async () => {
    if (isSubmitting) return;
    const trimmed = holdReason.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      setHoldError('Lý do tạm giữ phải từ 3 đến 500 ký tự.');
      return;
    }

    setIsSubmitting(true);
    setHoldError(null);

    const result = await holdOrderAction({
      orderId: detail.id,
      reason: trimmed,
    });

    if (result.ok) {
      await refetchDetail();
      setIsHoldDialogOpen(false);
      setHoldReason('');
      setNoticeMessage('Đã tạm giữ đơn hàng.');
      setTimeout(() => setNoticeMessage(null), 4000);
    } else {
      setHoldError(result.message);
      if (result.code === 'state_conflict') {
        await refetchDetail();
      }
    }
    setIsSubmitting(false);
  };

  // Release Hold
  const handleReleaseHold = async () => {
    if (isSubmitting || !detail.activeHold) return;
    setIsSubmitting(true);

    const result = await releaseHoldAction({
      orderId: detail.id,
      expectedHoldId: detail.activeHold.id,
    });

    if (result.ok) {
      await refetchDetail();
      setNoticeMessage('Đã bỏ tạm giữ đơn hàng.');
      setTimeout(() => setNoticeMessage(null), 4000);
    } else {
      setNoticeMessage(result.message);
      await refetchDetail();
    }
    setIsSubmitting(false);
  };

  return (
    <>
      {noticeMessage && (
        <div className="bg-neutral-900 text-white text-xs font-medium py-2.5 px-4 text-center sticky top-0 z-40 transition-all">
          {noticeMessage}
        </div>
      )}

      <OrderDetail
        detail={detail}
        canMutate={canMutate}
        isSubmitting={isSubmitting}
        returnTo={returnTo}
        onConfirmPaymentIntent={() => {
          setPaymentError(null);
          setIsPaymentDialogOpen(true);
        }}
        onHoldIntent={() => {
          setHoldReason('');
          setHoldError(null);
          setIsHoldDialogOpen(true);
        }}
        onReleaseHoldIntent={handleReleaseHold}
      />

      {/* Payment Confirmation AlertDialog */}
      <AlertDialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận thanh toán?</AlertDialogTitle>
            <AlertDialogDescription>
              Đơn <strong className="text-neutral-900 font-semibold">#{detail.publicOrderCode}</strong>
              <br />
              Số tiền: <strong className="text-neutral-900 font-semibold">{detail.payment.amount.toLocaleString('vi-VN')} {detail.payment.currency}</strong>
              <br />
              <span className="block mt-2 text-neutral-600">
                Chỉ xác nhận khi bạn đã kiểm tra tiền đã vào tài khoản.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {paymentError && (
            <p className="text-xs text-rose-600 font-medium px-1">{paymentError}</p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmPayment();
              }}
              disabled={isSubmitting}
              className="bg-neutral-900 hover:bg-neutral-800 text-white"
            >
              {isSubmitting ? 'Đang xác nhận...' : 'Xác nhận'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hold Order Dialog */}
      <Dialog open={isHoldDialogOpen} onOpenChange={setIsHoldDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tạm giữ đơn hàng</DialogTitle>
            <DialogDescription>
              Đơn #{detail.publicOrderCode}. Nhập lý do để lưu vào lịch sử kiểm toán của đơn.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="hold-reason" className="text-xs font-semibold text-neutral-700">
              Lý do tạm giữ <span className="text-rose-600">*</span>
            </Label>
            <Textarea
              id="hold-reason"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="Ví dụ: Khách yêu cầu đổi địa chỉ nhận hàng..."
              rows={3}
              maxLength={500}
              className="text-sm"
            />
            <div className="flex justify-between text-[11px] text-neutral-400">
              <span>Từ 3 đến 500 ký tự</span>
              <span>{holdReason.length}/500</span>
            </div>
            {holdError && (
              <p className="text-xs text-rose-600 font-medium">{holdError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsHoldDialogOpen(false)}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              onClick={handleHoldOrder}
              disabled={isSubmitting || holdReason.trim().length < 3}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {isSubmitting ? 'Đang lưu...' : 'Tạm giữ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
