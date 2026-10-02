import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  canDeleteDraft,
  canManageLibrary,
  type StaffRole,
  type ValidationReceipt,
} from '../lib/domain/asset-library.ts';
import type {
  AssetLibraryRepository,
  StickerRecord,
} from '../lib/repositories/asset-library-repository.ts';
import {
  archiveAsset,
  createStickerDraft,
  deleteDraftAsset,
  LibraryServiceError,
  publishAsset,
  resolveLibraryRefs,
  updateAssetMetadata,
  validateAssetDraft,
} from '../lib/services/asset-library.ts';
import type { DesignState } from '../lib/product-state.ts';
import { createStickerElement } from '../lib/product-state.ts';
import { renderDocument } from '../lib/services/document-renderer.ts';
import {
  extractLibraryDependencies,
  isLibraryAssetPath,
  resolveLegacyReferences,
} from '../lib/services/library-dependencies.ts';
import {
  validateFont,
  validateSticker,
} from '../lib/services/library-validation.ts';

test('State 42 End-to-End Integration Contracts', async (t) => {
  await t.test('1. Role authorization matrix: Editor & Admin manage content, Admin only deletes drafts', () => {
    const roles: StaffRole[] = ['editor', 'admin'];
    for (const r of roles) {
      assert.equal(canManageLibrary(r, 'sticker'), true, `${r} can manage stickers`);
      assert.equal(canManageLibrary(r, 'font-face'), true, `${r} can manage fonts`);
    }

    assert.equal(canDeleteDraft('editor', 'draft', null), false, 'Editor cannot delete draft');
    assert.equal(canDeleteDraft('admin', 'draft', null), true, 'Admin can delete unreferenced draft');
    assert.equal(canDeleteDraft('admin', 'published', null), false, 'Cannot delete published asset');
    assert.equal(canDeleteDraft('admin', 'draft', '2026-10-02T00:00:00Z'), false, 'Cannot delete previously published asset');
  });

  await t.test('2. Real font validation: decodes valid Vietnamese font, rejects forged signature', async () => {
    const fontBytes = await readFile(new URL('./fixtures/library/vietnamese-font.ttf', import.meta.url));
    const fontResult = await validateFont(fontBytes, 'vietnamese-font.ttf');
    assert.equal(fontResult.format, 'ttf');
    assert.equal(fontResult.missingCodepoints.length, 0, 'Must have 100% Vietnamese coverage');
    assert.ok(fontResult.checksum.length === 64, 'Must have 64-char SHA256 checksum');

    await assert.rejects(
      () => validateFont(Buffer.from('wOF2invalid_payload'), 'fake.woff2'),
      /Invalid font binary/i
    );
  });

  await t.test('3. Sticker security: validates safe SVG, rejects hostile SVGs', async () => {
    const safeSvgBytes = await readFile(new URL('./fixtures/library/safe-sticker.svg', import.meta.url));
    const safeResult = await validateSticker(safeSvgBytes, 'safe.svg');
    assert.equal(safeResult.format, 'svg');
    assert.ok(safeResult.canonicalBytes.length > 0);
    assert.ok(safeResult.thumbnailBytes.length > 0, 'Thumbnail PNG generated');

    const hostileDoctype = await readFile(new URL('./fixtures/library/malicious-doctype.svg', import.meta.url));
    await assert.rejects(() => validateSticker(hostileDoctype, 'bad.svg'), /DOCTYPE/i);

    const hostileScript = await readFile(new URL('./fixtures/library/malicious-script.svg', import.meta.url));
    await assert.rejects(() => validateSticker(hostileScript, 'bad.svg'), /element <script> is not allowed/i);
  });

  await t.test('4. Design dependencies: stickers are recognized as library assets and never promoted to customer assets', () => {
    assert.equal(isLibraryAssetPath('/api/library/sticker/cat-1'), true);
    assert.equal(isLibraryAssetPath('stickers/cat-1/abc.svg'), true);
    assert.equal(isLibraryAssetPath('/api/assets/cust-123'), false, 'Customer upload is not library asset');

    const stickerEl = createStickerElement({
      id: 'sticker-el-1',
      stickerId: 'cat-1',
      storagePath: 'stickers/cat-1/abc.svg',
      src: '/api/library/sticker/cat-1',
      title: 'Mèo dễ thương',
      checksum: 'chk123',
    });

    const doc: DesignState = {
      productId: 'card',
      variantId: 'horizontal',
      templateId: null,
      text: 'Chúc mừng',
      color: '#000',
      backgroundColor: '#fff',
      image: null,
      quantity: 1,
      productOptions: {},
      elements: [stickerEl],
    };

    const deps = extractLibraryDependencies(doc);
    assert.equal(deps.length, 1);
    assert.equal(deps[0].kind, 'sticker');
    assert.equal(deps[0].id, 'cat-1');
    assert.equal(deps[0].checksum, 'chk123');

    // Legacy resolver is strictly non-mutating
    const textDoc: DesignState = {
      ...doc,
      elements: [
        {
          id: 'text-1',
          type: 'text',
          x: 50,
          y: 50,
          width: 50,
          height: 20,
          rotation: 0,
          data: { text: 'Hello', color: '#000', fontFamily: 'Lora', fontSize: 16, fontWeight: 'regular', fontStyle: 'normal', align: 'center', lineHeight: 1.4, letterSpacing: 0 },
        },
      ],
    };
    const resolved = resolveLegacyReferences(textDoc, new Map([['lora', 'face-lora-1']]));
    assert.notStrictEqual(resolved, textDoc);
    assert.equal(resolved.elements?.[0].data?.fontFaceId, 'face-lora-1');
    assert.equal(textDoc.elements?.[0].data?.fontFaceId, undefined, 'Input document is untouched');
  });

  await t.test('5. Real Chromium document renderer: renders design containing sticker to valid PNG > 1x1', async () => {
    const stickerEl = createStickerElement({
      id: 'sticker-el-1',
      stickerId: 'star-1',
      storagePath: 'stickers/star-1/star.svg',
      src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 64,36 98,36 70,57 81,91 50,70 19,91 30,57 2,36 36,36" fill="%23f59e0b"/></svg>',
      title: 'Ngôi sao',
      x: 50,
      y: 50,
      width: 40,
      height: 40,
    });

    const design: DesignState = {
      productId: 'sticker',
      variantId: 'die-cut',
      templateId: null,
      text: '',
      color: '#000',
      backgroundColor: '#ffffff',
      image: null,
      quantity: 10,
      productOptions: { hasWhiteBorder: true, borderWidth: 4 },
      elements: [stickerEl],
    };

    const result = await renderDocument(design, { surface: 'front' });
    assert.ok(result.png.length > 100, 'Must produce real PNG binary');
    assert.equal(result.png[0], 0x89);
    assert.equal(result.png[1], 0x50); // 'P'
    assert.equal(result.png[2], 0x4e); // 'N'
    assert.equal(result.png[3], 0x47); // 'G'
    assert.ok(result.sha256.length === 64, 'Must output 64-char SHA256 hex checksum');
    assert.ok(result.engineFingerprint.startsWith('chromium-'), 'Must record engine fingerprint');
  });

  await t.test('6. Full service and repository lifecycle: draft -> validate -> publish -> archive -> resolve -> CAS conflict -> delete guard', async () => {
    const safeSvgBytes = await readFile(new URL('./fixtures/library/safe-sticker.svg', import.meta.url));
    const editorActor = { userId: 'user-editor-1', role: 'editor' as const };
    const adminActor = { userId: 'user-admin-1', role: 'admin' as const };

    // In-memory stateful repository simulating database and storage

    class IntegrationTestRepository {
      record: StickerRecord | null = null;
      receipt: ValidationReceipt | null = null;
      storage = new Map<string, Uint8Array>();

      async getRecord() { return this.record; }
      async getSticker() { return this.record; }
      async getValidationRunById() { return this.receipt; }
      async insertValidationRun(receipt: ValidationReceipt) {
        this.receipt = receipt;
        return receipt;
      }
      async linkValidationRun(_kind: string, _assetId: string, validationId: string) {
        if (this.record) this.record = { ...this.record, validationId };
      }
      async findDuplicate() { return null; }
      async uploadObject(bucket: string, key: string, bytes: Uint8Array) {
        this.storage.set(`${bucket}:${key}`, bytes);
      }
      async downloadObject(bucket: string, key: string) {
        const b = this.storage.get(`${bucket}:${key}`);
        if (!b) throw new Error(`Not found: ${bucket}:${key}`);
        return b;
      }
      async copyObject(srcBucket: string, srcKey: string, destBucket: string, destKey: string) {
        const b = this.storage.get(`${srcBucket}:${srcKey}`);
        if (!b) throw new Error(`Source not found: ${srcBucket}:${srcKey}`);
        this.storage.set(`${destBucket}:${destKey}`, b);
      }
      async removeObjects(bucket: string, keys: string[]) {
        for (const k of keys) this.storage.delete(`${bucket}:${k}`);
      }
      async createDraft(_actorId: string, _requestId: string, _kind: string, id: string, payload: unknown) {
        const p = payload as Record<string, unknown>;
        const checksum = String(p.checksum ?? '');
        const storagePath = String(p.storage_path ?? '');
        this.record = {
          ref: { kind: 'sticker', id, checksum },
          status: 'draft',
          revision: 1,
          everPublishedAt: null,
          binary: { bucket: 'library-drafts', key: storagePath, checksum, byteSize: Number(p.byte_size ?? 0), mimeType: String(p.mime_type ?? 'image/svg+xml') },
          thumbnail: null,
          displayName: String(p.display_name ?? id),
          category: String(p.category ?? 'general'),
          tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
          searchKeywords: [],
          description: String(p.description ?? ''),
          sampleText: null,
          license: null,
          validationId: null,
          width: typeof p.width === 'number' ? p.width : null,
          height: typeof p.height === 'number' ? p.height : null,
        };
        return { ok: true, item: { id } };
      }
      async publish(_actorId: string, _requestId: string, _kind: string, _id: string, expectedRevision: number, _validation: string, publicObjects: unknown) {
        if (!this.record) throw new Error('NOT_FOUND');
        if (this.record.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
        const pub = (publicObjects ?? {}) as { bucket?: string; key?: string; binary?: { key?: string } };
        const key = pub.key ?? pub.binary?.key ?? this.record.binary.key;
        this.record = {
          ...this.record,
          status: 'published',
          revision: this.record.revision + 1,
          everPublishedAt: new Date().toISOString(),
          binary: { ...this.record.binary, bucket: 'sticker-library', key },
        };
        return this.record;
      }
      async archive(_actorId: string, _requestId: string, _kind: string, _id: string, expectedRevision: number) {
        if (!this.record) throw new Error('NOT_FOUND');
        if (this.record.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
        this.record = { ...this.record, status: 'archived', revision: this.record.revision + 1 };
        return this.record;
      }
      async patchMetadata(_actorId: string, _requestId: string, _kind: string, _id: string, expectedRevision: number, patch: unknown) {
        if (!this.record) throw new Error('NOT_FOUND');
        if (this.record.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
        const p = patch as { displayName?: string };
        this.record = { ...this.record, displayName: p.displayName ?? this.record.displayName, revision: this.record.revision + 1 };
        return this.record;
      }
      async prepareDelete(_ref: unknown, expectedRevision: number) {
        if (!this.record) throw new Error('NOT_FOUND');
        if (this.record.revision !== expectedRevision) throw new Error('REVISION_CONFLICT');
        return { intent: 'intent-1', objectKeys: [this.record.binary.key] };
      }
      async finishDelete() {
        this.record = null;
      }
      async listStickers(query: { status?: string }) {
        const all = this.record ? [this.record] : [];
        const filtered = query.status ? all.filter((s) => s.status === query.status) : all;
        return { items: filtered, total: filtered.length };
      }
    }

    const repoInstance = new IntegrationTestRepository();
    const mockRepo = repoInstance as unknown as AssetLibraryRepository;

    // Step 1: Create sticker draft
    const draft = await createStickerDraft(
      {
        bytes: safeSvgBytes,
        filename: 'e2e-sticker.svg',
        metadata: { displayName: 'Sticker E2E', category: 'cute', tags: ['e2e', 'test'] },
        requestId: 'req-e2e-create',
      },
      editorActor,
      mockRepo,
    );
    assert.equal(draft.status, 'draft');
    assert.equal(draft.revision, 1);
    assert.equal(draft.displayName, 'Sticker E2E');
    assert.ok(repoInstance.record !== null);

    // Step 2: Validate draft via engine probe
    const receipt = await validateAssetDraft(
      draft.ref,
      { expectedRevision: 1, requestId: 'req-e2e-val' },
      editorActor,
      mockRepo,
    );
    assert.equal(receipt.passed, true);
    assert.ok(receipt.browserProofHash !== null);

    // Step 3: Publish asset atomically
    const published = await publishAsset(
      draft.ref,
      { expectedRevision: 1, requestId: 'req-e2e-pub' },
      receipt.id,
      editorActor,
      mockRepo,
    );
    assert.equal(published.status, 'published');
    assert.equal(published.revision, 2);
    assert.ok(published.everPublishedAt !== null);

    // Step 3b: Customer catalog query includes published sticker
    const catalogBeforeArchive = await mockRepo.listStickers({ status: 'published' });
    assert.equal(catalogBeforeArchive.items.length, 1);
    assert.equal(catalogBeforeArchive.items[0].ref.id, draft.ref.id);
    // Step 4: Archive asset requires valid reason
    await assert.rejects(
      () => archiveAsset(draft.ref, { expectedRevision: 2, requestId: 'req-e2e-arch-fail' }, 'no', editorActor, mockRepo),
      (err: unknown) => err instanceof LibraryServiceError && err.code === 'INVALID_INPUT',
    );

    const archived = await archiveAsset(
      draft.ref,
      { expectedRevision: 2, requestId: 'req-e2e-arch' },
      'Thay thế bộ sưu tập mới',
      editorActor,
      mockRepo,
    );
    assert.equal(archived.status, 'archived');
    assert.equal(archived.revision, 3);

    // Step 4b: Customer catalog query excludes archived sticker
    const catalogAfterArchive = await mockRepo.listStickers({ status: 'published' });
    assert.equal(catalogAfterArchive.items.length, 0, 'Archived sticker is excluded from published catalog');
    // Step 5: Exact reference resolver resolves archived asset by checksum
    const resolvedMap = await resolveLibraryRefs([draft.ref], mockRepo);
    assert.equal(resolvedMap.size, 1);
    const resolvedItem = resolvedMap.get(`sticker:${draft.ref.id}`);
    assert.ok(resolvedItem !== undefined);
    assert.equal(resolvedItem?.status, 'archived');
    assert.equal(resolvedItem?.binary.checksum, draft.ref.checksum);

    // Step 6: Monotonic revision CAS mismatch raises REVISION_CONFLICT
    await assert.rejects(
      () => updateAssetMetadata(draft.ref, { expectedRevision: 1, requestId: 'req-stale' }, { displayName: 'Hacked' }, editorActor, mockRepo),
      (err: unknown) => err instanceof LibraryServiceError && err.code === 'REVISION_CONFLICT',
    );

    // Step 7: Draft deletion role guards: Editor rejected with FORBIDDEN, published rejected with IMMUTABLE_BINARY
    await assert.rejects(
      () => deleteDraftAsset(draft.ref, { expectedRevision: 3, requestId: 'req-del-ed' }, editorActor, mockRepo),
      (err: unknown) => err instanceof LibraryServiceError && err.code === 'FORBIDDEN',
    );
    await assert.rejects(
      () => deleteDraftAsset(draft.ref, { expectedRevision: 3, requestId: 'req-del-adm' }, adminActor, mockRepo),
      (err: unknown) => err instanceof LibraryServiceError && err.code === 'IMMUTABLE_BINARY',
    );

    // Step 8: Successful Admin deletion of an eligible never-published draft
    const draft2 = await createStickerDraft(
      {
        bytes: safeSvgBytes,
        filename: 'e2e-draft-to-delete.svg',
        metadata: { displayName: 'Temporary Draft', category: 'test', tags: [] },
        requestId: 'req-e2e-create-temp',
      },
      editorActor,
      mockRepo,
    );
    assert.equal(draft2.status, 'draft');
    await deleteDraftAsset(draft2.ref, { expectedRevision: 1, requestId: 'req-e2e-del-admin' }, adminActor, mockRepo);
    const deletedRecord = await mockRepo.getRecord(draft2.ref);
    assert.equal(deletedRecord, null, 'Never-published draft is deleted by admin');
  });
});
