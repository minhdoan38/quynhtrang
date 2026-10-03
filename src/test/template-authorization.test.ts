import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextResponse } from 'next/server.js';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  assertTemplateOrigin,
  getStaffTemplateContext,
  InvalidRouteInput,
  requiredRoleForAction,
  templateRouteError,
  type TemplateAction,
} from '../app/api/admin/content/templates/_shared.ts';
import { AuthorizationError } from '../lib/admin/authorization.ts';
import { TemplateServiceError } from '../lib/domain/template.ts';

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

function createMockSupabaseForRole(role: 'customer' | 'editor' | 'admin' | 'anon'): SupabaseClient {
  if (role === 'anon') {
    return createMockSupabase({ user: null });
  }
  if (role === 'customer') {
    return createMockSupabase({
      user: { id: '00000000-0000-0000-0000-0000000000c1', email: 'customer@example.com' },
      roleRow: null,
    });
  }
  if (role === 'editor') {
    return createMockSupabase({
      user: { id: '00000000-0000-0000-0000-0000000000e1', email: 'editor@example.com' },
      roleRow: { role: 'editor' },
    });
  }
  return createMockSupabase({
    user: { id: '00000000-0000-0000-0000-0000000000a1', email: 'admin@example.com' },
    roleRow: { role: 'admin' },
  });
}

async function responseStatusFor(
  role: 'customer' | 'editor' | 'admin' | 'anon',
  action: TemplateAction,
): Promise<number> {
  const request = new Request(`http://localhost:3000/api/admin/content/templates/fixture-id/${action}`, {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    },
  });

  const mockSupabase = createMockSupabaseForRole(role);
  try {
    const requiredRole = requiredRoleForAction(action);
    const { staff } = await getStaffTemplateContext(
      request,
      { supabaseClient: mockSupabase },
      requiredRole,
    );
    const res = NextResponse.json({ ok: true, staffId: staff.userId, action });
    return res.status;
  } catch (error) {
    const res = templateRouteError(error);
    return res.status;
  }
}

