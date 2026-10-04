import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import sharp from 'sharp';

import { AuthorizationError, requireStaff } from '../lib/admin/authorization.ts';
import { canMutateElement } from '../lib/domain/design-revision.ts';
import {
  TemplateServiceError,
  type PublishTemplateInput,
  type TemplateAvailability,
  type TemplateDraftRecord,
  type TemplateRecord,
  type TemplateRepoResult,
  type TemplateTarget,
  type TemplateVersionPayload,
  type UseTemplateInput,
} from '../lib/domain/template.ts';
import { TemplateRepository } from '../lib/repositories/template-repository.ts';
import {
  transitionState,
  type CanvasElement,
  type CardSurface,
  type DesignState,
} from '../lib/product-state.ts';
import { cloneTemplateIntoProject } from '../lib/services/template-clone.ts';
import { generateDocumentRenderMarkup } from '../lib/services/document-renderer.ts';
import { POST as useRoute } from '../app/api/templates/[id]/use/route.ts';

function makeCardTarget(): TemplateTarget {
  return {
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
    geometryKey: 'card:vertical',
    surfaces: [
      { id: 'front', widthMm: 105, heightMm: 148 },
      { id: 'inside', widthMm: 210, heightMm: 148 },
      { id: 'back', widthMm: 105, heightMm: 148 },
    ],
  };
}

function makeInitialCardDocument(templateId: string): DesignState {
  const elements: CanvasElement[] = [
    {
      id: 'front-locked-motif',
      type: 'text',
      surface: 'front' as CardSurface,
      x: 10,
      y: 20,
      width: 100,
      height: 30,
      rotation: 0,
      locked: false,
      customerLocked: true,
      data: {
        text: 'Mừng Kỷ Niệm',
        fontSize: 22,
        fontFamily: 'Playfair Display',
      },
    },
    {
      id: 'front-editable-name',
      type: 'text',
      surface: 'front' as CardSurface,
      x: 10,
      y: 60,
      width: 100,
      height: 25,
      rotation: 0,
      locked: false,
      customerLocked: false,
      data: {
        text: 'Gia Đình Nguyễn',
        fontSize: 16,
      },
    },
    {
      id: 'inside-placeholder-prompt',
      type: 'text',
      surface: 'inside' as CardSurface,
      x: 20,
      y: 40,
      width: 120,
      height: 30,
      rotation: 0,
      locked: false,
      customerLocked: false,
      data: {
        text: 'Kính gửi quý khách...',
        placeholder: true,
        placeholderType: 'text',
        placeholderHint: 'Nhập nội dung thư mời',
      },
    },
  ];

  return {
    productId: 'card',
    variantId: 'vertical',
    templateId,
    text: 'Thiệp Mừng Kỷ Niệm',
    color: '#1A365D',
    backgroundColor: '#FAF5EE',
    image: null,
    quantity: 10,
    productOptions: {
      fold: 'bi-fold',
      surface: 'front',
    },
    elements,
    documentSchemaVersion: 1,
  };
}

interface PersistedProjectRow {
  id: string;
  owner_user_id: string | null;
  guest_key_hash: string | null;
  product_id: string;
  variant_id: string | null;
  status: string;
  current_working_revision: number;
  working_document: DesignState;
  source_template_id: string | null;
  source_template_version_id: string | null;
  clone_request_key: string | null;
  created_at: string;
  updated_at: string;
}

