import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextResponse } from 'next/server.js';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { StaffIdentity, StaffRole } from './domain/order.ts';
import type { OrderRepository } from './repositories/order-repository.ts';
import { serverOrderStore } from './server-order-store.ts';
import { createPrivilegedSupabaseClient } from './supabase/admin.ts';
import { getSupabaseConfig } from './supabase/config.ts';
import { createServerSupabaseClient } from './supabase/server.ts';

export const GUEST_ORDER_COOKIE_NAME = 'quynhtrang_guest_order_access';
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function createGuestOrderAccessToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashGuestOrderAccessToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const name = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      cookies[name] = decodeURIComponent(val);
    }
  }
  return cookies;
}

export function setGuestOrderAccessCookie(
  response: NextResponse | Response,
  token: string,
  orderId?: string,
  options?: { maxAge?: number }
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = options?.maxAge ?? DEFAULT_COOKIE_MAX_AGE_SECONDS;
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };

  if ('cookies' in response && typeof (response as NextResponse).cookies?.set === 'function') {
    (response as NextResponse).cookies.set(GUEST_ORDER_COOKIE_NAME, token, cookieOptions);
    if (orderId) {
      (response as NextResponse).cookies.set(`guest_order_token_${orderId}`, token, cookieOptions);
    }
  } else {
    const mainHeader = `${GUEST_ORDER_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}`;
    response.headers.append('Set-Cookie', mainHeader);
    if (orderId) {
      const orderHeader = `guest_order_token_${orderId}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}`;
      response.headers.append('Set-Cookie', orderHeader);
    }
  }
}

export function getGuestOrderAccessTokenFromRequest(request: Request, orderId?: string): string | null {
  const customHeader = request.headers.get('x-guest-token')?.trim();
  if (customHeader) return customHeader;

  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) return bearerToken;
  }

  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);

  if (orderId && cookies[`guest_order_token_${orderId}`]) {
    return cookies[`guest_order_token_${orderId}`];
  }

  if (cookies[GUEST_ORDER_COOKIE_NAME]) {
    const val = cookies[GUEST_ORDER_COOKIE_NAME];
    if (val.startsWith('{')) {
      try {
        const parsed = JSON.parse(val) as Record<string, string>;
        if (orderId && parsed[orderId]) return parsed[orderId];
      } catch {
        // Fall back to scalar value
      }
    }
    return val;
  }

  return null;
}

export function getAllGuestTokensFromRequest(request: Request, orderId: string): string[] {
  const tokens = new Set<string>();

  const customHeader = request.headers.get('x-guest-token')?.trim();
  if (customHeader) {
    for (const piece of customHeader.split(',')) {
      const trimmed = piece.trim();
      if (trimmed) tokens.add(trimmed);
    }
  }

  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) tokens.add(bearerToken);
  }

  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);

  if (cookies[`guest_order_token_${orderId}`]) {
    tokens.add(cookies[`guest_order_token_${orderId}`]);
  }

  if (cookies[GUEST_ORDER_COOKIE_NAME]) {
    const val = cookies[GUEST_ORDER_COOKIE_NAME];
    if (val.startsWith('{')) {
      try {
        const parsed = JSON.parse(val) as Record<string, string>;
        if (parsed[orderId]) tokens.add(parsed[orderId]);
        for (const t of Object.values(parsed)) {
          if (typeof t === 'string' && t.trim()) tokens.add(t.trim());
        }
      } catch {
        tokens.add(val);
      }
    } else {
      tokens.add(val);
    }
  }

  for (const [name, val] of Object.entries(cookies)) {
    if (name.startsWith('guest_order_token_') && val) {
      tokens.add(val);
    }
  }

  return Array.from(tokens).filter(Boolean);
}

export async function verifyGuestOrderAccess(
  request: Request,
  orderId: string,
  options?: {
    supabaseClient?: SupabaseClient;
    orderRepo?: Pick<OrderRepository, 'getById'>;
  }
): Promise<boolean> {
  if (!orderId || typeof orderId !== 'string') return false;

  const candidateTokens = getAllGuestTokensFromRequest(request, orderId);
  if (candidateTokens.length === 0) return false;

  for (const token of candidateTokens) {
    const tokenHash = hashGuestOrderAccessToken(token);

    if (options?.orderRepo) {
      try {
        const order = await options.orderRepo.getById(orderId, { kind: 'guest', tokenHash });
        if (order) return true;
      } catch {
        // Repo error
      }
    }

    const config = getSupabaseConfig();
    const client = options?.supabaseClient ?? (config ? createPrivilegedSupabaseClient() : null);
    if (client) {
      try {
        const { data, error } = await client
          .from('guest_order_access')
          .select('order_id, expires_at')
          .eq('order_id', orderId)
          .eq('token_hash', tokenHash)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (!error && data && data.order_id === orderId) {
          return true;
        }
      } catch {
        // Fall back to serverOrderStore
      }
    }

    const guestRecord = serverOrderStore.getGuestAccess(orderId);
    if (guestRecord) {
      const match =
        guestRecord.tokenHash.length === tokenHash.length &&
        timingSafeEqual(Buffer.from(guestRecord.tokenHash), Buffer.from(tokenHash));
      if (match) {
        const expiresAt = new Date(guestRecord.expiresAt).getTime();
        if (expiresAt > Date.now()) {
          return true;
        }
      }
    }
  }

  return false;
}

export async function verifyStaffAccess(request: Request): Promise<StaffIdentity | null> {
  const staffUserId = request.headers.get('x-staff-user-id')?.trim();
  const staffRole = request.headers.get('x-staff-role')?.trim();
  if (staffUserId && (staffRole === 'admin' || staffRole === 'editor')) {
    return { userId: staffUserId, role: staffRole as StaffRole };
  }

  try {
    const config = getSupabaseConfig();
    if (!config) return null;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const privilegedClient = createPrivilegedSupabaseClient();
    const { data: staffRow, error: roleError } = await privilegedClient
      .from('staff_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!roleError && staffRow && (staffRow.role === 'admin' || staffRow.role === 'editor')) {
      return { userId: user.id, role: staffRow.role as StaffRole };
    }
  } catch {
    // Auth context not available
  }

  return null;
}
