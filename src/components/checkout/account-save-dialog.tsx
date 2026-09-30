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
import { CheckCircle2, Mail, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import {
  requestEmailOtp,
  verifyEmailOtp,
  ensureCustomerProfile,
  validateOtpFormat,
} from '@/lib/services/customer-auth.ts';
import {
  CustomerOrderClaimService,
  parseClaimStateMessage,
  type ClaimProgressState,
} from '@/lib/services/customer-order-claim.ts';
import { migrateLocalProjects } from '@/lib/services/local-project-migration.ts';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser.ts';

export { parseClaimStateMessage, type ClaimProgressState };


export interface AccountSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  guestToken: string;
  initialEmail?: string;
  onSuccess?: () => void;
}

export function AccountSaveDialog({
  open,
  onOpenChange,
  orderId,
  guestToken,
  initialEmail = '',
  onSuccess,
}: AccountSaveDialogProps) {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [progress, setProgress] = useState<ClaimProgressState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ');
      return;
    }

    setErrorMessage(null);
    setProgress('sending_otp');

    const res = await requestEmailOtp(email);
    if (res.ok) {
      setProgress('otp_sent');
      setStep('otp');
    } else {
      setProgress('error');
      setErrorMessage(res.message || 'Không thể gửi mã xác thực. Vui lòng thử lại.');
    }
  };

  const handleVerifyAndClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateOtpFormat(otp)) {
      setErrorMessage('Mã xác thực gồm 6 chữ số');
      return;
    }

    setErrorMessage(null);
    setProgress('claiming');

    const verifyRes = await verifyEmailOtp(email, otp);
    if (!verifyRes.ok || !verifyRes.user) {
      setProgress('error');
      setErrorMessage(verifyRes.message || 'Mã xác thực không chính xác hoặc đã hết hạn.');
      return;
    }

    const supabase = createBrowserSupabaseClient();
    await ensureCustomerProfile(undefined, supabase);

    // Claim order
    try {
      const claimService = new CustomerOrderClaimService(supabase);
      await claimService.claimGuestOrder(orderId, guestToken);
    } catch (err: unknown) {
      console.warn('Lỗi khi liên kết đơn hàng:', err);
    }

    // Migrate local projects
    setProgress('migrating');
    try {
      await migrateLocalProjects(verifyRes.user.id, supabase);
    } catch (err: unknown) {
      console.warn('Lỗi khi chuyển thiết kế:', err);
    }

    setProgress('done');
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#FFFDF8] border-[#ECE6DC] p-6">
        {progress === 'done' ? (
          <div className="py-6 flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#EBF3ED] flex items-center justify-center text-[#4A7251]">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#2E3338]">
              Lưu vào tài khoản thành công!
            </DialogTitle>
            <DialogDescription className="text-sm text-[#666A6D]">
              Đơn hàng và các thiết kế đã tạo trên thiết bị này đã được đồng bộ vào tài khoản của bạn.
            </DialogDescription>
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-4 h-11 px-6 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold"
            >
              Hoàn tất
            </Button>
          </div>
        ) : step === 'email' ? (
          <form onSubmit={handleSendOtp}>
            <DialogHeader>
              <div className="w-10 h-10 rounded-full bg-[#EBF3ED] flex items-center justify-center text-[#4A7251] mb-2">
                <Mail className="w-5 h-5" />
              </div>
              <DialogTitle className="text-lg font-bold text-[#2E3338]">
                Lưu đơn & thiết kế vào tài khoản
              </DialogTitle>
              <DialogDescription className="text-sm text-[#666A6D] mt-1">
                Nhập email của bạn để nhận mã xác thực một lần (không cần mật khẩu) và lưu trữ không giới hạn thời gian.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-2">
              <label htmlFor="customer-email" className="block text-xs font-semibold text-[#2E3338]">
                Địa chỉ email
              </label>
              <input
                id="customer-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="tenban@example.com"
                className="w-full rounded-lg border border-[#DDD6CC] bg-white p-2.5 text-sm text-[#2E3338] placeholder:text-[#9EA2A6] focus:border-[#315F86] focus:outline-none"
              />
              {errorMessage && (
                <p className="text-xs text-red-600 font-medium">{errorMessage}</p>
              )}
            </div>

            <DialogFooter className="flex sm:justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-11 px-4 text-xs font-semibold"
              >
                Để sau
              </Button>
              <Button
                type="submit"
                disabled={progress === 'sending_otp'}
                className="h-11 px-5 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold gap-1.5"
              >
                {progress === 'sending_otp' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang gửi mã...</span>
                  </>
                ) : (
                  <>
                    <span>Gửi mã xác thực</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={handleVerifyAndClaim}>
            <DialogHeader>
              <div className="w-10 h-10 rounded-full bg-[#EBF3ED] flex items-center justify-center text-[#4A7251] mb-2">
                <KeyRound className="w-5 h-5" />
              </div>
              <DialogTitle className="text-lg font-bold text-[#2E3338]">
                Nhập mã xác thực 6 chữ số
              </DialogTitle>
              <DialogDescription className="text-sm text-[#666A6D] mt-1">
                Mã xác thực đã được gửi tới <strong className="text-[#2E3338]">{email}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-2">
              <label htmlFor="otp-token" className="block text-xs font-semibold text-[#2E3338]">
                Mã xác thực (OTP)
              </label>
              <input
                id="otp-token"
                type="text"
                maxLength={6}
                autoFocus
                required
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, ''));
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="123456"
                className="w-full text-center tracking-widest font-mono text-lg rounded-lg border border-[#DDD6CC] bg-white p-2.5 text-[#2E3338] focus:border-[#315F86] focus:outline-none"
              />
              {errorMessage && (
                <p className="text-xs text-red-600 font-medium text-center">{errorMessage}</p>
              )}
              {(progress === 'claiming' || progress === 'migrating') && (
                <div className="flex items-center justify-center gap-2 text-xs text-[#315F86] py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{parseClaimStateMessage(progress as 'claiming' | 'migrating')}</span>
                </div>
              )}
            </div>

            <DialogFooter className="flex sm:justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('email')}
                disabled={progress === 'claiming' || progress === 'migrating'}
                className="h-11 px-4 text-xs font-semibold"
              >
                Đổi email
              </Button>
              <Button
                type="submit"
                disabled={otp.length !== 6 || progress === 'claiming' || progress === 'migrating'}
                className="h-11 px-5 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold"
              >
                {progress === 'claiming' || progress === 'migrating' ? 'Đang xử lý...' : 'Xác minh & Lưu'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
