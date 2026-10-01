import { NextResponse } from 'next/server.js';

import { publishAsset } from '../../../../../../../lib/services/asset-library.ts';
import {
  getStaffContext,
  InvalidRouteInput,
  parseMutationKey,
  readJsonObject,
  routeError,
  type LibraryRouteDependencies,
} from '../../../_shared.ts';

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
    const validationId = typeof body.validationId === 'string' ? body.validationId.trim() : '';
    if (!validationId) {
      throw new InvalidRouteInput('validationId is required');
    }

    const item = await publishAsset(
      { kind: 'font-face', id, checksum: '' },
      key,
      validationId,
      staff,
      repo,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}
