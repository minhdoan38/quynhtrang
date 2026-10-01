import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server.js';

import type { LicenseAcknowledgement } from '../../../../../../../lib/domain/asset-library.ts';
import { createFontFaceDraft } from '../../../../../../../lib/services/asset-library.ts';
import {
  getStaffContext,
  InvalidRouteInput,
  readJsonObject,
  requireFile,
  routeError,
  type LibraryRouteDependencies,
} from '../../../_shared.ts';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: LibraryRouteDependencies,
) {
  try {
    const { id } = await context.params;
    const { repo } = await getStaffContext(request, dependencies);
    const faces = await repo.listFontFaces(id);
    return NextResponse.json({ faces });
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
    const { id: familyId } = await context.params;
    const { staff, repo } = await getStaffContext(request, dependencies);
    const contentType = request.headers.get('content-type') ?? '';

    let bytes: Uint8Array;
    let filename: string | undefined;
    let requestId: string;
    let license: LicenseAcknowledgement | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = requireFile(formData);
      bytes = new Uint8Array(await file.arrayBuffer());
      const reqId = formData.get('requestId');
      requestId = typeof reqId === 'string' && reqId.trim() ? reqId.trim() : randomUUID();
      const fn = formData.get('filename');
      filename = typeof fn === 'string' && fn.trim() ? fn.trim() : file.name;

      const licenseRaw = formData.get('license');
      if (typeof licenseRaw === 'string') {
        const parsed = JSON.parse(licenseRaw);
        if (parsed && typeof parsed === 'object') {
          license = parsed as LicenseAcknowledgement;
        }
      }
    } else {
      const body = await readJsonObject(request);
      if (typeof body.bytes === 'string') {
        bytes = Buffer.from(body.bytes, 'base64');
      } else if (Array.isArray(body.bytes)) {
        bytes = new Uint8Array(body.bytes);
      } else {
        throw new InvalidRouteInput('Font binary bytes required');
      }
      filename = typeof body.filename === 'string' ? body.filename : undefined;
      requestId = typeof body.requestId === 'string' && body.requestId.trim()
        ? body.requestId.trim()
        : randomUUID();
      if (body.license && typeof body.license === 'object') {
        license = body.license as LicenseAcknowledgement;
      }
    }

    const item = await createFontFaceDraft(
      { bytes, filename, familyId, license, requestId },
      staff,
      repo,
    );

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
