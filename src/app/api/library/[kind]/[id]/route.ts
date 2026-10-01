import { NextResponse } from 'next/server.js';

import type { LibraryKind } from '../../../../../lib/domain/asset-library.ts';
import { AssetLibraryRepository } from '../../../../../lib/repositories/asset-library-repository.ts';
import { createPrivilegedSupabaseClient } from '../../../../../lib/supabase/admin.ts';

export interface PublicLibraryRouteDependencies {
  createRepository?: () => Promise<AssetLibraryRepository> | AssetLibraryRepository;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
  dependencies?: PublicLibraryRouteDependencies,
) {
  try {
    const { kind: rawKind, id } = await context.params;

    let kind: LibraryKind;
    if (rawKind === 'sticker' || rawKind === 'stickers') {
      kind = 'sticker';
    } else if (rawKind === 'font-face' || rawKind === 'fonts' || rawKind === 'font') {
      kind = 'font-face';
    } else {
      return NextResponse.json({ error: 'Asset not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const repo = dependencies?.createRepository
      ? await dependencies.createRepository()
      : new AssetLibraryRepository(createPrivilegedSupabaseClient());

    const record = await repo.getRecord({ kind, id });
    if (!record) {
      return NextResponse.json({ error: 'Asset not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const isEligible = record.status === 'published'
      || (record.status === 'archived' && record.everPublishedAt !== null);

    if (!isEligible) {
      return NextResponse.json({ error: 'Asset not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const bytes = await repo.downloadObject(record.binary.bucket, record.binary.key);

    const headers: Record<string, string> = {
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${record.binary.checksum.replace(/"/g, '')}"`,
      'Content-Type': record.binary.mimeType || 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
    };

    if (
      record.binary.mimeType === 'image/svg+xml'
      || record.binary.key.endsWith('.svg')
    ) {
      headers['Content-Security-Policy'] = "default-src 'none'; sandbox;";
    }

    return new Response(bytes as BodyInit, { status: 200, headers });
  } catch (error) {
    console.error('Public library delivery failed', error);
    return NextResponse.json(
      { error: 'Asset delivery failed', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
