import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { DELETE as deleteFontFace, GET as getFontFace, PATCH as patchFontFace, PUT as putFontFace } from '../app/api/admin/content/font-faces/[id]/route.ts';
import { POST as archiveFontFace } from '../app/api/admin/content/font-faces/[id]/archive/route.ts';
import { POST as publishFontFace } from '../app/api/admin/content/font-faces/[id]/publish/route.ts';
import { POST as validateFontFace } from '../app/api/admin/content/font-faces/[id]/validate/route.ts';
import { POST as createFontFace, GET as listFontFaces } from '../app/api/admin/content/fonts/[id]/faces/route.ts';
import { GET as getFontFamily, PATCH as patchFontFamilyRoute, POST as postFontFamilyStatus } from '../app/api/admin/content/fonts/[id]/route.ts';
import { GET as listFonts, POST as createFont } from '../app/api/admin/content/fonts/route.ts';
import { GET as previewAsset } from '../app/api/admin/content/preview/[kind]/[id]/route.ts';
import { DELETE as deleteSticker, GET as getSticker, PATCH as patchSticker, PUT as putSticker } from '../app/api/admin/content/stickers/[id]/route.ts';
import { POST as archiveSticker } from '../app/api/admin/content/stickers/[id]/archive/route.ts';
import { POST as publishSticker } from '../app/api/admin/content/stickers/[id]/publish/route.ts';
import { POST as validateSticker } from '../app/api/admin/content/stickers/[id]/validate/route.ts';
import { POST as bulkStickers } from '../app/api/admin/content/stickers/bulk/route.ts';
import { GET as listStickers, POST as createSticker } from '../app/api/admin/content/stickers/route.ts';
import { GET as publicDelivery } from '../app/api/library/[kind]/[id]/route.ts';
import { AuthorizationError } from '../lib/admin/authorization.ts';
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

const fixturesDir = join(process.cwd(), 'src', 'test', 'fixtures', 'library');

const editorActor = { userId: '11111111-1111-4111-8111-111111111111', role: 'editor' as const };
const adminActor = { userId: '22222222-2222-4222-8222-222222222222', role: 'admin' as const };

function unauthenticatedStaff(): never {
  throw new AuthorizationError('Chưa đăng nhập', 401);
}

function editorStaff() {
  return Promise.resolve(editorActor);
}

function adminStaff() {
  return Promise.resolve(adminActor);
}

function makeStickerRecord(id: string, overrides: Partial<StickerRecord> = {}): StickerRecord {
  return {
    ref: { kind: 'sticker', id, checksum: `checksum-${id}` },
    status: 'draft',
    revision: 1,
    everPublishedAt: null,
    binary: {
      bucket: 'library-drafts',
      key: `drafts/${id}.svg`,
      checksum: `checksum-${id}`,
      byteSize: 100,
      mimeType: 'image/svg+xml',
    },
    thumbnail: {
      bucket: 'library-drafts',
      key: `drafts/${id}-thumb.png`,
      checksum: `thumb-${id}`,
      byteSize: 50,
      mimeType: 'image/png',
    },
    displayName: `Sticker ${id}`,
    category: 'floral',
    tags: ['floral'],
    searchKeywords: ['flower'],
    description: 'A sticker description',
    sampleText: null,
    license: null,
    validationId: null,
    width: 200,
    height: 200,
    ...overrides,
  };
}

function makeFontFaceRecord(id: string, overrides: Partial<FontFaceRecord> = {}): FontFaceRecord {
  return {
    ref: { kind: 'font-face', id, checksum: `checksum-${id}` },
    status: 'draft',
    revision: 1,
    everPublishedAt: null,
    binary: {
      bucket: 'library-drafts',
      key: `drafts/${id}.ttf`,
      checksum: `checksum-${id}`,
      byteSize: 1200,
      mimeType: 'font/ttf',
    },
    thumbnail: null,
    displayName: `Font Face ${id}`,
    category: 'sans',
    tags: ['sans'],
    searchKeywords: ['noto'],
    description: '',
    sampleText: null,
    license: {
      source: 'OFL',
      name: 'SIL OFL',
      text: 'Open Font License',
      webEmbedding: true,
      commercialPrint: true,
    },
    validationId: null,
    familyId: 'family-1',
    cssFamily: `qt-face-${id}`,
    format: 'ttf',
    weightMin: 400,
    weightMax: 400,
    style: 'normal',
    internalFamily: 'Noto Sans',
    postscriptName: 'NotoSans-Regular',
    ...overrides,
  };
}

