import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TEST_AUTH_IDENTITIES,
  createTestAuthHeaders,
  createTestAuthCookies,
} from '../../e2e/fixtures/auth.ts';
import {
  assertTestSupabaseUrl,
  createWorkerPrefix,
} from '../../e2e/fixtures/supabase.ts';
import { cleanupRecords, type CleanupRecord } from '../../e2e/fixtures/cleanup.ts';
import {
  simulateNetworkDelay,
  simulateOffline,
  simulateRouteFailure,
  simulateStorageWriteFailure,
} from '../../e2e/helpers/fault-injection.ts';
import { simulateCommittedResponseDrop } from '../../e2e/helpers/unknown-outcome.ts';

interface RegisteredRoute {
  handler: (route: FakeRoute) => Promise<void>;
  options?: { times?: number };
}

class FakeRoute {
  readonly events: string[];
  fulfilledStatus?: number;

  constructor(events: string[] = []) {
    this.events = events;
  }

  async abort(): Promise<void> {
    this.events.push('abort');
  }

  async continue(): Promise<void> {
    this.events.push('continue');
  }

  async fetch(): Promise<{ status(): number }> {
    this.events.push('fetch');
    return { status: () => 201 };
  }

  async fulfill(options: { status?: number }): Promise<void> {
    this.fulfilledStatus = options.status;
    this.events.push(`fulfill:${options.status}`);
  }
}

class FakePage {
  registered?: RegisteredRoute;
  readonly initScripts: string[] = [];

  async addInitScript(script: string | { content?: string }): Promise<void> {
    this.initScripts.push(typeof script === 'string' ? script : (script.content ?? ''));
  }
  async route(
    _pattern: string | RegExp,
    handler: RegisteredRoute['handler'],
    options?: RegisteredRoute['options'],
  ): Promise<void> {
    this.registered = { handler, options };
  }
}

describe('State 45 deterministic fixtures', () => {
  it('defines stable isolated Customer A/B, Admin, and Editor identities', () => {
    assert.deepEqual(Object.keys(TEST_AUTH_IDENTITIES), [
      'customerA',
      'customerB',
      'admin',
      'editor',
    ]);
    assert.equal(TEST_AUTH_IDENTITIES.customerA.userId, '45000000-0000-4000-8000-0000000000a1');
    assert.equal(TEST_AUTH_IDENTITIES.customerB.userId, '45000000-0000-4000-8000-0000000000b1');
    assert.equal(TEST_AUTH_IDENTITIES.admin.role, 'admin');
    assert.equal(TEST_AUTH_IDENTITIES.editor.role, 'editor');
    assert.notEqual(TEST_AUTH_IDENTITIES.customerA.email, TEST_AUTH_IDENTITIES.customerB.email);
    assert.deepEqual(createTestAuthHeaders('admin'), {
      'x-state45-test-actor': 'admin',
      'x-state45-test-user-id': '45000000-0000-4000-8000-0000000000ad',
    });
  });

  it('derives stable worker prefixes and rejects non-test Supabase URLs', () => {
    assert.equal(createWorkerPrefix(3, 'release-45'), 'release-45-w3');
    assert.equal(assertTestSupabaseUrl('http://127.0.0.1:54321'), 'http://127.0.0.1:54321');
    assert.equal(
      assertTestSupabaseUrl('https://release-hardening.test.supabase.co'),
      'https://release-hardening.test.supabase.co',
    );
    assert.throws(
      () => assertTestSupabaseUrl('https://production.supabase.co'),
      /Refusing non-test Supabase URL/,
    );
  });

  it('cleans only exact recorded IDs in reverse registration order', async () => {
    const calls: Array<[string, string, string]> = [];
    const client = {
      from(table: string) {
        return {
          delete() {
            return {
              async eq(column: string, id: string) {
                calls.push([table, column, id]);
                return { error: null };
              },
            };
          },
        };
      },
    };
    const records: CleanupRecord[] = [
      { table: 'projects', id: 'project-release-45-w3', column: 'id' },
      { table: 'orders', id: 'order-release-45-w3', column: 'id' },
    ];

    await cleanupRecords(client, 'http://localhost:54321', records);

    assert.deepEqual(calls, [
      ['orders', 'id', 'order-release-45-w3'],
      ['projects', 'id', 'project-release-45-w3'],
    ]);
  });

  it('formats Playwright cookies with url and no path, gating smoke staff role on non-production', () => {
    const env = process.env as Record<string, string | undefined>;
    const prevEnv = env.NODE_ENV;
    try {
      env.NODE_ENV = 'production';
      const prodCookies = createTestAuthCookies('admin', 'http://localhost:3000');
      assert.equal(prodCookies.some((c) => c.name === 'smoke_staff_role'), false);
      for (const cookie of prodCookies) {
        assert.ok(cookie.url, `Cookie ${cookie.name} missing url`);
        assert.equal(cookie.path, undefined, `Cookie ${cookie.name} must not specify path when url is present`);
      }

      env.NODE_ENV = 'development';
      const devCookies = createTestAuthCookies('admin', 'http://localhost:3000');
      const smokeRoleCookie = devCookies.find((c) => c.name === 'smoke_staff_role');
      assert.ok(smokeRoleCookie, 'Expected smoke_staff_role in development');
      assert.equal(smokeRoleCookie?.value, 'admin');
      for (const cookie of devCookies) {
        assert.ok(cookie.url, `Cookie ${cookie.name} missing url`);
        assert.equal(cookie.path, undefined, `Cookie ${cookie.name} must not specify path when url is present`);
      }
    } finally {
      if (prevEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = prevEnv;
    }
  });
});

describe('State 45 network fault contracts', () => {
  it('toggles browser context offline and returns a restore operation', async () => {
    const states: boolean[] = [];
    const restore = await simulateOffline({
      async setOffline(value: boolean) {
        states.push(value);
      },
    });
    await restore();
    assert.deepEqual(states, [true, false]);
  });

  it('fulfills a matched route with the controlled server status', async () => {
    const page = new FakePage();
    await simulateRouteFailure(page, '**/api/orders', 503);
    const route = new FakeRoute();
    await page.registered?.handler(route);
    assert.equal(route.fulfilledStatus, 503);
  });

  it('delays before continuing the real request', async () => {
    const page = new FakePage();
    await simulateNetworkDelay(page, '**/api/orders', 5);
    const route = new FakeRoute();
    const startedAt = Date.now();
    await page.registered?.handler(route);
    assert.ok(Date.now() - startedAt >= 4);
    assert.deepEqual(route.events, ['continue']);
  });

  it('forwards, verifies committed state, then drops one browser response', async () => {
    const page = new FakePage();
    const events: string[] = [];
    await simulateCommittedResponseDrop(page, '**/api/orders', async () => {
      events.push('verify');
    });
    const route = new FakeRoute(events);

    await page.registered?.handler(route);

    assert.deepEqual(events, ['fetch', 'verify', 'abort']);
    assert.equal(page.registered?.options?.times, 1);
  });

  it('injects storage write failure script into page', async () => {
    const page = new FakePage();
    await simulateStorageWriteFailure(page, 'localStorage', 'QuotaExceededError');
    assert.ok(page.initScripts.length > 0);
    assert.match(page.initScripts[0] as string, /QuotaExceededError/);
  });
});
