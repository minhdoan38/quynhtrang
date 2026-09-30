import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSupabaseConfig,
  getSupabaseSecretKey,
  isSupabaseConfigured,
} from '../lib/supabase/config.ts';
import { createBrowserSupabaseClient } from '../lib/supabase/browser.ts';
import { createPrivilegedSupabaseClient } from '../lib/supabase/admin.ts';
const ORIGINAL_ENV = { ...process.env };

function resetEnv(overrides: Record<string, string | undefined> = {}) {
  for (const key of Object.keys(process.env)) {
    if (
      key.includes('SUPABASE') ||
      key === 'SERVICE_SUPABASESERVICE_KEY'
    ) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test('returns null when Supabase environment variables are missing', () => {
  resetEnv();

  assert.equal(getSupabaseConfig(), null);
  assert.equal(isSupabaseConfigured(), false);
});

test('returns null when only URL is provided', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  });

  assert.equal(getSupabaseConfig(), null);
  assert.equal(isSupabaseConfigured(), false);
});

test('returns null when only publishable key is provided', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_test_123',
  });

  assert.equal(getSupabaseConfig(), null);
  assert.equal(isSupabaseConfigured(), false);
});

test('reads standard NEXT_PUBLIC Supabase environment variables', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://standard.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_standard_123',
    SUPABASE_SECRET_KEY: 'sb_secret_standard_456',
  });

  assert.equal(isSupabaseConfigured(), true);
  assert.deepEqual(getSupabaseConfig(), {
    url: 'https://standard.supabase.co',
    publishableKey: 'sb_pub_standard_123',
    secretKey: 'sb_secret_standard_456',
  });
  assert.equal(getSupabaseSecretKey(), 'sb_secret_standard_456');
});

test('resolves fallbacks for SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
  resetEnv({
    SUPABASE_URL: 'https://fallback.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_anon_fallback_123',
  });

  assert.equal(isSupabaseConfigured(), true);
  const config = getSupabaseConfig();
  assert.equal(config?.url, 'https://fallback.supabase.co');
  assert.equal(config?.publishableKey, 'sb_anon_fallback_123');
  assert.equal(config?.secretKey, undefined);
});

test('prefers canonical public names over fallback names', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://primary.supabase.co',
    SUPABASE_URL: 'https://fallback.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_primary',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_pub_fallback',
  });
  assert.deepEqual(getSupabaseConfig(), {
    url: 'https://primary.supabase.co',
    publishableKey: 'sb_pub_primary',
  });
  assert.equal(getSupabaseConfig()?.secretKey, undefined);
});

test('resolves secret role key fallbacks in priority order', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://primary.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_primary',
    SERVICE_SUPABASESERVICE_KEY: 'sb_service_compat',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_service_role',
  });

  assert.equal(getSupabaseSecretKey(), 'sb_service_compat');

  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://primary.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_primary',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_service_role',
  });

  assert.equal(getSupabaseSecretKey(), 'sb_service_role');
});

test('rejects NEXT_PUBLIC_SUPABASE_SECRET_KEY as a valid secret', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://primary.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_primary',
    NEXT_PUBLIC_SUPABASE_SECRET_KEY: 'leaked_public_secret_should_not_be_used',
  });

  const config = getSupabaseConfig();
  assert.equal(config?.secretKey, undefined);
  assert.equal(getSupabaseSecretKey(), undefined);
});

test('omits secretKey and throws on secret access when running in browser', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://browser.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_browser',
    SUPABASE_SECRET_KEY: 'sb_secret_server_only',
  });

  const originalWindow = Reflect.get(globalThis, 'window');
  Reflect.set(globalThis, 'window', {});

  try {
    const config = getSupabaseConfig();
    assert.deepEqual(config, {
      url: 'https://browser.supabase.co',
      publishableKey: 'sb_pub_browser',
    });
    assert.throws(
      () => getSupabaseSecretKey(),
      /browser/i,
    );
    assert.throws(
      () => createPrivilegedSupabaseClient(),
      /browser/i,
    );
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Reflect.set(globalThis, 'window', originalWindow);
    }
  }
});
test('createPrivilegedSupabaseClient throws if secret key is missing', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://primary.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_primary',
  });

  assert.throws(
    () => createPrivilegedSupabaseClient(),
    /secret/i,
  );
});
test('createPrivilegedSupabaseClient throws if url is blank or missing', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: '   ',
    SUPABASE_URL: '',
    SUPABASE_SECRET_KEY: 'sb_secret_primary',
  });

  assert.throws(
    () => createPrivilegedSupabaseClient(),
    /url/i,
  );
});

test('treats whitespace or blank variables as missing in getSupabaseConfig', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: '   ',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '\t  \n',
  });

  assert.equal(getSupabaseConfig(), null);
  assert.equal(isSupabaseConfigured(), false);
});


test('createBrowserSupabaseClient throws if Supabase is not configured', () => {
  resetEnv();

  assert.throws(
    () => createBrowserSupabaseClient(),
    /configured/i,
  );
});


test('createBrowserSupabaseClient instantiates client when configured', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://primary.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_primary',
  });

  const client = createBrowserSupabaseClient();
  assert.ok(client);
  assert.ok(client.auth);
});

test('createPrivilegedSupabaseClient instantiates privileged client when configured', () => {
  resetEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://primary.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_pub_primary',
    SUPABASE_SECRET_KEY: 'sb_secret_primary',
  });

  const client = createPrivilegedSupabaseClient();
  assert.ok(client);
  assert.ok(client.auth);
  // cleanup process.env
  resetEnv(ORIGINAL_ENV);
});
