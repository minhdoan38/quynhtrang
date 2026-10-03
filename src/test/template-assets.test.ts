import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

import type { StaffIdentity } from '../lib/domain/order.ts';
import {
  TemplateServiceError,
  type AttachTemplateAssetInput,
  type CreateTemplateRepoInput,
  type EligibleSourceProject,
  type SourceProjectDetail,
  type TemplateAssetRecord,
  type TemplateDraftRecord,
  type TemplateRecord,
  type TemplateRepoResult,
} from '../lib/domain/template.ts';
import { createInitialState, type DesignState } from '../lib/product-state.ts';
import { createTemplateTarget } from '../lib/template-target.ts';
import { isTemplateAssetPath, promoteDesignAssets } from '../lib/asset-store.ts';
import {
  canCollectTemplateAsset,
  createTemplateFromProject,
  extractTemplateAssetManifest,
  prepareTemplateVersionAssets,
  resolveTemplateAsset,
  uploadTemplateAsset,
  validateTemplateRasterImage,
} from '../lib/services/template-assets.ts';
import { TemplateManagementService } from '../lib/services/template-management.ts';
import type { TemplateRepository } from '../lib/repositories/template-repository.ts';

import { POST as uploadAssetRoute } from '../app/api/admin/content/templates/[id]/assets/route.ts';
import { GET as getDraftAssetRoute } from '../app/api/admin/content/templates/[id]/assets/[assetId]/route.ts';
import { GET as getPublishedAssetRoute } from '../app/api/templates/assets/[assetId]/route.ts';
import { GET as listSourcesRoute } from '../app/api/admin/content/templates/sources/route.ts';
import { POST as fromProjectRoute } from '../app/api/admin/content/templates/from-project/route.ts';
import { runTemplateCleanup } from '../../scripts/state43-template-cleanup.ts';

function createMockEditor(userId = '43000000-0000-0000-0000-0000000000e1'): StaffIdentity {
  return {
    userId,
    role: 'editor',
    email: 'editor@quynhtrang.test',
  };
}

function createMockCustomer(userId = 'customer-uuid-1'): StaffIdentity {
  return {
    userId,
    role: 'customer' as unknown as 'editor',
    email: 'customer@quynhtrang.test',
  };
}

async function createTestImage(format: 'png' | 'jpeg' | 'webp', width = 100, height = 100): Promise<Buffer> {
  const img = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 100, b: 50, alpha: 1 },
    },
  });
  if (format === 'png') return img.png().toBuffer();
  if (format === 'jpeg') return img.jpeg().toBuffer();
  return img.webp().toBuffer();
}

function buildCreateRepoInput(params: { id: string; name: string; productId?: 'card' | 'wrapping' }): CreateTemplateRepoInput {
  const productId = params.productId ?? 'card';
  return {
    requestId: `req-create-${params.id}`,
    id: params.id,
    name: params.name,
    productId,
    variantId: 'horizontal',
    productMode: null,
    fixedStickerShape: null,
    targetSnapshot: { productId, variantId: 'horizontal' },
    initialDocument: createInitialState(productId),
  };
}

