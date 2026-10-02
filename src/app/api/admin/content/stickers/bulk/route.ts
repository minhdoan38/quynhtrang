import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server.js';

import {
  bulkPublishStickers,
  bulkUpdateStickerMetadata,
  bulkUploadStickers,
} from '../../../../../../lib/services/asset-library.ts';
import {
  getStaffContext,
  InvalidRouteInput,
  parseMetadata,
  routeError,
  type NonDynamicRouteContext,
} from '../../_shared.ts';

export async function POST(
  request: Request,
  context?: NonDynamicRouteContext,
) {
  try {
    const { staff, repo } = await getStaffContext(request, context);
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      let files = formData.getAll('files').filter((f): f is File => f instanceof File);
      if (files.length === 0) {
        const file = formData.get('file');
        if (file instanceof File) files = [file];
      }
      if (files.length === 0) {
        throw new InvalidRouteInput('No files provided for bulk upload');
      }

      const metaRaw = formData.get('metadata');
      const metaParsed = metaRaw && typeof metaRaw === 'string' ? JSON.parse(metaRaw) : [];
      const items = await Promise.all(
        files.map(async (file, idx) => ({
          bytes: new Uint8Array(await file.arrayBuffer()),
          filename: file.name,
          metadata: parseMetadata(Array.isArray(metaParsed) ? metaParsed[idx] ?? {} : metaParsed),
          requestId: randomUUID(),
        })),
      );

      const results = await bulkUploadStickers(items, staff, repo);
      return NextResponse.json({ results });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new InvalidRouteInput('Request body must be a JSON object');
    }

    const action = String(
      body.action ?? body.operation ?? new URL(request.url).searchParams.get('action') ?? 'upload',
    ).toLowerCase();

    if (!Array.isArray(body.items)) {
      throw new InvalidRouteInput('items must be an array');
    }

    if (action === 'upload' || action === 'bulk-upload') {
      const items = (body.items as Record<string, unknown>[]).map((item) => {
        let bytes: Uint8Array;
        if (typeof item.bytes === 'string') {
          bytes = Buffer.from(item.bytes, 'base64');
        } else if (Array.isArray(item.bytes)) {
          bytes = new Uint8Array(item.bytes);
        } else {
          throw new InvalidRouteInput('Each upload item requires bytes (base64 or byte array)');
        }
        return {
          bytes,
          filename: typeof item.filename === 'string' ? item.filename : undefined,
          metadata: parseMetadata(item.metadata),
          requestId: typeof item.requestId === 'string' && item.requestId.trim()
            ? item.requestId.trim()
            : randomUUID(),
        };
      });

      const results = await bulkUploadStickers(items, staff, repo);
      return NextResponse.json({ results });
    }

    if (action === 'update-metadata' || action === 'updatemetadata' || action === 'metadata') {
      const items = (body.items as Record<string, unknown>[]).map((item) => {
        const refObj = item.ref && typeof item.ref === 'object' ? item.ref as Record<string, unknown> : null;
        const id = typeof item.id === 'string' ? item.id : (typeof refObj?.id === 'string' ? refObj.id : null);
        if (!id) throw new InvalidRouteInput('Item id is required');
        const keyObj = item.key && typeof item.key === 'object' ? item.key as Record<string, unknown> : null;
        const rev = Number(item.expectedRevision ?? keyObj?.expectedRevision);
        if (!Number.isInteger(rev) || rev < 0) {
          throw new InvalidRouteInput('expectedRevision must be a non-negative integer');
        }
        const reqId = typeof item.requestId === 'string'
          ? item.requestId
          : (typeof keyObj?.requestId === 'string' ? keyObj.requestId : undefined);
        const checksum = typeof item.checksum === 'string'
          ? item.checksum
          : (typeof refObj?.checksum === 'string' ? refObj.checksum : '');

        return {
          ref: {
            kind: 'sticker' as const,
            id,
            checksum,
          },
          key: {
            expectedRevision: rev,
            requestId: reqId && reqId.trim() ? reqId.trim() : randomUUID(),
          },
          patch: parseMetadata(item.patch ?? item),
        };
      });

      const results = await bulkUpdateStickerMetadata(items, staff, repo);
      return NextResponse.json({ results });
    }

    if (action === 'publish' || action === 'bulk-publish') {
      const items = (body.items as Record<string, unknown>[]).map((item) => {
        const refObj = item.ref && typeof item.ref === 'object' ? item.ref as Record<string, unknown> : null;
        const id = typeof item.id === 'string' ? item.id : (typeof refObj?.id === 'string' ? refObj.id : null);
        if (!id) throw new InvalidRouteInput('Item id is required');
        const keyObj = item.key && typeof item.key === 'object' ? item.key as Record<string, unknown> : null;
        const rev = Number(item.expectedRevision ?? keyObj?.expectedRevision);
        if (!Number.isInteger(rev) || rev < 0) {
          throw new InvalidRouteInput('expectedRevision must be a non-negative integer');
        }
        const validationId = typeof item.validationId === 'string' ? item.validationId.trim() : '';
        if (!validationId) throw new InvalidRouteInput('validationId is required for publish');
        const reqId = typeof item.requestId === 'string'
          ? item.requestId
          : (typeof keyObj?.requestId === 'string' ? keyObj.requestId : undefined);
        const checksum = typeof item.checksum === 'string'
          ? item.checksum
          : (typeof refObj?.checksum === 'string' ? refObj.checksum : '');

        return {
          ref: {
            kind: 'sticker' as const,
            id,
            checksum,
          },
          key: {
            expectedRevision: rev,
            requestId: reqId && reqId.trim() ? reqId.trim() : randomUUID(),
          },
          validationId,
        };
      });

      const results = await bulkPublishStickers(items, staff, repo);
      return NextResponse.json({ results });
    }

    throw new InvalidRouteInput(`Unsupported bulk action: ${action}`);
  } catch (error) {
    return routeError(error);
  }
}