function makeFontFamilyRecord(id: string, overrides: Partial<FontFamilyRecord> = {}): FontFamilyRecord {
  return {
    id,
    familyName: 'Noto Sans',
    displayName: 'Noto Sans Display',
    status: 'draft',
    revision: 1,
    everPublishedAt: null,
    category: 'sans',
    tags: ['sans'],
    searchKeywords: ['google'],
    description: 'Font family description',
    sampleText: 'Hôm nay trời đẹp',
    createdBy: editorActor.userId,
    updatedBy: editorActor.userId,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
    ...overrides,
  };
}

class TestAssetRepository {
  stickers = new Map<string, StickerRecord>();
  faces = new Map<string, FontFaceRecord>();
  families = new Map<string, FontFamilyRecord>();
  validations = new Map<string, ValidationReceipt>();
  storage = new Map<string, Uint8Array>();
  deletedRefs: string[] = [];

  constructor() {
    this.stickers.set('sticker-draft', makeStickerRecord('sticker-draft'));
    this.stickers.set(
      'sticker-published',
      makeStickerRecord('sticker-published', {
        status: 'published',
        everPublishedAt: '2026-10-02T00:00:00Z',
        binary: {
          bucket: 'sticker-library',
          key: 'stickers/sticker-published/checksum-sticker-published.svg',
          checksum: 'checksum-sticker-published',
          byteSize: 100,
          mimeType: 'image/svg+xml',
        },
      }),
    );
    this.stickers.set(
      'sticker-archived-published',
      makeStickerRecord('sticker-archived-published', {
        status: 'archived',
        everPublishedAt: '2026-10-02T00:00:00Z',
        binary: {
          bucket: 'sticker-library',
          key: 'stickers/sticker-archived-published/checksum-sticker-archived-published.svg',
          checksum: 'checksum-archived',
          byteSize: 100,
          mimeType: 'image/svg+xml',
        },
      }),
    );
    this.stickers.set(
      'sticker-archived-never',
      makeStickerRecord('sticker-archived-never', {
        status: 'archived',
        everPublishedAt: null,
      }),
    );

    this.faces.set('face-draft', makeFontFaceRecord('face-draft'));
    this.faces.set(
      'face-published',
      makeFontFaceRecord('face-published', {
        status: 'published',
        everPublishedAt: '2026-10-02T00:00:00Z',
        binary: {
          bucket: 'fonts',
          key: 'fonts/family-1/face-published/checksum-face-published.ttf',
          checksum: 'checksum-face-published',
          byteSize: 1200,
          mimeType: 'font/ttf',
        },
      }),
    );

    this.families.set('family-1', makeFontFamilyRecord('family-1'));
  }

  async listStickers() {
    return { items: Array.from(this.stickers.values()), total: this.stickers.size };
  }

  async getSticker(id: string) {
    return this.stickers.get(id) ?? null;
  }

  async listFontFamilies() {
    return { items: Array.from(this.families.values()), total: this.families.size };
  }

  async getFontFamily(id: string) {
    return this.families.get(id) ?? null;
  }

  async getFontFamilyById(id: string) {
    return this.getFontFamily(id);
  }

  async listFontFaces(familyId: string) {
    return Array.from(this.faces.values()).filter((face) => face.familyId === familyId);
  }

  async getFontFace(id: string) {
    return this.faces.get(id) ?? null;
  }

  async getRecord(ref: { kind: string; id: string }) {
    if (ref.kind === 'sticker') return this.getSticker(ref.id);
    return this.getFontFace(ref.id);
  }

  async findDuplicate() {
    return null;
  }

  async uploadObject(bucket: string, path: string, bytes: Uint8Array) {
    this.storage.set(`${bucket}:${path}`, bytes);
  }

