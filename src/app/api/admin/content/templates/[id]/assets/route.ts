import { NextResponse } from 'next/server.js';

import {
  getStaffTemplateContext,
  InvalidRouteInput,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type TemplateRouteDependencies,
} from '../../_shared.ts';
import { randomUUID } from 'node:crypto';
import {
  bulkUploadTemplateAssets,
  uploadTemplateAsset,
  type TemplateAssetUploadStatus,
} from '../../../../../../../lib/services/template-assets.ts';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: TemplateRouteDependencies,
) {
  try {
    const { staff, repo } = await getStaffTemplateContext(request, dependencies, 'editor');
    if (!repo) {
      throw new TemplateServiceError('INTERNAL_ERROR', 'Template repository unavailable', 500);
    }

    const { id } = await context.params;
    const template = await repo.getTemplate(id);
    if (!template) {
      throw new TemplateServiceError('NOT_FOUND', 'Template not found', 404);
    }

    const draft = await repo.getDraft(id);
    if (!draft) {
      throw new TemplateServiceError('NOT_FOUND', 'Active draft not found for template', 404);
    }

    let fileBuffer: Buffer | Uint8Array;
    let filename: string | undefined;
    let mimeType: string | undefined;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      let files = formData.getAll('files').filter((f): f is File => f instanceof File);
      if (files.length === 0) {
        const file = formData.get('file');
        if (file instanceof File) files = [file];
      }
      if (files.length === 0) {
        throw new InvalidRouteInput('Missing file in form data');
      }
      if (files.length > 1) {
        const items = await Promise.all(
          files.map(async (f) => ({
            requestId: randomUUID(),
            bytes: Buffer.from(await f.arrayBuffer()),
            filename: f.name,
            mimeType: f.type,
          })),
        );
        const results = await bulkUploadTemplateAssets(
          staff,
          { templateId: id, draftId: draft.id },
          items,
          { repo },
        );
        return NextResponse.json({ ok: true, results }, { status: 201 });
      }
      const singleFile = files[0]!;
      fileBuffer = Buffer.from(await singleFile.arrayBuffer());
      filename = singleFile.name;
      mimeType = singleFile.type;
    } else if (contentType.includes('application/json')) {
      const body = await readJsonObject(request);
      if (Array.isArray(body.items) || Array.isArray(body.files)) {
        const rawList = ((body.items || body.files) as Record<string, unknown>[]);
        const items = rawList.map((item) => {
          const raw = String(item.data ?? item.payload ?? item.bytes ?? '');
          const cleanBase64 = raw.replace(/^data:[^;]+;base64,/, '');
          return {
            requestId: typeof item.requestId === 'string' && item.requestId.trim() ? item.requestId.trim() : randomUUID(),
            bytes: Buffer.from(cleanBase64, 'base64'),
            filename: typeof item.filename === 'string' ? item.filename : undefined,
            mimeType: typeof item.mimeType === 'string' ? item.mimeType : undefined,
            status: typeof item.status === 'string' ? (item.status as TemplateAssetUploadStatus) : undefined,
          };
        });
        const results = await bulkUploadTemplateAssets(
          staff,
          { templateId: id, draftId: draft.id },
          items,
          { repo },
        );
        return NextResponse.json({ ok: true, results }, { status: 201 });
      }
      const rawData = body.data ?? body.payload ?? body.bytes;
      if (typeof rawData !== 'string') {
        throw new InvalidRouteInput('Missing image payload in request body');
      }
      const cleanBase64 = rawData.replace(/^data:[^;]+;base64,/, '');
      fileBuffer = Buffer.from(cleanBase64, 'base64');
      filename = typeof body.filename === 'string' ? body.filename : undefined;
      mimeType = typeof body.mimeType === 'string' ? body.mimeType : undefined;
    } else {
      fileBuffer = Buffer.from(await request.arrayBuffer());
      filename = request.headers.get('x-file-name') || undefined;
      mimeType = request.headers.get('content-type') || undefined;
    }
    if (!fileBuffer || fileBuffer.byteLength === 0) {
      throw new InvalidRouteInput('Image data cannot be empty');
    }

    const uploaded = await uploadTemplateAsset(
      staff,
      { templateId: id, draftId: draft.id },
      { bytes: fileBuffer, filename, mimeType },
      { repo },
    );

    return NextResponse.json({ ok: true, asset: uploaded }, { status: 201 });
  } catch (error: unknown) {
    return templateRouteError(error);
  }
}
