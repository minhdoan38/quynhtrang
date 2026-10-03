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
    const { service } = await getStaffTemplateContext(request, deps, 'editor');
    if (!service) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template service unavailable', 500);
    }

    const categories = await service.listCategories();
    return NextResponse.json({ categories });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