  async downloadObject(bucket: string, path: string) {
    const data = this.storage.get(`${bucket}:${path}`);
    if (data) return data;
    if (path.endsWith('.svg')) {
      return new Uint8Array(await readFile(join(fixturesDir, 'safe-sticker.svg')));
    }
    return new Uint8Array(await readFile(join(fixturesDir, 'vietnamese-font.ttf')));
  }

  async copyObject(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string) {
    const bytes = await this.downloadObject(sourceBucket, sourceKey);
    this.storage.set(`${destBucket}:${destKey}`, bytes);
  }

  async removeObjects(_bucket: string, _paths: string[]) { }

  async createDraft(_actor: string, _request: string, kind: string, id: string, payload: unknown) {
    if (kind === 'sticker') {
      const p = payload as Record<string, unknown>;
      const record = makeStickerRecord(id, {
        displayName: String(p.display_name ?? id),
        category: String(p.category ?? ''),
        tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
      });
      this.stickers.set(id, record);
      return { ok: true, item: record };
    }
    const record = makeFontFaceRecord(id);
    this.faces.set(id, record);
    return { ok: true, item: record };
  }

  async createFamily(_actor: string, _request: string, id: string, payload: unknown) {
    const p = payload as Record<string, unknown>;
    const fam = makeFontFamilyRecord(id, {
      familyName: String(p.family_name ?? id),
      displayName: typeof p.display_name === 'string' ? p.display_name : null,
    });
    this.families.set(id, fam);
    return fam;
  }

  async patchMetadata(_actor: string, _request: string, kind: string, id: string, revision: number, patch: unknown) {
    const current = kind === 'sticker' ? this.stickers.get(id) : this.faces.get(id);
    if (!current) throw new Error('NOT_FOUND');
    if (current.revision !== revision) throw new Error('REVISION_CONFLICT');
    const p = patch as Record<string, unknown>;
    const updated = {
      ...current,
      ...p,
      revision: current.revision + 1,
    } as LibraryRecord;
    if (kind === 'sticker') this.stickers.set(id, updated as StickerRecord);
    else this.faces.set(id, updated as FontFaceRecord);
    return updated;
  }

  async replaceDraftBinary(
    kind: string,
    id: string,
    revision: number,
    update: { storagePath: string; checksum: string; byteSize: number; mimeType?: string },
  ) {
    const current = kind === 'sticker' ? this.stickers.get(id) : this.faces.get(id);
    if (!current) throw new Error('NOT_FOUND');
    if (current.revision !== revision) throw new Error('REVISION_CONFLICT');
    const updated = {
      ...current,
      binary: {
        ...current.binary,
        key: update.storagePath,
        checksum: update.checksum,
        byteSize: update.byteSize,
        mimeType: update.mimeType ?? current.binary.mimeType,
      },
      validationId: null,
      revision: current.revision + 1,
    } as LibraryRecord;
    if (kind === 'sticker') this.stickers.set(id, updated as StickerRecord);
    else this.faces.set(id, updated as FontFaceRecord);
    return updated;
  }

  async patchFamily(_actor: string, _request: string, id: string, revision: number, patch: unknown) {
    const current = this.families.get(id);
    if (!current) throw new Error('NOT_FOUND');
    if (current.revision !== revision) throw new Error('REVISION_CONFLICT');
    const updated = {
      ...current,
      ...(patch as Record<string, unknown>),
      revision: current.revision + 1,
    } as FontFamilyRecord;
    this.families.set(id, updated);
    return updated;
  }

  async setFamilyStatus(_actor: string, _request: string, id: string, revision: number, status: unknown) {
    const current = this.families.get(id);
    if (!current) throw new Error('NOT_FOUND');
    if (current.revision !== revision) throw new Error('REVISION_CONFLICT');
    const updated = {
      ...current,
      status: status as FontFamilyRecord['status'],
      revision: current.revision + 1,
    };
    this.families.set(id, updated);
    return updated;
  }

  async insertValidationRun(receipt: ValidationReceipt) {
    this.validations.set(receipt.id, receipt);
    return receipt;
  }

  async linkValidationRun(kind: string, id: string, validationId: string) {
    const current = kind === 'sticker' ? this.stickers.get(id) : this.faces.get(id);
    if (current) current.validationId = validationId;
  }

  async getValidationRunById(id: string) {
    return this.validations.get(id) ?? null;
  }

