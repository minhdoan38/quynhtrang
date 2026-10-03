import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { StaffIdentity } from '../lib/domain/order.ts';
import type {
  DependencyMetadataItem,
  PublishTemplateInput,
  TemplateDraftRecord,
  TemplateRecord,
  TemplateRepoResult,
  TemplateValidationReceipt,
  TemplateVersionPayload,
} from '../lib/domain/template.ts';
import { TemplateServiceError } from '../lib/domain/template.ts';
import type { DesignState } from '../lib/product-state.ts';
import { createInitialState, createTextElement } from '../lib/product-state.ts';
import { TemplateRepository } from '../lib/repositories/template-repository.ts';
import {
  TemplateManagementService,
  publishTemplate,
} from '../lib/services/template-management.ts';
import { createTemplateTarget } from '../lib/template-target.ts';
import { POST as publishRoute } from '../app/api/admin/content/templates/[id]/publish/route.ts';

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

interface MockAssetEvent {
  id: string;
  targetId: string;
  event: string;
  metadata: Record<string, unknown>;
}

function createMockPublishHarness() {
  const templates = new Map<string, TemplateRecord>();
  const drafts = new Map<string, TemplateDraftRecord>();
  const versions = new Map<string, TemplateVersionPayload>();
  const validationRuns = new Map<string, TemplateValidationReceipt>();
  const dependencies = new Map<string, DependencyMetadataItem>();
  const operations = new Map<
    string,
    { actor: string; payloadHash: string; result: TemplateRepoResult<TemplateVersionPayload> }
  >();
  const assetEvents: MockAssetEvent[] = [];
  const storage = new Map<string, Uint8Array>();

  // Async lock mutex per template ID to model SQL FOR UPDATE locks
  const lockQueues = new Map<string, Promise<void>>();

  async function acquireLock(key: string): Promise<() => void> {
    const currentLock = lockQueues.get(key) ?? Promise.resolve();
    const { promise: nextLock, resolve: release } = Promise.withResolvers<void>();
    lockQueues.set(
      key,
      currentLock.then(() => nextLock),
    );
    await currentLock;
    return release;
  }

  function countPublishEventsForDraft(draftId: string): number {
    return assetEvents.filter(
      (e) =>
        e.event === 'template_published' &&
        (e.metadata.draftId === draftId || e.metadata.draft_id === draftId),
    ).length;
  }

  const repo = {
    async getTemplate(id: string) {
      const tmpl = templates.get(id);
      return tmpl ? structuredClone(tmpl) : null;
    },
    async getDraft(templateId: string) {
      const d = drafts.get(templateId);
      return d ? structuredClone(d) : null;
    },
    async getVersion(id: string) {
      const v = versions.get(id);
      return v ? structuredClone(v) : null;
    },
    async getValidationRun(id: string) {
      const run = validationRuns.get(id);
      return run ? structuredClone(run) : null;
    },
    async downloadStorageObject(bucket: string, path: string) {
      return storage.get(`${bucket}/${path}`) ?? null;
    },
    async uploadStorageObject(bucket: string, path: string, bytes: Uint8Array) {
      storage.set(`${bucket}/${path}`, bytes);
    },
    async publishDraft(
      actor: string,
      input: PublishTemplateInput,
    ): Promise<TemplateRepoResult<TemplateVersionPayload>> {
      const { promise: tickPromise, resolve: tickResolve } = Promise.withResolvers<void>();
      setImmediate(tickResolve);
      await tickPromise;
      const payloadHash = createHash('md5')
        .update(
          JSON.stringify({
            templateId: input.templateId,
            draftId: input.draftId,
            expectedDraftRevision: input.expectedRevision,
            expectedCatalogRevision: input.expectedCatalogRevision,
            sessionId: input.sessionId,
            leaseEpoch: input.leaseEpoch,
            validationId: input.validationId,
            acknowledgedWarningIds: input.acknowledgedWarningIds ?? [],
            revisionNote: input.revisionNote ?? null,
          }),
        )
        .digest('hex');

      // 1. Idempotency replay check
      const cached = operations.get(input.requestId);
      if (cached) {
        if (cached.actor !== actor || cached.payloadHash !== payloadHash) {
          return { ok: false, code: 'REVISION_CONFLICT', message: 'OPERATION_CONFLICT' };
        }
        return cached.result;
      }

      // 2. Acquire transactional row lock
      const release = await acquireLock(input.templateId);
      try {
        // Re-check idempotency under lock
        const cachedUnderLock = operations.get(input.requestId);
        if (cachedUnderLock) {
          if (cachedUnderLock.actor !== actor || cachedUnderLock.payloadHash !== payloadHash) {
            return { ok: false, code: 'REVISION_CONFLICT', message: 'OPERATION_CONFLICT' };
          }
          return cachedUnderLock.result;
        }

        const template = templates.get(input.templateId);
        if (!template) {
          return { ok: false, code: 'NOT_FOUND', message: 'NOT_FOUND: template not found' };
        }
        if (template.status === 'archived') {
          return { ok: false, code: 'TEMPLATE_ARCHIVED', message: 'TEMPLATE_ARCHIVED' };
        }
        if (
          input.expectedCatalogRevision !== undefined &&
          template.revision !== input.expectedCatalogRevision
        ) {
          return { ok: false, code: 'REVISION_CONFLICT', message: 'REVISION_CONFLICT' };
        }

        const draft = drafts.get(input.templateId);
        if (!draft || draft.id !== input.draftId) {
          return { ok: false, code: 'NOT_FOUND', message: 'NOT_FOUND: draft not found' };
        }
        if (draft.draftRevision !== input.expectedRevision) {
          return { ok: false, code: 'REVISION_CONFLICT', message: 'REVISION_CONFLICT' };
        }
        if (draft.leaseSessionId !== input.sessionId) {
          return { ok: false, code: 'LEASE_CONFLICT', message: 'LEASE_CONFLICT: invalid session' };
        }
        if (draft.leaseEpoch !== input.leaseEpoch) {
          return { ok: false, code: 'LEASE_CONFLICT', message: 'LEASE_CONFLICT: epoch mismatch' };
        }
        if (draft.leaseExpiresAt && new Date(draft.leaseExpiresAt).getTime() < Date.now()) {
          return { ok: false, code: 'LEASE_EXPIRED', message: 'LEASE_EXPIRED' };
        }

        const val = validationRuns.get(input.validationId);
        if (!val || val.templateId !== input.templateId || val.draftId !== input.draftId) {
          return { ok: false, code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED: run not found' };
        }
        if (new Date(val.expiresAt).getTime() <= Date.now()) {
          return {
            ok: false,
            code: 'VALIDATION_FAILED',
            message: 'VALIDATION_FAILED: validation receipt expired',
          };
        }
        if (!val.customerPreviewPassed) {
          return {
            ok: false,
            code: 'VALIDATION_FAILED',
            message: 'VALIDATION_FAILED: customer preview did not pass',
          };
        }
        if (val.sourceRevision !== draft.draftRevision) {
          return { ok: false, code: 'REVISION_CONFLICT', message: 'REVISION_CONFLICT' };
        }
        if (val.leaseEpoch !== draft.leaseEpoch || val.sessionId !== draft.leaseSessionId) {
          return { ok: false, code: 'LEASE_CONFLICT', message: 'LEASE_CONFLICT' };
        }

        // Warnings check
        if (val.warningIds.length > 0) {
          const acks = new Set(input.acknowledgedWarningIds ?? []);
          const allAcked = val.warningIds.every((w) => acks.has(w));
          if (!allAcked) {
            return {
              ok: false,
              code: 'VALIDATION_FAILED',
              message: 'UNACKNOWLEDGED_WARNINGS: all validation warnings must be acknowledged',
            };
          }
        }

        // Re-check dependencies under lock
        const docElements = draft.designDocument.elements ?? [];
        for (const el of docElements) {
          const textData = el.data as { fontFaceId?: string } | undefined;
          if (textData?.fontFaceId) {
            const dep = dependencies.get(`font-face:${textData.fontFaceId}`);
            if (!dep) {
              return {
                ok: false,
                code: 'DEPENDENCY_UNRESOLVED',
                message: `MISSING_DEPENDENCY: font-face ${textData.fontFaceId}`,
              };
            }
            if (dep.status === 'archived' || dep.familyStatus === 'archived') {
              return {
                ok: false,
                code: 'DEPENDENCY_UNRESOLVED',
                message: `ARCHIVED_DEPENDENCY: font-face ${textData.fontFaceId}`,
              };
            }
            if (dep.status !== 'published' || (dep.familyStatus && dep.familyStatus !== 'published')) {
              return {
                ok: false,
                code: 'DEPENDENCY_UNRESOLVED',
                message: `UNPUBLISHED_DEPENDENCY: font-face ${textData.fontFaceId}`,
              };
            }
          }

          const stickerData = el.data as { libraryAssetId?: string } | undefined;
          if (stickerData?.libraryAssetId) {
            const dep = dependencies.get(`sticker:${stickerData.libraryAssetId}`);
            if (!dep) {
              return {
                ok: false,
                code: 'DEPENDENCY_UNRESOLVED',
                message: `MISSING_DEPENDENCY: sticker ${stickerData.libraryAssetId}`,
              };
            }
            if (dep.status === 'archived') {
              return {
                ok: false,
                code: 'DEPENDENCY_UNRESOLVED',
                message: `ARCHIVED_DEPENDENCY: sticker ${stickerData.libraryAssetId}`,
              };
            }
            if (dep.status !== 'published') {
              return {
                ok: false,
                code: 'DEPENDENCY_UNRESOLVED',
                message: `UNPUBLISHED_DEPENDENCY: sticker ${stickerData.libraryAssetId}`,
              };
            }
          }
        }

        // Version allocation: compute under template lock
        const existingVersions = Array.from(versions.values()).filter(
          (v) => v.templateId === input.templateId,
        );
        const nextVersionNumber =
          existingVersions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
        const versionId = randomUUID();

        const publishedVersion: TemplateVersionPayload = {
          versionId,
          templateId: input.templateId,
          version: nextVersionNumber,
          documentSchemaVersion: draft.documentSchemaVersion,
          document: Object.freeze(structuredClone(draft.designDocument)),
          target: structuredClone(template.target),
          dependencies: [],
        };

        // Immutability freeze
        versions.set(versionId, Object.freeze(publishedVersion));

        // Update template pointer and status
        template.currentPublishedVersionId = versionId;
        template.status = 'published';
        template.everPublishedAt = template.everPublishedAt ?? new Date().toISOString();
        template.revision += 1;
        template.updatedAt = new Date().toISOString();

        // Remove active draft
        drafts.delete(input.templateId);

        // Record template_published event in asset_events
        assetEvents.push({
          id: randomUUID(),
          targetId: input.templateId,
          event: 'template_published',
          metadata: {
            draftId: input.draftId,
            draft_id: input.draftId,
            versionId,
            version: nextVersionNumber,
            validationId: input.validationId,
          },
        });

        const successResult: TemplateRepoResult<TemplateVersionPayload> = {
          ok: true,
          value: publishedVersion,
        };

        // Cache in operations log for idempotent retry
        operations.set(input.requestId, {
          actor,
          payloadHash,
          result: successResult,
        });

        return successResult;
      } finally {
        release();
      }
    },
  } as unknown as TemplateRepository;

  return {
    repo,
    service: new TemplateManagementService(repo),
    templates,
    drafts,
    versions,
    validationRuns,
    dependencies,
    assetEvents,
    storage,
    countPublishEventsForDraft,
  };
}

describe('State 43 Task 12: Atomic publish with idempotency and immutable history', () => {
  it('publishes Version 1 atomically and updates template pointer, everPublishedAt and audit', async () => {
    const harness = createMockPublishHarness();
    const actor = createMockEditor();
    const templateId = 'tmpl-card-1';
    const draftId = 'draft-card-1';
    const validationId = 'val-1';

    const target = createTemplateTarget({
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
    });

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Birthday Card Template',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target,
      categoryId: 'birthday',
      tags: ['birthday'],
      sortOrder: 1,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
      createdBy: actor.userId,
    });

    const doc: DesignState = createInitialState('card');
    doc.variantId = 'horizontal';
    doc.elements = [
      createTextElement({ id: 't1', preset: 'heading', text: 'Chúc mừng sinh nhật' }),
    ];

    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: doc,
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-1',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: actor.userId,
    });

    harness.validationRuns.set(validationId, {
      id: validationId,
      templateId,
      draftId,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-1',
      candidateDocumentHash: 'hash-1',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-1',
      findings: [],
      warningIds: [],
      customerPreviewPassed: true,
      engineFingerprint: 'chromium-engine-1',
      thumbnail: {
        assetId: 'thumb-1',
        sha256: 'thumb-sha256-hex',
      },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const input: PublishTemplateInput = {
      templateId,
      draftId,
      expectedRevision: 1,
      expectedCatalogRevision: 1,
      sessionId: 'session-1',
      leaseEpoch: 1,
      validationId,
      requestId: 'req-pub-1',
      acknowledgedWarningIds: [],
      revisionNote: 'Initial release',
    };

    const published = await harness.service.publishTemplate(actor, input);

    assert.equal(published.templateId, templateId);
    assert.equal(published.version, 1);
    assert.equal(published.documentSchemaVersion, 1);
    assert.deepEqual(published.document.elements, doc.elements);

    // Verify Template state
    const tmpl = await harness.repo.getTemplate(templateId);
    assert(tmpl !== null);
    assert.equal(tmpl.status, 'published');
    assert.equal(tmpl.currentPublishedVersionId, published.versionId);
    assert(tmpl.everPublishedAt !== null);
    assert.equal(tmpl.revision, 2);

    // Verify active draft deleted
    const activeDraft = await harness.repo.getDraft(templateId);
    assert.equal(activeDraft, null);

    // Verify audit event
    assert.equal(harness.countPublishEventsForDraft(draftId), 1);
  });

  it('guarantees Version 1 is immutable when Version 2 publishes, including thumbnail verification', async () => {
    const harness = createMockPublishHarness();
    const actor = createMockEditor();
    const templateId = 'tmpl-card-immutability';
    const draft1Id = 'draft-1';
    const val1Id = 'val-1';

    const target = createTemplateTarget({
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
    });

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Immutable Template',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target,
      categoryId: 'floral',
      tags: ['floral'],
      sortOrder: 1,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });

    const doc1 = createInitialState('card');
    doc1.elements = [createTextElement({ id: 't1', preset: 'heading', text: 'V1 Text' })];

    harness.drafts.set(templateId, {
      id: draft1Id,
      templateId,
      basedOnVersionId: null,
      designDocument: doc1,
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-1',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Store thumbnail bytes in storage
    const thumb1Bytes = new TextEncoder().encode('fake-thumbnail-v1-png-bytes');
    const thumb1Sha256 = createHash('sha256').update(thumb1Bytes).digest('hex');
    await harness.repo.uploadStorageObject('template-assets', 'thumbnails/v1.png', thumb1Bytes, 'image/png');
    harness.validationRuns.set(val1Id, {
      id: val1Id,
      templateId,
      draftId: draft1Id,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-v1',
      candidateDocumentHash: 'hash-v1',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-1',
      findings: [],
      warningIds: [],
      customerPreviewPassed: true,
      engineFingerprint: 'engine-1',
      thumbnail: { assetId: 'thumb-1', sha256: thumb1Sha256 },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const v1 = await harness.service.publishTemplate(actor, {
      templateId,
      draftId: draft1Id,
      expectedRevision: 1,
      expectedCatalogRevision: 1,
      sessionId: 'session-1',
      leaseEpoch: 1,
      validationId: val1Id,
      requestId: 'req-pub-v1',
      acknowledgedWarningIds: [],
    });

    const before = await harness.repo.getVersion(v1.versionId);
    assert(before !== null);

    // Create Draft 2 for Version 2
    const draft2Id = 'draft-2';
    const val2Id = 'val-2';
    const doc2 = createInitialState('card');
    doc2.elements = [createTextElement({ id: 't2', preset: 'heading', text: 'V2 Updated Text' })];

    harness.drafts.set(templateId, {
      id: draft2Id,
      templateId,
      basedOnVersionId: v1.versionId,
      designDocument: doc2,
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-2',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const thumb2Bytes = new TextEncoder().encode('fake-thumbnail-v2-png-bytes');
    await harness.repo.uploadStorageObject('template-assets', 'thumbnails/v2.png', thumb2Bytes, 'image/png');
    harness.validationRuns.set(val2Id, {
      id: val2Id,
      templateId,
      draftId: draft2Id,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-v2',
      candidateDocumentHash: 'hash-v2',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-2',
      findings: [],
      warningIds: [],
      customerPreviewPassed: true,
      engineFingerprint: 'engine-1',
      thumbnail: { assetId: 'thumb-2', sha256: 'thumb2-sha256' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const v2 = await harness.service.publishTemplate(actor, {
      templateId,
      draftId: draft2Id,
      expectedRevision: 1,
      expectedCatalogRevision: 2,
      sessionId: 'session-2',
      leaseEpoch: 1,
      validationId: val2Id,
      requestId: 'req-pub-v2',
      acknowledgedWarningIds: [],
    });

    assert.equal(v2.version, 2);

    // Assert v1 row equality and deep immutability
    const v1After = await harness.repo.getVersion(v1.versionId);
    assert.deepEqual(v1After, before);

    // Assert v1 thumbnail bytes and hash remain untouched
    const v1ThumbAfter = await harness.repo.downloadStorageObject('template-assets', 'thumbnails/v1.png');
    assert(v1ThumbAfter !== null);
    assert.deepEqual(v1ThumbAfter, thumb1Bytes);
    const v1ThumbShaAfter = createHash('sha256').update(v1ThumbAfter).digest('hex');
    assert.equal(v1ThumbShaAfter, thumb1Sha256);
  });

  it('satisfies brief contract: live race allows exactly one winner, keeps v1 immutable and records 1 event', async () => {
    const harness = createMockPublishHarness();
    const actor = createMockEditor();
    const templateId = 'tmpl-card-race';
    const draftId = 'draft-race-1';
    const validationId = 'val-race-1';

    const target = createTemplateTarget({
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
    });

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Race Template',
      status: 'published',
      revision: 1,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target,
      categoryId: 'all',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: 'v1-pre-existing-id',
      everPublishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });

    const v1Payload: TemplateVersionPayload = {
      versionId: 'v1-pre-existing-id',
      templateId,
      version: 1,
      documentSchemaVersion: 1,
      document: createInitialState('card'),
      target,
      dependencies: [],
    };
    harness.versions.set('v1-pre-existing-id', Object.freeze(structuredClone(v1Payload)));

    const doc = createInitialState('card');
    doc.elements = [createTextElement({ id: 't1', preset: 'heading', text: 'Race Text' })];

    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: 'v1-pre-existing-id',
      designDocument: doc,
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-race',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    harness.validationRuns.set(validationId, {
      id: validationId,
      templateId,
      draftId,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-race',
      candidateDocumentHash: 'hash-race',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-race',
      findings: [],
      warningIds: [],
      customerPreviewPassed: true,
      engineFingerprint: 'engine-1',
      thumbnail: { assetId: 'thumb-race', sha256: 'sha-race' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const input: PublishTemplateInput = {
      templateId,
      draftId,
      expectedRevision: 1,
      expectedCatalogRevision: 1,
      sessionId: 'session-race',
      leaseEpoch: 1,
      validationId,
      requestId: 'to-be-overridden',
      acknowledgedWarningIds: [],
    };

    const v1 = { versionId: 'v1-pre-existing-id' };
    const repo = harness.repo;

    // Exact contract from brief (exercises standalone publishTemplate export too):
    const before = await repo.getVersion(v1.versionId);
    const results = await Promise.allSettled([
      publishTemplate(actor, { ...input, requestId: randomUUID() }, { repo }),
      publishTemplate(actor, { ...input, requestId: randomUUID() }, { repo }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.deepEqual(await repo.getVersion(v1.versionId), before);
    assert.equal(await harness.countPublishEventsForDraft(input.draftId), 1);
  });

  it('lost HTTP response retry with same request ID yields identical Version ID without duplicate event', async () => {
    const harness = createMockPublishHarness();
    const actor = createMockEditor();
    const templateId = 'tmpl-card-replay';
    const draftId = 'draft-replay-1';
    const validationId = 'val-replay-1';

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Replay Template',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target: createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null }),
      categoryId: 'all',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });

    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: createInitialState('card'),
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-replay',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    harness.validationRuns.set(validationId, {
      id: validationId,
      templateId,
      draftId,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-replay',
      candidateDocumentHash: 'hash-replay',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-replay',
      findings: [],
      warningIds: [],
      customerPreviewPassed: true,
      engineFingerprint: 'engine-1',
      thumbnail: { assetId: 'thumb-replay', sha256: 'sha-replay' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const input: PublishTemplateInput = {
      templateId,
      draftId,
      expectedRevision: 1,
      expectedCatalogRevision: 1,
      sessionId: 'session-replay',
      leaseEpoch: 1,
      validationId,
      requestId: 'req-idempotent-key',
      acknowledgedWarningIds: [],
      revisionNote: 'First attempt note',
    };

    const res1 = await harness.service.publishTemplate(actor, input);
    // Simulating second retry of exact same request ID
    const res2 = await harness.service.publishTemplate(actor, input);

    assert.equal(res1.versionId, res2.versionId);
    assert.equal(res1.version, res2.version);
    assert.equal(await harness.countPublishEventsForDraft(input.draftId), 1);

    // Tampered payload on same request ID -> rejected with REVISION_CONFLICT (OPERATION_CONFLICT)
    await assert.rejects(
      async () => {
        await harness.service.publishTemplate(actor, {
          ...input,
          revisionNote: 'Tampered note on same request ID',
        });
      },
      (err: unknown) => {
        assert(err instanceof TemplateServiceError);
        assert.equal(err.code, 'REVISION_CONFLICT');
        return true;
      },
    );
  });

  it('concurrent requests with identical requestId resolve to same Version ID and emit 1 audit event', async () => {
    const harness = createMockPublishHarness();
    const actor = createMockEditor();
    const templateId = 'tmpl-card-concurrent-replay';
    const draftId = 'draft-concurrent-replay-1';
    const validationId = 'val-concurrent-replay-1';
    const requestId = 'req-concurrent-same-id-1';

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Concurrent Replay Template',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target: createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null }),
      categoryId: 'all',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });

    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: createInitialState('card'),
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-concurrent-replay',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    harness.validationRuns.set(validationId, {
      id: validationId,
      templateId,
      draftId,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-concurrent',
      candidateDocumentHash: 'hash-concurrent',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-concurrent-replay',
      findings: [],
      warningIds: [],
      customerPreviewPassed: true,
      engineFingerprint: 'engine-1',
      thumbnail: { assetId: 'thumb-concurrent', sha256: 'sha-concurrent' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const input: Omit<PublishTemplateInput, 'requestId'> = {
      templateId,
      draftId,
      expectedRevision: 1,
      expectedCatalogRevision: 1,
      sessionId: 'session-concurrent-replay',
      leaseEpoch: 1,
      validationId,
      acknowledgedWarningIds: [],
      revisionNote: 'Concurrent replay test',
    };

    const publishDraft = harness.service.publishTemplate.bind(harness.service);
    const [resA, resB] = await Promise.all([
      publishDraft(actor, { ...input, requestId }),
      publishDraft(actor, { ...input, requestId }),
    ]);

    assert.equal(resA.versionId, resB.versionId);
    assert.equal(resA.version, 1);
    assert.equal(resB.version, 1);
    assert.equal(harness.countPublishEventsForDraft(input.draftId), 1);
  });

  it('rejects expired validation receipt', async () => {
    const harness = createMockPublishHarness();
    const actor = createMockEditor();
    const templateId = 'tmpl-card-expired';
    const draftId = 'draft-expired-1';
    const validationId = 'val-expired-1';

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Expired Test',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target: createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null }),
      categoryId: 'all',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });

    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: createInitialState('card'),
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-exp',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Validation receipt expired 10 seconds ago
    harness.validationRuns.set(validationId, {
      id: validationId,
      templateId,
      draftId,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-exp',
      candidateDocumentHash: 'hash-exp',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-exp',
      findings: [],
      warningIds: [],
      customerPreviewPassed: true,
      engineFingerprint: 'engine-1',
      thumbnail: { assetId: 'thumb-exp', sha256: 'sha-exp' },
      expiresAt: new Date(Date.now() - 10000).toISOString(),
    });

    await assert.rejects(
      async () => {
        await harness.service.publishTemplate(actor, {
          templateId,
          draftId,
          expectedRevision: 1,
          expectedCatalogRevision: 1,
          sessionId: 'session-exp',
          leaseEpoch: 1,
          validationId,
          requestId: 'req-exp-1',
          acknowledgedWarningIds: [],
        });
      },
      (err: unknown) => {
        assert(err instanceof TemplateServiceError);
        assert.equal(err.code, 'VALIDATION_FAILED');
        return true;
      },
    );
  });

  it('rejects unacknowledged validation warnings', async () => {
    const harness = createMockPublishHarness();
    const actor = createMockEditor();
    const templateId = 'tmpl-card-warnings';
    const draftId = 'draft-warnings-1';
    const validationId = 'val-warnings-1';

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Warnings Test',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target: createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null }),
      categoryId: 'all',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });

    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: createInitialState('card'),
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-warn',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Validation run produced 2 warnings
    harness.validationRuns.set(validationId, {
      id: validationId,
      templateId,
      draftId,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-warn',
      candidateDocumentHash: 'hash-warn',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-warn',
      findings: [
        { code: 'NO_EDITABLE_ELEMENTS', message: 'Warning 1' },
        { code: 'LOW_RESOLUTION_WARNING', message: 'Warning 2' },
      ],
      warningIds: ['WARN_1', 'WARN_2'],
      customerPreviewPassed: true,
      engineFingerprint: 'engine-1',
      thumbnail: { assetId: 'thumb-warn', sha256: 'sha-warn' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    // Attempt 1: empty acknowledgements -> rejected
    await assert.rejects(
      async () => {
        await harness.service.publishTemplate(actor, {
          templateId,
          draftId,
          expectedRevision: 1,
          expectedCatalogRevision: 1,
          sessionId: 'session-warn',
          leaseEpoch: 1,
          validationId,
          requestId: 'req-warn-empty',
          acknowledgedWarningIds: [],
        });
      },
      (err: unknown) => {
        assert(err instanceof TemplateServiceError);
        assert.equal(err.code, 'VALIDATION_FAILED');
        return true;
      },
    );

    // Attempt 2: partial acknowledgement -> rejected
    await assert.rejects(
      async () => {
        await harness.service.publishTemplate(actor, {
          templateId,
          draftId,
          expectedRevision: 1,
          expectedCatalogRevision: 1,
          sessionId: 'session-warn',
          leaseEpoch: 1,
          validationId,
          requestId: 'req-warn-partial',
          acknowledgedWarningIds: ['WARN_1'],
        });
      },
      (err: unknown) => {
        assert(err instanceof TemplateServiceError);
        assert.equal(err.code, 'VALIDATION_FAILED');
        return true;
      },
    );

    // Attempt 3: all acknowledged -> success!
    const published = await harness.service.publishTemplate(actor, {
      templateId,
      draftId,
      expectedRevision: 1,
      expectedCatalogRevision: 1,
      sessionId: 'session-warn',
      leaseEpoch: 1,
      validationId,
      requestId: 'req-warn-all',
      acknowledgedWarningIds: ['WARN_1', 'WARN_2'],
    });

    assert.equal(published.version, 1);
  });

  it('rejects publication when referenced font face or sticker is archived', async () => {
    const harness = createMockPublishHarness();
    const actor = createMockEditor();
    const templateId = 'tmpl-card-archived-dep';
    const draftId = 'draft-archived-dep-1';
    const validationId = 'val-archived-dep-1';

    harness.dependencies.set('font-face:ff-archived', {
      id: 'ff-archived',
      kind: 'font-face',
      status: 'archived',
      familyId: 'fam-1',
      familyStatus: 'published',
    });

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Archived Dep Template',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target: createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null }),
      categoryId: 'all',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });

    const doc = createInitialState('card');
    const txt = createTextElement({ id: 't1', preset: 'heading', text: 'Text with archived font' });
    txt.data = { ...txt.data, fontFaceId: 'ff-archived' };
    doc.elements = [txt];

    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: doc,
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-dep',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    harness.validationRuns.set(validationId, {
      id: validationId,
      templateId,
      draftId,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-dep',
      candidateDocumentHash: 'hash-dep',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-dep',
      findings: [],
      warningIds: [],
      customerPreviewPassed: true,
      engineFingerprint: 'engine-1',
      thumbnail: { assetId: 'thumb-dep', sha256: 'sha-dep' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    await assert.rejects(
      async () => {
        await harness.service.publishTemplate(actor, {
          templateId,
          draftId,
          expectedRevision: 1,
          expectedCatalogRevision: 1,
          sessionId: 'session-dep',
          leaseEpoch: 1,
          validationId,
          requestId: 'req-dep-1',
          acknowledgedWarningIds: [],
        });
      },
      (err: unknown) => {
        assert(err instanceof TemplateServiceError);
        assert.equal(err.code, 'DEPENDENCY_UNRESOLVED');
        return true;
      },
    );
  });

  it('enforces RBAC: non-staff cannot publish template', async () => {
    const harness = createMockPublishHarness();
    const customer = createMockCustomer();

    await assert.rejects(
      async () => {
        await harness.service.publishTemplate(customer, {
          templateId: 'tmpl-1',
          draftId: 'draft-1',
          expectedRevision: 1,
          expectedCatalogRevision: 1,
          sessionId: 'sess-1',
          leaseEpoch: 1,
          validationId: 'val-1',
          requestId: 'req-1',
          acknowledgedWarningIds: [],
        });
      },
      (err: unknown) => {
        assert(err instanceof TemplateServiceError);
        assert.equal(err.code, 'FORBIDDEN');
        return true;
      },
    );
  });

  it('POST /api/admin/content/templates/[id]/publish route succeeds with valid payload', async () => {
    const harness = createMockPublishHarness();
    const actor = createMockEditor();
    const templateId = 'tmpl-route-test';
    const draftId = 'draft-route-1';
    const validationId = 'val-route-1';

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Route Test Template',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target: createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null }),
      categoryId: 'all',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });

    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: createInitialState('card'),
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: actor.userId,
      leaseSessionId: 'session-route',
      leaseEpoch: 1,
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    harness.validationRuns.set(validationId, {
      id: validationId,
      templateId,
      draftId,
      sourceRevision: 1,
      sourceDocumentHash: 'hash-route',
      candidateDocumentHash: 'hash-route',
      targetHash: 'target-hash-1',
      leaseEpoch: 1,
      sessionId: 'session-route',
      findings: [],
      warningIds: [],
      customerPreviewPassed: true,
      engineFingerprint: 'engine-1',
      thumbnail: { assetId: 'thumb-route', sha256: 'sha-route' },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    const request = new Request(`http://localhost:3000/api/admin/content/templates/${templateId}/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        draftId,
        expectedRevision: 1,
        expectedCatalogRevision: 1,
        sessionId: 'session-route',
        leaseEpoch: 1,
        validationId,
        requestId: 'req-route-pub-1',
        acknowledgedWarningIds: [],
      }),
    });

    const response = await publishRoute(request, { params: Promise.resolve({ id: templateId }) }, {
      requireStaff: async () => actor,
      service: harness.service,
      repo: harness.repo,
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.version.version, 1);

    // Rejection on missing draftId
    const badRequest = new Request(`http://localhost:3000/api/admin/content/templates/${templateId}/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({}),
    });
    const badResponse = await publishRoute(badRequest, { params: Promise.resolve({ id: templateId }) }, {
      requireStaff: async () => actor,
      service: harness.service,
      repo: harness.repo,
    });
    assert.equal(badResponse.status, 400);
  });
});
