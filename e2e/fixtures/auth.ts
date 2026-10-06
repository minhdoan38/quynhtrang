import { createServerClient } from '@supabase/ssr';

import { assertTestSupabaseUrl } from './supabase.ts';

export type TestActorRole = 'admin' | 'editor' | 'customer';

export type TestActorKey = 'customerA' | 'customerB' | 'admin' | 'editor';

export interface TestAuthIdentity {
  readonly actorKey: TestActorKey;
  readonly userId: string;
  readonly role: TestActorRole;
  readonly email: string;
  readonly displayName: string;
}

export const TEST_AUTH_IDENTITIES: Readonly<Record<TestActorKey, TestAuthIdentity>> = Object.freeze({
  customerA: Object.freeze({
    actorKey: 'customerA',
    userId: '45000000-0000-4000-8000-0000000000a1',
    role: 'customer',
    email: 'customer-a@state45.test',
    displayName: 'Khách hàng A (Test)',
  }),
  customerB: Object.freeze({
    actorKey: 'customerB',
    userId: '45000000-0000-4000-8000-0000000000b1',
    role: 'customer',
    email: 'customer-b@state45.test',
    displayName: 'Khách hàng B (Test)',
  }),
  admin: Object.freeze({
    actorKey: 'admin',
    userId: '45000000-0000-4000-8000-0000000000ad',
    role: 'admin',
    email: 'admin@state45.test',
    displayName: 'Quản trị viên (Test)',
  }),
  editor: Object.freeze({
    actorKey: 'editor',
    userId: '45000000-0000-4000-8000-0000000000ed',
    role: 'editor',
    email: 'editor@state45.test',
    displayName: 'Biên tập viên (Test)',
  }),
});

export function getTestAuthIdentity(actor: TestActorKey): TestAuthIdentity {
  const identity = TEST_AUTH_IDENTITIES[actor];
  if (!identity) {
    throw new Error(`Unknown test auth actor: ${String(actor)}`);
  }
  return identity;
}

export function createTestAuthHeaders(actor: TestActorKey): Record<string, string> {
  const identity = getTestAuthIdentity(actor);
  return {
    'x-state45-test-actor': identity.actorKey,
    'x-state45-test-user-id': identity.userId,
  };
}

export interface TestCookie {
  name: string;
  value: string;
  url?: string;
  path?: string;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export function createTestAuthCookies(
  actor: TestActorKey,
  baseUrl = 'http://localhost:3000',
): TestCookie[] {
  const identity = getTestAuthIdentity(actor);
  const cookies: TestCookie[] = [
    {
      name: 'state45_test_actor',
      value: identity.actorKey,
      url: baseUrl,
      sameSite: 'Lax',
    },
  ];

  if (
    process.env.NODE_ENV !== 'production' &&
    (identity.role === 'admin' || identity.role === 'editor')
  ) {
    cookies.push({
      name: 'smoke_staff_role',
      value: identity.role,
      url: baseUrl,
      sameSite: 'Lax',
    });
  }

  return cookies;
}

export interface TestSupabaseAuth {
  url: string;
  publishableKey: string;
  accessToken?: string;
  refreshToken?: string;
  password?: string;
}

export async function createTestSupabaseAuthCookies(
  actor: TestActorKey,
  auth: TestSupabaseAuth,
  baseUrl = 'http://localhost:3000',
): Promise<TestCookie[]> {
  const values: Record<string, string> = {};
  const supabase = createServerClient(assertTestSupabaseUrl(auth.url), auth.publishableKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookies) => {
        for (const cookie of cookies) {
          if (cookie.value) values[cookie.name] = cookie.value;
          else delete values[cookie.name];
        }
      },
    },
  });

  const result = auth.accessToken && auth.refreshToken
    ? await supabase.auth.setSession({
      access_token: auth.accessToken,
      refresh_token: auth.refreshToken,
    })
    : auth.password
      ? await supabase.auth.signInWithPassword({
        email: getTestAuthIdentity(actor).email,
        password: auth.password,
      })
      : null;

  if (!result) {
    throw new Error('Test Supabase auth requires accessToken + refreshToken or password');
  }
  if (result.error) {
    throw new Error(`Test Supabase authentication failed: ${result.error.message}`);
  }

  return Object.entries(values).map(([name, value]) => ({ name, value, url: baseUrl }));
}

export interface CookieContextLike {
  addCookies(cookies: TestCookie[]): Promise<void>;
  setExtraHTTPHeaders?(headers: Record<string, string>): Promise<void>;
}

export async function applyTestAuth(
  context: CookieContextLike,
  actor: TestActorKey,
  baseUrl = 'http://localhost:3000',
  supabaseAuth?: TestSupabaseAuth,
): Promise<void> {
  const cookies = supabaseAuth
    ? await createTestSupabaseAuthCookies(actor, supabaseAuth, baseUrl)
    : createTestAuthCookies(actor, baseUrl);
  await context.addCookies(cookies);
  if (context.setExtraHTTPHeaders) {
    await context.setExtraHTTPHeaders(createTestAuthHeaders(actor));
  }
}
