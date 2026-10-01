import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import type {
  FontFaceRecord,
  LibraryRecord,
  ValidationReceipt,
} from '../lib/domain/asset-library.ts';
import type {
  AssetLibraryRepository,
  FontFamilyRecord,
  StickerRecord,
} from '../lib/repositories/asset-library-repository.ts';
import {
  archiveAsset,
  createFontFaceDraft,
  createFontFamily,
  createStickerDraft,
  LibraryServiceError,
  patchFontFamily,
  publishAsset,
  replaceDraftBinary,
  resolveLibraryRefs,
  setFontFamilyStatus,
  updateAssetMetadata,
  validateAssetDraft,
} from '../lib/services/asset-library.ts';

const fixtures = join(process.cwd(), 'src', 'test', 'fixtures', 'library');
const actor = { userId: '10000000-0000-4000-8000-000000000001', role: 'editor' as const };
const key = { expectedRevision: 1, requestId: '20000000-0000-4000-8000-000000000001' };

function isExpectedServiceError(expectedCode: string) {
  return (error: unknown): boolean => {
    if (error instanceof LibraryServiceError) {
      return error.code === expectedCode;
    }
    return false;
  };
}

function sticker(overrides: Partial<StickerRecord> = {}): StickerRecord {
  return {
    ref: { kind: 'sticker', id: 'sticker-1', checksum: 'checksum-1' },
    status: 'draft',
    revision: 1,
    everPublishedAt: null,
    binary: { bucket: 'library-drafts', key: 'drafts/sticker-1.svg', checksum: 'checksum-1', byteSize: 10, mimeType: 'image/svg+xml' },
    thumbnail: { bucket: 'library-drafts', key: 'drafts/sticker-1-thumb.png', checksum: '', byteSize: 5, mimeType: 'image/png' },
    displayName: 'Rose',
    category: 'floral',
    tags: [],
    searchKeywords: [],
    description: '',
    sampleText: null,
    license: null,
    validationId: null,
    width: 120,
    height: 80,
    ...overrides,
  };
}

function face(overrides: Partial<FontFaceRecord> = {}): FontFaceRecord {
  return {
    ref: { kind: 'font-face', id: 'face-1', checksum: 'font-checksum' },
    status: 'draft',
    revision: 1,
    everPublishedAt: null,
    binary: { bucket: 'library-drafts', key: 'drafts/face-1.ttf', checksum: 'font-checksum', byteSize: 10, mimeType: 'font/ttf' },
    thumbnail: null,
    displayName: 'Noto Sans',
    category: '',
    tags: [],
    searchKeywords: [],
    description: '',
    sampleText: null,
    license: { source: 'OFL', name: 'SIL OFL', text: 'Licensed', webEmbedding: true, commercialPrint: true },
    validationId: null,
    familyId: 'family-1',
    cssFamily: 'qt-face-face-1',
    format: 'ttf',
    weightMin: 400,
    weightMax: 400,
    style: 'normal',
    internalFamily: 'Noto Sans',
    postscriptName: 'NotoSans-Regular',
    ...overrides,
  };
}

function family(overrides: Partial<FontFamilyRecord> = {}): FontFamilyRecord {
  return {
    id: 'family-1', familyName: 'Noto Sans', displayName: null, status: 'draft', revision: 1,
    everPublishedAt: null, category: 'sans', tags: [], searchKeywords: [], description: null,
    sampleText: null, createdBy: actor.userId, updatedBy: actor.userId,
    createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', ...overrides,
  };
}

