import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import type { StaffIdentity } from '../lib/domain/order.ts';
import type {
  DeleteDraftTemplateInput,
  DuplicateTemplateInput,
  TemplateDraftRecord,
  TemplateMutation,
  TemplateRecord,
  TemplateRepoResult,
  TemplateVersionPayload,
} from '../lib/domain/template.ts';
import { TemplateServiceError } from '../lib/domain/template.ts';
import type { DesignState } from '../lib/product-state.ts';
import { createInitialState, createTextElement } from '../lib/product-state.ts';
import { TemplateRepository } from '../lib/repositories/template-repository.ts';
import { AssetLibraryRepository } from '../lib/repositories/asset-library-repository.ts';
import { TemplateManagementService } from '../lib/services/template-management.ts';
import { createTemplateTarget } from '../lib/template-target.ts';

import { POST as archiveRoute } from '../app/api/admin/content/templates/[id]/archive/route.ts';
import { POST as republishRoute } from '../app/api/admin/content/templates/[id]/republish/route.ts';
import { POST as duplicateRoute } from '../app/api/admin/content/templates/[id]/duplicate/route.ts';
import { DELETE as deleteRoute } from '../app/api/admin/content/templates/[id]/route.ts';
import { POST as discardRoute } from '../app/api/admin/content/templates/[id]/draft/discard/route.ts';

function createMockEditor(userId = '43000000-0000-0000-0000-0000000000e1'): StaffIdentity {
  return {
    userId,
    role: 'editor',
    email: 'editor@quynhtrang.test',
  };
}

function createMockAdmin(userId = '43000000-0000-0000-0000-0000000000a1'): StaffIdentity {
  return {
    userId,
    role: 'admin',
    email: 'admin@quynhtrang.test',
  };
}

interface MockAssetEvent {
  id: string;
  targetId: string;
  event: string;
  metadata: Record<string, unknown>;
}

interface MockDependency {
  kind: 'font-face' | 'sticker';
  assetId: string;
  familyId?: string;
  status: 'draft' | 'published' | 'archived';
}

