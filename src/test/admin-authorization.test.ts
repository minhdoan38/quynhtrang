import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AuthorizationError,
  getOptionalStaff,
  requireStaff,
} from '../lib/admin/authorization.ts';

interface MockSupabaseOptions {
  user?: { id: string; email?: string } | null;
  authError?: Error | null;
  roleRow?: { role: string } | null;
  roleError?: Error | null;
}

function createMockSupabase(options: MockSupabaseOptions): SupabaseClient {
  return {
    auth: {
      async getUser() {
        if (options.authError) {
          return { data: { user: null }, error: options.authError };
        }
        return { data: { user: options.user ?? null }, error: null };
      },
    },
    from(table: string) {
      if (table !== 'staff_roles') {
        throw new Error(`Unexpected table query: ${table}`);
      }
      return {
        select(_fields: string) {
          return {
            eq(_column: string, _value: string) {
              return {
                async maybeSingle() {
                  if (options.roleError) {
                    return { data: null, error: options.roleError };
                  }
                  return { data: options.roleRow ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('Admin Authorization', () => {
  describe('getOptionalStaff', () => {
    it('returns null when user is unauthenticated', async () => {
      const client = createMockSupabase({ user: null });
      const staff = await getOptionalStaff(undefined, { supabaseClient: client });
      assert.equal(staff, null);
    });

    it('returns null when auth error occurs', async () => {
      const client = createMockSupabase({ authError: new Error('JWT expired') });
      const staff = await getOptionalStaff(undefined, { supabaseClient: client });
      assert.equal(staff, null);
    });

    it('returns null when user has no staff_roles row', async () => {
      const client = createMockSupabase({
        user: { id: 'user-regular', email: 'user@example.com' },
        roleRow: null,
      });
      const staff = await getOptionalStaff(undefined, { supabaseClient: client });
      assert.equal(staff, null);
    });

    it('returns null when role is not a valid staff role', async () => {
      const client = createMockSupabase({
        user: { id: 'user-other', email: 'other@example.com' },
        roleRow: { role: 'customer' },
      });
      const staff = await getOptionalStaff(undefined, { supabaseClient: client });
      assert.equal(staff, null);
    });

    it('returns editor identity when user has editor role', async () => {
      const client = createMockSupabase({
        user: { id: 'staff-editor-1', email: 'editor@quynhtrang.vn' },
        roleRow: { role: 'editor' },
      });
      const staff = await getOptionalStaff(undefined, { supabaseClient: client });
      assert.deepEqual(staff, {
        userId: 'staff-editor-1',
        role: 'editor',
        email: 'editor@quynhtrang.vn',
      });
    });

    it('returns admin identity when user has admin role', async () => {
      const client = createMockSupabase({
        user: { id: 'staff-admin-1', email: 'admin@quynhtrang.vn' },
        roleRow: { role: 'admin' },
      });
      const staff = await getOptionalStaff(undefined, { supabaseClient: client });
      assert.deepEqual(staff, {
        userId: 'staff-admin-1',
        role: 'admin',
        email: 'admin@quynhtrang.vn',
      });
    });
  });

  describe('requireStaff', () => {
    it('throws 401 AuthorizationError when unauthenticated', async () => {
      const client = createMockSupabase({ user: null });
      await assert.rejects(
        async () => {
          await requireStaff(undefined, undefined, { supabaseClient: client });
        },
        (error: unknown) => {
          assert(error instanceof AuthorizationError);
          assert.equal(error.status, 401);
          return true;
        }
      );
    });

    it('throws 403 AuthorizationError when user is not staff', async () => {
      const client = createMockSupabase({
        user: { id: 'user-regular', email: 'user@example.com' },
        roleRow: null,
      });
      await assert.rejects(
        async () => {
          await requireStaff(undefined, undefined, { supabaseClient: client });
        },
        (error: unknown) => {
          assert(error instanceof AuthorizationError);
          assert.equal(error.status, 403);
          return true;
        }
      );
    });

    it('succeeds for editor when any staff role is accepted', async () => {
      const client = createMockSupabase({
        user: { id: 'staff-editor-1', email: 'editor@quynhtrang.vn' },
        roleRow: { role: 'editor' },
      });
      const staff = await requireStaff(undefined, undefined, { supabaseClient: client });
      assert.equal(staff.userId, 'staff-editor-1');
      assert.equal(staff.role, 'editor');
    });

    it('succeeds for editor when editor role is explicitly required', async () => {
      const client = createMockSupabase({
        user: { id: 'staff-editor-1', email: 'editor@quynhtrang.vn' },
        roleRow: { role: 'editor' },
      });
      const staff = await requireStaff(undefined, 'editor', { supabaseClient: client });
      assert.equal(staff.userId, 'staff-editor-1');
      assert.equal(staff.role, 'editor');
    });

    it('throws 403 AuthorizationError when editor attempts admin-only operation', async () => {
      const client = createMockSupabase({
        user: { id: 'staff-editor-1', email: 'editor@quynhtrang.vn' },
        roleRow: { role: 'editor' },
      });
      await assert.rejects(
        async () => {
          await requireStaff(undefined, 'admin', { supabaseClient: client });
        },
        (error: unknown) => {
          assert(error instanceof AuthorizationError);
          assert.equal(error.status, 403);
          return true;
        }
      );
    });

    it('succeeds for admin when admin role is required', async () => {
      const client = createMockSupabase({
        user: { id: 'staff-admin-1', email: 'admin@quynhtrang.vn' },
        roleRow: { role: 'admin' },
      });
      const staff = await requireStaff(undefined, 'admin', { supabaseClient: client });
      assert.equal(staff.userId, 'staff-admin-1');
      assert.equal(staff.role, 'admin');
      assert.equal(staff.email, 'admin@quynhtrang.vn');
    });

    it('accepts request object as first parameter', async () => {
      const client = createMockSupabase({
        user: { id: 'staff-admin-1', email: 'admin@quynhtrang.vn' },
        roleRow: { role: 'admin' },
      });
      const req = new Request('https://quynhtrang.vn/api/admin/orders');
      const staff = await requireStaff(req, 'admin', { supabaseClient: client });
      assert.equal(staff.userId, 'staff-admin-1');
    });
  });
});