class FakeRepository {
  record: LibraryRecord | null = sticker();
  familyRecord: FontFamilyRecord | null = family();
  receipt: ValidationReceipt | null = null;
  duplicate: LibraryRecord | null = null;
  uploads: { bucket: string; key: string; bytes: Uint8Array; mimeType: string }[] = [];
  copies: { sourceBucket: string; sourceKey: string; destinationBucket: string; destinationKey: string }[] = [];
  removals: { bucket: string; keys: string[] }[] = [];
  calls: { name: string; args: unknown[] }[] = [];
  failCreate = false;
  failPatch = false;
  failReplace = false;
  replaceError: Error | null = null;
  async getRecord() { return this.record; }
  async getSticker() { return this.record as StickerRecord | null; }
  async getFontFace() { return this.record as FontFaceRecord | null; }
  async getFontFamilyById() { return this.familyRecord; }
  async findDuplicate() { return this.duplicate; }
  async uploadObject(bucket: string, objectKey: string, bytes: Uint8Array, mimeType: string) {
    this.uploads.push({ bucket, key: objectKey, bytes, mimeType });
  }
  async copyObject(sourceBucket: string, sourceKey: string, destinationBucket: string, destinationKey: string) {
    this.copies.push({ sourceBucket, sourceKey, destinationBucket, destinationKey });
  }
  async removeObjects(bucket: string, keys: string[]) { this.removals.push({ bucket, keys }); }
  async downloadObject() { return new Uint8Array(await readFile(join(fixtures, 'safe-sticker.svg'))); }
  async createDraft(actorId: string, requestId: string, kind: string, id: string, payload: unknown) {
    this.calls.push({ name: 'createDraft', args: [actorId, requestId, kind, id, payload] });
    if (this.failCreate) throw new Error('database unavailable');
    if (this.record) {
      this.record = { ...this.record, ref: { ...this.record.ref, id } } as LibraryRecord;
    }
    return { ok: true, item: { id } };
  }
  async replaceDraftBinary(...args: unknown[]) {
    this.calls.push({ name: 'replaceDraftBinary', args });
    if (this.failReplace) throw this.replaceError ?? new Error('REVISION_CONFLICT');
    const replaced = sticker({ ...this.record as StickerRecord, revision: (this.record?.revision ?? 1) + 1, validationId: null });
    this.record = replaced;
    return replaced;
  }
  async patchMetadata(...args: unknown[]) {
    this.calls.push({ name: 'patchMetadata', args });
    if (this.failPatch) throw new Error('REVISION_CONFLICT');
    return sticker({ revision: 2, displayName: 'New name' });
  }
  async insertValidationRun(receipt: ValidationReceipt, userId: string) {
    this.calls.push({ name: 'insertValidationRun', args: [receipt, userId] });
    this.receipt = receipt;
    return receipt;
  }
  async linkValidationRun(...args: unknown[]) { this.calls.push({ name: 'linkValidationRun', args }); }
  async getValidationRunById() { return this.receipt; }
  async publish(...args: unknown[]) {
    this.calls.push({ name: 'publish', args });
    const published = this.record?.ref.kind === 'font-face'
      ? face({ status: 'published', revision: (this.record?.revision ?? 1) + 1, binary: { ...face().binary, bucket: 'fonts' } })
      : sticker({ status: 'published', revision: (this.record?.revision ?? 1) + 1, binary: { ...sticker().binary, bucket: 'sticker-library' } });
    this.record = published;
    return published;
  }
  async archive(...args: unknown[]) {
    this.calls.push({ name: 'archive', args });
    const archived = { ...this.record!, status: 'archived', revision: (this.record?.revision ?? 1) + 1 } as LibraryRecord;
    this.record = archived;
    return archived;
  }
  async createFamily(...args: unknown[]) { this.calls.push({ name: 'createFamily', args }); return this.familyRecord!; }
  async patchFamily(...args: unknown[]) {
    this.calls.push({ name: 'patchFamily', args });
    if (this.familyRecord) {
      this.familyRecord = { ...this.familyRecord, revision: this.familyRecord.revision + 1 };
    }
    return this.familyRecord!;
  }
  async setFamilyStatus(actorId: string, requestId: string, id: string, revision: number, status: string) {
    this.calls.push({ name: 'setFamilyStatus', args: [actorId, requestId, id, revision, status] });
    if (this.familyRecord) {
      this.familyRecord = { ...this.familyRecord, status: status as never, revision: this.familyRecord.revision + 1 };
    }
    return this.familyRecord!;
  }
}

test('createStickerDraft rejects unauthorized actor before validation or upload', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  await assert.rejects(
    createStickerDraft({ bytes: new Uint8Array(), metadata: {}, requestId: key.requestId }, { userId: 'guest', role: 'guest' as never }, repo),
    isExpectedServiceError('FORBIDDEN'),
  );
  assert.equal(repoInstance.uploads.length, 0);
});

