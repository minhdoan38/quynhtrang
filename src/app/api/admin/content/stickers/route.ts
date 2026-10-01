import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server.js';

import { createStickerDraft } from '../../../../../lib/services/asset-library.ts';
import {
  formString,
  getStaffContext,
  parseListQuery,
  parseMetadataForm,
  requireFile,
  routeError,
  type LibraryRouteDependencies,
} from '../_shared.ts';

export async function GET(
  request: Request,
  dependencies?: LibraryRouteDependencies,
) {
  try {
    const { repo } = await getStaffContext(request, dependencies);
    const query = parseListQuery(request);
    const result = await repo.listStickers(query);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(
  request: Request,
  dependencies?: LibraryRouteDependencies,
) {
  try {
    const { staff, repo } = await getStaffContext(request, dependencies);
    const formData = await request.formData();
    const file = requireFile(formData);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const metadata = parseMetadataForm(formData);
    const requestId = formString(formData, 'requestId') ?? randomUUID();
    const filename = formString(formData, 'filename') ?? file.name;

    const item = await createStickerDraft(
      { bytes, filename, metadata, requestId },
      staff,
      repo,
    );

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
