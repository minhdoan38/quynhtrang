import {
  getStaffTemplateContext,
  templateRouteError,
  TemplateServiceError,
  type TemplateRouteDependencies,
} from '../../../_shared.ts';
import { resolveTemplateAsset } from '../../../../../../../../lib/services/template-assets.ts';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; assetId: string }> },
  dependencies?: TemplateRouteDependencies,
) {
  try {
    const { staff, repo } = await getStaffTemplateContext(request, dependencies, 'editor');
    if (!repo) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template repository unavailable', 500);
    }

    const { id, assetId } = await context.params;
    const resolved = await resolveTemplateAsset(
      assetId,
      { kind: 'draft', templateId: id, actor: staff },
      { repo },
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
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'ETag': etag,
      },
    });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
