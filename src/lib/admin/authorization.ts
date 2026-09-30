import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffIdentity, StaffRole } from '../domain/order.ts';
import { createServerSupabaseClient } from '../supabase/server.ts';

export class AuthorizationError extends Error {
  readonly status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = status;
  }
}

export interface StaffAuthOptions {
  supabaseClient?: SupabaseClient;
}

export async function getOptionalStaff(
  _request?: Request,
  options?: StaffAuthOptions
): Promise<(StaffIdentity & { email?: string }) | null> {
  try {
    const supabase = options?.supabaseClient ?? (await createServerSupabaseClient());
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return null;
    }

    const userId = authData.user.id;
    const { data: staffData, error: staffError } = await supabase
      .from('staff_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (staffError || !staffData) {
      return null;
    }

    const role = staffData.role as string;
    if (role !== 'admin' && role !== 'editor') {
      return null;
    }

    return {
      userId,
      role: role as StaffRole,
      email: authData.user.email,
    };
  } catch {
    return null;
  }
}

export async function requireStaff(
  _request?: Request,
  requiredRole?: StaffRole,
  options?: StaffAuthOptions
): Promise<StaffIdentity & { email?: string }> {
  const supabase = options?.supabaseClient ?? (await createServerSupabaseClient());
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    throw new AuthorizationError('Chưa đăng nhập', 401);
  }

  const userId = authData.user.id;
  const { data: staffData, error: staffError } = await supabase
    .from('staff_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (staffError || !staffData) {
    throw new AuthorizationError('Bạn không có quyền truy cập', 403);
  }

  const role = staffData.role as string;
  if (role !== 'admin' && role !== 'editor') {
    throw new AuthorizationError('Bạn không có quyền truy cập', 403);
  }

  if (requiredRole === 'admin' && role !== 'admin') {
    throw new AuthorizationError('Yêu cầu quyền quản trị viên', 403);
  }

  if (requiredRole === 'editor' && role !== 'admin' && role !== 'editor') {
    throw new AuthorizationError('Yêu cầu quyền biên tập viên', 403);
  }

  return {
    userId,
    role: role as StaffRole,
    email: authData.user.email,
  };
}

export async function requireCurrentStaff(requiredRole?: StaffRole): Promise<StaffIdentity> {
  return requireStaff(undefined, requiredRole);
}
