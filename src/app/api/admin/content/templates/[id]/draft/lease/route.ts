import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import {
  getStaffTemplateContext,
  InvalidRouteInput,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type TemplateRouteDependencies,
} from '../../../_shared.ts';

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

    await context.params;
    const body = await readJsonObject(request);

    const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
    if (!draftId) {
      throw new InvalidRouteInput('draftId is required');
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      throw new InvalidRouteInput('sessionId is required');
    }

    const requestId =
      typeof body.requestId === 'string' && body.requestId.trim()
        ? body.requestId.trim()
        : randomUUID();

    const draft = await service.acquireDraftLease(staff, {
      draftId,
      sessionId,
      requestId,
    });

    return NextResponse.json({ ok: true, draft });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