  async publish(_actor: string, _request: string, kind: string, id: string, revision: number) {
    const current = kind === 'sticker' ? this.stickers.get(id) : this.faces.get(id);
    if (!current) throw new Error('NOT_FOUND');
    if (current.revision !== revision) throw new Error('REVISION_CONFLICT');
    const updated = {
      ...current,
      status: 'published' as const,
      everPublishedAt: '2026-10-02T00:00:00Z',
      revision: current.revision + 1,
    } as LibraryRecord;
    if (kind === 'sticker') this.stickers.set(id, updated as StickerRecord);
    else this.faces.set(id, updated as FontFaceRecord);
    return updated;
  }

  async archive(_actor: string, _request: string, kind: string, id: string, revision: number) {
    const current = kind === 'sticker' ? this.stickers.get(id) : this.faces.get(id);
    if (!current) throw new Error('NOT_FOUND');
    if (current.revision !== revision) throw new Error('REVISION_CONFLICT');
    const updated = {
      ...current,
      status: 'archived' as const,
      revision: current.revision + 1,
    } as LibraryRecord;
    if (kind === 'sticker') this.stickers.set(id, updated as StickerRecord);
    else this.faces.set(id, updated as FontFaceRecord);
    return updated;
  }

  async prepareDelete(ref: { id: string }, revision: number) {
    return { intent: `del-${ref.id}-${revision}`, object_keys: [`drafts/${ref.id}.svg`] };
  }

  async finishDelete(_actor: string, _intent: string) {
    this.deletedRefs.push(_intent);
  }
}

function makeDeps(repo: TestAssetRepository, role: 'unauth' | 'editor' | 'admin' = 'editor') {
  const requireStaff = role === 'unauth'
    ? unauthenticatedStaff
    : role === 'admin'
      ? adminStaff
      : editorStaff;
  return {
    requireStaff,
    createRepository: () => repo as unknown as AssetLibraryRepository,
    createPrivilegedRepository: () => repo as unknown as AssetLibraryRepository,
  };
}

test('1. Unauthenticated requests return 401 across admin routes', async () => {
  const repo = new TestAssetRepository();
  const unauthDeps = makeDeps(repo, 'unauth');

  const reqGetStickers = new Request('http://localhost/api/admin/content/stickers');
  const resGetStickers = await listStickers(reqGetStickers, unauthDeps);
  assert.equal(resGetStickers.status, 401);
  const body1 = await resGetStickers.json() as { code: string };
  assert.equal(body1.code, 'UNAUTHENTICATED');

  const reqGetFonts = new Request('http://localhost/api/admin/content/fonts');
  const resGetFonts = await listFonts(reqGetFonts, unauthDeps);
  assert.equal(resGetFonts.status, 401);

  const reqPreview = new Request('http://localhost/api/admin/content/preview/sticker/sticker-draft');
  const resPreview = await previewAsset(
    reqPreview,
    { params: Promise.resolve({ kind: 'sticker', id: 'sticker-draft' }) },
    unauthDeps,
  );
  assert.equal(resPreview.status, 401);
});

test('2. Editor role can list, create, validate, and publish stickers', async () => {
  const repo = new TestAssetRepository();
  const deps = makeDeps(repo, 'editor');

  const listRes = await listStickers(new Request('http://localhost/api/admin/content/stickers'), deps);
  assert.equal(listRes.status, 200);
  const listJson = await listRes.json() as { items: StickerRecord[] };
  assert.ok(listJson.items.length >= 1);

  const svgBytes = await readFile(join(fixturesDir, 'safe-sticker.svg'));
  const formData = new FormData();
  formData.append('file', new File([svgBytes], 'sunflower.svg', { type: 'image/svg+xml' }));
  formData.append('displayName', 'Sunflower');
  formData.append('category', 'floral');

  const createReq = new Request('http://localhost/api/admin/content/stickers', {
    method: 'POST',
    body: formData,
  });
  const createRes = await createSticker(createReq, deps);
  assert.equal(createRes.status, 201);
  const createJson = await createRes.json() as { item: StickerRecord };
  assert.equal(createJson.item.displayName, 'Sunflower');
  const newId = createJson.item.ref.id;

  const valReq = new Request(`http://localhost/api/admin/content/stickers/${newId}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: createJson.item.revision }),
  });
  const valRes = await validateSticker(valReq, { params: Promise.resolve({ id: newId }) }, deps);
  assert.equal(valRes.status, 200);
  const valJson = await valRes.json() as { receipt: ValidationReceipt };
  assert.equal(valJson.receipt.passed, true);

  const pubReq = new Request(`http://localhost/api/admin/content/stickers/${newId}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedRevision: createJson.item.revision,
      validationId: valJson.receipt.id,
    }),
  });
  const pubRes = await publishSticker(pubReq, { params: Promise.resolve({ id: newId }) }, deps);
  assert.equal(pubRes.status, 200);
  const pubJson = await pubRes.json() as { item: StickerRecord };
  assert.equal(pubJson.item.status, 'published');
});

