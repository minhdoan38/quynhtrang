export interface SupabaseConfig {
  url: string;
  publishableKey: string;
  secretKey?: string;
}

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function getSupabaseSecretKey(): string | undefined {
  if (typeof window !== 'undefined') {
    throw new Error('Supabase secret key cannot be accessed in browser context');
  }

  // Never trust NEXT_PUBLIC-prefixed secrets
  return (
    readEnv('SUPABASE_SECRET_KEY') ??
    readEnv('SERVICE_SUPABASESERVICE_KEY') ??
    readEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL') ?? readEnv('SUPABASE_URL');
  const publishableKey =
    readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
    readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

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
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL') ?? readEnv('SUPABASE_URL');
  const publishableKey =
    readEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ??
    readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return Boolean(url && publishableKey);
}

// ponytail: direct process.env reads → skipped: runtime schema parsing (Zod), add when external env validation is needed.
