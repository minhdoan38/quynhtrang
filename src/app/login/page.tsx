'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, KeyRound, ArrowRight, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  requestEmailOtp,
  verifyEmailOtp,
  ensureCustomerProfile,
  validateOtpFormat,
  sanitizeRedirectUrl,
} from '@/lib/services/customer-auth.ts';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser.ts';

export { sanitizeRedirectUrl };

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = sanitizeRedirectUrl(searchParams.get('returnUrl') || searchParams.get('next'));

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    const res = await requestEmailOtp(email);
    setIsLoading(false);

    if (res.ok) {
      setStep('otp');
    } else {
      setErrorMessage(res.message || 'Không thể gửi mã xác thực. Vui lòng thử lại.');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateOtpFormat(otp)) {
      setErrorMessage('Mã xác thực gồm 6 chữ số');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    const res = await verifyEmailOtp(email, otp);
    if (!res.ok || !res.user) {
      setIsLoading(false);
      setErrorMessage(res.message || 'Mã xác thực không hợp lệ hoặc đã hết hạn');
      return;
    }

    const supabase = createBrowserSupabaseClient();
    await ensureCustomerProfile(undefined, supabase);
    setIsLoading(false);

    router.push(returnUrl);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#FFFDF8] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-[#666A6D] hover:text-[#2E3338] mb-6 font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Về trang chủ</span>
        </Link>

        <div className="bg-white py-8 px-6 shadow-xs border border-[#ECE6DC] rounded-2xl sm:px-10">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-[#EBF3ED] flex items-center justify-center text-[#4A7251] mx-auto mb-3">
              {step === 'email' ? <Mail className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
            </div>
            <h1 className="text-xl font-bold text-[#2E3338]">
              {step === 'email' ? 'Đăng nhập tài khoản' : 'Nhập mã xác thực'}
            </h1>
            <p className="text-xs text-[#666A6D] mt-1.5">
              {step === 'email'
                ? 'Nhận mã xác thực qua email để truy cập thiết kế và đơn hàng đã lưu.'
                : `Mã 6 chữ số đã được gửi tới ${email}`}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-[#2E3338] mb-1.5">
                  Địa chỉ email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="tenban@example.com"
                  className="w-full rounded-xl border border-[#DDD6CC] bg-white p-3 text-sm text-[#2E3338] placeholder:text-[#9EA2A6] focus:border-[#315F86] focus:outline-none"
                />
              </div>

              {errorMessage && (
                <p className="text-xs text-red-600 font-medium">{errorMessage}</p>
              )}

              <Button
                type="submit"
                disabled={isLoading || !email}
                className="w-full h-11 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold rounded-xl gap-1.5"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang gửi mã...</span>
                  </>
                ) : (
                  <>
                    <span>Gửi mã đăng nhập</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label htmlFor="login-otp" className="block text-xs font-semibold text-[#2E3338] mb-1.5 text-center">
                  Mã xác thực một lần (OTP)
                </label>
                <input
                  id="login-otp"
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, ''));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="123456"
                  className="w-full text-center tracking-widest font-mono text-xl rounded-xl border border-[#DDD6CC] bg-white p-3 text-[#2E3338] focus:border-[#315F86] focus:outline-none"
                />
              </div>

              {errorMessage && (
                <p className="text-xs text-red-600 font-medium text-center">{errorMessage}</p>
              )}

              <Button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                className="w-full h-11 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold rounded-xl"
              >
                {isLoading ? 'Đang xác thực...' : 'Đăng nhập'}
              </Button>

              <button
                type="button"
                onClick={() => setStep('email')}
                className="w-full text-center text-xs text-[#666A6D] hover:text-[#2E3338] pt-2"
              >
                Dùng email khác
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center text-xs text-[#666A6D]">Đang tải...</div>}>
      <LoginContent />
    </Suspense>
  );
}
