import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import {
  getStaffTemplateContext,
  InvalidRouteInput,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type TemplateRouteDependencies,
} from '../../_shared.ts';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: TemplateRouteDependencies,
) {
  try {
    const { staff, service } = await getStaffTemplateContext(request, dependencies, 'editor');
    if (!service) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template service unavailable', 500);
    }

    const { id } = await context.params;
    const body = await readJsonObject(request);

    const expectedRevisionRaw = body.expectedRevision ?? body.expectedCatalogRevision;
    const expectedCatalogRevision =
      typeof expectedRevisionRaw === 'number'
        ? expectedRevisionRaw
        : typeof expectedRevisionRaw === 'string'
          ? parseInt(expectedRevisionRaw, 10)
          : -1;

    if (!Number.isInteger(expectedCatalogRevision) || expectedCatalogRevision < 1) {
      throw new InvalidRouteInput('expectedRevision must be a positive integer');
    }

    const requestId =
      typeof body.requestId === 'string' && body.requestId.trim()
        ? body.requestId.trim()
        : randomUUID();

    const template = await service.archiveTemplate(staff, {
      templateId: id,
      expectedCatalogRevision,
      requestId,
    });

    return NextResponse.json({ ok: true, template });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
