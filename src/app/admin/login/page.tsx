'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation.js';

import { createBrowserSupabaseClient } from '@/lib/supabase/browser.ts';

function sanitizeRedirectUrl(target: string | null): string {
  if (!target) return '/admin/orders';
  if (target.startsWith('/admin') && !target.startsWith('//') && !target.includes('\\')) {
    return target;
  }
  return '/admin/orders';
}

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextTarget = sanitizeRedirectUrl(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage('Email hoặc mật khẩu không chính xác.');
        setLoading(false);
        return;
      }

      router.replace(nextTarget);
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại.'
      );
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-white border border-stone-200/90 rounded-2xl shadow-xs">
      <div className="mb-6 text-center">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
          Đăng nhập quản trị
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-stone-600">
          Hệ thống quản trị đơn hàng Quỳnh Trang Studio
        </p>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mb-5 p-3 text-xs sm:text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
        >
          {errorMessage}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="admin-email"
            className="block text-xs font-semibold text-stone-800 mb-1.5"
          >
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder="nhanvien@quynhtrang.vn"
            className="w-full h-11 px-3.5 text-sm bg-white border border-stone-300 rounded-lg text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-stone-800/20 focus:border-stone-800 disabled:opacity-50 transition"
          />
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="block text-xs font-semibold text-stone-800 mb-1.5"
          >
            Mật khẩu
          </label>
          <input
            id="admin-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="w-full h-11 px-3.5 text-sm bg-white border border-stone-300 rounded-lg text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-stone-800/20 focus:border-stone-800 disabled:opacity-50 transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 mt-2 inline-flex items-center justify-center text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-stone-800/30 disabled:opacity-60 cursor-pointer transition"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md mx-auto p-8 bg-white border border-stone-200 rounded-2xl shadow-xs text-center text-sm text-stone-500">
            Đang tải biểu mẫu...
          </div>
        }
      >
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}

// ponytail: client-side signInWithPassword with searchParams next redirect → skipped: biometric/passkey webauthn, add when hardware keys required for staff.
