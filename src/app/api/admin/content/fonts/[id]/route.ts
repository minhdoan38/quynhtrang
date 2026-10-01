import { NextResponse } from 'next/server.js';

import type { LibraryStatus } from '../../../../../../lib/domain/asset-library.ts';
import {
  patchFontFamily,
  setFontFamilyStatus,
} from '../../../../../../lib/services/asset-library.ts';
import {
  getStaffContext,
  InvalidRouteInput,
  parseMetadata,
  parseMutationKey,
  readJsonObject,
  routeError,
  type LibraryRouteDependencies,
} from '../../_shared.ts';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: LibraryRouteDependencies,
) {
  try {
    const { id } = await context.params;
    const { repo } = await getStaffContext(request, dependencies);
    const family = await repo.getFontFamily(id);
    if (!family) {
      return NextResponse.json({ error: 'Font family not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const faces = await repo.listFontFaces(id);
    return NextResponse.json({ family, faces });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: LibraryRouteDependencies,
) {
  try {
    const { id } = await context.params;
    const { staff, repo } = await getStaffContext(request, dependencies);
    const body = await readJsonObject(request);
    const key = parseMutationKey(body);

    if (typeof body.status === 'string') {
      const status = body.status as LibraryStatus;
      const family = await setFontFamilyStatus(id, key, status, staff, repo);
      return NextResponse.json({ family });
    }

    const patchSource = typeof body.patch === 'object' && body.patch !== null ? body.patch : body;
    const patch = parseMetadata(patchSource);
    const family = await patchFontFamily(id, key, patch, staff, repo);
    return NextResponse.json({ family });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: LibraryRouteDependencies,
) {
  try {
    const { id } = await context.params;
    const { staff, repo } = await getStaffContext(request, dependencies);
    const body = await readJsonObject(request);
    const key = parseMutationKey(body);

    if (typeof body.status !== 'string') {
      throw new InvalidRouteInput('status is required');
    }
    const status = body.status as LibraryStatus;
    const family = await setFontFamilyStatus(id, key, status, staff, repo);
    return NextResponse.json({ family });
  } catch (error) {
    return routeError(error);
  }
}
