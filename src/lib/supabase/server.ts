import { cookies } from 'next/headers.js';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from './config.ts';

export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error('Supabase is not configured. Provide NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignores set cookie failures if invoked within read-only Server Component context
        }
      },
    },
  });
}

// ponytail: basic cookies adapter for Next.js SSR → skipped: custom cookie encoding/middleware sync, add when session cookies require custom serialization.
