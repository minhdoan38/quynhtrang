import { NextResponse } from 'next/server.js';

import { archiveAsset } from '../../../../../../../lib/services/asset-library.ts';
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
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      throw new InvalidRouteInput('reason is required');
    }

    const item = await archiveAsset(
      { kind: 'font-face', id, checksum: '' },
      key,
      reason,
      staff,
      repo,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}