test('3. Editor role can list, create, and manage font families and faces', async () => {
  const repo = new TestAssetRepository();
  const deps = makeDeps(repo, 'editor');

  const createFamReq = new Request('http://localhost/api/admin/content/fonts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      familyName: 'Lora Serif',
      displayName: 'Lora',
      category: 'serif',
    }),
  });
  const createFamRes = await createFont(createFamReq, deps);
  assert.equal(createFamRes.status, 201);
  const famJson = await createFamRes.json() as { item: FontFamilyRecord };
  assert.equal(famJson.item.familyName, 'Lora Serif');
  const familyId = famJson.item.id;

  const fontBytes = await readFile(join(fixturesDir, 'vietnamese-font.ttf'));
  const faceFormData = new FormData();
  faceFormData.append('file', new File([fontBytes], 'Lora-Regular.ttf', { type: 'font/ttf' }));
  faceFormData.append('license', JSON.stringify({
    source: 'OFL',
    name: 'SIL OFL',
    text: 'License text',
    webEmbedding: true,
    commercialPrint: true,
  }));

  const createFaceReq = new Request(`http://localhost/api/admin/content/fonts/${familyId}/faces`, {
    method: 'POST',
    body: faceFormData,
  });
  const createFaceRes = await createFontFace(
    createFaceReq,
    { params: Promise.resolve({ id: familyId }) },
    deps,
  );
  assert.equal(createFaceRes.status, 201);
  const faceJson = await createFaceRes.json() as { item: FontFaceRecord };
  const faceId = faceJson.item.ref.id;

  const valFaceReq = new Request(`http://localhost/api/admin/content/font-faces/${faceId}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: faceJson.item.revision }),
  });
  const valFaceRes = await validateFontFace(
    valFaceReq,
    { params: Promise.resolve({ id: faceId }) },
    deps,
  );
  assert.equal(valFaceRes.status, 200);
  const valFaceJson = await valFaceRes.json() as { receipt: ValidationReceipt };
  assert.equal(valFaceJson.receipt.passed, true);

  const pubFaceReq = new Request(`http://localhost/api/admin/content/font-faces/${faceId}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedRevision: faceJson.item.revision,
      validationId: valFaceJson.receipt.id,
    }),
  });
  const pubFaceRes = await publishFontFace(
    pubFaceReq,
    { params: Promise.resolve({ id: faceId }) },
    deps,
  );
  assert.equal(pubFaceRes.status, 200);
  const pubFaceJson = await pubFaceRes.json() as { item: FontFaceRecord };
  assert.equal(pubFaceJson.item.status, 'published');
});

test('4. Editor role is rejected with 403 on DELETE draft', async () => {
  const repo = new TestAssetRepository();
  const editorDeps = makeDeps(repo, 'editor');

  const delStickerReq = new Request('http://localhost/api/admin/content/stickers/sticker-draft?expectedRevision=1', {
    method: 'DELETE',
  });
  const delStickerRes = await deleteSticker(
    delStickerReq,
    { params: Promise.resolve({ id: 'sticker-draft' }) },
    editorDeps,
  );
  assert.equal(delStickerRes.status, 403);
  const stickerErr = await delStickerRes.json() as { code: string };
  assert.equal(stickerErr.code, 'FORBIDDEN');

  const delFaceReq = new Request('http://localhost/api/admin/content/font-faces/face-draft?expectedRevision=1', {
    method: 'DELETE',
  });
  const delFaceRes = await deleteFontFace(
    delFaceReq,
    { params: Promise.resolve({ id: 'face-draft' }) },
    editorDeps,
  );
  assert.equal(delFaceRes.status, 403);
  const faceErr = await delFaceRes.json() as { code: string };
  assert.equal(faceErr.code, 'FORBIDDEN');
});