test('createStickerDraft validates, uploads canonical binary and thumbnail, and cleans both on DB failure', async () => {
  const bytes = new Uint8Array(await readFile(join(fixtures, 'safe-sticker.svg')));
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  repoInstance.record = sticker();
  const created = await createStickerDraft({ bytes, filename: 'rose.svg', metadata: { displayName: ' Rose ' }, requestId: key.requestId }, actor, repo);
  assert.equal(created.revision, 1);
  assert.equal(repoInstance.uploads.length, 2);
  assert.match(repoInstance.uploads[0]!.key, /^drafts\/10000000-0000-4000-8000-000000000001\/[0-9a-f-]+\/[0-9a-f]{64}\.svg$/);
  assert.match(repoInstance.uploads[1]!.key, /-thumb\.png$/);

  const payload = repoInstance.calls[0]?.args[4];
  if (payload && typeof payload === 'object' && 'display_name' in payload) {
    assert.equal(payload.display_name, 'Rose');
  } else {
    assert.fail('createDraft payload missing display_name');
  }

  const failedInstance = new FakeRepository();
  const failedRepo = failedInstance as unknown as AssetLibraryRepository;
  failedInstance.failCreate = true;
  await assert.rejects(createStickerDraft({ bytes, filename: 'rose.svg', metadata: {}, requestId: key.requestId }, actor, failedRepo), /database unavailable/);
  assert.deepEqual(failedInstance.removals, [{ bucket: 'library-drafts', keys: failedInstance.uploads.map((upload) => upload.key) }]);
});

test('draft creation rejects duplicate binaries and validates font family and license payload', async () => {
  const stickerInstance = new FakeRepository();
  const stickerRepo = stickerInstance as unknown as AssetLibraryRepository;
  stickerInstance.duplicate = sticker({ status: 'archived' });
  await assert.rejects(
    createStickerDraft({ bytes: new Uint8Array(await readFile(join(fixtures, 'safe-sticker.svg'))), filename: 'rose.svg', metadata: {}, requestId: key.requestId }, actor, stickerRepo),
    isExpectedServiceError('DUPLICATE_BINARY'),
  );
  assert.equal(stickerInstance.uploads.length, 0);

  const fontInstance = new FakeRepository();
  const fontRepo = fontInstance as unknown as AssetLibraryRepository;
  fontInstance.record = face();
  const bytes = new Uint8Array(await readFile(join(fixtures, 'vietnamese-font.ttf')));
  const created = await createFontFaceDraft({ bytes, filename: 'font.ttf', familyId: 'family-1', license: face().license!, requestId: key.requestId }, actor, fontRepo);
  assert.equal(created.familyId, 'family-1');
  assert.equal(fontInstance.uploads.length, 1);

  const fontPayload = fontInstance.calls[0]?.args[4];
  if (fontPayload && typeof fontPayload === 'object' && 'css_family' in fontPayload) {
    assert.equal(fontPayload.css_family, `qt-face-${created.ref.id}`);
  } else {
    assert.fail('createFontFaceDraft payload missing css_family');
  }
});

test('replaceDraftBinary rejects immutable published or previously published assets before upload', async () => {
  for (const immutable of [
    sticker({ status: 'published', everPublishedAt: '2026-10-02T00:00:00Z' }),
    sticker({ status: 'archived', everPublishedAt: '2026-10-02T00:00:00Z' }),
  ]) {
    const repoInstance = new FakeRepository();
    const repo = repoInstance as unknown as AssetLibraryRepository;
    repoInstance.record = immutable;
    await assert.rejects(replaceDraftBinary(immutable.ref, key, new Uint8Array(), actor, repo), isExpectedServiceError('IMMUTABLE_BINARY'));
    assert.equal(repoInstance.uploads.length, 0);
  }
});

test('updateAssetMetadata rejects identity keys and maps repository revision conflicts', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  await assert.rejects(
    updateAssetMetadata(sticker().ref, key, { storagePath: 'other.svg' } as never, actor, repo),
    isExpectedServiceError('INVALID_INPUT'),
  );
  repoInstance.failPatch = true;
  await assert.rejects(updateAssetMetadata(sticker().ref, key, { displayName: 'New name' }, actor, repo), isExpectedServiceError('REVISION_CONFLICT'));
});

test('validateAssetDraft probes current bytes, persists receipt, and links it to current revision', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  const receipt = await validateAssetDraft(sticker().ref, key, actor, repo);
  assert.equal(receipt.passed, true);
  assert.equal(receipt.revision, 1);
  assert.deepEqual(receipt.ref, sticker().ref);
  assert.deepEqual(repoInstance.calls.map((call) => call.name), ['insertValidationRun', 'linkValidationRun']);
});

