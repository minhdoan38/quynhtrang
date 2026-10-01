import { NextResponse } from 'next/server.js';

import {
  getPrivilegedRepository,
  getStaffContext,
  routeError,
  type LibraryKind,
  type LibraryRouteDependencies,
} from '../../../_shared.ts';

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
  dependencies?: LibraryRouteDependencies,
) {
  try {
    const { kind: rawKind, id } = await context.params;
    const { repo } = await getStaffContext(request, dependencies);

    let kind: LibraryKind;
    if (rawKind === 'sticker' || rawKind === 'stickers') {
      kind = 'sticker';
    } else if (rawKind === 'font-face' || rawKind === 'fonts' || rawKind === 'font') {
      kind = 'font-face';
    } else {
      return NextResponse.json({ error: 'Invalid asset kind', code: 'INVALID_INPUT' }, { status: 400 });
    }

    const record = await repo.getRecord({ kind, id });
    if (!record) {
      return NextResponse.json({ error: 'Asset not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const privRepo = await getPrivilegedRepository(dependencies);
    const bytes = await privRepo.downloadObject(record.binary.bucket, record.binary.key);

    const headers: Record<string, string> = {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': record.binary.mimeType || 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      ETag: `"${record.binary.checksum.replace(/"/g, '')}"`,
    };

    if (
      record.binary.mimeType === 'image/svg+xml'
      || record.binary.key.endsWith('.svg')
    ) {
      headers['Content-Security-Policy'] = "default-src 'none'; sandbox;";
    }

    return new Response(bytes as BodyInit, { status: 200, headers });
  } catch (error) {
    return routeError(error);
  }
}
