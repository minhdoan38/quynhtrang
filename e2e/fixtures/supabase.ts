import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig, getSupabaseSecretKey } from '../../src/lib/supabase/config.ts';

const ALLOWED_TEST_PATTERNS = [
  /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/.*)?$/i,
  /^https?:\/\/[a-z0-9-]+\.test\.supabase\.co(?::\d+)?(?:\/.*)?$/i,
  /^https?:\/\/[a-z0-9-]*-test(?:\.[a-z0-9-]+)*\.supabase\.co(?::\d+)?(?:\/.*)?$/i,
  /^https?:\/\/test-[a-z0-9-]+\.supabase\.co(?::\d+)?(?:\/.*)?$/i,
  /^https?:\/\/[a-z0-9-]+\.test(?::\d+)?(?:\/.*)?$/i,
];

export function assertTestSupabaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('Supabase URL cannot be blank');
  }

  const isAllowed = ALLOWED_TEST_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!isAllowed) {
    throw new Error(
      `Refusing non-test Supabase URL: "${trimmed}". State 45 fixtures require isolated local or dedicated test Supabase instance.`,
    );
  }

  return trimmed;
}

export function createWorkerPrefix(workerIndex: number, runId = 'state45'): string {
  const safeRunId = runId.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  return `${safeRunId}-w${workerIndex}`;
}

export interface TestSupabaseClientOptions {
  workerIndex?: number;
  runId?: string;
  role?: 'service_role' | 'anon';
  url?: string;
  key?: string;
}

export function createTestSupabaseClient(
  options: TestSupabaseClientOptions = {},
): SupabaseClient {
  const config = getSupabaseConfig();
  const rawUrl = options.url ?? config?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const validatedUrl = assertTestSupabaseUrl(rawUrl);

  const secretKey = options.key ?? (options.role === 'anon'
    ? (config?.publishableKey ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'test-anon-key')
    : (getSupabaseSecretKey() ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? config?.publishableKey ?? 'test-service-key'));

  return createClient(validatedUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