test('publishAsset rejects missing, failed, stale, or unlicensed validation before public copy', async () => {
  const cases: Array<{ receipt: ValidationReceipt | null; record?: LibraryRecord; expected: string }> = [
    { receipt: null, expected: 'VALIDATION_FAILED' },
    { receipt: { id: 'v', ref: sticker().ref, revision: 1, validatorVersion: '1', engineFingerprint: 'x', passed: false, failures: [], missingCodepoints: [], browserProofHash: null, productionProofHash: null }, expected: 'VALIDATION_FAILED' },
    { receipt: { id: 'v', ref: { ...sticker().ref, checksum: 'old' }, revision: 1, validatorVersion: '1', engineFingerprint: 'x', passed: true, failures: [], missingCodepoints: [], browserProofHash: null, productionProofHash: null }, expected: 'VALIDATION_FAILED' },
    { receipt: { id: 'v', ref: sticker().ref, revision: 2, validatorVersion: '1', engineFingerprint: 'x', passed: true, failures: [], missingCodepoints: [], browserProofHash: null, productionProofHash: null }, expected: 'VALIDATION_FAILED' },
    { receipt: { id: 'v', ref: face().ref, revision: 1, validatorVersion: '1', engineFingerprint: 'x', passed: true, failures: [], missingCodepoints: [], browserProofHash: null, productionProofHash: null }, record: face({ license: null }), expected: 'LICENSE_REQUIRED' },
  ];
  for (const item of cases) {
    const repoInstance = new FakeRepository();
    const repo = repoInstance as unknown as AssetLibraryRepository;
    repoInstance.receipt = item.receipt;
    if (item.record) repoInstance.record = item.record;
    const current = repoInstance.record!;
    await assert.rejects(publishAsset(current.ref, key, 'v', actor, repo), isExpectedServiceError(item.expected));
    assert.equal(repoInstance.copies.length, 0);
  }
});

test('publishAsset copies validated sticker objects to immutable public keys then publishes', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  repoInstance.receipt = { id: 'validation-1', ref: sticker().ref, revision: 1, validatorVersion: '1', engineFingerprint: 'chromium', passed: true, failures: [], missingCodepoints: [], browserProofHash: 'proof', productionProofHash: 'proof' };
  const published = await publishAsset(sticker().ref, key, 'validation-1', actor, repo);
  assert.equal(published.status, 'published');
  assert.deepEqual(repoInstance.copies.map(({ destinationBucket, destinationKey }) => ({ destinationBucket, destinationKey })), [
    { destinationBucket: 'sticker-library', destinationKey: 'stickers/sticker-1/checksum-1.svg' },
    { destinationBucket: 'sticker-library', destinationKey: 'stickers/sticker-1/checksum-1-thumb.png' },
  ]);
  assert.equal(repoInstance.calls.at(-1)?.name, 'publish');
});

test('archiveAsset validates reason and preserves binary locator returned by transaction', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  await assert.rejects(archiveAsset(sticker().ref, key, '  no ', actor, repo), isExpectedServiceError('INVALID_INPUT'));
  const archived = await archiveAsset(sticker().ref, key, ' Retired artwork ', actor, repo);
  assert.equal(archived.status, 'archived');
  assert.deepEqual(archived.binary, sticker().binary);
  assert.equal(repoInstance.calls.at(-1)?.args[5], 'Retired artwork');
});

test('font family create, patch, and status operations parse metadata and enforce transitions', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  const created = await createFontFamily({ id: 'family-1', familyName: ' Noto Sans ', category: 'sans', tags: ['ui'], requestId: key.requestId }, actor, repo);
  assert.equal(created.familyName, 'Noto Sans');
  await patchFontFamily('family-1', key, { displayName: ' Interface ' }, actor, repo);
  await setFontFamilyStatus('family-1', key, 'published', actor, repo);
  assert.deepEqual(repoInstance.calls.map((call) => call.name), ['createFamily', 'patchFamily', 'setFamilyStatus']);

  repoInstance.familyRecord = family({ status: 'published', everPublishedAt: '2026-10-02T00:00:00Z' });
  await assert.rejects(setFontFamilyStatus('family-1', key, 'draft', actor, repo), isExpectedServiceError('INVALID_INPUT'));
});