test('5. Admin role can DELETE draft asset', async () => {
  const repo = new TestAssetRepository();
  const adminDeps = makeDeps(repo, 'admin');

  const delReq = new Request('http://localhost/api/admin/content/stickers/sticker-draft?expectedRevision=1', {
    method: 'DELETE',
  });
  const delRes = await deleteSticker(
    delReq,
    { params: Promise.resolve({ id: 'sticker-draft' }) },
    adminDeps,
  );
  assert.equal(delRes.status, 200);
  const delJson = await delRes.json() as { ok: boolean };
  assert.equal(delJson.ok, true);
  assert.ok(repo.deletedRefs.length > 0);
});

test('6. Public library route serves published asset, returns 404 for draft', async () => {
  const repo = new TestAssetRepository();
  const deps = { createRepository: () => repo as unknown as AssetLibraryRepository };

  const draftRes = await publicDelivery(
    new Request('http://localhost/api/library/sticker/sticker-draft'),
    { params: Promise.resolve({ kind: 'sticker', id: 'sticker-draft' }) },
    deps,
  );
  assert.equal(draftRes.status, 404);

  const neverPubRes = await publicDelivery(
    new Request('http://localhost/api/library/sticker/sticker-archived-never'),
    { params: Promise.resolve({ kind: 'sticker', id: 'sticker-archived-never' }) },
    deps,
  );
  assert.equal(neverPubRes.status, 404);

  const pubRes = await publicDelivery(
    new Request('http://localhost/api/library/sticker/sticker-published'),
    { params: Promise.resolve({ kind: 'sticker', id: 'sticker-published' }) },
    deps,
  );
  assert.equal(pubRes.status, 200);
  assert.equal(pubRes.headers.get('Content-Type'), 'image/svg+xml');

  const archPubRes = await publicDelivery(
    new Request('http://localhost/api/library/sticker/sticker-archived-published'),
    { params: Promise.resolve({ kind: 'sticker', id: 'sticker-archived-published' }) },
    deps,
  );
  assert.equal(archPubRes.status, 200);
});

test('7. Public library route sets immutable cache headers and CSP for SVG', async () => {
  const repo = new TestAssetRepository();
  const deps = { createRepository: () => repo as unknown as AssetLibraryRepository };

  const pubRes = await publicDelivery(
    new Request('http://localhost/api/library/sticker/sticker-published'),
    { params: Promise.resolve({ kind: 'sticker', id: 'sticker-published' }) },
    deps,
  );
  assert.equal(pubRes.status, 200);
  assert.equal(pubRes.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal(pubRes.headers.get('ETag'), '"checksum-sticker-published"');
  assert.equal(pubRes.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(pubRes.headers.get('Content-Security-Policy'), "default-src 'none'; sandbox;");
});

test('8. Invalid metadata returns 400 and revision conflict returns 409', async () => {
  const repo = new TestAssetRepository();
  const deps = makeDeps(repo, 'editor');

  const invalidMetaReq = new Request('http://localhost/api/admin/content/stickers/sticker-draft', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedRevision: 1,
      patch: { unknownField: 'not allowed' },
    }),
  });
  const invalidRes = await patchSticker(
    invalidMetaReq,
    { params: Promise.resolve({ id: 'sticker-draft' }) },
    deps,
  );
  assert.equal(invalidRes.status, 400);
  const invalidJson = await invalidRes.json() as { code: string };
  assert.equal(invalidJson.code, 'INVALID_INPUT');

  const conflictReq = new Request('http://localhost/api/admin/content/stickers/sticker-draft', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedRevision: 99,
      patch: { displayName: 'Stale update' },
    }),
  });
  const conflictRes = await patchSticker(
    conflictReq,
    { params: Promise.resolve({ id: 'sticker-draft' }) },
    deps,
  );
  assert.equal(conflictRes.status, 409);
  const conflictJson = await conflictRes.json() as { code: string };
  assert.equal(conflictJson.code, 'REVISION_CONFLICT');
});