describe('Template Authorization and Access Boundary', () => {
  describe('assertTemplateOrigin', () => {
    it('allows safe methods without origin header', () => {
      const getReq = new Request('http://localhost:3000/api/admin/content/templates');
      assert.doesNotThrow(() => assertTemplateOrigin(getReq));

      const headReq = new Request('http://localhost:3000/api/admin/content/templates', { method: 'HEAD' });
      assert.doesNotThrow(() => assertTemplateOrigin(headReq));
    });

    it('allows same-origin mutating requests when origin matches host', () => {
      const postReq = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
      });
      assert.doesNotThrow(() => assertTemplateOrigin(postReq));
    });

    it('allows same-origin mutating requests with x-forwarded-host', () => {
      const postReq = new Request('http://internal-node:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          origin: 'https://quynhtrang.vn',
          'x-forwarded-host': 'quynhtrang.vn',
        },
      });
      assert.doesNotThrow(() => assertTemplateOrigin(postReq));
    });

    it('rejects cross-origin mutating requests with 403', () => {
      const postReq = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          origin: 'http://attacker-site.com',
          host: 'localhost:3000',
        },
      });
      assert.throws(() => assertTemplateOrigin(postReq), (err: unknown) => {
        assert(err instanceof AuthorizationError);
        assert.equal(err.status, 403);
        assert.match(err.message, /cross-origin mutation forbidden/i);
        return true;
      });
    });

    it('rejects mutating request without origin or referer header', () => {
      const postReq = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
        },
      });
      assert.throws(() => assertTemplateOrigin(postReq), (err: unknown) => {
        assert(err instanceof AuthorizationError);
        assert.equal(err.status, 403);
        assert.match(err.message, /origin header missing/i);
        return true;
      });
    });

    it('allows mutating request without origin when referer matches host', () => {
      const postReq = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          referer: 'http://localhost:3000/admin/content/templates',
          host: 'localhost:3000',
        },
      });
      assert.doesNotThrow(() => assertTemplateOrigin(postReq));
    });

    it('rejects mutating request when referer does not match host', () => {
      const postReq = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          referer: 'http://evil.com/phishing',
          host: 'localhost:3000',
        },
      });
      assert.throws(() => assertTemplateOrigin(postReq), (err: unknown) => {
        assert(err instanceof AuthorizationError);
        assert.equal(err.status, 403);
        return true;
      });
    });

    it('rejects malformed origin header', () => {
      const postReq = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          origin: 'not-a-valid-url',
          host: 'localhost:3000',
        },
      });
      assert.throws(() => assertTemplateOrigin(postReq), (err: unknown) => {
        assert(err instanceof AuthorizationError);
        assert.equal(err.status, 403);
        return true;
      });
    });
  });

  describe('getStaffTemplateContext', () => {
    it('throws 401 when unauthenticated', async () => {
      const mockSupabase = createMockSupabaseForRole('anon');
      await assert.rejects(
        async () => {
          await getStaffTemplateContext(undefined, { supabaseClient: mockSupabase });
        },
        (err: unknown) => {
          assert(err instanceof AuthorizationError);
          assert.equal(err.status, 401);
          return true;
        },
      );
    });

    it('throws 403 when customer attempts staff access', async () => {
      const mockSupabase = createMockSupabaseForRole('customer');
      await assert.rejects(
        async () => {
          await getStaffTemplateContext(undefined, { supabaseClient: mockSupabase });
        },
        (err: unknown) => {
          assert(err instanceof AuthorizationError);
          assert.equal(err.status, 403);
          return true;
        },
      );
    });

    it('returns editor identity when editor accesses editor route', async () => {
      const mockSupabase = createMockSupabaseForRole('editor');
      const { staff } = await getStaffTemplateContext(undefined, { supabaseClient: mockSupabase }, 'editor');
      assert.equal(staff.role, 'editor');
      assert.equal(staff.userId, '00000000-0000-0000-0000-0000000000e1');
    });

    it('throws 403 when editor attempts admin-only operation', async () => {
      const mockSupabase = createMockSupabaseForRole('editor');
      await assert.rejects(
        async () => {
          await getStaffTemplateContext(undefined, { supabaseClient: mockSupabase }, 'admin');
        },
        (err: unknown) => {
          assert(err instanceof AuthorizationError);
          assert.equal(err.status, 403);
          return true;
        },
      );
    });

    it('returns admin identity when admin accesses admin route', async () => {
      const mockSupabase = createMockSupabaseForRole('admin');
      const { staff } = await getStaffTemplateContext(undefined, { supabaseClient: mockSupabase }, 'admin');
      assert.equal(staff.role, 'admin');
      assert.equal(staff.userId, '00000000-0000-0000-0000-0000000000a1');
    });

    it('validates request origin when request is passed', async () => {
      const crossOriginReq = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          origin: 'http://attacker.com',
          host: 'localhost:3000',
        },
      });
      const mockSupabase = createMockSupabaseForRole('admin');
      await assert.rejects(
        async () => {
          await getStaffTemplateContext(crossOriginReq, { supabaseClient: mockSupabase });
        },
        (err: unknown) => {
          assert(err instanceof AuthorizationError);
          assert.equal(err.status, 403);
          return true;
        },
      );
    });

    it('uses injected requireStaff dependency when provided', async () => {
      const customStaff = { userId: 'custom-staff-id', role: 'admin' as const };
      const { staff } = await getStaffTemplateContext(undefined, {
        requireStaff: async () => customStaff,
      });
      assert.equal(staff.userId, 'custom-staff-id');
    });
  });

  describe('templateRouteError', () => {
    it('maps 401 AuthorizationError to UNAUTHENTICATED', async () => {
      const res = templateRouteError(new AuthorizationError('Chưa đăng nhập', 401));
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.code, 'UNAUTHENTICATED');
    });

    it('maps 403 AuthorizationError to FORBIDDEN', async () => {
      const res = templateRouteError(new AuthorizationError('Không có quyền', 403));
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'FORBIDDEN');
    });

    it('maps TemplateServiceError with status code and error details', async () => {
      const errNotFound = new TemplateServiceError('NOT_FOUND', 'Template không tồn tại', 404);
      const res1 = templateRouteError(errNotFound);
      assert.equal(res1.status, 404);
      const data1 = await res1.json();
      assert.equal(data1.code, 'NOT_FOUND');

      const errRevision = new TemplateServiceError('REVISION_CONFLICT', 'Conflict', 409, { expectedRevision: 2 });
      const res2 = templateRouteError(errRevision);
      assert.equal(res2.status, 409);
      const data2 = await res2.json();
      assert.equal(data2.code, 'REVISION_CONFLICT');
      assert.deepEqual(data2.details, { expectedRevision: 2 });

      const errValidation = new TemplateServiceError('VALIDATION_FAILED', 'Validation error', 422);
      const res3 = templateRouteError(errValidation);
      assert.equal(res3.status, 422);
      const data3 = await res3.json();
      assert.equal(data3.code, 'VALIDATION_FAILED');
    });

    it('maps InvalidRouteInput and SyntaxError to 400 INVALID_INPUT', async () => {
      const res1 = templateRouteError(new InvalidRouteInput('Missing required field'));
      assert.equal(res1.status, 400);
      const data1 = await res1.json();
      assert.equal(data1.code, 'INVALID_INPUT');

      const res2 = templateRouteError(new SyntaxError('Unexpected token'));
      assert.equal(res2.status, 400);
      const data2 = await res2.json();
      assert.equal(data2.code, 'INVALID_INPUT');
    });

    it('maps unexpected generic errors to 500 INTERNAL_ERROR', async () => {
      const res = templateRouteError(new Error('Unexpected DB crash'));
      assert.equal(res.status, 500);
      const data = await res.json();
      assert.equal(data.code, 'INTERNAL_ERROR');
    });
  });

  describe('responseStatusFor role-action matrix', () => {
    it('customer cannot publish template (403)', async () => {
      assert.equal(await responseStatusFor('customer', 'publish'), 403);
    });

    it('editor cannot delete template (403)', async () => {
      assert.equal(await responseStatusFor('editor', 'delete'), 403);
    });

    it('editor can validate template (200)', async () => {
      assert.equal(await responseStatusFor('editor', 'validate'), 200);
    });

    it('editor can publish template (200)', async () => {
      assert.equal(await responseStatusFor('editor', 'publish'), 200);
    });

    it('editor cannot takeover template (403)', async () => {
      assert.equal(await responseStatusFor('editor', 'takeover'), 403);
    });

    it('admin can delete template (200)', async () => {
      assert.equal(await responseStatusFor('admin', 'delete'), 200);
    });

    it('admin can takeover template (200)', async () => {
      assert.equal(await responseStatusFor('admin', 'takeover'), 200);
    });

    it('anon cannot publish template (401)', async () => {
      assert.equal(await responseStatusFor('anon', 'publish'), 401);
    });

    it('customer cannot delete template (403)', async () => {
      assert.equal(await responseStatusFor('customer', 'delete'), 403);
    });
  });
});
