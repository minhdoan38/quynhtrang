import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import type { DesignState } from '../../../../../../../lib/product-state.ts';
import {
  getStaffTemplateContext,
  InvalidRouteInput,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type TemplateRouteDependencies,
} from '../../_shared.ts';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: TemplateRouteDependencies,
) {
  try {
    const { service } = await getStaffTemplateContext(request, dependencies, 'editor');
    if (!service) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template service unavailable', 500);
    }

    const { id } = await context.params;
    const detail = await service.getTemplateDetail(id);
    if (!detail.draft) {
      throw new TemplateServiceError('NOT_FOUND', `Template draft for "${id}" not found`, 404);
    }

    return NextResponse.json({ draft: detail.draft });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}

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

    const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
    if (!draftId) {
      throw new InvalidRouteInput('draftId is required');
    }

    const expectedRevision =
      typeof body.expectedRevision === 'number'
        ? body.expectedRevision
        : typeof body.expectedRevision === 'string'
          ? parseInt(body.expectedRevision, 10)
          : -1;
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new InvalidRouteInput('expectedRevision must be a positive integer');
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      throw new InvalidRouteInput('sessionId is required');
    }

    const leaseEpochRaw = body.leaseEpoch ?? body.epoch;
    const leaseEpoch =
      typeof leaseEpochRaw === 'number'
        ? leaseEpochRaw
        : typeof leaseEpochRaw === 'string'
          ? parseInt(leaseEpochRaw, 10)
          : -1;
    if (!Number.isInteger(leaseEpoch) || leaseEpoch < 0) {
      throw new InvalidRouteInput('leaseEpoch must be a non-negative integer');
    }

    if (!body.document || typeof body.document !== 'object') {
      throw new InvalidRouteInput('document is required');
    }

    const requestId =
      typeof body.requestId === 'string' && body.requestId.trim()
        ? body.requestId.trim()
        : randomUUID();

    const saved = await service.saveDraft(staff, {
      templateId: id,
      draftId,
      expectedRevision,
      sessionId,
      leaseEpoch,
      document: body.document as DesignState,
      requestId,
    });

    return NextResponse.json({ ok: true, value: saved });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
