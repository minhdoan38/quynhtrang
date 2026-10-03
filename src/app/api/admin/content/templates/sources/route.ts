import { NextResponse } from 'next/server.js';

import {
  getStaffTemplateContext,
  templateRouteError,
  TemplateServiceError,
  type NonDynamicRouteContext,
  type TemplateRouteDependencies,
} from '../_shared.ts';

export async function GET(
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

    const url = new URL(request.url);
    const productId = url.searchParams.get('productId') ?? undefined;

    const items = await repo.listEligibleSourceProjects(staff.userId, productId);

    return NextResponse.json({ items });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
