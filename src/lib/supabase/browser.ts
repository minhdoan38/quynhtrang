import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from './config.ts';

export function createBrowserSupabaseClient(): SupabaseClient {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('Supabase is not configured. Provide NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  return createBrowserClient(config.url, config.publishableKey);
}

// ponytail: single client factory without singleton caching → skipped: module-level client caching, add when duplicate listeners or socket churn appears.
