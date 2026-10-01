import { randomUUID } from 'node:crypto';

import {
  assertLibraryTransition,
  canManageLibrary,
  parseLibraryMetadata,
  type FontCategory,
  type FontFaceRecord,
  type LibraryErrorCode,
  type LibraryMetadataPatch,
  type LibraryRecord,
  type LibraryRef,
  type LibraryStatus,
  type LicenseAcknowledgement,
  type MutationKey,
  type ValidationReceipt,
} from '../domain/asset-library.ts';
import type { StaffIdentity } from '../domain/order.ts';
import type {
  AssetLibraryRepository,
  FontFamilyRecord,
  StickerRecord,
} from '../repositories/asset-library-repository.ts';
import { probeLibraryBinary } from './library-render-probe.ts';
import { validateFont, validateSticker } from './library-validation.ts';

export class LibraryServiceError extends Error {
  readonly code: LibraryErrorCode;
  constructor(code: LibraryErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'LibraryServiceError';
  }
}

function normalizeServiceError(error: unknown, fallbackMessage?: string): Error {
  if (error instanceof LibraryServiceError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('REVISION_CONFLICT')) return new LibraryServiceError('REVISION_CONFLICT', message);
  if (message.includes('FORBIDDEN')) return new LibraryServiceError('FORBIDDEN', message);
  if (message.includes('UNAUTHENTICATED')) return new LibraryServiceError('UNAUTHENTICATED', message);
  if (message.includes('NOT_FOUND')) return new LibraryServiceError('NOT_FOUND', message);
  if (message.includes('VALIDATION_FAILED')) return new LibraryServiceError('VALIDATION_FAILED', message);
  if (message.includes('DUPLICATE_BINARY')) return new LibraryServiceError('DUPLICATE_BINARY', message);
  if (message.includes('IMMUTABLE_BINARY')) return new LibraryServiceError('IMMUTABLE_BINARY', message);
  if (message.includes('LICENSE_REQUIRED')) return new LibraryServiceError('LICENSE_REQUIRED', message);
  if (
    message.includes('INVALID_INPUT') ||
    message.includes('INVALID_REASON') ||
    message.includes('INVALID_TRANSITION') ||
    message.includes('CANNOT_RETURN_TO_DRAFT')
  ) {
    return new LibraryServiceError('INVALID_INPUT', message);
  }
  if (error instanceof Error) {
    if (fallbackMessage && !error.message) {
      return new Error(fallbackMessage);
    }
    return error;
  }
  return new Error(fallbackMessage ?? message);
}