function createMockRepository() {
  const templates = new Map<string, TemplateRecord>();
  const drafts = new Map<string, TemplateDraftRecord>();
  const assets = new Map<string, TemplateAssetRecord>();
  const storage = new Map<string, Uint8Array>(); // key: `${bucket}/${path}`
  const projects = new Map<string, SourceProjectDetail>();
  const versionAssets = new Set<string>(); // `${versionId}:${assetId}`

  const repo = {
    async getTemplate(id: string) {
      return templates.get(id) ?? null;
    },
    async getDraft(templateId: string) {
      return drafts.get(templateId) ?? null;
    },
    async createTemplate(actor: string, input: CreateTemplateRepoInput) {
      const target = createTemplateTarget({
        productId: input.productId,
        variantId: input.variantId,
        mode: input.productMode,
        shape: input.fixedStickerShape,
      });
      const template: TemplateRecord = {
        id: input.id,
        name: input.name,
        status: 'draft',
        revision: 1,
        productId: input.productId,
        variantId: input.variantId,
        mode: input.productMode,
        shape: input.fixedStickerShape,
        target,
        categoryId: input.categoryId ?? '',
        tags: input.tags ?? [],
        sortOrder: input.sortOrder ?? 0,
        currentPublishedVersionId: null,
        everPublishedAt: null,
        createdAt: '2026-10-04T10:00:00Z',
        updatedAt: '2026-10-04T10:00:00Z',
        archivedAt: null,
        createdBy: actor,
      };
      const draft: TemplateDraftRecord = {
        id: `draft-${input.id}`,
        templateId: input.id,
        basedOnVersionId: null,
        designDocument: input.initialDocument,
        documentSchemaVersion: 1,
        draftRevision: 1,
        editorUserId: null,
        leaseSessionId: null,
        leaseEpoch: 0,
        leaseExpiresAt: null,
        lastActivityAt: null,
        createdAt: '2026-10-04T10:00:00Z',
        updatedAt: '2026-10-04T10:00:00Z',
        createdBy: actor,
      };
      templates.set(input.id, template);
      drafts.set(input.id, draft);
      return { ok: true, value: { template, draft } };
    },
    async attachAsset(actor: string, input: AttachTemplateAssetInput): Promise<TemplateRepoResult<TemplateAssetRecord>> {
      if (!templates.has(input.templateId)) {
        return { ok: false, code: 'NOT_FOUND', message: 'Template not found' };
      }
      const asset: TemplateAssetRecord = {
        id: input.storagePath.split('/')[1]?.split('.')[0] || 'mock-asset-id',
        templateId: input.templateId,
        draftId: input.draftId ?? null,
        storageBucket: input.storageBucket,
        storageKey: input.storagePath,
        checksum: input.checksum,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        widthPx: input.pixelWidth ?? undefined,
        heightPx: input.pixelHeight ?? undefined,
        uploadStatus: input.uploadStatus ?? 'attached',
        isPublished: false,
        createdAt: new Date().toISOString(),
        createdBy: actor,
      };
      assets.set(asset.id, asset);
      return { ok: true, value: asset };
    },
    async acquireLease(actor: string, input: { requestId: string; draftId: string; sessionId: string }) {
      const draft = Array.from(drafts.values()).find((d) => d.id === input.draftId || d.templateId === input.draftId);
      if (!draft) return { ok: false, code: 'NOT_FOUND', message: 'Draft not found' };
      draft.editorUserId = actor;
      draft.leaseSessionId = input.sessionId;
      draft.leaseExpiresAt = new Date(Date.now() + 120_000).toISOString();
      return { ok: true, value: draft };
    },
    async saveDraft(actor: string, input: { requestId: string; draftId: string; expectedRevision: number; sessionId: string; leaseEpoch: number; document: DesignState }) {
      const draft = Array.from(drafts.values()).find((d) => d.id === input.draftId || d.templateId === input.draftId);
      if (!draft) return { ok: false, code: 'NOT_FOUND', message: 'Draft not found' };
      draft.designDocument = input.document;
      draft.draftRevision = input.expectedRevision + 1;
      draft.updatedAt = new Date().toISOString();
      return { ok: true, value: { revision: draft.draftRevision, updatedAt: draft.updatedAt, requestId: input.requestId } };
    },
    async cleanupDraftAsset(actor: string, assetId: string, options: { requestId?: string; maxAgeHours?: number } = {}) {
      const asset = assets.get(assetId);
      if (!asset) return { success: false, reason: 'NOT_FOUND' };
      if (asset.isPublished) return { success: false, reason: 'EVER_PUBLISHED' };
      assets.delete(assetId);
      return { success: true, storagePath: asset.storageKey, storageBucket: asset.storageBucket };
    },
    async getAsset(assetId: string) {
      return assets.get(assetId) ?? null;
    },
    async listAssetsForTemplate(templateId: string) {
      return Array.from(assets.values()).filter((a) => a.templateId === templateId);
    },
    async uploadStorageObject(bucket: string, path: string, bytes: Uint8Array) {
      storage.set(`${bucket}/${path}`, bytes);
    },
    async downloadStorageObject(bucket: string, path: string) {
      return storage.get(`${bucket}/${path}`) ?? null;
    },
    async copyStorageObject(fromBucket: string, fromPath: string, toBucket: string, toPath: string) {
      const bytes = storage.get(`${fromBucket}/${fromPath}`);
      if (!bytes) throw new Error(`Source not found: ${fromBucket}/${fromPath}`);
      storage.set(`${toBucket}/${toPath}`, bytes);
    },
    async deleteStorageObject(bucket: string, path: string) {
      storage.delete(`${bucket}/${path}`);
    },
    async markAssetPublished(assetId: string) {
      const asset = assets.get(assetId);
      if (asset) {
        asset.isPublished = true;
        asset.uploadStatus = 'verified';
      }
    },
    async linkVersionAsset(versionId: string, assetId: string) {
      versionAssets.add(`${versionId}:${assetId}`);
    },
    async listEligibleSourceProjects(actor: string, productId?: string | null): Promise<EligibleSourceProject[]> {
      return Array.from(projects.values())
        .filter((p) => p.ownerUserId === actor && (!productId || p.productId === productId))
        .map((p) => ({
          id: p.id,
          productId: p.productId,
          variantId: p.variantId,
          currentWorkingRevision: p.currentWorkingRevision,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          eligible: p.eligible,
          blockedReason: p.blockedReason,
        }));
    },
    async getSourceProject(actor: string, projectId: string) {
      const p = projects.get(projectId);
      if (!p || p.ownerUserId !== actor) return null;
      return p;
    },
  } as unknown as TemplateRepository;

  return {
    repo,
    templates,
    drafts,
    assets,
    storage,
    projects,
    versionAssets,
  };
}

