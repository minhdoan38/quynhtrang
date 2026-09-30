import type { Metadata } from 'next';
import { headers } from 'next/headers.js';
import { redirect } from 'next/navigation.js';

import { getOptionalStaff } from '@/lib/admin/authorization.ts';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';

export const metadata: Metadata = {
  title: 'Quỳnh Trang Studio — Quản trị đơn hàng',
};

async function signOutAction() {
  'use server';
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    // Session cleanup fallback
  }
  redirect('/admin/login');
}

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const pathname =
    headerStore.get('x-admin-pathname') ||
    headerStore.get('x-pathname') ||
    headerStore.get('next-url') ||
    '';

  const isLoginPage =
    pathname === '/admin/login' ||
    pathname.includes('/admin/login') ||
    Boolean(headerStore.get('x-matched-path')?.includes('/admin/login'));

  const staff = await getOptionalStaff();

  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-stone-50/70 text-stone-900 font-sans">
        {children}
      </div>
    );
  }

  if (!staff) {
    redirect('/admin/login');
  }

  const roleLabel = staff.role === 'admin' ? 'Quản trị viên' : 'Biên tập viên';
  const roleBadgeStyle =
    staff.role === 'admin'
      ? 'bg-amber-100 text-amber-900 border-amber-200'
      : 'bg-blue-100 text-blue-900 border-blue-200';

  return (
    <div className="min-h-screen bg-stone-50/70 text-stone-900 font-sans">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm sm:text-base font-semibold text-stone-900 truncate">
              Quỳnh Trang Studio — Quản trị đơn hàng
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {staff.email ? (
              <span className="hidden md:inline text-xs text-stone-600 truncate max-w-[200px]">
                {staff.email}
              </span>
            ) : null}

            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${roleBadgeStyle}`}
            >
              {roleLabel}
            </span>

            <form action={signOutAction}>
              <button
                type="submit"
                className="text-xs text-stone-600 hover:text-stone-900 border border-stone-300 rounded px-2.5 py-1 hover:bg-stone-100 transition cursor-pointer"
              >
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-7xl mx-auto">{children}</main>
    </div>
  );
}

// ponytail: layout server auth check with inline signOutAction → skipped: multi-tab broadcast logout sync, add when concurrent staff browser sessions conflict.
