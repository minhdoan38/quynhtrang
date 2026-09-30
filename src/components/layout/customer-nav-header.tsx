'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Palette, Package, LogIn, LogOut, User } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser.ts';
import { customerSignOut } from '@/lib/services/customer-auth.ts';

export function CustomerNavHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await customerSignOut();
    setUserEmail(null);
    router.push('/');
    router.refresh();
  };

  // Don't render on admin routes
  if (pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <header className="h-[52px] border-b border-[#ECE6DC] bg-[#FFFDF8]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 select-none">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-serif font-bold text-base text-[#2E3338] tracking-tight">
          Quỳnh Trang
        </Link>

        <nav className="hidden sm:flex items-center gap-4 text-xs font-semibold">
          <Link
            href="/my-designs"
            className={`inline-flex items-center gap-1.5 transition-colors ${pathname === '/my-designs' ? 'text-[#315F86]' : 'text-[#666A6D] hover:text-[#2E3338]'
              }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Thiết kế của tôi</span>
          </Link>
          <Link
            href="/my-orders"
            className={`inline-flex items-center gap-1.5 transition-colors ${pathname === '/my-orders' ? 'text-[#315F86]' : 'text-[#666A6D] hover:text-[#2E3338]'
              }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Đơn hàng của tôi</span>
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3 text-xs">
        {userEmail ? (
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1 text-[#666A6D] max-w-[180px] truncate">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{userEmail}</span>
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1 text-[#666A6D] hover:text-red-600 font-medium transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-[#315F86] hover:text-[#244A69] font-semibold transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Đăng nhập</span>
          </Link>
        )}
      </div>
    </header>
  );
}