test('resolveLibraryRefs includes only exact published or archived records', async () => {
  const published = sticker({ status: 'published' });
  const archived = face({ status: 'archived', everPublishedAt: '2026-10-02T00:00:00Z' });
  const draft = sticker({ ref: { kind: 'sticker', id: 'draft', checksum: 'draft-sum' } });
  const records: Record<string, LibraryRecord> = {
    'sticker:sticker-1': published,
    'font-face:face-1': archived,
    'sticker:draft': draft,
  };
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  repoInstance.getRecord = async (ref?: { kind: string; id: string }) => records[`${ref?.kind}:${ref?.id}`] ?? null;
  const resolved = await resolveLibraryRefs([
    published.ref,
    archived.ref,
    draft.ref,
    { kind: 'sticker', id: 'missing', checksum: 'none' },
    { ...published.ref, checksum: 'wrong' },
  ], repo);
  assert.deepEqual([...resolved.keys()], ['sticker:sticker-1', 'font-face:face-1']);
});

test('replaceDraftBinary updates font face binary and resets validation', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  repoInstance.record = face();
  const bytes = new Uint8Array(await readFile(join(fixtures, 'vietnamese-font.ttf')));
  const replaced = await replaceDraftBinary(face().ref, key, bytes, actor, repo);
  assert.equal(replaced.revision, 2);
  assert.equal(replaced.validationId, null);
  assert.equal(repoInstance.uploads.length, 1);
  assert.match(repoInstance.uploads[0]!.key, /^drafts\/10000000-0000-4000-8000-000000000001\/face-1\/[0-9a-f]{64}\.ttf$/);

  await assert.rejects(
    replaceDraftBinary(face().ref, { ...key, expectedRevision: 99 }, bytes, actor, repo),
    isExpectedServiceError('REVISION_CONFLICT'),
  );
});

test('replaceDraftBinary cleans up uploaded draft files and maps REVISION_CONFLICT when repository update fails', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  repoInstance.record = sticker();
  repoInstance.failReplace = true;
  const bytes = new Uint8Array(await readFile(join(fixtures, 'safe-sticker.svg')));

  await assert.rejects(
    replaceDraftBinary(sticker().ref, key, bytes, actor, repo),
    (error: unknown) => {
      assert.ok(error instanceof LibraryServiceError);
      assert.equal(error.code, 'REVISION_CONFLICT');
      return true;
    },
  );

  assert.equal(repoInstance.uploads.length, 2);
  assert.deepEqual(repoInstance.removals, [
    { bucket: 'library-drafts', keys: repoInstance.uploads.map((upload) => upload.key) },
  ]);
});

test('publishAsset copies validated font face binary to fonts bucket', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  repoInstance.record = face();
  repoInstance.receipt = {
    id: 'font-val-1',
    ref: face().ref,
    revision: 1,
    validatorVersion: '1',
    engineFingerprint: 'chromium',
    passed: true,
    failures: [],
    missingCodepoints: [],
    browserProofHash: 'hash',
    productionProofHash: 'hash',
  };
  const published = await publishAsset(face().ref, key, 'font-val-1', actor, repo);
  assert.equal(published.status, 'published');
  assert.deepEqual(repoInstance.copies, [
    {
      sourceBucket: 'library-drafts',
      sourceKey: 'drafts/face-1.ttf',
      destinationBucket: 'fonts',
      destinationKey: 'fonts/family-1/face-1/font-checksum.ttf',
    },
  ]);
});

test('archiveAsset rejects reasons longer than 500 characters', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  const overlong = 'a'.repeat(501);
  await assert.rejects(archiveAsset(sticker().ref, key, overlong, actor, repo), isExpectedServiceError('INVALID_INPUT'));
});

test('updateAssetMetadata rejects various binary identity keys', async () => {
  const repoInstance = new FakeRepository();
  const repo = repoInstance as unknown as AssetLibraryRepository;
  for (const forbiddenKey of ['checksum', 'width', 'cssFamily', 'familyId', 'mimeType']) {
    await assert.rejects(
      updateAssetMetadata(sticker().ref, key, { [forbiddenKey]: 'injected' } as never, actor, repo),
      isExpectedServiceError('INVALID_INPUT'),
    );
  }
});
