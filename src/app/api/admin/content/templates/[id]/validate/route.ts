import { NextResponse } from 'next/server.js';
import {
  getStaffTemplateContext,
  InvalidRouteInput,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type TemplateRouteDependencies,
} from '../../_shared.ts';
import { validateTemplateDraft } from '../../../../../../../lib/services/template-validation.ts';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: TemplateRouteDependencies,
) {
  try {
    const { staff, repo } = await getStaffTemplateContext(request, dependencies, 'editor');
    if (!repo) {
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

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      throw new InvalidRouteInput('sessionId is required');
    }

    const rawEpoch = body.leaseEpoch;
    const leaseEpoch = typeof rawEpoch === 'number' ? rawEpoch : Number(rawEpoch ?? 0);

    const receipt = await validateTemplateDraft(
      staff,
      {
        templateId: id,
        draftId,
        expectedRevision,
        sessionId,
        leaseEpoch,
      },
      { repository: repo },
    );

    return NextResponse.json({
      ok: true,
      receipt,
    });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
