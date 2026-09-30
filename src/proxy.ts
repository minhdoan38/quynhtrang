import { NextResponse, type NextRequest } from 'next/server.js';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseConfig } from './lib/supabase/config.ts';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  const isCustomerRoute = pathname.startsWith('/my-designs') || pathname.startsWith('/my-orders');
  const isCustomerLogin = pathname === '/login';
  const isAdminRoute = pathname.startsWith('/admin');

  if (!isAdminRoute && !isCustomerRoute && !isCustomerLogin) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-staff-user-id');
  requestHeaders.delete('x-staff-role');
  requestHeaders.set('x-admin-pathname', pathname);
  requestHeaders.set('x-pathname', pathname);
  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const config = getSupabaseConfig();
  if (!config) {
    if (pathname === '/admin/login') {
      return supabaseResponse;
    }
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname === '/admin/login') {
    return supabaseResponse;
  }

  if (isCustomerLogin) {
    if (user) {
      return NextResponse.redirect(new URL('/my-designs', request.url));
    }
    return supabaseResponse;
  }

  if (!user) {
    if (isAdminRoute) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('next', `${pathname}${search}`);
      const redirectResponse = NextResponse.redirect(loginUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }
    if (isCustomerRoute) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('returnUrl', `${pathname}${search}`);
      const redirectResponse = NextResponse.redirect(loginUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/admin/:path*', '/my-designs/:path*', '/my-orders/:path*', '/login'],
};
export { proxy as middleware };
export default proxy;

// ponytail: basic SSR cookie refresh in proxy → skipped: edge claim verification, add when admin route traversal volume scales.
