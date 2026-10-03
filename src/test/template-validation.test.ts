import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StaffIdentity } from '../lib/domain/order.ts';
import type {
  AttachTemplateAssetInput,
  CreateTemplateRepoInput,
  DependencyMetadataItem,
  TemplateAssetRecord,
  TemplateDraftGuard,
  TemplateDraftRecord,
  TemplateRecord,
  TemplateRepoResult,
  TemplateValidationReceipt,
  TemplateVersionPayload,
} from '../lib/domain/template.ts';
import { createInitialState, createTextElement, type CanvasElement, type DesignState } from '../lib/product-state.ts';
import { createTemplateTarget } from '../lib/template-target.ts';
import { TemplateRepository, type RecordValidationRunInput } from '../lib/repositories/template-repository.ts';
import {
  getTemplateAvailability,
  validateTemplateDraft,
} from '../lib/services/template-validation.ts';
import { resolveTemplateDependencies } from '../lib/services/library-dependencies.ts';
import { POST as validateRoute } from '../app/api/admin/content/templates/[id]/validate/route.ts';

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

function makeTextElementWithFontFace(params: {
  id: string;
  preset: 'heading' | 'body';
  text: string;
  fontFaceId: string;
  fontChecksum?: string;
  surface?: 'front' | 'inside' | 'back';
}): CanvasElement {
  const el = createTextElement({
    id: params.id,
    preset: params.preset,
    text: params.text,
    surface: params.surface,
  });
  el.x = 20;
  el.y = 20;
  el.width = 40;
  el.height = 10;
  el.data = {
    ...el.data,
    fontFaceId: params.fontFaceId,
    fontChecksum: params.fontChecksum,
  };
  return el;
}

