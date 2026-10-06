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
      path: '/',
      sameSite: 'Lax',
    },
  ];

  if (identity.role === 'admin' || identity.role === 'editor') {
    // Test staff bypass cookie used in isolated smoke/e2e test environment
    cookies.push({
      name: 'smoke_staff_role',
      value: identity.role,
      url: baseUrl,
      path: '/',
      sameSite: 'Lax',
    });
  }

  return cookies;
}

export interface CookieContextLike {
  addCookies(cookies: TestCookie[]): Promise<void>;
  setExtraHTTPHeaders?(headers: Record<string, string>): Promise<void>;
}

export async function applyTestAuth(
  context: CookieContextLike,
  actor: TestActorKey,
  baseUrl = 'http://localhost:3000',
): Promise<void> {
  const cookies = createTestAuthCookies(actor, baseUrl);
  await context.addCookies(cookies);
  if (context.setExtraHTTPHeaders) {
    await context.setExtraHTTPHeaders(createTestAuthHeaders(actor));
  }
}
