import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import {
  getStaffTemplateContext,
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
    let body: Record<string, unknown> = {};
    try {
      body = await readJsonObject(request);
    } catch {
      // Body optional on duplicate
    }

    const requestId =
      typeof body.requestId === 'string' && body.requestId.trim()
        ? body.requestId.trim()
        : randomUUID();

    const sourceVersionId =
      typeof body.sourceVersionId === 'string' && body.sourceVersionId.trim()
        ? body.sourceVersionId.trim()
        : undefined;

    const newName =
      typeof body.newName === 'string' && body.newName.trim()
        ? body.newName.trim()
        : typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : undefined;

    const newTemplateId =
      typeof body.newTemplateId === 'string' && body.newTemplateId.trim()
        ? body.newTemplateId.trim()
        : undefined;

    const result = await service.duplicateTemplate(staff, {
      requestId,
      sourceTemplateId: id,
      sourceVersionId,
      newName,
      newTemplateId,
    });

    return NextResponse.json({
      ok: true,
      template: result.template,
      draft: result.draft,
    });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