function createMockValidationRepository() {
  const templates = new Map<string, TemplateRecord>();
  const drafts = new Map<string, TemplateDraftRecord>();
  const assets = new Map<string, TemplateAssetRecord>();
  const validationRuns = new Map<string, TemplateValidationReceipt>();
  const dependencies = new Map<string, DependencyMetadataItem>();
  const storage = new Map<string, Uint8Array>();

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
        editorUserId: actor,
        leaseSessionId: 'session-1',
        leaseEpoch: 1,
        leaseExpiresAt: '2026-10-04T11:00:00Z',
        lastActivityAt: '2026-10-04T10:00:00Z',
        createdAt: '2026-10-04T10:00:00Z',
        updatedAt: '2026-10-04T10:00:00Z',
        createdBy: actor,
      };
      templates.set(input.id, template);
      drafts.set(input.id, draft);
      return { ok: true, value: { template, draft } };
    },
    async getAsset(assetId: string) {
      return assets.get(assetId) ?? null;
    },
    async attachAsset(actor: string, input: AttachTemplateAssetInput): Promise<TemplateRepoResult<TemplateAssetRecord>> {
      const asset: TemplateAssetRecord = {
        id: `asset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
    async uploadStorageObject(bucket: string, path: string, bytes: Uint8Array): Promise<void> {
      storage.set(`${bucket}/${path}`, bytes);
    },
    async getBatchDependencies(refs: { fontFaces?: string[]; stickers?: string[]; fontFamilies?: string[] }) {
      const result = new Map<string, DependencyMetadataItem>();
      for (const id of refs.fontFaces ?? []) {
        const item = dependencies.get(id) ?? dependencies.get(`font-face:${id}`);
        if (item) {
          result.set(id, item);
          result.set(`font-face:${id}`, item);
        }
      }
      for (const id of refs.stickers ?? []) {
        const item = dependencies.get(id) ?? dependencies.get(`sticker:${id}`);
        if (item) {
          result.set(id, item);
          result.set(`sticker:${id}`, item);
        }
      }
      for (const fam of refs.fontFamilies ?? []) {
        const item = dependencies.get(fam);
        if (item) {
          result.set(fam, item);
        }
      }
      return result;
    },
    async getValidationRun(id: string) {
      return validationRuns.get(id) ?? null;
    },
    async recordValidationRun(actor: string, input: RecordValidationRunInput): Promise<TemplateRepoResult<TemplateValidationReceipt>> {
      const receipt: TemplateValidationReceipt = {
        id: input.id ?? `run-${Date.now()}`,
        templateId: input.templateId,
        draftId: input.draftId,
        sourceRevision: input.sourceRevision,
        sourceDocumentHash: input.sourceDocumentHash,
        candidateDocumentHash: input.candidateDocumentHash,
        targetHash: input.targetHash,
        leaseEpoch: input.leaseEpoch,
        sessionId: input.leaseSessionId,
        findings: input.findings,
        warningIds: input.warningIds,
        customerPreviewPassed: input.customerPreviewPassed,
        engineFingerprint: input.engineFingerprint,
        thumbnail: {
          assetId: input.thumbnailAssetId ?? 'thumb-asset-id',
          sha256: input.thumbnailChecksum ?? '0'.repeat(64),
        },
        expiresAt: input.expiresAt,
      };
      validationRuns.set(receipt.id, receipt);
      return { ok: true, value: receipt };
    },
  } as unknown as TemplateRepository;

  return {
    repo,
    templates,
    drafts,
    assets,
    validationRuns,
    dependencies,
    storage,
  };
}

describe('Template Validation & Availability Pipeline (State 43 Task 11)', () => {
  it('enforces RBAC: non-staff cannot trigger template validation', async () => {
    const mock = createMockValidationRepository();
    const customer = createMockCustomer();
    const guard: TemplateDraftGuard = {
      templateId: 'tmpl-1',
      draftId: 'draft-tmpl-1',
      expectedRevision: 1,
      sessionId: 'session-1',
      leaseEpoch: 1,
    };

    await assert.rejects(
      () => validateTemplateDraft(customer, guard, { repository: mock.repo }),
      (err: unknown) => err instanceof Error && err.message.includes('Chỉ biên tập viên hoặc quản trị viên'),
    );
  });

  it('rejects on lease or revision mismatch (stale validation attempt)', async () => {
    const mock = createMockValidationRepository();
    const editor = createMockEditor();

    await mock.repo.createTemplate(editor.userId, {
      requestId: 'req-1',
      id: 'tmpl-stale',
      name: 'Stale Test',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: createInitialState('card'),
    });

    // 1. Revision mismatch
    await assert.rejects(
      () => validateTemplateDraft(editor, {
        templateId: 'tmpl-stale',
        draftId: 'draft-tmpl-stale',
        expectedRevision: 99,
        sessionId: 'session-1',
        leaseEpoch: 1,
      }, { repository: mock.repo }),
      (err: unknown) => err instanceof Error && err.message.includes('Xung đột phiên bản'),
    );

    // 2. Session mismatch
    await assert.rejects(
      () => validateTemplateDraft(editor, {
        templateId: 'tmpl-stale',
        draftId: 'draft-tmpl-stale',
        expectedRevision: 1,
        sessionId: 'wrong-session',
        leaseEpoch: 1,
      }, { repository: mock.repo }),
      (err: unknown) => err instanceof Error && err.message.includes('Xung đột phiên làm việc'),
    );
  });

  it('rejects invalid product target surfaces', async () => {
    const mock = createMockValidationRepository();
    const editor = createMockEditor();

    await mock.repo.createTemplate(editor.userId, {
      requestId: 'req-target',
      id: 'tmpl-bad-target',
      name: 'Bad Target',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: createInitialState('card'),
    });

    const tmpl = mock.templates.get('tmpl-bad-target')!;
    tmpl.target.surfaces = []; // Corrupt target

    await assert.rejects(
      () => validateTemplateDraft(editor, {
        templateId: 'tmpl-bad-target',
        draftId: 'draft-tmpl-bad-target',
        expectedRevision: 1,
        sessionId: 'session-1',
        leaseEpoch: 1,
      }, { repository: mock.repo }),
      (err: unknown) => err instanceof Error && err.message.includes('INVALID_PRODUCT_TARGET'),
    );
  });

  it('rejects PLACEHOLDER_LOCK_CONFLICT when element is both placeholder and customerLocked', async () => {
    const mock = createMockValidationRepository();
    const editor = createMockEditor();

    const doc: DesignState = {
      ...createInitialState('card'),
      elements: [
        {
          id: 'conflict-el',
          type: 'text',
          x: 20,
          y: 20,
          width: 50,
          height: 10,
          rotation: 0,
          customerLocked: true, // LOCKED
          data: {
            text: 'Tên mẫu',
            placeholder: true, // AND PLACEHOLDER!
            placeholderType: 'text',
          },
        },
      ],
    };

    await mock.repo.createTemplate(editor.userId, {
      requestId: 'req-conflict',
      id: 'tmpl-conflict',
      name: 'Conflict Test',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: doc,
    });

    await assert.rejects(
      () => validateTemplateDraft(editor, {
        templateId: 'tmpl-conflict',
        draftId: 'draft-tmpl-conflict',
        expectedRevision: 1,
        sessionId: 'session-1',
        leaseEpoch: 1,
      }, { repository: mock.repo }),
      (err: unknown) => err instanceof Error && err.message.includes('PLACEHOLDER_LOCK_CONFLICT'),
    );
  });

  it('rejects BROKEN_PLACEHOLDER when element has mismatched placeholder type or invalid dimensions', async () => {
    const mock = createMockValidationRepository();
    const editor = createMockEditor();

    const doc: DesignState = {
      ...createInitialState('card'),
      elements: [
        {
          id: 'broken-el',
          type: 'text',
          x: 20,
          y: 20,
          width: 50,
          height: 10,
          rotation: 0,
          customerLocked: false,
          data: {
            text: 'Broken text',
            placeholder: true,
            placeholderType: 'image', // Text element with image placeholder type!
          },
        },
      ],
    };

    await mock.repo.createTemplate(editor.userId, {
      requestId: 'req-broken',
      id: 'tmpl-broken',
      name: 'Broken Placeholder Test',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: doc,
    });

    await assert.rejects(
      () => validateTemplateDraft(editor, {
        templateId: 'tmpl-broken',
        draftId: 'draft-tmpl-broken',
        expectedRevision: 1,
        sessionId: 'session-1',
        leaseEpoch: 1,
      }, { repository: mock.repo }),
      (err: unknown) => err instanceof Error && err.message.includes('BROKEN_PLACEHOLDER'),
    );
  });

  it('rejects private asset leakage when document references asset belonging to another template', async () => {
    const mock = createMockValidationRepository();
    const editor = createMockEditor();

    // Create another template's asset with standard UUID
    const otherAssetId = '43000000-0000-0000-0000-000000000099';
    const otherAsset: TemplateAssetRecord = {
      id: otherAssetId,
      templateId: 'other-template-id',
      draftId: 'other-draft',
      storageBucket: 'template-drafts',
      storageKey: `template-drafts/other-template-id/${otherAssetId}.png`,
      checksum: 'sha256-secret',
      mimeType: 'image/png',
      byteSize: 1024,
      isPublished: false,
      createdAt: new Date().toISOString(),
    };
    mock.assets.set(otherAssetId, otherAsset);

    const docWithLeakedAsset: DesignState = {
      ...createInitialState('card'),
      elements: [
        {
          id: 'leaked-img',
          type: 'image',
          x: 20,
          y: 20,
          width: 40,
          height: 40,
          rotation: 0,
          customerLocked: false,
          data: {
            assetId: otherAssetId,
            src: `/api/admin/content/templates/other-template-id/assets/${otherAssetId}`,
          },
        },
      ],
    };

    await mock.repo.createTemplate(editor.userId, {
      requestId: 'req-leak',
      id: 'tmpl-leak',
      name: 'Leak Test',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: docWithLeakedAsset,
    });

    await assert.rejects(
      () => validateTemplateDraft(editor, {
        templateId: 'tmpl-leak',
        draftId: 'draft-tmpl-leak',
        expectedRevision: 1,
        sessionId: 'session-1',
        leaseEpoch: 1,
      }, { repository: mock.repo }),
      (err: unknown) => err instanceof Error && err.message.includes('PRIVATE_ASSET_LEAKAGE'),
    );
  });

  it('emits NO_EDITABLE_ELEMENTS warning when all elements in template are customerLocked', async () => {
    const mock = createMockValidationRepository();
    const editor = createMockEditor();

    const allLockedDoc: DesignState = {
      ...createInitialState('card'),
      elements: [
        {
          id: 'locked-title',
          type: 'text',
          x: 20,
          y: 20,
          width: 50,
          height: 10,
          rotation: 0,
          customerLocked: true,
          data: {
            text: 'Locked Header',
            placeholder: false,
          },
        },
      ],
    };

    await mock.repo.createTemplate(editor.userId, {
      requestId: 'req-no-editable',
      id: 'tmpl-all-locked',
      name: 'All Locked Template',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: allLockedDoc,
    });

    const receipt = await validateTemplateDraft(editor, {
      templateId: 'tmpl-all-locked',
      draftId: 'draft-tmpl-all-locked',
      expectedRevision: 1,
      sessionId: 'session-1',
      leaseEpoch: 1,
    }, { repository: mock.repo });

    assert.equal(receipt.customerPreviewPassed, true);
    assert.ok(receipt.warningIds.includes('template-no-editable-elements'));
    const warning = receipt.findings.find((f) => f.code === 'NO_EDITABLE_ELEMENTS');
    assert.ok(warning, 'NO_EDITABLE_ELEMENTS warning must be emitted');
  });

  it('satisfies brief contract: fails missing dependency and validates draft with real Chromium proof', async () => {
    const mock = createMockValidationRepository();
    const actor = createMockEditor();

    // 1. Template with MISSING font face dependency
    const docMissingFace: DesignState = {
      ...createInitialState('card'),
      elements: [
        makeTextElementWithFontFace({
          id: 'txt-missing',
          preset: 'heading',
          text: 'Thiệp mẫu',
          fontFaceId: 'missing-face-uuid',
          fontChecksum: 'abc123',
        }),
      ],
    };

    await mock.repo.createTemplate(actor.userId, {
      requestId: 'req-missing-face',
      id: 'tmpl-missing-face',
      name: 'Missing Face Template',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: docMissingFace,
    });

    const guardWithMissingFace: TemplateDraftGuard = {
      templateId: 'tmpl-missing-face',
      draftId: 'draft-tmpl-missing-face',
      expectedRevision: 1,
      sessionId: 'session-1',
      leaseEpoch: 1,
    };

    // Assertion exactly as in brief:
    await assert.rejects(
      () => validateTemplateDraft(actor, guardWithMissingFace, { repository: mock.repo }),
      (e: unknown) => e instanceof Error && e.message.includes('MISSING_DEPENDENCY'),
    );

    // 2. Now register a valid published font face dependency
    mock.dependencies.set('valid-face-uuid', {
      id: 'valid-face-uuid',
      kind: 'font-face',
      status: 'published',
      checksum: 'valid-checksum-hex',
      familyId: 'fam-vietnam',
      familyName: 'Arial', // Arial is available in Chromium everywhere
      familyStatus: 'published',
    });

    const docValidFace: DesignState = {
      ...createInitialState('card'),
      elements: [
        makeTextElementWithFontFace({
          id: 'txt-valid',
          preset: 'heading',
          text: 'Thiệp Chúc Mừng',
          fontFaceId: 'valid-face-uuid',
          fontChecksum: 'valid-checksum-hex',
        }),
      ],
    };

    await mock.repo.createTemplate(actor.userId, {
      requestId: 'req-valid',
      id: 'tmpl-valid',
      name: 'Valid Template',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: docValidFace,
    });

    const validGuard: TemplateDraftGuard = {
      templateId: 'tmpl-valid',
      draftId: 'draft-tmpl-valid',
      expectedRevision: 1,
      sessionId: 'session-1',
      leaseEpoch: 1,
    };

    const receipt = await validateTemplateDraft(actor, validGuard, { repository: mock.repo });
    assert.equal(receipt.sourceRevision, validGuard.expectedRevision);
    assert.equal(receipt.customerPreviewPassed, true);
    assert.match(receipt.engineFingerprint, /chromium-/);
    assert.match(receipt.thumbnail.sha256, /^[a-f0-9]{64}$/);
  });

  it('rejects UNPUBLISHED_DEPENDENCY and ARCHIVED_DEPENDENCY (and archived font family)', async () => {
    const mock = createMockValidationRepository();
    const actor = createMockEditor();

    // Draft face
    mock.dependencies.set('draft-face', {
      id: 'draft-face',
      kind: 'font-face',
      status: 'draft',
      familyStatus: 'published',
    });

    // Archived face
    mock.dependencies.set('archived-face', {
      id: 'archived-face',
      kind: 'font-face',
      status: 'archived',
      familyStatus: 'published',
    });

    // Published face whose family is archived
    mock.dependencies.set('face-with-archived-family', {
      id: 'face-with-archived-family',
      kind: 'font-face',
      status: 'published',
      familyStatus: 'archived',
    });

    // Check draft face rejection
    const docDraft: DesignState = {
      ...createInitialState('card'),
      elements: [
        makeTextElementWithFontFace({
          id: 'txt-1',
          preset: 'heading',
          text: 'Draft Face Text',
          fontFaceId: 'draft-face',
        }),
      ],
    };
    await mock.repo.createTemplate(actor.userId, {
      requestId: 'req-draft-dep',
      id: 'tmpl-draft-dep',
      name: 'Draft Dep',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: docDraft,
    });
    await assert.rejects(
      () => validateTemplateDraft(actor, {
        templateId: 'tmpl-draft-dep',
        draftId: 'draft-tmpl-draft-dep',
        expectedRevision: 1,
        sessionId: 'session-1',
        leaseEpoch: 1,
      }, { repository: mock.repo }),
      (e: unknown) => e instanceof Error && e.message.includes('UNPUBLISHED_DEPENDENCY'),
    );

    // Check archived face rejection
    const docArchived: DesignState = {
      ...createInitialState('card'),
      elements: [
        makeTextElementWithFontFace({
          id: 'txt-2',
          preset: 'heading',
          text: 'Archived Face Text',
          fontFaceId: 'archived-face',
        }),
      ],
    };
    await mock.repo.createTemplate(actor.userId, {
      requestId: 'req-archived-dep',
      id: 'tmpl-archived-dep',
      name: 'Archived Dep',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: docArchived,
    });
    await assert.rejects(
      () => validateTemplateDraft(actor, {
        templateId: 'tmpl-archived-dep',
        draftId: 'draft-tmpl-archived-dep',
        expectedRevision: 1,
        sessionId: 'session-1',
        leaseEpoch: 1,
      }, { repository: mock.repo }),
      (e: unknown) => e instanceof Error && e.message.includes('ARCHIVED_DEPENDENCY'),
    );

    // Check face with archived family rejection
    const docArchivedFam: DesignState = {
      ...createInitialState('card'),
      elements: [
        makeTextElementWithFontFace({
          id: 'txt-3',
          preset: 'heading',
          text: 'Archived Family Text',
          fontFaceId: 'face-with-archived-family',
        }),
      ],
    };
    await mock.repo.createTemplate(actor.userId, {
      requestId: 'req-archived-fam',
      id: 'tmpl-archived-fam',
      name: 'Archived Fam',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: docArchivedFam,
    });
    await assert.rejects(
      () => validateTemplateDraft(actor, {
        templateId: 'tmpl-archived-fam',
        draftId: 'draft-tmpl-archived-fam',
        expectedRevision: 1,
        sessionId: 'session-1',
        leaseEpoch: 1,
      }, { repository: mock.repo }),
      (e: unknown) => e instanceof Error && e.message.includes('ARCHIVED_DEPENDENCY'),
    );
  });

  it('assigns stable distinct warning IDs when multiple elements have warnings with the same code', async () => {
    const mock = createMockValidationRepository();
    const actor = createMockEditor();

    const docMultiplePlaceholders: DesignState = {
      ...createInitialState('card'),
      elements: [
        {
          id: 'text-ph-1',
          type: 'text',
          x: 20,
          y: 20,
          width: 40,
          height: 10,
          rotation: 0,
          customerLocked: false,
          data: { text: 'Tên 1', placeholder: true, placeholderType: 'text' },
        },
        {
          id: 'text-ph-2',
          type: 'text',
          x: 20,
          y: 40,
          width: 40,
          height: 10,
          rotation: 0,
          customerLocked: false,
          data: { text: 'Tên 2', placeholder: true, placeholderType: 'text' },
        },
      ],
    };

    await mock.repo.createTemplate(actor.userId, {
      requestId: 'req-multi-warn',
      id: 'tmpl-multi-warn',
      name: 'Multi Warning Template',
      productId: 'card',
      variantId: 'horizontal',
      productMode: null,
      fixedStickerShape: null,
      targetSnapshot: {},
      initialDocument: docMultiplePlaceholders,
    });

    const receipt = await validateTemplateDraft(actor, {
      templateId: 'tmpl-multi-warn',
      draftId: 'draft-tmpl-multi-warn',
      expectedRevision: 1,
      sessionId: 'session-1',
      leaseEpoch: 1,
    }, { repository: mock.repo });

    assert.equal(receipt.customerPreviewPassed, true);
    // Ensure warning IDs are distinct and stable
    const warningIds = receipt.warningIds;
    assert.equal(new Set(warningIds).size, warningIds.length, 'Warning IDs must be unique');
  });

  describe('Central getTemplateAvailability & SQL Parity', () => {
    it('returns TEMPLATE_ARCHIVED when template is archived', () => {
      const template: TemplateRecord = {
        id: 't-archived',
        name: 'Archived',
        status: 'archived',
        archivedAt: '2026-10-04T10:00:00Z',
        revision: 1,
        productId: 'card',
        variantId: 'horizontal',
        mode: null,
        shape: null,
        target: createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null }),
        categoryId: '',
        tags: [],
        sortOrder: 0,
        currentPublishedVersionId: 'v-1',
        everPublishedAt: '2026-10-01T10:00:00Z',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-04T10:00:00Z',
      };

      const availability = getTemplateAvailability(template, null);
      assert.equal(availability.available, false);
      assert.ok(availability.blockers.some((b) => b.code === 'TEMPLATE_ARCHIVED'));
    });

    it('returns NO_PUBLISHED_VERSION when template has no published version', () => {
      const template: TemplateRecord = {
        id: 't-draft-only',
        name: 'Draft Only',
        status: 'draft',
        archivedAt: null,
        revision: 1,
        productId: 'card',
        variantId: 'horizontal',
        mode: null,
        shape: null,
        target: createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null }),
        categoryId: '',
        tags: [],
        sortOrder: 0,
        currentPublishedVersionId: null,
        everPublishedAt: null,
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      };

      const availability = getTemplateAvailability(template, null);
      assert.equal(availability.available, false);
      assert.ok(availability.blockers.some((b) => b.code === 'NO_PUBLISHED_VERSION'));
    });

    it('returns VERSION_INVALID when asset manifest is unhealthy', () => {
      const target = createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null });
      const template: TemplateRecord = {
        id: 't-manifest-broken',
        name: 'Broken Manifest',
        status: 'published',
        archivedAt: null,
        revision: 1,
        productId: 'card',
        variantId: 'horizontal',
        mode: null,
        shape: null,
        target,
        categoryId: '',
        tags: [],
        sortOrder: 0,
        currentPublishedVersionId: 'v-1',
        everPublishedAt: '2026-10-01T10:00:00Z',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      };

      const version: TemplateVersionPayload = {
        versionId: 'v-1',
        templateId: 't-manifest-broken',
        version: 1,
        documentSchemaVersion: 1,
        document: createInitialState('card'),
        target,
        dependencies: [],
      };

      const availability = getTemplateAvailability(template, version, { assetManifestHealthy: false });
      assert.equal(availability.available, false);
      assert.ok(availability.blockers.some((b) => b.code === 'VERSION_INVALID'));
    });

    it('archiving dependency after validation blocks availability without mutating Version', () => {
      const target = createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null });
      const template: TemplateRecord = {
        id: 't-dep-archive',
        name: 'Dependency Lifecycle',
        status: 'published',
        archivedAt: null,
        revision: 1,
        productId: 'card',
        variantId: 'horizontal',
        mode: null,
        shape: null,
        target,
        categoryId: '',
        tags: [],
        sortOrder: 0,
        currentPublishedVersionId: 'v-1',
        everPublishedAt: '2026-10-01T10:00:00Z',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      };

      const version: TemplateVersionPayload = {
        versionId: 'v-1',
        templateId: 't-dep-archive',
        version: 1,
        documentSchemaVersion: 1,
        document: createInitialState('card'),
        target,
        dependencies: [
          { kind: 'font-face', id: 'face-123', checksum: 'hex123' },
        ],
      };

      // 1. When face is published -> template available
      const publishedLookup = new Map<string, DependencyMetadataItem>([
        ['face-123', { id: 'face-123', kind: 'font-face', status: 'published', checksum: 'hex123' }],
      ]);
      const beforeArchive = getTemplateAvailability(template, version, { lookup: publishedLookup });
      assert.equal(beforeArchive.available, true);
      assert.equal(beforeArchive.blockers.length, 0);

      // 2. Later, dependency is archived -> template availability is now blocked without mutating Version
      const archivedLookup = new Map<string, DependencyMetadataItem>([
        ['face-123', { id: 'face-123', kind: 'font-face', status: 'archived', checksum: 'hex123' }],
      ]);
      const afterArchive = getTemplateAvailability(template, version, { lookup: archivedLookup });
      assert.equal(afterArchive.available, false);
      const archivedBlocker = afterArchive.blockers.find((b) => b.code === 'ARCHIVED_DEPENDENCY');
      assert.ok(archivedBlocker);
      assert.equal(archivedBlocker.id, 'face-123');

      // 3. Version payload remains completely immutable
      assert.equal(version.versionId, 'v-1');
      assert.equal(version.dependencies[0].id, 'face-123');
    });
  });

  describe('resolveTemplateDependencies contract', () => {
    it('distinguishes new-use vs historical: historical permits archived dependencies', () => {
      const doc: DesignState = {
        ...createInitialState('card'),
        elements: [
          makeTextElementWithFontFace({
            id: 'txt-hist',
            preset: 'body',
            text: 'Historical Design Text',
            fontFaceId: 'old-face-uuid',
          }),
        ],
      };

      const lookup = new Map<string, DependencyMetadataItem>([
        ['old-face-uuid', { id: 'old-face-uuid', kind: 'font-face', status: 'archived' }],
      ]);

      // 1. new-use: archived dependency BLOCKS
      const newUseResult = resolveTemplateDependencies(doc, { purpose: 'new-use', lookup });
      assert.equal(newUseResult.valid, false);
      assert.ok(newUseResult.blockers.some((b) => b.code === 'ARCHIVED_DEPENDENCY'));

      // 2. historical: archived dependency is ALLOWED
      const histResult = resolveTemplateDependencies(doc, { purpose: 'historical', lookup });
      assert.equal(histResult.valid, true);
      assert.equal(histResult.blockers.length, 0);
    });
  });

  describe('API Route POST /api/admin/content/templates/[id]/validate', () => {
    it('validates draft and returns receipt', async () => {
      const mock = createMockValidationRepository();
      const editor = createMockEditor();

      await mock.repo.createTemplate(editor.userId, {
        requestId: 'req-route-val',
        id: 'tmpl-route-val',
        name: 'Route Validation Tmpl',
        productId: 'card',
        variantId: 'horizontal',
        productMode: null,
        fixedStickerShape: null,
        targetSnapshot: {},
        initialDocument: createInitialState('card'),
      });

      const request = new Request('http://localhost:3000/api/admin/content/templates/tmpl-route-val/validate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: JSON.stringify({
          draftId: 'draft-tmpl-route-val',
          expectedRevision: 1,
          sessionId: 'session-1',
          leaseEpoch: 1,
        }),
      });

      const response = await validateRoute(
        request,
        { params: Promise.resolve({ id: 'tmpl-route-val' }) },
        {
          requireStaff: async () => editor,
          repo: mock.repo,
        },
      );

      assert.equal(response.status, 200);
      const json = await response.json();
      assert.equal(json.ok, true);
      assert.ok(json.receipt);
      assert.equal(json.receipt.customerPreviewPassed, true);
      assert.match(json.receipt.engineFingerprint, /chromium-/);
      assert.match(json.receipt.thumbnail.sha256, /^[a-f0-9]{64}$/);
    });

    it('rejects with 400 when required fields are missing', async () => {
      const mock = createMockValidationRepository();
      const editor = createMockEditor();

      const request = new Request('http://localhost:3000/api/admin/content/templates/tmpl-1/validate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: JSON.stringify({
          // missing draftId, expectedRevision, sessionId
        }),
      });

      const response = await validateRoute(
        request,
        { params: Promise.resolve({ id: 'tmpl-1' }) },
        {
          requireStaff: async () => editor,
          repo: mock.repo,
        },
      );

      assert.equal(response.status, 400);
    });
  });
});
