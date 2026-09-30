import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '../supabase/server.ts';
import { isSupabaseConfigured } from '../supabase/config.ts';

function isSafeThumbnailPath(path: string | null | undefined): path is string {
  if (!path || typeof path !== 'string') {
    return false;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return false;
  }
  if (/^(https?:|data:|\/\/)/i.test(trimmed)) {
    return false;
  }
  if (trimmed.includes('..') || trimmed.includes('\\') || /%2e/i.test(trimmed)) {
    return false;
  }
  return true;
}

export async function resolveApprovedThumbnailUrl(
  supabase: SupabaseClient,
  thumbnailPath: string | null | undefined
): Promise<string | null> {
  if (!isSafeThumbnailPath(thumbnailPath)) {
    return null;
  }

  const cleanPath = thumbnailPath.trim().replace(/^approved-renders\//, '');

  try {
    const { data, error } = await supabase.storage
      .from('approved-renders')
      .createSignedUrl(cleanPath, 3600);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function getSecureThumbnailUrl(
  thumbnailPath: string | null,
  client?: SupabaseClient
): Promise<string | null> {
  if (!isSafeThumbnailPath(thumbnailPath)) {
    return null;
  }

  let supabase = client;
  if (!supabase) {
    if (!isSupabaseConfigured()) {
      return null;
    }
    try {
      supabase = await createServerSupabaseClient();
    } catch {
      return null;
    }
  }

  return resolveApprovedThumbnailUrl(supabase, thumbnailPath);
}
