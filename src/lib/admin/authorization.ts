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

export async function requireCurrentStaff(requiredRole?: StaffRole): Promise<StaffIdentity> {
  const supabase = await createServerSupabaseClient();
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

  const userRole = staffData.role as StaffRole;
  if (requiredRole === 'admin' && userRole !== 'admin') {
    throw new AuthorizationError('Yêu cầu quyền quản trị viên', 403);
  }

  return {
    userId,
    role: userRole,
  };
}

export async function requireStaff(_request?: Request, requiredRole?: StaffRole): Promise<StaffIdentity> {
  return requireCurrentStaff(requiredRole);
}
