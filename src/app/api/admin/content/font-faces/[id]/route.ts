import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server.js';

import {
  deleteDraftAsset,
  replaceDraftBinary,
  updateAssetMetadata,
} from '../../../../../../lib/services/asset-library.ts';
import {
  getStaffContext,
  InvalidRouteInput,
  parseMetadata,
  parseMutationKey,
  readJsonObject,
  requireFile,
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
    const item = await repo.getFontFace(id);
    if (!item) {
      return NextResponse.json({ error: 'Font face not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ item });
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
    const patchSource = typeof body.patch === 'object' && body.patch !== null ? body.patch : body;
    const patch = parseMetadata(patchSource);

    const item = await updateAssetMetadata(
      { kind: 'font-face', id, checksum: '' },
      key,
      patch,
      staff,
      repo,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: LibraryRouteDependencies,
) {
  try {
    const { id } = await context.params;
    const { staff, repo } = await getStaffContext(request, dependencies);
    const contentType = request.headers.get('content-type') ?? '';

    let bytes: Uint8Array;
    let key: { expectedRevision: number; requestId: string };

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = requireFile(formData);
      bytes = new Uint8Array(await file.arrayBuffer());
      const revRaw = formData.get('expectedRevision');
      const expectedRevision = Number(revRaw);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
        throw new InvalidRouteInput('expectedRevision must be a non-negative integer');
      }
      const reqId = formData.get('requestId');
      const requestId = typeof reqId === 'string' && reqId.trim() ? reqId.trim() : randomUUID();
      key = { expectedRevision, requestId };
    } else {
      const body = await readJsonObject(request);
      key = parseMutationKey(body);
      if (typeof body.bytes === 'string') {
        bytes = Buffer.from(body.bytes, 'base64');
      } else if (Array.isArray(body.bytes)) {
        bytes = new Uint8Array(body.bytes);
      } else {
        throw new InvalidRouteInput('Binary bytes required');
      }
    }

    const item = await replaceDraftBinary(
      { kind: 'font-face', id, checksum: '' },
      key,
      bytes,
      staff,
      repo,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: LibraryRouteDependencies,
) {
  try {
    const { id } = await context.params;
    const { staff, repo } = await getStaffContext(request, dependencies);
    if (staff.role !== 'admin') {
      return NextResponse.json(
        { error: 'Yêu cầu quyền quản trị viên', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    let key: { expectedRevision: number; requestId: string };
    try {
      const body = await readJsonObject(request);
      key = parseMutationKey(body);
    } catch {
      const url = new URL(request.url);
      const rev = Number(url.searchParams.get('expectedRevision'));
      if (!Number.isInteger(rev) || rev < 0) {
        throw new InvalidRouteInput('expectedRevision must be a non-negative integer');
      }
      key = {
        expectedRevision: rev,
        requestId: url.searchParams.get('requestId') || randomUUID(),
      };
    }

    await deleteDraftAsset(
      { kind: 'font-face', id, checksum: '' },
      key,
      staff,
      repo,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
