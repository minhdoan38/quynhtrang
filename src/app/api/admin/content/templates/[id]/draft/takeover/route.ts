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
    const { staff, service } = await getStaffTemplateContext(request, dependencies, 'admin');
    if (!service) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template service unavailable', 500);
    }

    await context.params;
    const body = await readJsonObject(request);

    const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
    if (!draftId) {
      throw new InvalidRouteInput('draftId is required');
    }

    const expectedRevisionRaw = body.expectedRevision ?? body.draftRevision;
    const expectedRevision =
      typeof expectedRevisionRaw === 'number'
        ? expectedRevisionRaw
        : typeof expectedRevisionRaw === 'string'
          ? parseInt(expectedRevisionRaw, 10)
          : -1;
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new InvalidRouteInput('expectedRevision must be a positive integer');
    }

    const expectedEpochRaw = body.expectedEpoch ?? body.epoch;
    const expectedEpoch =
      typeof expectedEpochRaw === 'number'
        ? expectedEpochRaw
        : typeof expectedEpochRaw === 'string'
          ? parseInt(expectedEpochRaw, 10)
          : -1;
    if (!Number.isInteger(expectedEpoch) || expectedEpoch < 0) {
      throw new InvalidRouteInput('expectedEpoch must be a non-negative integer');
    }

    const newSessionId = typeof body.newSessionId === 'string' ? body.newSessionId.trim() : '';
    if (!newSessionId) {
      throw new InvalidRouteInput('newSessionId is required');
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 500) {
      throw new InvalidRouteInput('reason must be between 3 and 500 characters');
    }

    const requestId =
      typeof body.requestId === 'string' && body.requestId.trim()
        ? body.requestId.trim()
        : randomUUID();

    const draft = await service.takeoverDraft(staff, {
      draftId,
      expectedRevision,
      expectedEpoch,
      newSessionId,
      reason,
      requestId,
    });

    return NextResponse.json({ ok: true, draft });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
