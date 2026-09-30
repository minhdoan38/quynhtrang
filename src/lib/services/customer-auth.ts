import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '../supabase/browser.ts';

export interface CustomerProfile {
  userId: string;
  displayName: string;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function normalizeCustomerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateOtpFormat(otp: string): boolean {
  const clean = otp.trim();
  return /^\d{6}$/.test(clean);
}

export function sanitizeRedirectUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '/my-designs';
  const clean = url.trim();
  if (clean.startsWith('/') && !clean.startsWith('//') && !clean.includes('://')) {
    return clean;
  }
  return '/my-designs';
}

export function formatProjectUpdatedDate(timestamp: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - timestamp);
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 1) return 'Vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ngày trước`;
  return new Date(timestamp).toLocaleDateString('vi-VN');
}

export async function requestEmailOtp(
  email: string,
  client?: SupabaseClient
): Promise<{ ok: boolean; message?: string }> {
  const supabase = client ?? createBrowserSupabaseClient();
  const normalizedEmail = normalizeCustomerEmail(email);

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function verifyEmailOtp(
  email: string,
  token: string,
  client?: SupabaseClient
): Promise<{ ok: boolean; user?: User; message?: string }> {
  const supabase = client ?? createBrowserSupabaseClient();
  const normalizedEmail = normalizeCustomerEmail(email);
  const cleanToken = token.trim();

  if (!validateOtpFormat(cleanToken)) {
    return { ok: false, message: 'Mã OTP phải gồm 6 chữ số' };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: cleanToken,
    type: 'email',
  });

  if (error || !data.user) {
    return { ok: false, message: error?.message ?? 'Xác thực OTP không thành công' };
  }

  return { ok: true, user: data.user };
}

export async function ensureCustomerProfile(
  displayName?: string,
  client?: SupabaseClient
): Promise<CustomerProfile | null> {
  const supabase = client ?? createBrowserSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return null;
  }

  const user = authData.user;
  const name = displayName?.trim() || user.email?.split('@')[0] || 'Khách hàng';

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      display_name: name,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error || !data) {
    return null;
  }

  return {
    userId: String(data.user_id),
    displayName: String(data.display_name),
    phone: data.phone ? String(data.phone) : null,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

export async function getCurrentCustomer(
  client?: SupabaseClient
): Promise<{ user: User; profile: CustomerProfile | null } | null> {
  const supabase = client ?? createBrowserSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return null;
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  const profile: CustomerProfile | null = profileData
    ? {
      userId: String(profileData.user_id),
      displayName: String(profileData.display_name),
      phone: profileData.phone ? String(profileData.phone) : null,
      createdAt: String(profileData.created_at),
      updatedAt: String(profileData.updated_at),
    }
    : null;

  return {
    user: authData.user,
    profile,
  };
}

export async function customerSignOut(client?: SupabaseClient): Promise<void> {
  const supabase = client ?? createBrowserSupabaseClient();
  await supabase.auth.signOut();
}
