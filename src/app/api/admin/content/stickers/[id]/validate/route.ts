import { NextResponse } from 'next/server.js';

import { validateAssetDraft } from '../../../../../../../lib/services/asset-library.ts';
import {
  getStaffContext,
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

    const receipt = await validateAssetDraft(
      { kind: 'sticker', id, checksum: '' },
      key,
      staff,
      repo,
    );
    return NextResponse.json({ receipt });
  } catch (error) {
    return routeError(error);
  }
}
