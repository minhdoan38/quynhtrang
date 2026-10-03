import { NextResponse } from 'next/server.js';

import type { TemplateTargetInput } from '../../../../../../lib/domain/template.ts';
import {
  getStaffTemplateContext,
  InvalidRouteInput,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type NonDynamicRouteContext,
  type TemplateRouteDependencies,
} from '../_shared.ts';
import { createTemplateFromProject } from '../../../../../../lib/services/template-assets.ts';

export async function POST(
  request: Request,
  context?: NonDynamicRouteContext,
  dependencies?: TemplateRouteDependencies,
) {
  try {
    const deps = dependencies ?? context;
    const { staff, repo } = await getStaffTemplateContext(request, deps, 'editor');
    if (!repo) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template repository unavailable', 500);
    }

    const body = await readJsonObject(request);

    const sourceProjectId = typeof body.sourceProjectId === 'string' ? body.sourceProjectId.trim() : '';
    if (!sourceProjectId) {
      throw new InvalidRouteInput('sourceProjectId is required');
    }

    const expectedSourceRevision = typeof body.expectedSourceRevision === 'number'
      ? body.expectedSourceRevision
      : typeof body.expectedSourceRevision === 'string'
        ? parseInt(body.expectedSourceRevision, 10)
        : NaN;

    if (Number.isNaN(expectedSourceRevision)) {
      throw new InvalidRouteInput('expectedSourceRevision must be a valid number');
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw new InvalidRouteInput('name is required');
    }

    const rightsAcknowledged = Boolean(body.rightsAcknowledged);

    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!requestId) {
      throw new InvalidRouteInput('requestId is required');
    }

    const rawTarget = body.target;
    if (!rawTarget || typeof rawTarget !== 'object') {
      throw new InvalidRouteInput('target object is required');
    }
    const target = rawTarget as TemplateTargetInput;
    if (!target.productId || !target.variantId) {
      throw new InvalidRouteInput('target must include productId and variantId');
    }

    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : null;
    const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string') : [];
    const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;

    const result = await createTemplateFromProject(
      staff,
      {
        sourceProjectId,
        expectedSourceRevision,
        target,
        name,
        rightsAcknowledged,
        requestId,
        categoryId,
        tags,
        sortOrder,
      },
      { repo },
    );

    return NextResponse.json(
      {
        ok: true,
        template: result.template,
        draft: result.draft,
        copiedAssetsCount: result.copiedAssetsCount,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
