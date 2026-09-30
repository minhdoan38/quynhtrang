import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveApprovedThumbnailUrl(
  supabase: SupabaseClient,
  thumbnailPath: string | null | undefined
): Promise<string | null> {
  if (!thumbnailPath || thumbnailPath.trim() === '') {
    return null;
  }

  if (
    thumbnailPath.startsWith('http://') ||
    thumbnailPath.startsWith('https://') ||
    thumbnailPath.startsWith('data:')
  ) {
    return thumbnailPath;
  }

  try {
    const { data, error } = await supabase.storage
      .from('approved-renders')
      .createSignedUrl(thumbnailPath, 3600);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}
