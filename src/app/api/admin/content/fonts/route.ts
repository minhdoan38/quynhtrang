import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server.js';

import { normalizeAssetId, type FontCategory } from '../../../../../lib/domain/asset-library.ts';
import { createFontFamily } from '../../../../../lib/services/asset-library.ts';
import {
  getStaffContext,
  InvalidRouteInput,
  parseListQuery,
  readJsonObject,
  routeError,
  type NonDynamicRouteContext,
} from '../_shared.ts';

export async function GET(
  request: Request,
  context?: NonDynamicRouteContext,
) {
  try {
    const { repo } = await getStaffContext(request, context);
    const query = parseListQuery(request);
    const result = await repo.listFontFamilies(query);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(
  request: Request,
  context?: NonDynamicRouteContext,
) {
  try {
    const { staff, repo } = await getStaffContext(request, context);
    const body = await readJsonObject(request);

    const familyName = typeof body.familyName === 'string'
      ? body.familyName.trim()
      : (typeof body.name === 'string' ? body.name.trim() : '');
    if (!familyName) {
      throw new InvalidRouteInput('familyName is required');
    }

    const id = typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : (normalizeAssetId(familyName) || randomUUID());

    const requestId = typeof body.requestId === 'string' && body.requestId.trim()
      ? body.requestId.trim()
      : randomUUID();

    const item = await createFontFamily(
      {
        id,
        familyName,
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
        category: typeof body.category === 'string' ? body.category as FontCategory : undefined,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        sampleText: typeof body.sampleText === 'string' ? body.sampleText : undefined,
        requestId,
      },
      staff,
      repo,
    );

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
