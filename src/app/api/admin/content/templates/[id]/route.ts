import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server.js';

import type { TemplateMetadataPatch, TemplateMutation } from '../../../../../../lib/domain/template.ts';
import {
  getStaffTemplateContext,
  InvalidRouteInput,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type TemplateRouteDependencies,
} from '../_shared.ts';

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

    return NextResponse.json(detail);
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}

export async function PATCH(
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

    if (!Number.isInteger(expectedCatalogRevision) || expectedCatalogRevision < 0) {
      throw new InvalidRouteInput('expectedRevision must be a non-negative integer');
    }

    const requestId =
      typeof body.requestId === 'string' && body.requestId.trim()
        ? body.requestId.trim()
        : randomUUID();

    const mutation: TemplateMutation = {
      templateId: id,
      expectedCatalogRevision,
      requestId,
    };

    const patch: TemplateMetadataPatch = {};
    if (typeof body.name === 'string') patch.name = body.name;
    if (body.categoryId !== undefined) {
      patch.categoryId = body.categoryId === null ? null : String(body.categoryId);
    }
    if (Array.isArray(body.tags)) patch.tags = body.tags as string[];
    if (typeof body.sortOrder === 'number') patch.sortOrder = body.sortOrder;

    const updated = await service.patchTemplateMetadata(staff, mutation, patch);
    return NextResponse.json({ template: updated });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