function filterDefined(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

const FORBIDDEN_IDENTITY_KEYS = new Set([
  'storagePath', 'storage_path', 'checksum', 'cssFamily', 'css_family',
  'width', 'height', 'weightMin', 'weightMax', 'style', 'format',
  'familyId', 'family_id', 'byteSize', 'byte_size', 'mimeType', 'mime_type',
  'validationId', 'validation_id', 'revision', 'status', 'ref',
]);

export async function createStickerDraft(
  input: {
    bytes: Uint8Array;
    filename?: string;
    metadata: LibraryMetadataPatch;
    requestId: string;
  },
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<StickerRecord> {
  if (!actor || !canManageLibrary(actor.role, 'sticker')) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to manage stickers');
  }

  const validated = await validateSticker(input.bytes, input.filename);
  const duplicate = await repo.findDuplicate('sticker', validated.checksum);
  if (duplicate) {
    throw new LibraryServiceError('DUPLICATE_BINARY', 'Duplicate sticker binary already exists in library');
  }

  const id = randomUUID();
  const ext = validated.format === 'svg' ? 'svg' : validated.format;
  const storageKey = `drafts/${actor.userId}/${id}/${validated.checksum}.${ext}`;
  const thumbKey = `drafts/${actor.userId}/${id}/${validated.checksum}-thumb.png`;
  const uploadedKeys: string[] = [];

  try {
    const mimeType = validated.format === 'svg' ? 'image/svg+xml' : `image/${validated.format}`;
    await repo.uploadObject('library-drafts', storageKey, validated.canonicalBytes, mimeType);
    uploadedKeys.push(storageKey);

    if (validated.thumbnailBytes && validated.thumbnailBytes.byteLength > 0) {
      await repo.uploadObject('library-drafts', thumbKey, validated.thumbnailBytes, 'image/png');
      uploadedKeys.push(thumbKey);
    }

    const rawMeta = typeof input.metadata === 'object' && input.metadata !== null
      ? filterDefined(input.metadata as Record<string, unknown>)
      : {};
    const parsedMeta = parseLibraryMetadata(rawMeta);
    const displayName = parsedMeta.displayName ?? (input.filename ? input.filename.replace(/\.[^.]+$/, '') : id);

    const payload = {
      display_name: displayName,
      category: parsedMeta.category ?? '',
      tags: parsedMeta.tags ?? [],
      search_keywords: parsedMeta.searchKeywords ?? [],
      description: parsedMeta.description ?? '',
      storage_path: storageKey,
      metadata: {
        thumbnail_path: uploadedKeys.includes(thumbKey) ? thumbKey : null,
        width: validated.width,
        height: validated.height,
        mime_type: mimeType,
        byte_size: validated.canonicalBytes.byteLength,
        checksum: validated.checksum,
      },
    };

    await repo.createDraft(actor.userId, input.requestId, 'sticker', id, payload);

    const record = await repo.getSticker(id);
    if (!record) {
      throw new LibraryServiceError('NOT_FOUND', 'Failed to retrieve created sticker draft');
    }
    return record;
  } catch (error) {
    if (uploadedKeys.length > 0) {
      await repo.removeObjects('library-drafts', uploadedKeys).catch(() => { });
    }
    throw normalizeServiceError(error);
  }
}

export async function createFontFaceDraft(
  input: {
    bytes: Uint8Array;
    filename?: string;
    familyId: string;
    license?: LicenseAcknowledgement;
    requestId: string;
  },
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<FontFaceRecord> {
  if (!actor || !canManageLibrary(actor.role, 'font-face')) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to manage font faces');
  }

  const family = await repo.getFontFamilyById(input.familyId);
  if (!family) {
    throw new LibraryServiceError('NOT_FOUND', `Font family ${input.familyId} not found`);
  }

  const validated = await validateFont(input.bytes, input.filename);
  const duplicate = await repo.findDuplicate('font-face', validated.checksum, input.familyId);
  if (duplicate) {
    throw new LibraryServiceError('DUPLICATE_BINARY', 'Duplicate font face binary already exists in library');
  }

  const id = randomUUID();
  const storageKey = `drafts/${actor.userId}/${id}/${validated.checksum}.${validated.format}`;
  const uploadedKeys: string[] = [];

  try {
    const mimeType = `font/${validated.format}`;
    await repo.uploadObject('library-drafts', storageKey, input.bytes, mimeType);
    uploadedKeys.push(storageKey);

    const cssFamily = `qt-face-${id}`;
    const payload = {
      family_id: input.familyId,
      css_family: cssFamily,
      format: validated.format,
      weight_min: validated.weightMin,
      weight_max: validated.weightMax,
      style: validated.style,
      internal_family: validated.familyName,
      postscript_name: validated.postscriptName,
      storage_path: storageKey,
      checksum: validated.checksum,
      byte_size: input.bytes.byteLength,
      mime_type: mimeType,
      license: input.license ?? null,
    };

    const createResult = await repo.createDraft(actor.userId, input.requestId, 'font-face', id, payload);
    let resolvedId: string = id;
    if (createResult && typeof createResult === 'object' && 'item' in createResult) {
      const item = (createResult as { item?: { id?: string } }).item;
      if (item && typeof item.id === 'string') {
        resolvedId = item.id;
      }
    }

    const record = await repo.getFontFace(resolvedId);
    if (!record) {
      throw new LibraryServiceError('NOT_FOUND', 'Failed to retrieve created font face draft');
    }
    return record;
  } catch (error) {
    if (uploadedKeys.length > 0) {
      await repo.removeObjects('library-drafts', uploadedKeys).catch(() => { });
    }
    throw normalizeServiceError(error);
  }
}

export async function replaceDraftBinary(
  ref: LibraryRef,
  key: MutationKey,
  bytes: Uint8Array,
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<LibraryRecord> {
  if (!actor || !canManageLibrary(actor.role, ref.kind)) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to manage this library kind');
  }

  const current = await repo.getRecord(ref);
  if (!current) {
    throw new LibraryServiceError('NOT_FOUND', `${ref.kind} ${ref.id} not found`);
  }

  if (current.status !== 'draft' || current.everPublishedAt !== null) {
    throw new LibraryServiceError('IMMUTABLE_BINARY', 'Cannot replace binary of published or archived asset');
  }

  if (current.revision !== key.expectedRevision) {
    throw new LibraryServiceError('REVISION_CONFLICT', `Expected revision ${key.expectedRevision}, found ${current.revision}`);
  }

  const uploadedKeys: string[] = [];

  try {
    if (ref.kind === 'sticker') {
      const validated = await validateSticker(bytes);
      const ext = validated.format === 'svg' ? 'svg' : validated.format;
      const storageKey = `drafts/${actor.userId}/${ref.id}/${validated.checksum}.${ext}`;
      const thumbKey = `drafts/${actor.userId}/${ref.id}/${validated.checksum}-thumb.png`;
      const mimeType = validated.format === 'svg' ? 'image/svg+xml' : `image/${validated.format}`;

      await repo.uploadObject('library-drafts', storageKey, validated.canonicalBytes, mimeType);
      uploadedKeys.push(storageKey);
      if (validated.thumbnailBytes && validated.thumbnailBytes.byteLength > 0) {
        await repo.uploadObject('library-drafts', thumbKey, validated.thumbnailBytes, 'image/png');
        uploadedKeys.push(thumbKey);
      }

      return await repo.replaceDraftBinary('sticker', ref.id, key.expectedRevision, {
        storagePath: storageKey,
        checksum: validated.checksum,
        byteSize: validated.canonicalBytes.byteLength,
        width: validated.width,
        height: validated.height,
        mimeType,
      });
    } else {
      const validated = await validateFont(bytes);
      const storageKey = `drafts/${actor.userId}/${ref.id}/${validated.checksum}.${validated.format}`;
      const mimeType = `font/${validated.format}`;

      await repo.uploadObject('library-drafts', storageKey, bytes, mimeType);
      uploadedKeys.push(storageKey);

      return await repo.replaceDraftBinary('font-face', ref.id, key.expectedRevision, {
        storagePath: storageKey,
        checksum: validated.checksum,
        byteSize: bytes.byteLength,
        mimeType,
      });
    }
  } catch (err) {
    if (uploadedKeys.length > 0) {
      await repo.removeObjects('library-drafts', uploadedKeys).catch(() => { });
    }
    throw normalizeServiceError(err, 'Failed to replace draft binary');
  }
}

export async function updateAssetMetadata(
  ref: LibraryRef,
  key: MutationKey,
  patch: LibraryMetadataPatch,
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<LibraryRecord> {
  if (!actor || !canManageLibrary(actor.role, ref.kind)) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to manage this library kind');
  }

  if (typeof patch === 'object' && patch !== null) {
    for (const prop of Object.keys(patch)) {
      if (FORBIDDEN_IDENTITY_KEYS.has(prop)) {
        throw new LibraryServiceError('INVALID_INPUT', `Cannot modify binary identity field: ${prop}`);
      }
    }
  }

  const rawPatch = typeof patch === 'object' && patch !== null
    ? filterDefined(patch as Record<string, unknown>)
    : {};
  const sanitized = parseLibraryMetadata(rawPatch);

  try {
    await repo.patchMetadata(actor.userId, key.requestId, ref.kind, ref.id, key.expectedRevision, sanitized);
    const record = await repo.getRecord(ref);
    if (!record) {
      throw new LibraryServiceError('NOT_FOUND', `${ref.kind} ${ref.id} not found`);
    }
    return record;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function validateAssetDraft(
  ref: LibraryRef,
  key: MutationKey,
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<ValidationReceipt> {
  if (!actor || !canManageLibrary(actor.role, ref.kind)) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to validate this library kind');
  }

  const current = await repo.getRecord(ref);
  if (!current) {
    throw new LibraryServiceError('NOT_FOUND', `${ref.kind} ${ref.id} not found`);
  }

  if (current.revision !== key.expectedRevision) {
    throw new LibraryServiceError('REVISION_CONFLICT', `Expected revision ${key.expectedRevision}, found ${current.revision}`);
  }

  const bytes = await repo.downloadObject(current.binary.bucket, current.binary.key);
  const probeReceipt = await probeLibraryBinary(ref, bytes, ref.kind);
  const finalReceipt: ValidationReceipt = {
    ...probeReceipt,
    revision: current.revision,
    ref: {
      kind: ref.kind,
      id: ref.id,
      checksum: current.ref.checksum,
    },
  };

  await repo.insertValidationRun(finalReceipt, actor.userId);
  await repo.linkValidationRun(ref.kind, ref.id, finalReceipt.id);
  return finalReceipt;
}

export async function publishAsset(
  ref: LibraryRef,
  key: MutationKey,
  validationId: string,
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<LibraryRecord> {
  if (!actor || !canManageLibrary(actor.role, ref.kind)) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to publish this library kind');
  }

  const current = await repo.getRecord(ref);
  if (!current) {
    throw new LibraryServiceError('NOT_FOUND', `${ref.kind} ${ref.id} not found`);
  }

  if (current.revision !== key.expectedRevision) {
    throw new LibraryServiceError('REVISION_CONFLICT', `Expected revision ${key.expectedRevision}, found ${current.revision}`);
  }

  const receipt = await repo.getValidationRunById(validationId);
  if (
    !receipt ||
    !receipt.passed ||
    receipt.ref.id !== ref.id ||
    receipt.ref.kind !== ref.kind ||
    receipt.ref.checksum !== current.ref.checksum ||
    receipt.revision !== current.revision
  ) {
    throw new LibraryServiceError('VALIDATION_FAILED', 'Validation receipt missing, failed, or does not match asset revision/checksum');
  }

  if (ref.kind === 'font-face') {
    if (!current.license || !current.license.webEmbedding || !current.license.commercialPrint) {
      throw new LibraryServiceError('LICENSE_REQUIRED', 'Valid font license acknowledgement required for publication');
    }
  }

  try {
    if (ref.kind === 'font-face') {
      const faceRecord = current as FontFaceRecord;
      const ext = faceRecord.format ?? 'woff2';
      const destKey = `fonts/${faceRecord.familyId}/${faceRecord.ref.id}/${faceRecord.ref.checksum}.${ext}`;
      await repo.copyObject(faceRecord.binary.bucket, faceRecord.binary.key, 'fonts', destKey);
      const publicObjects = { bucket: 'fonts', key: destKey };

      await repo.publish(actor.userId, key.requestId, 'font-face', ref.id, key.expectedRevision, validationId, publicObjects);
    } else {
      const stickerRecord = current as StickerRecord;
      const ext = stickerRecord.binary.mimeType === 'image/svg+xml' ? 'svg' : (stickerRecord.binary.mimeType.split('/')[1] ?? 'png');
      const destKey = `stickers/${stickerRecord.ref.id}/${stickerRecord.ref.checksum}.${ext}`;
      await repo.copyObject(stickerRecord.binary.bucket, stickerRecord.binary.key, 'sticker-library', destKey);

      let thumbKey: string | null = null;
      if (stickerRecord.thumbnail) {
        thumbKey = `stickers/${stickerRecord.ref.id}/${stickerRecord.ref.checksum}-thumb.png`;
        await repo.copyObject(stickerRecord.thumbnail.bucket, stickerRecord.thumbnail.key, 'sticker-library', thumbKey);
      }

      const publicObjects = {
        bucket: 'sticker-library',
        key: destKey,
        ...(thumbKey ? { thumbnail_key: thumbKey } : {}),
      };

      await repo.publish(actor.userId, key.requestId, 'sticker', ref.id, key.expectedRevision, validationId, publicObjects);
    }

    const updated = await repo.getRecord(ref);
    if (!updated) {
      throw new LibraryServiceError('NOT_FOUND', `Failed to load published record for ${ref.kind} ${ref.id}`);
    }
    return updated;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function archiveAsset(
  ref: LibraryRef,
  key: MutationKey,
  reason: string,
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<LibraryRecord> {
  if (!actor || !canManageLibrary(actor.role, ref.kind)) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to archive this library kind');
  }

  const trimmedReason = (reason ?? '').trim();
  if (trimmedReason.length < 3 || trimmedReason.length > 500) {
    throw new LibraryServiceError('INVALID_INPUT', 'Archive reason must be between 3 and 500 characters');
  }

  try {
    await repo.archive(actor.userId, key.requestId, ref.kind, ref.id, key.expectedRevision, trimmedReason);
    const record = await repo.getRecord(ref);
    if (!record) {
      throw new LibraryServiceError('NOT_FOUND', `${ref.kind} ${ref.id} not found`);
    }
    return record;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function createFontFamily(
  input: {
    id: string;
    familyName: string;
    displayName?: string;
    category?: FontCategory;
    tags?: string[];
    description?: string;
    sampleText?: string;
    requestId: string;
  },
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<FontFamilyRecord> {
  if (!actor || !canManageLibrary(actor.role, 'font-face')) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to manage font families');
  }

  const familyName = (input.familyName ?? '').trim();
  if (!familyName) {
    throw new LibraryServiceError('INVALID_INPUT', 'Font family name is required');
  }

  const rawMeta: Record<string, unknown> = {};
  if (input.displayName !== undefined) rawMeta.displayName = input.displayName;
  if (input.category !== undefined) rawMeta.category = input.category;
  if (input.tags !== undefined) rawMeta.tags = input.tags;
  if (input.description !== undefined) rawMeta.description = input.description;
  if (input.sampleText !== undefined) rawMeta.sampleText = input.sampleText;
  const parsedMeta = parseLibraryMetadata(rawMeta);

  const payload = {
    family_name: familyName,
    display_name: parsedMeta.displayName ?? null,
    category: parsedMeta.category ?? null,
    tags: parsedMeta.tags ?? [],
    search_keywords: parsedMeta.searchKeywords ?? [],
    description: parsedMeta.description ?? null,
    sample_text: parsedMeta.sampleText ?? null,
  };

  try {
    await repo.createFamily(actor.userId, input.requestId, input.id, payload);
    const family = await repo.getFontFamilyById(input.id);
    if (!family) {
      throw new LibraryServiceError('NOT_FOUND', `Failed to load created font family ${input.id}`);
    }
    return family;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function patchFontFamily(
  id: string,
  key: MutationKey,
  patch: Partial<LibraryMetadataPatch>,
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<FontFamilyRecord> {
  if (!actor || !canManageLibrary(actor.role, 'font-face')) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to patch font families');
  }

  const rawPatch = typeof patch === 'object' && patch !== null
    ? filterDefined(patch as Record<string, unknown>)
    : {};
  const sanitized = parseLibraryMetadata(rawPatch);

  try {
    await repo.patchFamily(actor.userId, key.requestId, id, key.expectedRevision, sanitized);
    const family = await repo.getFontFamilyById(id);
    if (!family) {
      throw new LibraryServiceError('NOT_FOUND', `Font family ${id} not found`);
    }
    return family;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function setFontFamilyStatus(
  id: string,
  key: MutationKey,
  status: LibraryStatus,
  actor: StaffIdentity,
  repo: AssetLibraryRepository,
): Promise<FontFamilyRecord> {
  if (!actor || !canManageLibrary(actor.role, 'font-face')) {
    throw new LibraryServiceError('FORBIDDEN', 'Actor does not have permission to change font family status');
  }

  const current = await repo.getFontFamilyById(id);
  if (!current) {
    throw new LibraryServiceError('NOT_FOUND', `Font family ${id} not found`);
  }

  try {
    assertLibraryTransition(current.status, status);
  } catch (error) {
    throw new LibraryServiceError('INVALID_INPUT', error instanceof Error ? error.message : String(error));
  }

  if (status === 'draft' && current.everPublishedAt !== null) {
    throw new LibraryServiceError('INVALID_INPUT', 'Cannot return previously published font family to draft');
  }

  try {
    await repo.setFamilyStatus(actor.userId, key.requestId, id, key.expectedRevision, status);
    const family = await repo.getFontFamilyById(id);
    if (!family) {
      throw new LibraryServiceError('NOT_FOUND', `Font family ${id} not found`);
    }
    return family;
  } catch (error) {
    throw normalizeServiceError(error);
  }
}

export async function resolveLibraryRefs(
  refs: readonly LibraryRef[],
  repo: AssetLibraryRepository,
): Promise<ReadonlyMap<string, LibraryRecord>> {
  const result = new Map<string, LibraryRecord>();
  for (const ref of refs) {
    const record = await repo.getRecord(ref);
    if (!record) continue;
    if (record.status !== 'published' && record.status !== 'archived') continue;
    if (record.ref.checksum !== ref.checksum) continue;
    result.set(`${ref.kind}:${ref.id}`, record);
  }
  return result;
}