test('9. Preview route requires staff authentication and applies no-store plus CSP for SVG', async () => {
  const repo = new TestAssetRepository();
  const unauthDeps = makeDeps(repo, 'unauth');
  const editorDeps = makeDeps(repo, 'editor');

  const unauthRes = await previewAsset(
    new Request('http://localhost/api/admin/content/preview/sticker/sticker-draft'),
    { params: Promise.resolve({ kind: 'sticker', id: 'sticker-draft' }) },
    unauthDeps,
  );
  assert.equal(unauthRes.status, 401);

  const previewRes = await previewAsset(
    new Request('http://localhost/api/admin/content/preview/sticker/sticker-draft'),
    { params: Promise.resolve({ kind: 'sticker', id: 'sticker-draft' }) },
    editorDeps,
  );
  assert.equal(previewRes.status, 200);
  assert.equal(previewRes.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(previewRes.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(previewRes.headers.get('Content-Security-Policy'), "default-src 'none'; sandbox;");
});

test('10. Bulk route handles bulk upload, metadata update, and publish operations', async () => {
  const repo = new TestAssetRepository();
  const deps = makeDeps(repo, 'editor');

  const svgBytes = await readFile(join(fixturesDir, 'safe-sticker.svg'));
  const bulkUploadReq = new Request('http://localhost/api/admin/content/stickers/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload',
      items: [
        {
          bytes: Buffer.from(svgBytes).toString('base64'),
          filename: 'item-1.svg',
          metadata: { displayName: 'Item 1' },
        },
      ],
    }),
  });
  const bulkUploadRes = await bulkStickers(bulkUploadReq, deps);
  assert.equal(bulkUploadRes.status, 200);
  const uploadJson = await bulkUploadRes.json() as { results: { ok: boolean }[] };
  assert.equal(uploadJson.results.length, 1);
  assert.equal(uploadJson.results[0]?.ok, true);

  const bulkMetaReq = new Request('http://localhost/api/admin/content/stickers/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update-metadata',
      items: [
        {
          id: 'sticker-draft',
          expectedRevision: 1,
          patch: { displayName: 'Batch Updated Name' },
        },
      ],
    }),
  });
  const bulkMetaRes = await bulkStickers(bulkMetaReq, deps);
  assert.equal(bulkMetaRes.status, 200);
  const metaJson = await bulkMetaRes.json() as { results: { ok: boolean }[] };
  assert.equal(metaJson.results.length, 1);
  assert.equal(metaJson.results[0]?.ok, true);
});

test('11. Sticker detail, binary replacement, and archiving', async () => {
  const repo = new TestAssetRepository();
  const deps = makeDeps(repo, 'editor');

  const getRes = await getSticker(
    new Request('http://localhost/api/admin/content/stickers/sticker-draft'),
    { params: Promise.resolve({ id: 'sticker-draft' }) },
    deps,
  );
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json() as { item: StickerRecord };
  assert.equal(getJson.item.ref.id, 'sticker-draft');

  const svgBytes = await readFile(join(fixturesDir, 'safe-sticker.svg'));
  const putFormData = new FormData();
  putFormData.append('file', new File([svgBytes], 'replaced.svg', { type: 'image/svg+xml' }));
  putFormData.append('expectedRevision', '1');

  const putRes = await putSticker(
    new Request('http://localhost/api/admin/content/stickers/sticker-draft', {
      method: 'PUT',
      body: putFormData,
    }),
    { params: Promise.resolve({ id: 'sticker-draft' }) },
    deps,
  );
  assert.equal(putRes.status, 200);
  const putJson = await putRes.json() as { item: StickerRecord };
  assert.equal(putJson.item.revision, 2);

  const archiveRes = await archiveSticker(
    new Request('http://localhost/api/admin/content/stickers/sticker-draft/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, reason: 'Archiving asset' }),
    }),
    { params: Promise.resolve({ id: 'sticker-draft' }) },
    deps,
  );
  assert.equal(archiveRes.status, 200);
  const archiveJson = await archiveRes.json() as { item: StickerRecord };
  assert.equal(archiveJson.item.status, 'archived');
});