function createMockLifecycleHarness() {
  const templates = new Map<string, TemplateRecord>();
  const drafts = new Map<string, TemplateDraftRecord>();
  const versions = new Map<string, TemplateVersionPayload>();
  const versionDeps = new Map<string, MockDependency[]>();
  const projects = new Map<string, { id: string; sourceTemplateId?: string | null; workingDocument: DesignState }>();
  const operations = new Map<string, { actor: string; payloadHash: string; result: TemplateRepoResult<unknown> }>();
  const assetEvents: MockAssetEvent[] = [];

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
    async listVersions(templateId: string) {
      return Array.from(versions.values())
        .filter((v) => v.templateId === templateId)
        .map((v) => ({
          id: v.versionId,
          version: v.version,
          publishedAt: '2026-10-04T00:00:00Z',
          publishedBy: 'mock-actor',
          revisionNote: null,
          createdAt: '2026-10-04T00:00:00Z',
        }));
    },
    async archiveTemplate(actor: string, input: TemplateMutation): Promise<TemplateRepoResult<TemplateRecord>> {
      const payloadHash = createHash('md5')
        .update(JSON.stringify({ templateId: input.templateId, expectedRevision: input.expectedCatalogRevision }))
        .digest('hex');

      const cached = operations.get(input.requestId);
      if (cached) {
        if (cached.actor !== actor || cached.payloadHash !== payloadHash) {
          return { ok: false, code: 'REVISION_CONFLICT', message: 'OPERATION_CONFLICT' };
        }
        return cached.result as TemplateRepoResult<TemplateRecord>;
      }

      const template = templates.get(input.templateId);
      if (!template) {
        return { ok: false, code: 'NOT_FOUND', message: 'Template not found' };
      }
      if (template.revision !== input.expectedCatalogRevision) {
        return { ok: false, code: 'REVISION_CONFLICT', message: 'Revision conflict' };
      }

      const updated: TemplateRecord = {
        ...template,
        status: 'archived',
        archivedAt: new Date().toISOString(),
        revision: template.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      templates.set(input.templateId, updated);

      assetEvents.push({
        id: randomUUID(),
        targetId: input.templateId,
        event: 'template_archived',
        metadata: { event: 'template_archived', template_id: input.templateId },
      });

      const res: TemplateRepoResult<TemplateRecord> = { ok: true, value: structuredClone(updated) };
      operations.set(input.requestId, { actor, payloadHash, result: res });
      return res;
    },
    async republishTemplate(actor: string, input: TemplateMutation): Promise<TemplateRepoResult<TemplateRecord>> {
      const payloadHash = createHash('md5')
        .update(JSON.stringify({ templateId: input.templateId, expectedRevision: input.expectedCatalogRevision }))
        .digest('hex');

      const cached = operations.get(input.requestId);
      if (cached) {
        if (cached.actor !== actor || cached.payloadHash !== payloadHash) {
          return { ok: false, code: 'REVISION_CONFLICT', message: 'OPERATION_CONFLICT' };
        }
        return cached.result as TemplateRepoResult<TemplateRecord>;
      }

      const template = templates.get(input.templateId);
      if (!template) {
        return { ok: false, code: 'NOT_FOUND', message: 'Template not found' };
      }
      if (template.revision !== input.expectedCatalogRevision) {
        return { ok: false, code: 'REVISION_CONFLICT', message: 'Revision conflict' };
      }
      if (!template.currentPublishedVersionId) {
        return { ok: false, code: 'NO_PUBLISHED_VERSION', message: 'Cannot republish template without published version' };
      }

      const deps = versionDeps.get(template.currentPublishedVersionId) ?? [];
      for (const dep of deps) {
        if (dep.status === 'archived' || dep.status !== 'published') {
          return {
            ok: false,
            code: 'ARCHIVED_DEPENDENCY',
            message: `Dependency ${dep.kind} ${dep.assetId} is archived or not published`,
          };
        }
      }

      const updated: TemplateRecord = {
        ...template,
        status: 'published',
        archivedAt: null,
        revision: template.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      templates.set(input.templateId, updated);

      assetEvents.push({
        id: randomUUID(),
        targetId: input.templateId,
        event: 'template_republished',
        metadata: { event: 'template_republished', template_id: input.templateId },
      });

      const res: TemplateRepoResult<TemplateRecord> = { ok: true, value: structuredClone(updated) };
      operations.set(input.requestId, { actor, payloadHash, result: res });
      return res;
    },
    async duplicateTemplate(
      actor: string,
      input: DuplicateTemplateInput,
    ): Promise<TemplateRepoResult<{ template: TemplateRecord; draft: TemplateDraftRecord }>> {
      const payloadHash = createHash('md5')
        .update(JSON.stringify({
          sourceTemplateId: input.sourceTemplateId,
          newTemplateId: input.newTemplateId,
          sourceVersionId: input.sourceVersionId,
          newName: input.newName,
        }))
        .digest('hex');

      const cached = operations.get(input.requestId);
      if (cached) {
        if (cached.actor !== actor || cached.payloadHash !== payloadHash) {
          return { ok: false, code: 'REVISION_CONFLICT', message: 'OPERATION_CONFLICT' };
        }
        return cached.result as TemplateRepoResult<{ template: TemplateRecord; draft: TemplateDraftRecord }>;
      }

      const source = templates.get(input.sourceTemplateId);
      if (!source) {
        return { ok: false, code: 'NOT_FOUND', message: 'Source template not found' };
      }

      let docToCopy: DesignState | null = null;
      let schemaVersion = 1;

      if (input.sourceVersionId) {
        const v = versions.get(input.sourceVersionId);
        if (!v) return { ok: false, code: 'NOT_FOUND', message: 'Source version not found' };
        docToCopy = structuredClone(v.document);
        schemaVersion = v.documentSchemaVersion;
      } else if (source.currentPublishedVersionId) {
        const v = versions.get(source.currentPublishedVersionId);
        if (v) {
          docToCopy = structuredClone(v.document);
          schemaVersion = v.documentSchemaVersion;
        }
      }

      if (!docToCopy) {
        const d = drafts.get(input.sourceTemplateId);
        if (d) {
          docToCopy = structuredClone(d.designDocument);
          schemaVersion = d.documentSchemaVersion;
        }
      }

      if (!docToCopy) {
        return { ok: false, code: 'NOT_FOUND', message: 'No document to duplicate' };
      }

      const newId = input.newTemplateId?.trim() || `tmpl-${randomUUID().slice(0, 8)}`;
      const newName = input.newName?.trim() || `${source.name} — Bản sao`;

      const newTemplate: TemplateRecord = {
        ...structuredClone(source),
        id: newId,
        slug: newId,
        name: newName,
        status: 'draft',
        revision: 1,
        currentPublishedVersionId: null,
        everPublishedAt: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      templates.set(newId, newTemplate);

      const newDraft: TemplateDraftRecord = {
        id: randomUUID(),
        templateId: newId,
        basedOnVersionId: null,
        designDocument: docToCopy,
        documentSchemaVersion: schemaVersion,
        draftRevision: 1,
        sourceDocumentHash: createHash('sha256').update(JSON.stringify(docToCopy)).digest('hex'),
        editorUserId: actor,
        leaseSessionId: null,
        leaseEpoch: 0,
        leaseExpiresAt: null,
        lastActivityAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      drafts.set(newId, newDraft);

      assetEvents.push({
        id: randomUUID(),
        targetId: newId,
        event: 'created',
        metadata: { event: 'created', source_template_id: input.sourceTemplateId, name: newName },
      });

      const res: TemplateRepoResult<{ template: TemplateRecord; draft: TemplateDraftRecord }> = {
        ok: true,
        value: { template: structuredClone(newTemplate), draft: structuredClone(newDraft) },
      };
      operations.set(input.requestId, { actor, payloadHash, result: res });
      return res;
    },
    async deleteDraftTemplate(
      actor: string,
      input: DeleteDraftTemplateInput,
    ): Promise<TemplateRepoResult<{ templateId: string; deleted: boolean }>> {
      const payloadHash = createHash('md5').update(JSON.stringify({ templateId: input.templateId })).digest('hex');

      const cached = operations.get(input.requestId);
      if (cached) {
        if (cached.actor !== actor || cached.payloadHash !== payloadHash) {
          return { ok: false, code: 'REVISION_CONFLICT', message: 'OPERATION_CONFLICT' };
        }
        return cached.result as TemplateRepoResult<{ templateId: string; deleted: boolean }>;
      }

      const template = templates.get(input.templateId);
      if (!template) {
        return { ok: false, code: 'NOT_FOUND', message: 'Template not found' };
      }

      if (template.status !== 'draft' || template.everPublishedAt !== null || template.currentPublishedVersionId !== null) {
        return { ok: false, code: 'CANNOT_DELETE_PUBLISHED_TEMPLATE', message: 'Template was published' };
      }

      const hasVersions = Array.from(versions.values()).some((v) => v.templateId === input.templateId);
      if (hasVersions) {
        return { ok: false, code: 'CANNOT_DELETE_TEMPLATE_WITH_VERSIONS', message: 'Template has versions' };
      }

      const hasProjects = Array.from(projects.values()).some((p) => p.sourceTemplateId === input.templateId);
      if (hasProjects) {
        return { ok: false, code: 'CANNOT_DELETE_REFERENCED_TEMPLATE', message: 'Template referenced by projects' };
      }

      templates.delete(input.templateId);
      drafts.delete(input.templateId);

      assetEvents.push({
        id: randomUUID(),
        targetId: input.templateId,
        event: 'deleted',
        metadata: { name: template.name, template_id: input.templateId },
      });

      const res: TemplateRepoResult<{ templateId: string; deleted: boolean }> = {
        ok: true,
        value: { templateId: input.templateId, deleted: true },
      };
      operations.set(input.requestId, { actor, payloadHash, result: res });
      return res;
    },
    async discardDraft(
      actor: string,
      input: { requestId: string; draftId: string; expectedRevision: number; sessionId: string; epoch: number },
    ): Promise<TemplateRepoResult<{ draftId: string; discarded: boolean }>> {
      const draft = Array.from(drafts.values()).find((d) => d.id === input.draftId);
      if (!draft) {
        return { ok: false, code: 'NOT_FOUND', message: 'Draft not found' };
      }
      drafts.delete(draft.templateId);

      assetEvents.push({
        id: randomUUID(),
        targetId: draft.templateId,
        event: 'draft_discarded',
        metadata: { draft_id: input.draftId },
      });

      return {
        ok: true,
        value: { draftId: input.draftId, discarded: true },
      };
    },
  } as unknown as TemplateRepository;

  return {
    repo,
    service: new TemplateManagementService(repo),
    templates,
    drafts,
    versions,
    versionDeps,
    projects,
    assetEvents,
  };
}

describe('State 43 Task 13: Template Lifecycle Actions', () => {
  it('archive hides template, increments revision, records event, and leaves historical version untouched', async () => {
    const harness = createMockLifecycleHarness();
    const editor = createMockEditor();

    const target = createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null });
    const originalDoc = createInitialState('card');
    originalDoc.elements = [createTextElement({ id: 'txt-1', preset: 'heading', text: 'Happy Birthday' })];
    const templateId = 'tmpl-card-1';
    const versionId = 'v1-uuid';

    const originalVersion: TemplateVersionPayload = {
      versionId,
      templateId,
      version: 1,
      documentSchemaVersion: 1,
      document: originalDoc,
      target,
      dependencies: [],
    };
    harness.versions.set(versionId, originalVersion);

    const template: TemplateRecord = {
      id: templateId,
      name: 'Birthday Card',
      status: 'published',
      revision: 2,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target,
      categoryId: 'birthday',
      tags: ['bday'],
      sortOrder: 0,
      currentPublishedVersionId: versionId,
      everPublishedAt: '2026-10-04T00:00:00Z',
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      archivedAt: null,
    };
    harness.templates.set(templateId, template);

    // Also record a project cloned from this version
    harness.projects.set('project-1', {
      id: 'project-1',
      sourceTemplateId: templateId,
      workingDocument: originalDoc,
    });

    const archived = await harness.service.archiveTemplate(editor, {
      templateId,
      expectedCatalogRevision: 2,
      requestId: 'req-archive-1',
    });

    assert.equal(archived.status, 'archived');
    assert.equal(archived.revision, 3);
    assert.ok(archived.archivedAt);

    // Verify historical version is completely untouched
    const historicalVersion = await harness.repo.getVersion(versionId);
    assert.deepEqual(historicalVersion, originalVersion);

    // Cloned project document remains unaffected
    const proj = harness.projects.get('project-1');
    assert.deepEqual(proj?.workingDocument, originalDoc);

    // Audit event logged
    const archiveEvents = harness.assetEvents.filter((e) => e.event === 'template_archived');
    assert.equal(archiveEvents.length, 1);
    assert.equal(archiveEvents[0]?.targetId, templateId);
  });

  it('republish succeeds when valid, rejected when dependency is archived', async () => {
    const harness = createMockLifecycleHarness();
    const editor = createMockEditor();

    const target = createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null });
    const templateId = 'tmpl-card-2';
    const versionId = 'v2-uuid';

    const version: TemplateVersionPayload = {
      versionId,
      templateId,
      version: 1,
      documentSchemaVersion: 1,
      document: createInitialState('card'),
      target,
      dependencies: [],
    };
    harness.versions.set(versionId, version);

    // Font face and sticker dependencies
    harness.versionDeps.set(versionId, [
      { kind: 'font-face', assetId: 'face-1', status: 'published' },
      { kind: 'sticker', assetId: 'sticker-1', status: 'published' },
    ]);

    const template: TemplateRecord = {
      id: templateId,
      name: 'Anniversary Card',
      status: 'archived',
      revision: 3,
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
      target,
      categoryId: 'love',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: versionId,
      everPublishedAt: '2026-10-04T00:00:00Z',
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      archivedAt: '2026-10-04T01:00:00Z',
    };
    harness.templates.set(templateId, template);

    // 1. Valid republish succeeds
    const republished = await harness.service.republishTemplate(editor, {
      templateId,
      expectedCatalogRevision: 3,
      requestId: 'req-repub-1',
    });
    assert.equal(republished.status, 'published');
    assert.equal(republished.archivedAt, null);
    assert.equal(republished.revision, 4);

    // 2. Mark font face dependency as archived
    harness.versionDeps.set(versionId, [
      { kind: 'font-face', assetId: 'face-1', status: 'archived' },
    ]);

    // Re-archive template first
    await harness.service.archiveTemplate(editor, {
      templateId,
      expectedCatalogRevision: 4,
      requestId: 'req-archive-2',
    });

    // 3. Republish now rejected due to ARCHIVED_DEPENDENCY
    await assert.rejects(
      () =>
        harness.service.republishTemplate(editor, {
          templateId,
          expectedCatalogRevision: 5,
          requestId: 'req-repub-2',
        }),
      (err: unknown) => {
        assert.ok(err instanceof TemplateServiceError);
        assert.equal(err.code, 'ARCHIVED_DEPENDENCY');
        return true;
      },
    );

    // 4. Mark font family dependency as archived
    harness.versionDeps.set(versionId, [
      { kind: 'font-face', assetId: 'face-2', familyId: 'family-1', status: 'archived' },
    ]);

    await assert.rejects(
      () =>
        harness.service.republishTemplate(editor, {
          templateId,
          expectedCatalogRevision: 5,
          requestId: 'req-repub-3',
        }),
      (err: unknown) => {
        assert.ok(err instanceof TemplateServiceError);
        assert.equal(err.code, 'ARCHIVED_DEPENDENCY');
        return true;
      },
    );
  });

  it('duplicate creates independent draft with exact target equality', async () => {
    const harness = createMockLifecycleHarness();
    const editor = createMockEditor();
    const target = createTemplateTarget({ productId: 'wrapping', variantId: 'a1', mode: 'pattern', shape: null });
    const originalDoc = createInitialState('wrapping');
    originalDoc.elements = [createTextElement({ id: 'txt-1', preset: 'heading', text: 'Original Artwork' })];
    const originalId = 'tmpl-wrap-original';
    const versionId = 'v1-wrap';
    const originalVersion: TemplateVersionPayload = {
      versionId,
      templateId: originalId,
      version: 1,
      documentSchemaVersion: 1,
      document: originalDoc,
      target,
      dependencies: [],
    };
    harness.versions.set(versionId, originalVersion);

    const original: TemplateRecord = {
      id: originalId,
      name: 'Wrapping Stars',
      status: 'published',
      revision: 2,
      productId: 'wrapping',
      variantId: 'a1',
      mode: 'pattern',
      shape: null,
      target,
      categoryId: 'all',
      tags: ['stars'],
      sortOrder: 5,
      currentPublishedVersionId: versionId,
      everPublishedAt: '2026-10-04T00:00:00Z',
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      archivedAt: null,
    };
    harness.templates.set(originalId, original);

    const duplicateResult = await harness.service.duplicateTemplate(editor, {
      requestId: 'req-dup-1',
      sourceTemplateId: originalId,
    });

    const copy = duplicateResult.template;
    const copyDraft = duplicateResult.draft;

    // Assert exact duplicate target equality and new independent Draft:
    assert.notEqual(copy.id, original.id);
    assert.deepEqual(copy.target, original.target);
    assert.equal(copy.status, 'draft');
    assert.equal(copy.currentPublishedVersionId, null);
    assert.deepEqual(await harness.repo.getVersion(originalVersion.versionId), originalVersion);

    // Verify copy draft has identical document
    assert.deepEqual(copyDraft.designDocument, originalVersion.document);
    assert.equal(copyDraft.basedOnVersionId, null);
    assert.equal(copyDraft.draftRevision, 1);

    // Editing duplicate draft does not affect original
    copyDraft.designDocument.elements = [];
    assert.notEqual(copyDraft.designDocument.elements.length, originalVersion.document.elements?.length);
    assert.deepEqual(await harness.repo.getVersion(originalVersion.versionId), originalVersion);
  });

  it('delete draft is admin-only, rejected if template was ever published or has versions', async () => {
    const harness = createMockLifecycleHarness();
    const editor = createMockEditor();
    const admin = createMockAdmin();

    const target = createTemplateTarget({ productId: 'card', variantId: 'vertical', mode: null, shape: null });

    // 1. Draft-only template (never published)
    const draftOnlyId = 'tmpl-never-published';
    const draftOnlyTemplate: TemplateRecord = {
      id: draftOnlyId,
      name: 'Unpublished Draft',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'vertical',
      mode: null,
      shape: null,
      target,
      categoryId: 'all',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      archivedAt: null,
    };
    harness.templates.set(draftOnlyId, draftOnlyTemplate);
    harness.drafts.set(draftOnlyId, {
      id: 'draft-temp',
      templateId: draftOnlyId,
      basedOnVersionId: null,
      designDocument: createInitialState('card'),
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: null,
      leaseSessionId: null,
      leaseEpoch: 0,
      leaseExpiresAt: null,
      lastActivityAt: null,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    });

    // Editor cannot delete
    await assert.rejects(
      () => harness.service.deleteDraftTemplate(editor, { requestId: 'req-del-1', templateId: draftOnlyId }),
      (err: unknown) => {
        assert.ok(err instanceof TemplateServiceError);
        assert.equal(err.code, 'FORBIDDEN');
        return true;
      },
    );

    // Admin can delete never-published draft template
    const deleteResult = await harness.service.deleteDraftTemplate(admin, {
      requestId: 'req-del-2',
      templateId: draftOnlyId,
    });
    assert.equal(deleteResult.deleted, true);
    assert.equal(await harness.repo.getTemplate(draftOnlyId), null);
    assert.equal(await harness.repo.getDraft(draftOnlyId), null);

    // Audit event survives
    const deletedEvents = harness.assetEvents.filter((e) => e.event === 'deleted');
    assert.equal(deletedEvents.length, 1);
    assert.equal(deletedEvents[0]?.targetId, draftOnlyId);

    // 2. Published template cannot be deleted even after archive
    const publishedId = 'tmpl-was-published';
    const publishedTemplate: TemplateRecord = {
      id: publishedId,
      name: 'Published Template',
      status: 'archived',
      revision: 5,
      productId: 'card',
      variantId: 'vertical',
      mode: null,
      shape: null,
      target,
      categoryId: 'all',
      tags: [],
      sortOrder: 0,
      currentPublishedVersionId: null, // Even if pointer was corrupted/nulled
      everPublishedAt: '2026-10-04T00:00:00Z', // everPublishedAt is set
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      archivedAt: '2026-10-04T01:00:00Z',
    };
    harness.templates.set(publishedId, publishedTemplate);

    await assert.rejects(
      () => harness.service.deleteDraftTemplate(admin, { requestId: 'req-del-3', templateId: publishedId }),
      (err: unknown) => {
        assert.ok(err instanceof TemplateServiceError);
        assert.equal(err.code, 'CANNOT_DELETE_PUBLISHED_TEMPLATE');
        return true;
      },
    );

    // 3. Template with historical versions cannot be deleted
    const versionedId = 'tmpl-has-versions';
    harness.templates.set(versionedId, {
      ...publishedTemplate,
      id: versionedId,
      status: 'draft',
      everPublishedAt: null,
    });
    harness.versions.set('v-hist', {
      versionId: 'v-hist',
      templateId: versionedId,
      version: 1,
      documentSchemaVersion: 1,
      document: createInitialState('card'),
      target,
      dependencies: [],
    });

    await assert.rejects(
      () => harness.service.deleteDraftTemplate(admin, { requestId: 'req-del-4', templateId: versionedId }),
      (err: unknown) => {
        assert.ok(err instanceof TemplateServiceError);
        assert.equal(err.code, 'CANNOT_DELETE_TEMPLATE_WITH_VERSIONS');
        return true;
      },
    );
  });

  it('discard draft removes active draft and records event', async () => {
    const harness = createMockLifecycleHarness();
    const editor = createMockEditor();

    const templateId = 'tmpl-discard-test';
    const draftId = 'draft-discard-test';

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Discard Test',
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
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      archivedAt: null,
    });

    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: createInitialState('card'),
      documentSchemaVersion: 1,
      draftRevision: 2,
      editorUserId: editor.userId,
      leaseSessionId: 'sess-1',
      leaseEpoch: 1,
      leaseExpiresAt: '2026-10-04T02:00:00Z',
      lastActivityAt: '2026-10-04T01:50:00Z',
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    });

    const result = await harness.service.discardDraft(editor, {
      requestId: 'req-disc-1',
      draftId,
      expectedRevision: 2,
      sessionId: 'sess-1',
      epoch: 1,
    });

    assert.equal(result.discarded, true);
    assert.equal(await harness.repo.getDraft(templateId), null);
    assert.ok(await harness.repo.getTemplate(templateId)); // Template row remains visible

    const discardEvents = harness.assetEvents.filter((e) => e.event === 'draft_discarded');
    assert.equal(discardEvents.length, 1);
  });

  it('HTTP routes: POST archive, republish, duplicate, and DELETE handle authorization and CAS', async () => {
    const harness = createMockLifecycleHarness();
    const editor = createMockEditor();
    const admin = createMockAdmin();

    const target = createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null });
    const templateId = 'tmpl-route-test';
    const versionId = 'v-route-test';

    harness.versions.set(versionId, {
      versionId,
      templateId,
      version: 1,
      documentSchemaVersion: 1,
      document: createInitialState('card'),
      target,
      dependencies: [],
    });
    harness.versionDeps.set(versionId, []);

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Route Test Card',
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
      currentPublishedVersionId: versionId,
      everPublishedAt: '2026-10-04T00:00:00Z',
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      archivedAt: null,
    });

    const makeReq = (path: string, method: string, body?: unknown) =>
      new Request(`http://localhost:3000${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

    // 1. POST /api/admin/content/templates/[id]/archive
    const archiveRes = await archiveRoute(
      makeReq(`/api/admin/content/templates/${templateId}/archive`, 'POST', { expectedRevision: 1 }),
      { params: Promise.resolve({ id: templateId }) },
      { requireStaff: async () => editor, service: harness.service, repo: harness.repo },
    );
    assert.equal(archiveRes.status, 200);
    const archiveJson = await archiveRes.json();
    assert.equal(archiveJson.template.status, 'archived');
    assert.equal(archiveJson.template.revision, 2);

    // 2. POST /api/admin/content/templates/[id]/republish
    const republishRes = await republishRoute(
      makeReq(`/api/admin/content/templates/${templateId}/republish`, 'POST', { expectedRevision: 2 }),
      { params: Promise.resolve({ id: templateId }) },
      { requireStaff: async () => editor, service: harness.service, repo: harness.repo },
    );
    assert.equal(republishRes.status, 200);
    const republishJson = await republishRes.json();
    assert.equal(republishJson.template.status, 'published');
    assert.equal(republishJson.template.revision, 3);

    // 3. POST /api/admin/content/templates/[id]/duplicate
    const duplicateRes = await duplicateRoute(
      makeReq(`/api/admin/content/templates/${templateId}/duplicate`, 'POST', { newName: 'Duplicated Card' }),
      { params: Promise.resolve({ id: templateId }) },
      { requireStaff: async () => editor, service: harness.service, repo: harness.repo },
    );
    assert.equal(duplicateRes.status, 200);
    const duplicateJson = await duplicateRes.json();
    assert.equal(duplicateJson.template.name, 'Duplicated Card');
    assert.equal(duplicateJson.template.status, 'draft');

    // 4. DELETE /api/admin/content/templates/[id]
    // Non-admin editor gets 403
    const editorDeleteRes = await deleteRoute(
      makeReq(`/api/admin/content/templates/${duplicateJson.template.id}`, 'DELETE'),
      { params: Promise.resolve({ id: duplicateJson.template.id }) },
      { requireStaff: async () => editor, service: harness.service, repo: harness.repo },
    );
    assert.equal(editorDeleteRes.status, 403);

    // Admin can delete never-published duplicate
    const adminDeleteRes = await deleteRoute(
      makeReq(`/api/admin/content/templates/${duplicateJson.template.id}`, 'DELETE'),
      { params: Promise.resolve({ id: duplicateJson.template.id }) },
      { requireStaff: async () => admin, service: harness.service, repo: harness.repo },
    );
    assert.equal(adminDeleteRes.status, 200);
    const adminDeleteJson = await adminDeleteRes.json();
    assert.equal(adminDeleteJson.deleted, true);

    // 5. POST /api/admin/content/templates/[id]/draft/discard
    harness.drafts.set(templateId, {
      id: 'draft-route-discard',
      templateId,
      basedOnVersionId: null,
      designDocument: createInitialState('card'),
      documentSchemaVersion: 1,
      draftRevision: 1,
      editorUserId: editor.userId,
      leaseSessionId: 'sess-discard-route',
      leaseEpoch: 0,
      leaseExpiresAt: null,
      lastActivityAt: null,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    });
    const discardRes = await discardRoute(
      makeReq(`/api/admin/content/templates/${templateId}/draft/discard`, 'POST', {
        draftId: 'draft-route-discard',
        expectedRevision: 1,
        sessionId: 'sess-discard-route',
        epoch: 0,
      }),
      { params: Promise.resolve({ id: templateId }) },
      { requireStaff: async () => editor, service: harness.service, repo: harness.repo },
    );
    assert.equal(discardRes.status, 200);
    const discardJson = await discardRes.json();
    assert.equal(discardJson.ok, true);
    assert.equal(discardJson.value.discarded, true);
  });
  it('AssetLibraryRepository.checkAssetUsage detects references in template_drafts and template_version_dependencies', async () => {
    class MockClient {
      private readonly tdData: unknown[];
      private readonly tvdData: unknown[];

      constructor(tdData: unknown[] = [], tvdData: unknown[] = []) {
        this.tdData = tdData;
        this.tvdData = tvdData;
      }
      from(table: string) {
        if (table === 'template_drafts') {
          return {
            select: () => ({
              or: () => ({
                limit: () => Promise.resolve({ data: this.tdData, error: null }),
              }),
            }),
          };
        }
        if (table === 'template_version_dependencies') {
          return {
            select: () => ({
              or: () => ({
                limit: () => Promise.resolve({ data: this.tvdData, error: null }),
              }),
              eq: () => ({
                limit: () => Promise.resolve({ data: this.tvdData, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            or: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
    }

    // 1. Asset referenced in template_drafts
    const draftReferencedRepo = new AssetLibraryRepository(
      new MockClient([{ id: 'draft-with-sticker' }], []) as never,
    );
    const usedInDraft = await draftReferencedRepo.checkAssetUsage({
      kind: 'sticker',
      id: 'rose-sticker',
      checksum: 'sha-mock-sticker',
    });
    assert.equal(usedInDraft, true);

    // 2. Asset referenced in template_version_dependencies
    const versionReferencedRepo = new AssetLibraryRepository(
      new MockClient([], [{ id: 'dep-with-face' }]) as never,
    );
    const usedInVersion = await versionReferencedRepo.checkAssetUsage({
      kind: 'font-face',
      id: 'roboto-bold',
      checksum: 'sha-mock-font',
    });
    assert.equal(usedInVersion, true);

    // 3. Unreferenced asset returns false
    const unreferencedRepo = new AssetLibraryRepository(new MockClient([], []) as never);
    const notUsed = await unreferencedRepo.checkAssetUsage({
      kind: 'sticker',
      id: 'lonely-sticker',
      checksum: 'sha-mock-lonely',
    });
    assert.equal(notUsed, false);
  });
});
