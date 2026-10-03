import type { SupabaseClient } from '@supabase/supabase-js';

import { TemplateServiceError } from '../../../../../lib/domain/template.ts';
import type { TemplateRepository } from '../../../../../lib/repositories/template-repository.ts';
import { resolveTemplateAsset } from '../../../../../lib/services/template-assets.ts';

export interface PublicTemplateAssetDependencies {
  repo?: TemplateRepository;
  supabaseClient?: SupabaseClient;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
  dependencies?: PublicTemplateAssetDependencies,
) {
  try {
    const { assetId } = await context.params;
    const resolved = await resolveTemplateAsset(
      assetId,
      { kind: 'published' },
      { repo: dependencies?.repo, supabaseClient: dependencies?.supabaseClient },
    );

    const etag = `"${resolved.checksum}"`;
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch === etag || ifNoneMatch === resolved.checksum) {
      return new Response(null, { status: 304 });
    }

    return new Response(Buffer.from(resolved.bytes), {
      status: 200,
      headers: {
        'Content-Type': resolved.mimeType,
        'Content-Length': String(resolved.byteSize),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'ETag': etag,
      },
    });
  } catch (error: unknown) {
    if (error instanceof TemplateServiceError && error.status === 404) {
      return Response.json({ error: error.message, code: 'NOT_FOUND' }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Failed to serve template asset';
    return Response.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
