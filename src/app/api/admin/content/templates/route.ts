import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server.js';

import type { DesignState } from '../../../../../lib/product-state.ts';
import type { TemplateStatus, TemplateTargetInput } from '../../../../../lib/domain/template.ts';
import {
  getStaffTemplateContext,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type NonDynamicRouteContext,
  type TemplateRouteDependencies,
} from './_shared.ts';

export async function GET(
  request: Request,
  context?: NonDynamicRouteContext,
  dependencies?: TemplateRouteDependencies,
) {
  try {
    const deps = dependencies ?? context;
    const { service } = await getStaffTemplateContext(request, deps, 'editor');
    if (!service) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template service unavailable', 500);
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') as TemplateStatus | null;
    const productId = url.searchParams.get('productId') ?? undefined;
    const categoryId = url.searchParams.get('categoryId') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;
    const pageParam = url.searchParams.get('page');
    const pageSizeParam = url.searchParams.get('pageSize');
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : undefined;
    const pageSize = pageSizeParam
      ? Math.max(1, Math.min(100, parseInt(pageSizeParam, 10)))
      : undefined;

    const result = await service.listAdminTemplates({
      status: status ?? undefined,
      productId,
      categoryId,
      search,
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}

export async function POST(
  request: Request,
  context?: NonDynamicRouteContext,
  dependencies?: TemplateRouteDependencies,
) {
  try {
    const deps = dependencies ?? context;
    const { staff, service } = await getStaffTemplateContext(request, deps, 'editor');
    if (!service) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template service unavailable', 500);
    }

    const body = await readJsonObject(request);
    const requestId =
      typeof body.requestId === 'string' && body.requestId.trim()
        ? body.requestId.trim()
        : randomUUID();

    const id = typeof body.id === 'string' ? body.id.trim() : undefined;
    const name = typeof body.name === 'string' ? body.name : '';
    const target = (body.target ?? {}) as TemplateTargetInput;
    const categoryId =
      body.categoryId === null
        ? null
        : typeof body.categoryId === 'string'
          ? body.categoryId
          : undefined;
    const tags = Array.isArray(body.tags) ? (body.tags as string[]) : undefined;
    const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : undefined;
    const initialDocument = body.initialDocument as DesignState | undefined;

    const result = await service.createTemplate(staff, {
      requestId,
      id,
      name,
      target,
      categoryId,
      tags,
      sortOrder,
      initialDocument,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
