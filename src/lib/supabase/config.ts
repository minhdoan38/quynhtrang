export interface SupabaseConfig {
  url: string;
  publishableKey: string;
  secretKey?: string;
}

function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function getSupabaseSecretKey(): string | undefined {
  if (typeof window !== 'undefined') {
    throw new Error('Supabase secret key cannot be accessed in browser context');
  }

  // Never trust NEXT_PUBLIC-prefixed secrets
  return (
    cleanEnv(process.env.SUPABASE_SECRET_KEY) ??
    cleanEnv(process.env.SERVICE_SUPABASESERVICE_KEY) ??
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url =
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    cleanEnv(process.env.SUPABASE_URL);
  const publishableKey =
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !publishableKey) {
    return null;
  }

  // In browser context, never expose or attach server-side secretKey
  if (typeof window !== 'undefined') {
    return {
      url,
      publishableKey,
    };
  }

  const secretKey = getSupabaseSecretKey();

  return {
    url,
    publishableKey,
    ...(secretKey ? { secretKey } : {}),
  };
}

export function isSupabaseConfigured(): boolean {
  const url =
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    cleanEnv(process.env.SUPABASE_URL);
  const publishableKey =
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return Boolean(url && publishableKey);
}

// ponytail: literal process.env reads → skipped: runtime schema parsing (Zod), add when external env validation is needed.
