import { createHash, randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { StaffIdentity } from '../domain/order.ts';
import { createInitialState, type DesignState } from '../product-state.ts';
import {
  TemplateServiceError,
  type AttachTemplateAssetInput,
  type TemplateDraftRecord,
  type TemplateRecord,
  type TemplateTargetInput,
} from '../domain/template.ts';
import { TemplateRepository } from '../repositories/template-repository.ts';
import { createPrivilegedSupabaseClient } from '../supabase/admin.ts';

// ponytail: stdlib crypto + sharp covers validation and hashing. Max 10 MiB raster limit per State 43 spec.
const MAX_RASTER_BYTES = 10 * 1024 * 1024;
const MAX_DECOMPRESSION_PIXELS = 40_000_000;
const MAX_RASTER_DIMENSION = 8192;

export interface TemplateAssetCollectInfo {
  everPublished: boolean;
  referenced: boolean;
  pendingOperation: boolean;
  ageHours: number;
}

export function canCollectTemplateAsset(info: TemplateAssetCollectInfo): boolean {
  if (info.everPublished) return false;
  if (info.referenced) return false;
  if (info.pendingOperation) return false;
  return info.ageHours >= 24;
}

export interface TemplateAssetRef {
  assetId: string;
  sourceKey: string;
  role: 'image' | 'element' | 'original' | 'derived' | 'mask';
  elementId?: string;
}

export function isTemplateAssetPath(pathOrUrl: string): boolean {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return false;
  const trimmed = pathOrUrl.trim();
  if (trimmed.startsWith('template-asset://')) return true;
  if (trimmed.includes('api/templates/assets/')) return true;
  if (trimmed.includes('api/admin/content/templates/') && trimmed.includes('/assets/')) return true;
  return false;
}

export function extractTemplateAssetId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const protoMatch = trimmed.match(/^template-asset:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (protoMatch) return protoMatch[1].toLowerCase();
  const pubMatch = trimmed.match(/(?:^|\/)api\/templates\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (pubMatch) return pubMatch[1].toLowerCase();
  const adminMatch = trimmed.match(/(?:^|\/)api\/admin\/content\/templates\/[^/]+\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (adminMatch) return adminMatch[1].toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

export function extractTemplateAssetManifest(document: DesignState): TemplateAssetRef[] {
  const refs: TemplateAssetRef[] = [];
  const seen = new Set<string>();

  function record(assetId: string, sourceKey: string, role: TemplateAssetRef['role'], elementId?: string) {
    const key = `${assetId}:${role}:${elementId ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ assetId, sourceKey, role, elementId });
    }
  }

  // Top-level document.image
  if (document.image) {
    const img = document.image as unknown as Record<string, unknown>;
    const id = extractTemplateAssetId(img.templateAssetId ?? img.assetId ?? img.src ?? img.url);
    if (id) {
      record(id, String(img.src ?? img.url ?? id), 'image');
    }
  }

  // Elements
  if (Array.isArray(document.elements)) {
    for (const el of document.elements) {
      const data = el.data as Record<string, unknown> | undefined;
      if (!data) continue;

      const directId = extractTemplateAssetId(data.templateAssetId ?? data.assetId);
      if (directId) {
        record(directId, String(data.src ?? data.url ?? directId), 'element', el.id);
      }

      const slots: Array<{ field: string; role: TemplateAssetRef['role'] }> = [
        { field: 'src', role: 'element' },
        { field: 'url', role: 'element' },
        { field: 'originalSrc', role: 'original' },
        { field: 'removedBackgroundSrc', role: 'derived' },
        { field: 'previewSrc', role: 'derived' },
        { field: 'maskSrc', role: 'mask' },
        { field: 'mask', role: 'mask' },
      ];

      for (const { field, role } of slots) {
        const val = data[field];
        if (typeof val === 'string') {
          const extracted = extractTemplateAssetId(val);
          if (extracted) {
            record(extracted, val, role, el.id);
          }
        }
      }
    }
  }

  return refs;
}

export interface UploadedTemplateAsset {
  assetId: string;
  templateId: string;
  draftId?: string;
  storageBucket: string;
  storagePath: string;
  checksum: string;
  mimeType: string;
  byteSize: number;
  pixelWidth: number;
  pixelHeight: number;
  canonicalLocator: string;
  viewUrl: string;
}

export interface TemplateAssetServiceOptions {
  repo?: TemplateRepository;
  supabaseClient?: SupabaseClient;
}

function resolveRepository(options?: TemplateAssetServiceOptions): TemplateRepository {
  if (options?.repo) return options.repo;
  const client = options?.supabaseClient ?? createPrivilegedSupabaseClient();
  return new TemplateRepository(client);
}

export async function validateTemplateRasterImage(
  bytes: Uint8Array | Buffer,
): Promise<{
  canonicalBytes: Uint8Array;
  mimeType: string;
  ext: string;
  width: number;
  height: number;
  checksum: string;
  byteSize: number;
}> {
  if (bytes.length > MAX_RASTER_BYTES) {
    throw new TemplateServiceError('INVALID_INPUT', `Image exceeds maximum size limit of 10 MiB (${bytes.length} bytes)`, 400);
  }

  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const image = sharp(buffer);
  let meta: Metadata;
  try {
    meta = await image.metadata();
  } catch (err: unknown) {
    throw new TemplateServiceError('INVALID_INPUT', 'Failed to decode image data', 400);
  }

  if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format)) {
    throw new TemplateServiceError('INVALID_INPUT', `Unsupported image format: ${String(meta.format)}. Static PNG, JPEG, and WebP only.`, 400);
  }

  if (meta.pages && meta.pages > 1) {
    throw new TemplateServiceError('INVALID_INPUT', 'Animated images are not supported', 400);
  }

  if (!meta.width || !meta.height) {
    throw new TemplateServiceError('INVALID_INPUT', 'Invalid image dimensions', 400);
  }

  if (
    meta.width * meta.height > MAX_DECOMPRESSION_PIXELS ||
    meta.width > MAX_RASTER_DIMENSION ||
    meta.height > MAX_RASTER_DIMENSION
  ) {
    throw new TemplateServiceError('INVALID_INPUT', 'Image exceeds maximum allowed dimensions (8192px side or 40 MP)', 400);
  }

  const rotatedImage = sharp(buffer).rotate();
  const canonicalBuffer = await rotatedImage.toBuffer();
  const canonicalMeta = await sharp(canonicalBuffer).metadata();
  const width = canonicalMeta.width ?? meta.width;
  const height = canonicalMeta.height ?? meta.height;

  const canonicalBytes = new Uint8Array(canonicalBuffer);
  const checksum = createHash('sha256').update(canonicalBytes).digest('hex');
  const ext = meta.format === 'jpeg' ? 'jpg' : meta.format;
  const mimeType = meta.format === 'jpeg' ? 'image/jpeg' : `image/${meta.format}`;

  return {
    canonicalBytes,
    mimeType,
    ext,
    width,
    height,
    checksum,
    byteSize: canonicalBytes.byteLength,
  };
}

export async function uploadTemplateAsset(
  actor: StaffIdentity,
  guard: { templateId: string; draftId?: string },
  file: { bytes: Uint8Array | Buffer; filename?: string; mimeType?: string },
  options?: TemplateAssetServiceOptions,
): Promise<UploadedTemplateAsset> {
  if (!actor || !['admin', 'editor'].includes(actor.role)) {
    throw new TemplateServiceError('FORBIDDEN', 'Actor does not have permission to upload template assets', 403);
  }

  const repo = resolveRepository(options);
  const validated = await validateTemplateRasterImage(file.bytes);

  const assetId = randomUUID();
  const storageBucket = 'template-drafts';
  const storagePath = `${guard.templateId}/${assetId}.${validated.ext}`;

  await repo.uploadStorageObject(storageBucket, storagePath, validated.canonicalBytes, validated.mimeType);

  const attachInput: AttachTemplateAssetInput = {
    templateId: guard.templateId,
    draftId: guard.draftId ?? null,
    storageBucket,
    storagePath,
    checksum: validated.checksum,
    mimeType: validated.mimeType,
    byteSize: validated.byteSize,
    pixelWidth: validated.width,
    pixelHeight: validated.height,
    uploadStatus: 'attached',
  };

  const attachResult = await repo.attachAsset(actor.userId, attachInput);
  if (!attachResult.ok) {
    await repo.deleteStorageObject(storageBucket, storagePath).catch(() => { });
    throw new TemplateServiceError(attachResult.code, attachResult.message);
  }

  const canonicalLocator = `template-asset://${assetId}`;
  const viewUrl = `/api/admin/content/templates/${guard.templateId}/assets/${assetId}`;

  return {
    assetId,
    templateId: guard.templateId,
    draftId: guard.draftId,
    storageBucket,
    storagePath,
    checksum: validated.checksum,
    mimeType: validated.mimeType,
    byteSize: validated.byteSize,
    pixelWidth: validated.width,
    pixelHeight: validated.height,
    canonicalLocator,
    viewUrl,
  };
}

export type TemplateAssetAccess =
  | { kind: 'draft'; templateId: string; actor: StaffIdentity }
  | { kind: 'published' };

export interface ResolvedTemplateAsset {
  bytes: Uint8Array;
  mimeType: string;
  checksum: string;
  byteSize: number;
  isPublished: boolean;
}

export async function resolveTemplateAsset(
  assetId: string,
  access: TemplateAssetAccess,
  options?: TemplateAssetServiceOptions,
): Promise<ResolvedTemplateAsset> {
  const repo = resolveRepository(options);
  const asset = await repo.getAsset(assetId);
  if (!asset) {
    throw new TemplateServiceError('NOT_FOUND', 'Template asset not found', 404);
  }

  if (access.kind === 'draft') {
    if (!access.actor || !['admin', 'editor'].includes(access.actor.role)) {
      throw new TemplateServiceError('FORBIDDEN', 'Staff permission required for draft asset', 403);
    }
    if (asset.templateId !== access.templateId) {
      throw new TemplateServiceError('FORBIDDEN', 'Asset does not belong to specified template', 403);
    }
  } else {
    if (!asset.isPublished) {
      throw new TemplateServiceError('NOT_FOUND', 'Asset not found or not published', 404);
    }
  }

  const bytes = await repo.downloadStorageObject(asset.storageBucket, asset.storageKey);
  if (!bytes) {
    throw new TemplateServiceError('STORAGE_FAILURE', 'Failed to read asset from storage', 500);
  }

  return {
    bytes,
    mimeType: asset.mimeType,
    checksum: asset.checksum,
    byteSize: asset.byteSize,
    isPublished: asset.isPublished,
  };
}

export interface PreparedVersionAssetsResult {
  operationId: string;
  candidateDocument: DesignState;
  assets: Array<{
    assetId: string;
    sourceBucket: string;
    sourcePath: string;
    candidateBucket: string;
    candidatePath: string;
    checksum: string;
  }>;
}

export async function prepareTemplateVersionAssets(
  actor: StaffIdentity,
  guard: { templateId: string; draftId: string; document: DesignState },
  operationId: string,
  options?: TemplateAssetServiceOptions,
): Promise<PreparedVersionAssetsResult> {
  if (!actor || !['admin', 'editor'].includes(actor.role)) {
    throw new TemplateServiceError('FORBIDDEN', 'Actor does not have permission to publish template assets', 403);
  }

  const repo = resolveRepository(options);
  const manifest = extractTemplateAssetManifest(guard.document);
  const prepared: PreparedVersionAssetsResult['assets'] = [];

  const urlReplacements = new Map<string, string>();

  for (const ref of manifest) {
    const asset = await repo.getAsset(ref.assetId);
    if (!asset) {
      throw new TemplateServiceError('ASSET_MISSING', `Referenced asset ${ref.assetId} not found`, 422);
    }

    const ext = asset.storageKey.split('.').pop() || 'png';
    const candidatePath = `candidates/${operationId}/${asset.id}.${ext}`;
    const candidateBucket = 'template-versions';

    if (asset.storageBucket === 'template-drafts') {
      await repo.copyStorageObject(asset.storageBucket, asset.storageKey, candidateBucket, candidatePath);
    }

    prepared.push({
      assetId: asset.id,
      sourceBucket: asset.storageBucket,
      sourcePath: asset.storageKey,
      candidateBucket,
      candidatePath,
      checksum: asset.checksum,
    });

    // Map any draft or template-asset URLs to version asset URL
    urlReplacements.set(ref.sourceKey, `/api/templates/assets/${asset.id}`);
    urlReplacements.set(`template-asset://${asset.id}`, `/api/templates/assets/${asset.id}`);
  }

  const candidateDoc = rewriteDesignUrls(guard.document, urlReplacements);

  return {
    operationId,
    candidateDocument: candidateDoc,
    assets: prepared,
  };
}

function rewriteDesignUrls(doc: DesignState, mapping: Map<string, string>): DesignState {
  if (mapping.size === 0) return doc;
  const clone = JSON.parse(JSON.stringify(doc)) as DesignState;

  if (clone.image?.src && mapping.has(clone.image.src)) {
    clone.image.src = mapping.get(clone.image.src)!;
  }

  if (Array.isArray(clone.elements)) {
    for (const el of clone.elements) {
      const data = el.data as Record<string, unknown> | undefined;
      if (!data) continue;
      for (const key of ['src', 'url', 'originalSrc', 'removedBackgroundSrc', 'previewSrc', 'maskSrc', 'mask']) {
        const val = data[key];
        if (typeof val === 'string' && mapping.has(val)) {
          data[key] = mapping.get(val)!;
        }
      }
    }
  }

  return clone;
}

export interface CreateTemplateFromProjectInput {
  sourceProjectId: string;
  expectedSourceRevision: number;
  target: TemplateTargetInput;
  name: string;
  rightsAcknowledged: boolean;
  requestId: string;
  categoryId?: string | null;
  tags?: string[];
  sortOrder?: number;
}

export interface CreateTemplateFromProjectResult {
  template: TemplateRecord;
  draft: TemplateDraftRecord;
  copiedAssetsCount: number;
}

export async function createTemplateFromProject(
  actor: StaffIdentity,
  input: CreateTemplateFromProjectInput,
  options?: TemplateAssetServiceOptions,
): Promise<CreateTemplateFromProjectResult> {
  if (!actor || !['admin', 'editor'].includes(actor.role)) {
    throw new TemplateServiceError('FORBIDDEN', 'Actor does not have permission to create templates', 403);
  }

  if (!input.rightsAcknowledged) {
    throw new TemplateServiceError(
      'RIGHTS_ACKNOWLEDGEMENT_REQUIRED',
      'Must explicitly acknowledge rights to publish source design as a template',
      400,
    );
  }

  const repo = resolveRepository(options);
  const project = await repo.getSourceProject(actor.userId, input.sourceProjectId);
  if (!project) {
    throw new TemplateServiceError('NOT_FOUND', 'Source project not found', 404);
  }

  if (project.ownerUserId !== actor.userId) {
    throw new TemplateServiceError('FORBIDDEN', 'Only staff-owned projects can be used as template sources', 403);
  }

  if (!project.eligible || project.blockedReason === 'HAS_LINKED_ORDERS') {
    throw new TemplateServiceError(
      'SOURCE_PROJECT_HAS_ORDERS',
      'Source project has linked customer orders and cannot be cloned into a template',
      400,
    );
  }

  if (project.currentWorkingRevision !== input.expectedSourceRevision) {
    throw new TemplateServiceError('REVISION_CONFLICT', 'Source project revision conflict', 409);
  }

  if (!project.workingDocument) {
    throw new TemplateServiceError('INVALID_INPUT', 'Source project has no document', 400);
  }

  const templateId = randomUUID();
  const rawDocument = project.workingDocument as unknown as DesignState;
  const docClone = JSON.parse(JSON.stringify(rawDocument)) as DesignState;

  const targetSnapshot: Record<string, unknown> = {
    productId: input.target.productId,
    variantId: input.target.variantId,
    mode: input.target.mode ?? null,
    shape: input.target.shape ?? null,
  };

  // Step 1: Create template and draft in DB first with initial target document
  const initialBlankDoc = createInitialState(input.target.productId);
  initialBlankDoc.variantId = input.target.variantId;
  initialBlankDoc.templateId = templateId;
  initialBlankDoc.elements = [];

  const createResult = await repo.createTemplate(actor.userId, {
    requestId: input.requestId,
    id: templateId,
    name: input.name,
    productId: input.target.productId,
    variantId: input.target.variantId,
    productMode: input.target.mode ?? null,
    fixedStickerShape: input.target.shape ?? null,
    categoryId: input.categoryId ?? null,
    tags: input.tags ?? [],
    sortOrder: input.sortOrder ?? 0,
    targetSnapshot,
    initialDocument: initialBlankDoc,
  });

  if (!createResult.ok) {
    throw new TemplateServiceError(createResult.code, createResult.message);
  }

  const { template: createdTemplate, draft: createdDraft } = createResult.value;
  // Step 2: Find all assets in project, download, validate, upload, and attach
  let copiedAssetsCount = 0;
  const urlMapping = new Map<string, string>();

  async function processUrl(url: string | undefined): Promise<void> {
    if (!url || typeof url !== 'string') return;
    if (isTemplateAssetPath(url)) return;
    // Matches /api/assets/<id> or customer asset
    const customerMatch = url.match(/(?:^|\/)api\/assets\/([a-zA-Z0-9_-]+)/);
    if (!customerMatch) return;

    const assetId = customerMatch[1];
    if (urlMapping.has(url)) return;

    // Read asset from customer storage or asset repo
    const customerPath = `${project!.id}/${assetId}`;
    let bytes: Uint8Array | null = null;
    try {
      bytes = await repo.downloadStorageObject('customer-assets', customerPath);
    } catch {
      bytes = null;
    }

    if (!bytes) {
      try {
        bytes = await repo.downloadStorageObject('customer-assets', assetId);
      } catch {
        bytes = null;
      }
    }

    if (!bytes) {
      try {
        bytes = await repo.downloadStorageObject('customer-assets', `customer-assets/${project!.id}/${assetId}`);
      } catch {
        bytes = null;
      }
    }

    if (!bytes) {
      throw new TemplateServiceError(
        'INVALID_INPUT',
        `Failed to copy private project asset: asset ${assetId} not found in customer storage`,
        400,
      );
    }

    let validated;
    try {
      validated = await validateTemplateRasterImage(bytes);
    } catch (err: unknown) {
      throw new TemplateServiceError(
        'INVALID_INPUT',
        `Failed to copy private project asset: ${err instanceof Error ? err.message : 'validation failed'}`,
        400,
      );
    }

    const newAssetId = randomUUID();
    const newPath = `${templateId}/${newAssetId}.${validated.ext}`;
    await repo.uploadStorageObject('template-drafts', newPath, validated.canonicalBytes, validated.mimeType);

    const attachRes = await repo.attachAsset(actor.userId, {
      templateId,
      draftId: createdDraft.id,
      storageBucket: 'template-drafts',
      storagePath: newPath,
      checksum: validated.checksum,
      mimeType: validated.mimeType,
      byteSize: validated.byteSize,
      pixelWidth: validated.width,
      pixelHeight: validated.height,
      uploadStatus: 'attached',
    });

    if (!attachRes.ok) {
      throw new TemplateServiceError(attachRes.code, attachRes.message);
    }

    const newUrl = `/api/admin/content/templates/${templateId}/assets/${newAssetId}`;
    urlMapping.set(url, newUrl);
    copiedAssetsCount++;
  }

  if (docClone.image?.src) {
    await processUrl(docClone.image.src);
  }

  if (Array.isArray(docClone.elements)) {
    for (const el of docClone.elements) {
      const data = el.data as Record<string, unknown> | undefined;
      if (!data) continue;
      for (const key of ['src', 'url', 'originalSrc', 'removedBackgroundSrc', 'previewSrc', 'maskSrc']) {
        if (typeof data[key] === 'string') {
          await processUrl(data[key] as string);
        }
      }
    }
  }

  // Step 3: Rewrite document image URLs with new attached asset URLs
  const rewrittenDoc = rewriteDesignUrls(docClone, urlMapping);
  rewrittenDoc.templateId = templateId;
  delete (rewrittenDoc as unknown as Record<string, unknown>).sourceTemplate;

  // Final sanity assertion verifying NO /api/assets/ URLs remain
  const docJson = JSON.stringify(rewrittenDoc);
  if (/(?:^|\/)api\/assets\/[a-zA-Z0-9_-]+/.test(docJson) || docJson.includes('/api/assets/')) {
    throw new TemplateServiceError('INVALID_INPUT', 'Private customer asset reference detected in template', 400);
  }

  // Step 4: Save the updated rewritten document into the draft via repo.saveDraft(...)
  const sessionId = randomUUID();
  if (typeof repo.acquireLease === 'function') {
    await repo.acquireLease(actor.userId, {
      requestId: `${input.requestId}-lease`,
      draftId: createdDraft.id,
      sessionId,
    });
  }

  const saveResult = await repo.saveDraft(actor.userId, {
    requestId: `${input.requestId}-save`,
    draftId: createdDraft.id,
    expectedRevision: createdDraft.draftRevision,
    sessionId,
    leaseEpoch: createdDraft.leaseEpoch ?? 0,
    document: rewrittenDoc,
  });

  if (!saveResult.ok) {
    throw new TemplateServiceError(saveResult.code, saveResult.message);
  }

  return {
    template: createdTemplate,
    draft: {
      ...createdDraft,
      designDocument: rewrittenDoc,
      draftRevision: saveResult.value.revision,
      updatedAt: saveResult.value.updatedAt,
    },
    copiedAssetsCount,
  };
}