test('12. Font family detail/status and font face detail, update, replacement, and archiving', async () => {
  const repo = new TestAssetRepository();
  const deps = makeDeps(repo, 'editor');

  const famRes = await getFontFamily(
    new Request('http://localhost/api/admin/content/fonts/family-1'),
    { params: Promise.resolve({ id: 'family-1' }) },
    deps,
  );
  assert.equal(famRes.status, 200);
  const famJson = await famRes.json() as { family: FontFamilyRecord; faces: FontFaceRecord[] };
  assert.equal(famJson.family.id, 'family-1');
  assert.ok(Array.isArray(famJson.faces));

  const patchFamRes = await patchFontFamilyRoute(
    new Request('http://localhost/api/admin/content/fonts/family-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 1,
        patch: { displayName: 'Updated Noto Display' },
      }),
    }),
    { params: Promise.resolve({ id: 'family-1' }) },
    deps,
  );
  assert.equal(patchFamRes.status, 200);
  const patchFamJson = await patchFamRes.json() as { family: FontFamilyRecord };
  assert.equal(patchFamJson.family.displayName, 'Updated Noto Display');

  const statusFamRes = await postFontFamilyStatus(
    new Request('http://localhost/api/admin/content/fonts/family-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, status: 'published' }),
    }),
    { params: Promise.resolve({ id: 'family-1' }) },
    deps,
  );
  assert.equal(statusFamRes.status, 200);
  const statusFamJson = await statusFamRes.json() as { family: FontFamilyRecord };
  assert.equal(statusFamJson.family.status, 'published');

  const facesListRes = await listFontFaces(
    new Request('http://localhost/api/admin/content/fonts/family-1/faces'),
    { params: Promise.resolve({ id: 'family-1' }) },
    deps,
  );
  assert.equal(facesListRes.status, 200);
  const facesListJson = await facesListRes.json() as { faces: FontFaceRecord[] };
  assert.ok(Array.isArray(facesListJson.faces));

  const getFaceRes = await getFontFace(
    new Request('http://localhost/api/admin/content/font-faces/face-draft'),
    { params: Promise.resolve({ id: 'face-draft' }) },
    deps,
  );
  assert.equal(getFaceRes.status, 200);
  const getFaceJson = await getFaceRes.json() as { item: FontFaceRecord };
  assert.equal(getFaceJson.item.ref.id, 'face-draft');

  const patchFaceRes = await patchFontFace(
    new Request('http://localhost/api/admin/content/font-faces/face-draft', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 1,
        patch: { displayName: 'Noto Sans Updated' },
      }),
    }),
    { params: Promise.resolve({ id: 'face-draft' }) },
    deps,
  );
  assert.equal(patchFaceRes.status, 200);
  const patchFaceJson = await patchFaceRes.json() as { item: FontFaceRecord };
  assert.equal(patchFaceJson.item.displayName, 'Noto Sans Updated');

  const fontBytes = await readFile(join(fixturesDir, 'vietnamese-font.ttf'));
  const putFaceFormData = new FormData();
  putFaceFormData.append('file', new File([fontBytes], 'replaced.ttf', { type: 'font/ttf' }));
  putFaceFormData.append('expectedRevision', '2');
  const putFaceRes = await putFontFace(
    new Request('http://localhost/api/admin/content/font-faces/face-draft', {
      method: 'PUT',
      body: putFaceFormData,
    }),
    { params: Promise.resolve({ id: 'face-draft' }) },
    deps,
  );
  assert.equal(putFaceRes.status, 200);
  const putFaceJson = await putFaceRes.json() as { item: FontFaceRecord };
  assert.equal(putFaceJson.item.revision, 3);

  const archiveFaceRes = await archiveFontFace(
    new Request('http://localhost/api/admin/content/font-faces/face-draft/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 3, reason: 'Archiving font face' }),
    }),
    { params: Promise.resolve({ id: 'face-draft' }) },
    deps,
  );
  assert.equal(archiveFaceRes.status, 200);
  const archiveFaceJson = await archiveFaceRes.json() as { item: FontFaceRecord };
  assert.equal(archiveFaceJson.item.status, 'archived');
});
