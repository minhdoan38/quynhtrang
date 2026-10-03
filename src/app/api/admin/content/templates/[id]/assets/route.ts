import { NextResponse } from 'next/server.js';

import {
  getStaffTemplateContext,
  InvalidRouteInput,
  readJsonObject,
  templateRouteError,
  TemplateServiceError,
  type TemplateRouteDependencies,
} from '../../_shared.ts';
import { uploadTemplateAsset } from '../../../../../../../lib/services/template-assets.ts';

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
      const file = formData.get('file');
      if (!file || !(file instanceof Blob)) {
        throw new InvalidRouteInput('Missing file in form data');
      }
      fileBuffer = Buffer.from(await file.arrayBuffer());
      if (file instanceof File) {
        filename = file.name;
      }
      mimeType = file.type;
    } else if (contentType.includes('application/json')) {
      const body = await readJsonObject(request);
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
