import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server.js';

import {
  AuthorizationError,
  getOptionalStaff,
  isTestStaffBypassAllowed,
  requireStaff,
} from '../lib/admin/authorization.ts';
import { proxy } from '../proxy.ts';

const SYNTHETIC_STAFF_ENV_KEYS = [
  'NODE_ENV',
  'ENABLE_TEST_STAFF_BYPASS',
  'SMOKE_TEST_STAFF_ROLE',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;

async function withSyntheticStaffEnv(
  values: Partial<Record<(typeof SYNTHETIC_STAFF_ENV_KEYS)[number], string>>,
  run: () => Promise<void>
): Promise<void> {
  const previous = Object.fromEntries(
    SYNTHETIC_STAFF_ENV_KEYS.map((key) => [key, process.env[key]])
  );
  try {
    const env = process.env as Record<string, string | undefined>;
    for (const key of SYNTHETIC_STAFF_ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    await run();
  } finally {
    const env = process.env as Record<string, string | undefined>;
    for (const key of SYNTHETIC_STAFF_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
}

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

describe('Synthetic staff bypass isolation', () => {
  it('ignores synthetic environment role in production and requires real authentication', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'production',
        ENABLE_TEST_STAFF_BYPASS: '1',
        SMOKE_TEST_STAFF_ROLE: 'admin',
      },
      async () => {
        const client = createMockSupabase({ user: null });
        await assert.rejects(
          () => requireStaff(undefined, undefined, { supabaseClient: client }),
          (error: unknown) => {
            assert(error instanceof AuthorizationError);
            assert.equal(error.status, 401);
            return true;
          }
        );
      }
    );
  });

  it('ignores smoke_staff_role cookie in production proxy routing', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'production',
        ENABLE_TEST_STAFF_BYPASS: '1',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      },
      async () => {
        const request = new NextRequest('https://quynhtrang.vn/admin/orders', {
          headers: { cookie: 'smoke_staff_role=admin' },
        });
        const response = await proxy(request);
        assert.equal(response.status, 307);
        assert.equal(response.headers.get('location'), 'https://quynhtrang.vn/admin/login?next=%2Fadmin%2Forders');
      }
    );
  });

  it('requires explicit opt-in before honoring synthetic staff role outside production', async () => {
    await withSyntheticStaffEnv(
      { NODE_ENV: 'test', SMOKE_TEST_STAFF_ROLE: 'admin' },
      async () => {
        const client = createMockSupabase({ user: null });
        await assert.rejects(
          () => requireStaff(undefined, undefined, { supabaseClient: client }),
          (error: unknown) => {
            assert(error instanceof AuthorizationError);
            assert.equal(error.status, 401);
            return true;
          }
        );
      }
    );
  });

  it('honors synthetic staff role when non-production test bypass is explicitly enabled', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'test',
        ENABLE_TEST_STAFF_BYPASS: '1',
        SMOKE_TEST_STAFF_ROLE: 'admin',
      },
      async () => {
        const staff = await requireStaff(undefined, 'admin', {
          supabaseClient: createMockSupabase({ user: null }),
        });
        assert.equal(staff.role, 'admin');
        assert.equal(staff.email, 'admin@quynhtrang.test');
      }
    );
  });

  it('denies synthetic editor role for Admin-only operations', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'test',
        ENABLE_TEST_STAFF_BYPASS: '1',
        SMOKE_TEST_STAFF_ROLE: 'editor',
      },
      async () => {
        await assert.rejects(
          () => requireStaff(undefined, 'admin'),
          (error: unknown) => {
            assert(error instanceof AuthorizationError);
            assert.equal(error.status, 403);
            return true;
          }
        );
      }
    );
  });

  it('ignores synthetic environment role in getOptionalStaff in production', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'production',
        ENABLE_TEST_STAFF_BYPASS: '1',
        SMOKE_TEST_STAFF_ROLE: 'admin',
      },
      async () => {
        const client = createMockSupabase({ user: null });
        const staff = await getOptionalStaff(undefined, { supabaseClient: client });
        assert.equal(staff, null);
      }
    );
  });

  it('isTestStaffBypassAllowed returns false in production regardless of flag', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'production',
        ENABLE_TEST_STAFF_BYPASS: '1',
      },
      async () => {
        assert.equal(isTestStaffBypassAllowed(), false);
      }
    );
  });

  it('isTestStaffBypassAllowed returns false in development when flag is absent', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'development',
      },
      async () => {
        assert.equal(isTestStaffBypassAllowed(), false);
      }
    );
  });

  it('isTestStaffBypassAllowed returns true in non-production only when flag is 1', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'development',
        ENABLE_TEST_STAFF_BYPASS: '1',
      },
      async () => {
        assert.equal(isTestStaffBypassAllowed(), true);
      }
    );
  });

  it('ignores smoke_staff_role cookie in non-production proxy routing when flag is absent', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'development',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      },
      async () => {
        const request = new NextRequest('https://quynhtrang.vn/admin/orders', {
          headers: { cookie: 'smoke_staff_role=admin' },
        });
        const response = await proxy(request);
        assert.equal(response.status, 307);
        assert.equal(response.headers.get('location'), 'https://quynhtrang.vn/admin/login?next=%2Fadmin%2Forders');
      }
    );
  });

  it('allows smoke_staff_role cookie in non-production proxy routing when bypass is enabled', async () => {
    await withSyntheticStaffEnv(
      {
        NODE_ENV: 'development',
        ENABLE_TEST_STAFF_BYPASS: '1',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      },
      async () => {
        const request = new NextRequest('https://quynhtrang.vn/admin/orders', {
          headers: { cookie: 'smoke_staff_role=admin' },
        });
        const response = await proxy(request);
        assert.equal(response.status, 200);
      }
    );
  });
});

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