describe('State 43 Task 10: Template Assets, Safe Delivery, and Source Cloning', () => {
  describe('canCollectTemplateAsset predicate', () => {
    it('strictly satisfies plan contract checks', () => {
      assert.equal(canCollectTemplateAsset({ everPublished: true, referenced: false, pendingOperation: false, ageHours: 48 }), false);
      assert.equal(canCollectTemplateAsset({ everPublished: false, referenced: true, pendingOperation: false, ageHours: 48 }), false);
      assert.equal(canCollectTemplateAsset({ everPublished: false, referenced: false, pendingOperation: false, ageHours: 25 }), true);
      assert.equal(canCollectTemplateAsset({ everPublished: false, referenced: false, pendingOperation: true, ageHours: 48 }), false);
      assert.equal(canCollectTemplateAsset({ everPublished: false, referenced: false, pendingOperation: false, ageHours: 12 }), false);
    });
  });

  describe('extractTemplateAssetManifest and isTemplateAssetPath', () => {
    it('correctly identifies and extracts canonical template asset locators from documents', () => {
      assert.equal(isTemplateAssetPath('template-asset://f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
      assert.equal(isTemplateAssetPath('/api/templates/assets/f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
      assert.equal(isTemplateAssetPath('/api/admin/content/templates/t1/assets/f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
      assert.equal(isTemplateAssetPath('/api/assets/asset-1234'), false);
      assert.equal(isTemplateAssetPath('blob:http://localhost/1234'), false);

      const doc = createInitialState('card');
      doc.image = {
        src: 'template-asset://11111111-1111-1111-1111-111111111111',
        name: 'test.png',
        type: 'image/png',
        size: 1024,
        width: 100,
        height: 100,
      };
      doc.elements = [
        {
          id: 'el-1',
          type: 'image',
          x: 10,
          y: 10,
          width: 50,
          height: 50,
          rotation: 0,
          locked: false,
          data: {
            src: '/api/templates/assets/22222222-2222-2222-2222-222222222222',
            originalSrc: 'template-asset://33333333-3333-3333-3333-333333333333',
            removedBackgroundSrc: '/api/admin/content/templates/t1/assets/44444444-4444-4444-4444-444444444444',
          },
        },
      ];

      const manifest = extractTemplateAssetManifest(doc);
      assert.equal(manifest.length, 4);
      const ids = manifest.map((m) => m.assetId).sort();
      assert.deepEqual(ids, [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
      ]);
    });
  });

  describe('validateTemplateRasterImage', () => {
    it('accepts and normalizes valid PNG, JPEG, and WebP', async () => {
      const pngBytes = await createTestImage('png', 200, 150);
      const pngResult = await validateTemplateRasterImage(pngBytes);
      assert.equal(pngResult.mimeType, 'image/png');
      assert.equal(pngResult.ext, 'png');
      assert.equal(pngResult.width, 200);
      assert.equal(pngResult.height, 150);
      assert.match(pngResult.checksum, /^[a-f0-9]{64}$/);

      const jpegBytes = await createTestImage('jpeg', 120, 80);
      const jpegResult = await validateTemplateRasterImage(jpegBytes);
      assert.equal(jpegResult.mimeType, 'image/jpeg');
      assert.equal(jpegResult.ext, 'jpg');

      const webpBytes = await createTestImage('webp', 50, 50);
      const webpResult = await validateTemplateRasterImage(webpBytes);
      assert.equal(webpResult.mimeType, 'image/webp');
      assert.equal(webpResult.ext, 'webp');
    });

    it('rejects unsupported SVG and text files', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
      await assert.rejects(
        () => validateTemplateRasterImage(svg),
        (err: unknown) => {
          assert.ok(err && typeof err === 'object' && 'code' in err && err.code === 'INVALID_INPUT');
          return true;
        },
      );

      const text = Buffer.from('not an image');
      await assert.rejects(
        () => validateTemplateRasterImage(text),
        (err: unknown) => {
          assert.ok(err && typeof err === 'object' && 'code' in err && err.code === 'INVALID_INPUT');
          return true;
        },
      );
    });

    it('rejects files exceeding 10 MiB limit', async () => {
      const bigBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
      await assert.rejects(
        () => validateTemplateRasterImage(bigBuffer),
        (err: unknown) => {
          assert.ok(err && typeof err === 'object' && 'code' in err && err.code === 'INVALID_INPUT');
          return true;
        },
      );
    });
  });

  describe('uploadTemplateAsset and resolveTemplateAsset', () => {
    it('uploads image into private template-drafts bucket and resolves via draft endpoint', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      await mock.repo.createTemplate(editor.userId, buildCreateRepoInput({ id: 'tmpl-1', name: 'Template 1' }));

      const pngBytes = await createTestImage('png', 300, 200);
      const uploaded = await uploadTemplateAsset(
        editor,
        { templateId: 'tmpl-1', draftId: 'draft-tmpl-1' },
        { bytes: pngBytes, filename: 'photo.png' },
        { repo: mock.repo },
      );

      assert.equal(uploaded.templateId, 'tmpl-1');
      assert.equal(uploaded.storageBucket, 'template-drafts');
      assert.equal(uploaded.canonicalLocator, `template-asset://${uploaded.assetId}`);
      assert.equal(uploaded.viewUrl, `/api/admin/content/templates/tmpl-1/assets/${uploaded.assetId}`);

      // Verify draft resolve works for staff
      const resolvedDraft = await resolveTemplateAsset(
        uploaded.assetId,
        { kind: 'draft', templateId: 'tmpl-1', actor: editor },
        { repo: mock.repo },
      );
      assert.equal(resolvedDraft.mimeType, 'image/png');
      assert.equal(resolvedDraft.isPublished, false);
      assert.equal(resolvedDraft.checksum, uploaded.checksum);

      // Verify draft resolve fails for non-matching template
      await assert.rejects(
        () => resolveTemplateAsset(
          uploaded.assetId,
          { kind: 'draft', templateId: 'other-tmpl', actor: editor },
          { repo: mock.repo },
        ),
        (err: unknown) => err instanceof Error && 'code' in err && err.code === 'FORBIDDEN',
      );

      // Verify draft resolve fails for non-staff
      await assert.rejects(
        () => resolveTemplateAsset(
          uploaded.assetId,
          { kind: 'draft', templateId: 'tmpl-1', actor: createMockCustomer() },
          { repo: mock.repo },
        ),
        (err: unknown) => err instanceof Error && 'code' in err && err.code === 'FORBIDDEN',
      );

      // Verify public version resolve fails while unpublished
      await assert.rejects(
        () => resolveTemplateAsset(
          uploaded.assetId,
          { kind: 'published' },
          { repo: mock.repo },
        ),
        (err: unknown) => err instanceof Error && 'code' in err && err.code === 'NOT_FOUND',
      );

      // Mark published and verify public access succeeds
      await mock.repo.markAssetPublished(uploaded.assetId);
      const resolvedPub = await resolveTemplateAsset(
        uploaded.assetId,
        { kind: 'published' },
        { repo: mock.repo },
      );
      assert.equal(resolvedPub.isPublished, true);
      assert.equal(resolvedPub.checksum, uploaded.checksum);
    });
  });

  describe('prepareTemplateVersionAssets', () => {
    it('copies draft assets to candidates directory in template-versions bucket and rewrites document URLs', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      await mock.repo.createTemplate(editor.userId, buildCreateRepoInput({ id: 'tmpl-ver', name: 'Template Ver' }));

      const pngBytes = await createTestImage('png', 100, 100);
      const uploaded = await uploadTemplateAsset(
        editor,
        { templateId: 'tmpl-ver', draftId: 'draft-tmpl-ver' },
        { bytes: pngBytes },
        { repo: mock.repo },
      );

      const draftDoc = createInitialState('card');
      draftDoc.elements = [
        {
          id: 'el-pic',
          type: 'image',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          locked: false,
          data: {
            src: uploaded.viewUrl,
            templateAssetId: uploaded.assetId,
          },
        },
      ];

      const opId = 'op-publish-123';
      const prepared = await prepareTemplateVersionAssets(
        editor,
        { templateId: 'tmpl-ver', draftId: 'draft-tmpl-ver', document: draftDoc },
        opId,
        { repo: mock.repo },
      );

      assert.equal(prepared.operationId, opId);
      assert.equal(prepared.assets.length, 1);
      assert.equal(prepared.assets[0].candidateBucket, 'template-versions');
      assert.equal(prepared.assets[0].candidatePath, `candidates/${opId}/${uploaded.assetId}.png`);

      // Verify candidate bytes were copied
      const copiedBytes = await mock.repo.downloadStorageObject('template-versions', `candidates/${opId}/${uploaded.assetId}.png`);
      assert.ok(copiedBytes);
      assert.equal(copiedBytes!.byteLength, pngBytes.byteLength);

      // Verify candidate document references were rewritten to public version endpoint
      const rewrittenEl = prepared.candidateDocument.elements![0];
      const data = rewrittenEl.data as Record<string, unknown>;
      assert.equal(data.src, `/api/templates/assets/${uploaded.assetId}`);
    });
  });

  describe('createTemplateFromProject', () => {
    it('enforces rights acknowledgement checkbox', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      await assert.rejects(
        () => createTemplateFromProject(
          editor,
          {
            sourceProjectId: 'proj-1',
            expectedSourceRevision: 1,
            target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
            name: 'Cloned Template',
            rightsAcknowledged: false,
            requestId: 'req-clone-1',
          },
          { repo: mock.repo },
        ),
        (err: unknown) => err instanceof Error && 'code' in err && err.code === 'RIGHTS_ACKNOWLEDGEMENT_REQUIRED',
      );
    });

    it('rejects cloning projects with linked customer orders', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      mock.projects.set('proj-with-orders', {
        id: 'proj-with-orders',
        ownerUserId: editor.userId,
        productId: 'card',
        variantId: 'horizontal',
        currentWorkingRevision: 2,
        workingDocument: createInitialState('card') as unknown as Record<string, unknown>,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        eligible: false,
        blockedReason: 'HAS_LINKED_ORDERS',
      });

      await assert.rejects(
        () => createTemplateFromProject(
          editor,
          {
            sourceProjectId: 'proj-with-orders',
            expectedSourceRevision: 2,
            target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
            name: 'Cloned Template',
            rightsAcknowledged: true,
            requestId: 'req-clone-2',
          },
          { repo: mock.repo },
        ),
        (err: unknown) => err instanceof Error && 'code' in err && err.code === 'SOURCE_PROJECT_HAS_ORDERS',
      );
    });

    it('rejects cloning non-staff owned projects', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      mock.projects.set('proj-customer', {
        id: 'proj-customer',
        ownerUserId: 'other-user-uuid',
        productId: 'card',
        variantId: 'horizontal',
        currentWorkingRevision: 1,
        workingDocument: createInitialState('card') as unknown as Record<string, unknown>,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        eligible: true,
        blockedReason: null,
      });

      await assert.rejects(
        () => createTemplateFromProject(
          editor,
          {
            sourceProjectId: 'proj-customer',
            expectedSourceRevision: 1,
            target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
            name: 'Cloned Template',
            rightsAcknowledged: true,
            requestId: 'req-clone-3',
          },
          { repo: mock.repo },
        ),
        (err: unknown) => err instanceof Error && 'code' in err && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND'),
      );
    });

    it('successfully clones staff project, copies customer assets into template-drafts, and keeps source untouched', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      const customerImgBytes = await createTestImage('png', 150, 150);
      mock.storage.set('customer-assets/source-proj-1/cust-asset-99', customerImgBytes);

      const sourceDoc = createInitialState('card');
      sourceDoc.image = {
        src: '/api/assets/cust-asset-99',
        name: 'card-front.png',
        type: 'image/png',
        size: customerImgBytes.byteLength,
        width: 150,
        height: 150,
      };

      const sourceSnapshot = JSON.stringify(sourceDoc);

      mock.projects.set('source-proj-1', {
        id: 'source-proj-1',
        ownerUserId: editor.userId,
        productId: 'card',
        variantId: 'horizontal',
        currentWorkingRevision: 3,
        workingDocument: sourceDoc as unknown as Record<string, unknown>,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        eligible: true,
        blockedReason: null,
      });

      const result = await createTemplateFromProject(
        editor,
        {
          sourceProjectId: 'source-proj-1',
          expectedSourceRevision: 3,
          target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
          name: 'Cloned Staff Template',
          rightsAcknowledged: true,
          requestId: 'req-clone-success',
        },
        { repo: mock.repo },
      );

      assert.ok(result.template);
      assert.equal(result.template.name, 'Cloned Staff Template');
      assert.equal(result.copiedAssetsCount, 1);

      // Verify copied asset is now in template-drafts bucket
      const draftDoc = result.draft.designDocument;
      assert.ok(draftDoc.image?.src.includes('/api/admin/content/templates/'));
      assert.notEqual(draftDoc.image?.src, '/api/assets/cust-asset-99');

      // Verify source project was completely untouched
      const originalProj = mock.projects.get('source-proj-1');
      assert.equal(JSON.stringify(originalProj?.workingDocument), sourceSnapshot);
    });

    it('fails clone and rejects when project asset is missing in storage', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      const sourceDoc = createInitialState('card');
      sourceDoc.image = {
        src: '/api/assets/missing-asset-404',
        name: 'missing.png',
        type: 'image/png',
        size: 100,
        width: 200,
        height: 200,
      };
      mock.projects.set('proj-missing-asset', {
        id: 'proj-missing-asset',
        ownerUserId: editor.userId,
        productId: 'card',
        variantId: 'horizontal',
        currentWorkingRevision: 1,
        workingDocument: sourceDoc as unknown as Record<string, unknown>,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        eligible: true,
        blockedReason: null,
      });

      await assert.rejects(
        () => createTemplateFromProject(
          editor,
          {
            sourceProjectId: 'proj-missing-asset',
            expectedSourceRevision: 1,
            target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
            name: 'Missing Asset Template',
            rightsAcknowledged: true,
            requestId: 'req-clone-missing',
          },
          { repo: mock.repo },
        ),
        (err: unknown) => {
          assert.ok(err instanceof TemplateServiceError);
          assert.equal(err.code, 'INVALID_INPUT');
          assert.match(err.message, /Failed to copy private project asset/);
          return true;
        },
      );
    });

    it('fails clone and rejects when project asset is corrupt', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      const sourceDoc = createInitialState('card');
      sourceDoc.image = {
        src: '/api/assets/corrupt-asset-1',
        name: 'corrupt.png',
        type: 'image/png',
        size: 5,
        width: 200,
        height: 200,
      };
      // Upload corrupt bytes
      mock.storage.set('customer-assets/proj-corrupt/corrupt-asset-1', new Uint8Array([1, 2, 3, 4, 5]));

      mock.projects.set('proj-corrupt', {
        id: 'proj-corrupt',
        ownerUserId: editor.userId,
        productId: 'card',
        variantId: 'horizontal',
        currentWorkingRevision: 1,
        workingDocument: sourceDoc as unknown as Record<string, unknown>,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        eligible: true,
        blockedReason: null,
      });

      await assert.rejects(
        () => createTemplateFromProject(
          editor,
          {
            sourceProjectId: 'proj-corrupt',
            expectedSourceRevision: 1,
            target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
            name: 'Corrupt Asset Template',
            rightsAcknowledged: true,
            requestId: 'req-clone-corrupt',
          },
          { repo: mock.repo },
        ),
        (err: unknown) => {
          assert.ok(err instanceof TemplateServiceError);
          assert.equal(err.code, 'INVALID_INPUT');
          assert.match(err.message, /Failed to copy private project asset/);
          return true;
        },
      );
    });
  });

  describe('TemplateManagementService integration', () => {
    it('provides unified access to asset and source project operations', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();
      const service = new TemplateManagementService(mock.repo);

      mock.projects.set('p-service', {
        id: 'p-service',
        ownerUserId: editor.userId,
        productId: 'card',
        variantId: 'horizontal',
        currentWorkingRevision: 1,
        workingDocument: createInitialState('card') as unknown as Record<string, unknown>,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        eligible: true,
        blockedReason: null,
      });

      const sources = await service.listEligibleSourceProjects(editor);
      assert.equal(sources.length, 1);
      assert.equal(sources[0].id, 'p-service');
      assert.equal(sources[0].eligible, true);
    });
  });

  describe('HTTP Route Handlers', () => {
    it('POST /api/admin/content/templates/[id]/assets handles image upload', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      await mock.repo.createTemplate(editor.userId, buildCreateRepoInput({ id: 'route-tmpl-1', name: 'Route Template 1' }));

      const pngBytes = await createTestImage('png', 100, 100);
      const req = new Request('http://localhost:3000/api/admin/content/templates/route-tmpl-1/assets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          data: pngBytes.toString('base64'),
          filename: 'uploaded.png',
          mimeType: 'image/png',
        }),
      });

      const deps = {
        requireStaff: async () => editor,
        repo: mock.repo,
      };

      const res = await uploadAssetRoute(req, { params: Promise.resolve({ id: 'route-tmpl-1' }) }, deps);
      assert.equal(res.status, 201);
      const json = (await res.json()) as { ok: boolean; asset: { assetId: string; storageBucket: string } };
      assert.equal(json.ok, true);
      assert.ok(json.asset.assetId);
      assert.equal(json.asset.storageBucket, 'template-drafts');
    });

    it('GET /api/admin/content/templates/[id]/assets/[assetId] serves draft asset to staff', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      await mock.repo.createTemplate(editor.userId, buildCreateRepoInput({ id: 'route-tmpl-2', name: 'Route Template 2' }));

      const pngBytes = await createTestImage('png', 80, 80);
      const uploaded = await uploadTemplateAsset(
        editor,
        { templateId: 'route-tmpl-2', draftId: 'draft-route-tmpl-2' },
        { bytes: pngBytes },
        { repo: mock.repo },
      );

      const deps = {
        requireStaff: async () => editor,
        repo: mock.repo,
      };

      const req = new Request(`http://localhost:3000/api/admin/content/templates/route-tmpl-2/assets/${uploaded.assetId}`);
      const res = await getDraftAssetRoute(req, { params: Promise.resolve({ id: 'route-tmpl-2', assetId: uploaded.assetId }) }, deps);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.equal(res.headers.get('cache-control'), 'private, no-store');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');

      // Test 304 with If-None-Match
      const etag = res.headers.get('etag')!;
      const req304 = new Request(`http://localhost:3000/api/admin/content/templates/route-tmpl-2/assets/${uploaded.assetId}`, {
        headers: { 'if-none-match': etag },
      });
      const res304 = await getDraftAssetRoute(req304, { params: Promise.resolve({ id: 'route-tmpl-2', assetId: uploaded.assetId }) }, deps);
      assert.equal(res304.status, 304);
    });

    it('GET /api/templates/assets/[assetId] serves published version asset publicly with immutable headers', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      await mock.repo.createTemplate(editor.userId, buildCreateRepoInput({ id: 'route-tmpl-pub', name: 'Published Tmpl' }));

      const webpBytes = await createTestImage('webp', 64, 64);
      const uploaded = await uploadTemplateAsset(
        editor,
        { templateId: 'route-tmpl-pub' },
        { bytes: webpBytes },
        { repo: mock.repo },
      );

      // While unpublished: 404
      const reqUnpub = new Request(`http://localhost:3000/api/templates/assets/${uploaded.assetId}`);
      const resUnpub = await getPublishedAssetRoute(reqUnpub, { params: Promise.resolve({ assetId: uploaded.assetId }) }, { repo: mock.repo });
      assert.equal(resUnpub.status, 404);

      // After publishing
      await mock.repo.markAssetPublished(uploaded.assetId);

      const reqPub = new Request(`http://localhost:3000/api/templates/assets/${uploaded.assetId}`);
      const resPub = await getPublishedAssetRoute(reqPub, { params: Promise.resolve({ assetId: uploaded.assetId }) }, { repo: mock.repo });
      assert.equal(resPub.status, 200);
      assert.equal(resPub.headers.get('content-type'), 'image/webp');
      assert.equal(resPub.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal(resPub.headers.get('x-content-type-options'), 'nosniff');

      // Test 304 on published asset
      const etag = resPub.headers.get('etag')!;
      const reqPub304 = new Request(`http://localhost:3000/api/templates/assets/${uploaded.assetId}`, {
        headers: { 'if-none-match': etag },
      });
      const resPub304 = await getPublishedAssetRoute(reqPub304, { params: Promise.resolve({ assetId: uploaded.assetId }) }, { repo: mock.repo });
      assert.equal(resPub304.status, 304);
    });

    it('GET /api/admin/content/templates/sources lists eligible projects for staff', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      mock.projects.set('p-1', {
        id: 'p-1',
        ownerUserId: editor.userId,
        productId: 'card',
        variantId: 'horizontal',
        currentWorkingRevision: 1,
        workingDocument: {} as unknown as Record<string, unknown>,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        eligible: true,
        blockedReason: null,
      });

      const deps = {
        requireStaff: async () => editor,
        repo: mock.repo,
      };

      const req = new Request('http://localhost:3000/api/admin/content/templates/sources');
      const res = await listSourcesRoute(req, undefined, deps);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { items: Array<{ id: string; eligible: boolean }> };
      assert.equal(json.items.length, 1);
      assert.equal(json.items[0].id, 'p-1');
      assert.equal(json.items[0].eligible, true);
    });

    it('POST /api/admin/content/templates/from-project creates template via route', async () => {
      const mock = createMockRepository();
      const editor = createMockEditor();

      mock.projects.set('p-clone', {
        id: 'p-clone',
        ownerUserId: editor.userId,
        productId: 'card',
        variantId: 'horizontal',
        currentWorkingRevision: 2,
        workingDocument: createInitialState('card') as unknown as Record<string, unknown>,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        eligible: true,
        blockedReason: null,
      });

      const deps = {
        requireStaff: async () => editor,
        repo: mock.repo,
      };

      const req = new Request('http://localhost:3000/api/admin/content/templates/from-project', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          sourceProjectId: 'p-clone',
          expectedSourceRevision: 2,
          target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
          name: 'Route Cloned Template',
          rightsAcknowledged: true,
          requestId: 'route-clone-req-1',
        }),
      });

      const res = await fromProjectRoute(req, undefined, deps);
      assert.equal(res.status, 201);
      const json = (await res.json()) as { ok: boolean; template: { name: string } };
      assert.equal(json.ok, true);
      assert.equal(json.template.name, 'Route Cloned Template');
    });
  });

  describe('Integration with asset-store promoteDesignAssets', () => {
    it('ignores template-owned image assets and prevents re-promotion into customer assets', async () => {
      const design = createInitialState('card');
      design.image = {
        src: '/api/templates/assets/55555555-5555-5555-5555-555555555555',
        name: 'template-art.png',
        type: 'image/png',
        size: 2048,
        width: 100,
        height: 100,
      };
      design.elements = [
        {
          id: 'template-el',
          type: 'image',
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          rotation: 0,
          locked: false,
          data: {
            src: 'template-asset://66666666-6666-6666-6666-666666666666',
            templateAssetId: '66666666-6666-6666-6666-666666666666',
          },
        },
      ];

      const result = await promoteDesignAssets(design);
      // None of the template assets should have been promoted as customer blob assets
      assert.equal(result.promotedAssets.length, 0);
      assert.equal(result.rewrittenDesign.image?.src, '/api/templates/assets/55555555-5555-5555-5555-555555555555');
    });
  });

  describe('Template Cleanup Script', () => {
    it('dry run finds eligible candidate but deletes nothing, apply deletes eligible candidate', async () => {
      const deletedKeys: string[] = [];
      const deletedAssetIds: string[] = [];

      const mockClient = {
        from(table: string) {
          if (table === 'template_assets') {
            return {
              select() {
                return {
                  eq() {
                    return Promise.resolve({
                      data: [
                        {
                          id: 'asset-unref-old',
                          template_id: 'tmpl-clean',
                          draft_id: null,
                          storage_bucket: 'template-drafts',
                          storage_path: 'tmpl-clean/asset-unref-old.png',
                          is_published: false,
                          upload_status: 'attached',
                          created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
                        },
                        {
                          id: 'asset-young',
                          template_id: 'tmpl-clean',
                          draft_id: null,
                          storage_bucket: 'template-drafts',
                          storage_path: 'tmpl-clean/asset-young.png',
                          is_published: false,
                          upload_status: 'attached',
                          created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
                        },
                      ],
                      error: null,
                    });
                  },
                };
              },
              delete() {
                return {
                  eq(_col: string, val: string) {
                    deletedAssetIds.push(val);
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          }
          if (table === 'template_drafts') {
            return {
              select() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          }
          if (table === 'template_version_assets') {
            return {
              select() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          }
          return {};
        },
        storage: {
          from() {
            return {
              remove(keys: string[]) {
                deletedKeys.push(...keys);
                return Promise.resolve({ error: null });
              },
            };
          },
        },
        async rpc(fn: string, params: Record<string, unknown>) {
          if (fn === 'template_cleanup_draft_asset') {
            const assetId = String(params.p_asset_id);
            deletedAssetIds.push(assetId);
            return {
              data: {
                success: true,
                storage_path: 'tmpl-clean/asset-unref-old.png',
                storage_bucket: 'template-drafts',
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      } as unknown as SupabaseClient;

      // 1. Dry run
      const dryResult = await runTemplateCleanup({ client: mockClient, apply: false });
      assert.equal(dryResult.found, 2);
      assert.equal(dryResult.eligible, 1); // Only the 48h old unreferenced asset
      assert.equal(dryResult.cleaned, 0);
      assert.equal(deletedKeys.length, 0);
      assert.equal(deletedAssetIds.length, 0);

      // 2. Apply
      const applyResult = await runTemplateCleanup({ client: mockClient, apply: true });
      assert.equal(applyResult.eligible, 1);
      assert.equal(applyResult.cleaned, 1);
      assert.equal(deletedKeys.length, 1);
      assert.equal(deletedKeys[0], 'tmpl-clean/asset-unref-old.png');
      assert.equal(deletedAssetIds.length, 1);
      assert.equal(deletedAssetIds[0], 'asset-unref-old');
    });
  });
});
