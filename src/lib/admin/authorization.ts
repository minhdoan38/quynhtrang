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

type StaffResolution =
  | { ok: true; staff: StaffIdentity & { email?: string } }
  | { ok: false; error: 'UNAUTHENTICATED' | 'NOT_STAFF' };

async function resolveStaffIdentity(supabase: SupabaseClient): Promise<StaffResolution> {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }

  const userId = authData.user.id;
  const { data: staffData, error: staffError } = await supabase
    .from('staff_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (staffError || !staffData) {
    return { ok: false, error: 'NOT_STAFF' };
  }

  const role = staffData.role as string;
  if (role !== 'admin' && role !== 'editor') {
    return { ok: false, error: 'NOT_STAFF' };
  }

  return {
    ok: true,
    staff: {
      userId,
      role: role as StaffRole,
      email: authData.user.email,
    },
  };
}

export async function getOptionalStaff(
  _request?: Request,
  options?: StaffAuthOptions
): Promise<(StaffIdentity & { email?: string }) | null> {
  try {
    const supabase = options?.supabaseClient ?? (await createServerSupabaseClient());
    const result = await resolveStaffIdentity(supabase);
    return result.ok ? result.staff : null;
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
  const result = await resolveStaffIdentity(supabase);

  if (!result.ok) {
    if (result.error === 'UNAUTHENTICATED') {
      throw new AuthorizationError('Chưa đăng nhập', 401);
    }
    throw new AuthorizationError('Bạn không có quyền truy cập', 403);
  }

  if (requiredRole === 'admin' && result.staff.role !== 'admin') {
    throw new AuthorizationError('Yêu cầu quyền quản trị viên', 403);
  }

  return result.staff;
}

export async function requireCurrentStaff(requiredRole?: StaffRole): Promise<StaffIdentity> {
  return requireStaff(undefined, requiredRole);
}