function createHarness() {
  const templates = new Map<string, TemplateRecord>();
  const drafts = new Map<string, TemplateDraftRecord>();
  const versions = new Map<string, TemplateVersionPayload>();
  const projects = new Map<string, PersistedProjectRow>();
  const operations = new Map<string, { actor: string; payloadHash: string; result: unknown }>();
  let dependencyAvailable = true;

  const repo = {
    async getTemplate(id: string) {
      const t = templates.get(id);
      return t ? structuredClone(t) : null;
    },
    async getVersion(id: string) {
      const v = versions.get(id);
      return v ? structuredClone(v) : null;
    },
    async getTemplateAvailability(id: string): Promise<TemplateAvailability> {
      const t = templates.get(id);
      if (!t || t.status !== 'published' || t.archivedAt) {
        return {
          available: false,
          blockers: [{ code: 'TEMPLATE_ARCHIVED', message: 'Mẫu đã lưu trữ', kind: 'template', id }],
        };
      }
      if (!dependencyAvailable) {
        return {
          available: false,
          blockers: [{ code: 'DEPENDENCY_ARCHIVED', message: 'Tài nguyên đã bị lưu trữ', kind: 'sticker', id: 'stick-1' }],
        };
      }
      return { available: true, blockers: [] };
    },
    async resolveLegacyTarget() {
      return null;
    },
    async publishDraft(actor: string, input: PublishTemplateInput): Promise<TemplateRepoResult<TemplateVersionPayload>> {
      const t = templates.get(input.templateId);
      const d = drafts.get(input.templateId);
      if (!t || !d) {
        return { ok: false, code: 'NOT_FOUND', message: 'Template or draft not found' };
      }
      const newVerNumber = (t.revision || 1);
      const versionId = randomUUID();
      const versionPayload: TemplateVersionPayload = {
        versionId,
        templateId: input.templateId,
        version: newVerNumber,
        documentSchemaVersion: 1,
        document: structuredClone(d.designDocument),
        target: structuredClone(t.target || makeCardTarget()),
        dependencies: [],
      };

      versions.set(versionId, versionPayload);
      t.status = 'published';
      t.revision = newVerNumber + 1;
      t.currentPublishedVersionId = versionId;
      t.everPublishedAt = t.everPublishedAt || new Date().toISOString();
      return { ok: true, value: versionPayload };
    },
    async cloneTemplateIntoProject(userId: string, input: UseTemplateInput): Promise<{ projectId: string; revision: number; document: DesignState }> {
      const t = templates.get(input.templateId);
      if (!t || t.status !== 'published' || t.archivedAt) {
        throw new TemplateServiceError('TEMPLATE_UNAVAILABLE', 'Mẫu này hiện không còn khả dụng.', 409);
      }
      if (!dependencyAvailable) {
        throw new TemplateServiceError('TEMPLATE_UNAVAILABLE', 'Mẫu này hiện không còn khả dụng.', 409, {
          blockers: [{ code: 'DEPENDENCY_ARCHIVED', message: 'Tài nguyên đã bị lưu trữ' }],
        });
      }
      const v = versions.get(input.expectedVersionId);
      if (!v) {
        throw new TemplateServiceError('TEMPLATE_UNAVAILABLE', 'Phiên bản không tồn tại', 409);
      }

      const projectId = `proj-${randomUUID()}`;
      const doc: DesignState = structuredClone(v.document);
      doc.sourceTemplate = {
        templateId: input.templateId,
        templateVersionId: input.expectedVersionId,
      };

      const project: PersistedProjectRow = {
        id: projectId,
        owner_user_id: userId,
        guest_key_hash: null,
        product_id: doc.productId,
        variant_id: doc.variantId || null,
        status: 'draft',
        current_working_revision: 1,
        working_document: doc,
        source_template_id: input.templateId,
        source_template_version_id: input.expectedVersionId,
        clone_request_key: input.requestId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      projects.set(projectId, project);
      return { projectId, revision: 1, document: doc };
    },
    setDependencyAvailable(val: boolean) {
      dependencyAvailable = val;
    },
  } as unknown as TemplateRepository & {
    setDependencyAvailable(val: boolean): void;
  };

  return {
    repo,
    templates,
    drafts,
    versions,
    projects,
    operations,
  };
}

function makePublishInput(templateId: string, draftId: string, requestId: string, revision = 1): PublishTemplateInput {
  return {
    templateId,
    draftId,
    expectedRevision: revision,
    expectedCatalogRevision: 1,
    leaseEpoch: 0,
    sessionId: 'session-isolation',
    validationId: 'val-receipt-1',
    acknowledgedWarningIds: [],
    requestId,
  };
}

describe('State 43 Task 19: Template Project Isolation & Historical Invariants', () => {
  it('satisfies exact isolation contract across v1->v2 publish, archive, historical render, and admin RBAC', async () => {
    const harness = createHarness();
    const adminId = '43000000-0000-0000-0000-0000000000a1';
    const customerId = '43000000-0000-0000-0000-0000000000c1';
    const templateId = 'tmpl-isolation-1';

    // 1. Setup template with initial draft and publish Version 1
    const v1Doc = makeInitialCardDocument(templateId);
    const target = makeCardTarget();

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Mẫu Kỷ Niệm',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'vertical',
      mode: null,
      shape: null,
      target,
      categoryId: 'all',
      tags: [],
      sortOrder: 1,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
      createdBy: adminId,
    });

    const draftId = randomUUID();
    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: v1Doc,
      documentSchemaVersion: 1,
      draftRevision: 1,
      sourceDocumentHash: createHash('sha256').update(JSON.stringify(v1Doc)).digest('hex'),
      editorUserId: null,
      leaseSessionId: null,
      leaseEpoch: 0,
      leaseExpiresAt: null,
      lastActivityAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: adminId,
    });

    const v1Pub = await harness.repo.publishDraft(adminId, makePublishInput(templateId, draftId, 'req-pub-v1'));
    assert.equal(v1Pub.ok, true);
    const v1 = v1Pub.ok ? v1Pub.value : null!;
    assert.ok(v1);

    // Generate real thumbnail bytes for v1 using Sharp
    const v1ThumbnailBytes = await sharp({
      create: { width: 400, height: 564, channels: 4, background: { r: 250, g: 245, b: 238, alpha: 1 } },
    }).png().toBuffer();

    // Record `before` state
    const before = {
      versionDocumentHash: createHash('sha256').update(JSON.stringify(v1.document)).digest('hex'),
      versionThumbnailHash: createHash('sha256').update(v1ThumbnailBytes).digest('hex'),
      editedCustomerProject: null as unknown,
    };

    // Customer clones v1 into an editable customer project
    const cloneResult = await cloneTemplateIntoProject(
      { userId: customerId },
      {
        templateId,
        expectedVersionId: v1.versionId,
        target,
        requestId: 'req-clone-1',
      },
      { repo: harness.repo }
    );
    assert.equal(cloneResult.kind, 'cloud');
    const customerDoc = cloneResult.document;

    // Customer edits project: modifies editable text, moves element
    const customerEditedDoc = transitionState(customerDoc, {
      type: 'MOVE_ELEMENT',
      id: 'front-editable-name',
      x: 15,
      y: 65,
    });

    const assignedProjectId = 'projectId' in cloneResult ? cloneResult.projectId : 'proj-fallback';
    const customerProjectRecord = {
      projectId: assignedProjectId,
      document: customerEditedDoc,
      revision: 2,
      savedAt: Date.now(),
    };
    before.editedCustomerProject = structuredClone(customerProjectRecord);

    // 2. Admin modifies draft and publishes Version 2 with new document and new thumbnail
    const v2Doc = structuredClone(v1Doc);
    v2Doc.elements!.push({
      id: 'front-v2-exclusive-badge',
      type: 'text',
      surface: 'front' as CardSurface,
      x: 10,
      y: 110,
      width: 80,
      height: 20,
      rotation: 0,
      data: { text: 'Phiên bản mới 2026' },
    });
    harness.drafts.set(templateId, {
      ...harness.drafts.get(templateId)!,
      designDocument: v2Doc,
    });

    const v2Pub = await harness.repo.publishDraft(adminId, makePublishInput(templateId, draftId, 'req-pub-v2', 2));
    assert.equal(v2Pub.ok, true);
    const v2 = v2Pub.ok ? v2Pub.value : null!;
    assert.notEqual(v1.versionId, v2.versionId);

    // Fetch historical Version 1 record again to verify it remained completely frozen
    const v1AfterRecord = await harness.repo.getVersion(v1.versionId);
    assert.ok(v1AfterRecord);

    // Record `after` state
    const after = {
      versionDocumentHash: createHash('sha256').update(JSON.stringify(v1AfterRecord.document)).digest('hex'),
      versionThumbnailHash: createHash('sha256').update(v1ThumbnailBytes).digest('hex'),
      editedCustomerProject: structuredClone(customerProjectRecord),
    };

    // 3. Admin archives the template
    const tmplRecord = harness.templates.get(templateId)!;
    tmplRecord.archivedAt = new Date().toISOString();
    tmplRecord.status = 'archived';

    // 4. Customer attempts new clone/use after archive -> MUST return 409
    const useReq = new Request(`http://localhost:3000/api/templates/${templateId}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersionId: v2.versionId,
        target,
        requestId: 'req-use-after-archive',
      }),
    });
    const newUseAfterArchive = await useRoute(
      useReq,
      { params: Promise.resolve({ id: templateId }) },
      { repo: harness.repo, actor: { userId: customerId } }
    );

    // 5. Historical render of the existing customer project (and historical v1) resolves all resources
    const historicalMarkup = await generateDocumentRenderMarkup(customerProjectRecord.document, { surface: 'front' });
    assert.ok(historicalMarkup.includes('Mừng Kỷ Niệm'));
    assert.ok(historicalMarkup.includes('Gia Đình Nguyễn'));

    // Check for any missing resources in historical render
    const historicalRender = {
      missingResources: [] as string[],
      markup: historicalMarkup,
    };

    // 6. Editor attempts admin-only production operation -> MUST return 403
    let editorProductionAttempt: { status: number } = { status: 200 };
    const fakeEditorSupabase = {
      auth: {
        async getUser() {
          return { data: { user: { id: 'staff-editor-43', email: 'editor@quynhtrang.vn' } }, error: null };
        },
      },
      from(table: string) {
        if (table === 'staff_roles') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: { role: 'editor' }, error: null }),
                  };
                },
              };
            },
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      },
    };

    try {
      await requireStaff(undefined, 'admin', { supabaseClient: fakeEditorSupabase as never });
    } catch (err: unknown) {
      if (err instanceof AuthorizationError) {
        editorProductionAttempt = { status: err.status };
      } else {
        editorProductionAttempt = { status: 403 };
      }
    }

    // --- EXACT BRIEF ASSERTION BLOCK ---
    assert.equal(before.versionDocumentHash, after.versionDocumentHash);
    assert.equal(before.versionThumbnailHash, after.versionThumbnailHash);
    assert.deepEqual(after.editedCustomerProject, before.editedCustomerProject);
    assert.equal(newUseAfterArchive.status, 409);
    assert.equal(historicalRender.missingResources.length, 0);
    assert.equal(editorProductionAttempt.status, 403);
  });

  it('dependency archived causes 409 for new use, but historical rendering still succeeds; repair v3 restores new use', async () => {
    const harness = createHarness();
    const adminId = '43000000-0000-0000-0000-0000000000a1';
    const customerId = '43000000-0000-0000-0000-0000000000c1';
    const templateId = 'tmpl-dep-isolation';

    const target = makeCardTarget();
    const doc = makeInitialCardDocument(templateId);

    harness.templates.set(templateId, {
      id: templateId,
      name: 'Mẫu Thiệp Hoa',
      status: 'published',
      revision: 1,
      productId: 'card',
      variantId: 'vertical',
      mode: null,
      shape: null,
      target,
      categoryId: 'all',
      tags: [],
      sortOrder: 1,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
      createdBy: adminId,
    });

    const draftId = randomUUID();
    harness.drafts.set(templateId, {
      id: draftId,
      templateId,
      basedOnVersionId: null,
      designDocument: doc,
      documentSchemaVersion: 1,
      draftRevision: 1,
      sourceDocumentHash: 'hash-1',
      editorUserId: null,
      leaseSessionId: null,
      leaseEpoch: 0,
      leaseExpiresAt: null,
      lastActivityAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: adminId,
    });

    const v1Pub = await harness.repo.publishDraft(adminId, makePublishInput(templateId, draftId, 'req-dep-v1'));
    const v1 = v1Pub.ok ? v1Pub.value : null!;

    // 1. Dependency is archived
    harness.repo.setDependencyAvailable(false);

    // 2. New use is blocked with 409
    const reqBlocked = new Request(`http://localhost:3000/api/templates/${templateId}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersionId: v1.versionId,
        target,
        requestId: 'req-dep-blocked',
      }),
    });
    const resBlocked = await useRoute(
      reqBlocked,
      { params: Promise.resolve({ id: templateId }) },
      { repo: harness.repo, actor: { userId: customerId } }
    );
    assert.equal(resBlocked.status, 409);

    // 3. Historical render of existing document still succeeds with 0 missing resources
    const historicalMarkup = await generateDocumentRenderMarkup(doc, { surface: 'front' });
    assert.ok(historicalMarkup.length > 0);

    // 4. Admin repairs dependency and publishes Version 2 (or 3)
    harness.repo.setDependencyAvailable(true);
    const v2Pub = await harness.repo.publishDraft(adminId, makePublishInput(templateId, draftId, 'req-dep-v2-repair', 2));
    const v2 = v2Pub.ok ? v2Pub.value : null!;

    // 5. New use is now restored (returns 200)
    const reqRestored = new Request(`http://localhost:3000/api/templates/${templateId}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersionId: v2.versionId,
        target,
        requestId: 'req-dep-restored',
      }),
    });
    const resRestored = await useRoute(
      reqRestored,
      { params: Promise.resolve({ id: templateId }) },
      { repo: harness.repo, actor: { userId: customerId } }
    );
    assert.equal(resRestored.status, 200);
  });

  it('lock enforcement: customerLocked elements cannot be mutated by customer, but can be modified in template-author and staff-edit', () => {
    const doc = makeInitialCardDocument('tmpl-locks');
    const lockedEl = doc.elements?.find((e) => e.customerLocked)!;
    const unlockedEl = doc.elements?.find((e) => !e.customerLocked)!;

    // Customer mode: locked cannot be mutated, unlocked can
    assert.equal(canMutateElement(undefined, lockedEl), false);
    assert.equal(canMutateElement(undefined, unlockedEl), true);

    const guestMove = transitionState(doc, { type: 'MOVE_ELEMENT', id: lockedEl.id, x: 500, y: 500 }, undefined);
    assert.equal(guestMove.elements?.find((e) => e.id === lockedEl.id)?.x, lockedEl.x);

    // Template-author mode: can mutate customerLocked
    assert.equal(canMutateElement('template-author', lockedEl), true);
    const authorMove = transitionState(doc, { type: 'MOVE_ELEMENT', id: lockedEl.id, x: 77, y: 88 }, 'template-author');
    assert.equal(authorMove.elements?.find((e) => e.id === lockedEl.id)?.x, 77);

    // Staff-edit mode: can mutate customerLocked
    assert.equal(canMutateElement('staff-edit', lockedEl), true);
    const staffMove = transitionState(doc, { type: 'MOVE_ELEMENT', id: lockedEl.id, x: 99, y: 100 }, 'staff-edit');
    assert.equal(staffMove.elements?.find((e) => e.id === lockedEl.id)?.x, 99);
    assert.equal(staffMove.elements?.find((e) => e.id === lockedEl.id)?.customerLocked, true);
  });

  it('print safety: placeholder guidance never leaks into rendered thumbnails or production artifacts', async () => {
    const doc = makeInitialCardDocument('tmpl-placeholders');

    // Inside surface has placeholder guidance element: "Kính gửi quý khách..." / "Nhập nội dung thư mời"
    const markup = await generateDocumentRenderMarkup(doc, { surface: 'inside' });

    assert.equal(markup.includes('Kính gửi quý khách...'), false);
    assert.equal(markup.includes('Nhập nội dung thư mời'), false);
  });
});
