import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseConfig, getSupabaseSecretKey } from './config.ts';

export function createPrivilegedSupabaseClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('createPrivilegedSupabaseClient cannot be called in browser environment');
  }

  const secretKey = getSupabaseSecretKey();
  if (!secretKey) {
    throw new Error('Supabase secret key is missing. Set SUPABASE_SECRET_KEY.');
  }

  const config = getSupabaseConfig();
  const url =
    config?.url ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    '';

  if (!url) {
    throw new Error('Supabase URL is missing. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.');
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ponytail: privileged client without connection pooling config → skipped: custom pooler endpoints/keepalive, add when high concurrency backend RPC workloads demand it.
