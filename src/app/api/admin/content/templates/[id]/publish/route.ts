import { NextResponse } from 'next/server.js';
import {
  getStaffTemplateContext,
  InvalidRouteInput,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type TemplateRouteDependencies,
} from '../../_shared.ts';
import { publishTemplate } from '../../../../../../../lib/services/template-management.ts';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: TemplateRouteDependencies,
) {
  try {
    const { staff, repo, service } = await getStaffTemplateContext(request, dependencies, 'editor');
    if (!repo && !service) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template repository unavailable', 500);
    }

    const { id } = await context.params;
    const body = await readJsonObject(request);

    const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
    if (!draftId) {
      throw new InvalidRouteInput('draftId is required');
    }

    const rawRevision = body.expectedRevision;
    const expectedRevision = typeof rawRevision === 'number' ? rawRevision : Number(rawRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new InvalidRouteInput('expectedRevision must be a positive integer');
    }

    const rawCatalogRevision = body.expectedCatalogRevision;
    const expectedCatalogRevision = typeof rawCatalogRevision === 'number'
      ? rawCatalogRevision
      : (rawCatalogRevision !== undefined ? Number(rawCatalogRevision) : 1);
    if (!Number.isInteger(expectedCatalogRevision) || expectedCatalogRevision < 1) {
      throw new InvalidRouteInput('expectedCatalogRevision must be a positive integer');
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      throw new InvalidRouteInput('sessionId is required');
    }

    const rawEpoch = body.leaseEpoch;
    const leaseEpoch = typeof rawEpoch === 'number' ? rawEpoch : Number(rawEpoch ?? 0);

    const validationId = typeof body.validationId === 'string' ? body.validationId.trim() : '';
    if (!validationId) {
      throw new InvalidRouteInput('validationId is required');
    }

    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!requestId) {
      throw new InvalidRouteInput('requestId is required');
    }

    const acknowledgedWarningIds = Array.isArray(body.acknowledgedWarningIds)
      ? body.acknowledgedWarningIds.filter((w): w is string => typeof w === 'string')
      : [];

    const revisionNote = typeof body.revisionNote === 'string' ? body.revisionNote : undefined;

    const input = {
      templateId: id,
      draftId,
      expectedRevision,
      expectedCatalogRevision,
      sessionId,
      leaseEpoch,
      validationId,
      requestId,
      acknowledgedWarningIds,
      revisionNote,
    };

    const version = service
      ? await service.publishTemplate(staff, input)
      : await publishTemplate(staff, input, { repo: repo! });

    return NextResponse.json({
      ok: true,
      version,
    });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
