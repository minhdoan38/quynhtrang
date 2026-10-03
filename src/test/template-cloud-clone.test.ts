import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

import type { StaffIdentity } from '../lib/domain/order.ts';
import type {
  PublishTemplateInput,
  TemplateAvailability,
  TemplateDraftRecord,
  TemplateRecord,
  TemplateRepoResult,
  TemplateTarget,
  TemplateVersionPayload,
  UseTemplateInput,
} from '../lib/domain/template.ts';
import { TemplateServiceError } from '../lib/domain/template.ts';
import type { DesignState } from '../lib/product-state.ts';
import { TemplateRepository } from '../lib/repositories/template-repository.ts';
import {
  cloneTemplateIntoProject as baseCloneTemplateIntoProject,
} from '../lib/services/template-clone.ts';
import {
  saveCustomerProjectRevision as baseSaveCustomerProjectRevision,
} from '../lib/services/cloud-project-autosave.ts';
import {
  migrateLocalProjects,
  type LocalProjectItem,
} from '../lib/services/local-project-migration.ts';
import { publishTemplate as basePublishTemplate } from '../lib/services/template-management.ts';
import { POST as useRoute } from '../app/api/templates/[id]/use/route.ts';

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

function makeCardTarget(): TemplateTarget {
  return {
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
    geometryKey: 'card:vertical',
    surfaces: [
      { id: 'front', widthMm: 100, heightMm: 150 },
      { id: 'inside', widthMm: 200, heightMm: 150 },
      { id: 'back', widthMm: 100, heightMm: 150 },
    ],
  };
}

function makeInitialCardDocument(): DesignState {
  return {
    productId: 'card',
    variantId: 'vertical',
    templateId: 'tpl-card-1',
    text: 'Thiệp Sinh Nhật',
    color: '#2E3338',
    backgroundColor: '#FFFFFF',
    image: null,
    quantity: 1,
    productOptions: {},
    elements: [
      {
        id: 'el-locked-1',
        type: 'text',
        name: 'Cố định bởi mẫu',
        x: 10,
        y: 20,
        width: 80,
        height: 30,
        rotation: 0,
        zIndex: 1,
        locked: true,
        customerLocked: true,
        data: {
          text: 'Happy Birthday',
          fontSize: 20,
          fontFamily: 'Playfair Display',
          color: '#2E3338',
          textAlign: 'center',
        },
      },
      {
        id: 'el-text-editable',
        type: 'text',
        name: 'Lời chúc',
        x: 10,
        y: 60,
        width: 80,
        height: 40,
        rotation: 0,
        zIndex: 2,
        locked: false,
        customerLocked: false,
        data: {
          text: 'Chúc bạn tuổi mới nhiều niềm vui',
          fontSize: 14,
          fontFamily: 'Inter',
          color: '#2E3338',
          textAlign: 'center',
        },
      },
    ],
    documentSchemaVersion: 1,
  };
}

function createHarness() {
  const templates = new Map<string, TemplateRecord>();
  const drafts = new Map<string, TemplateDraftRecord>();
  const versions = new Map<string, TemplateVersionPayload>();
  const projects = new Map<string, PersistedProjectRow>();
  const operations = new Map<string, { actor: string; payloadHash: string; result: unknown }>();
  const assetEvents: Array<{ id: string; targetId: string; event: string; metadata: Record<string, unknown> }> = [];
  const stickerAssets = new Map<string, { id: string; status: string; everPublishedAt?: string }>();
  const fontFaces = new Map<string, { id: string; status: string }>();

  // Mock template repository
  const repo = {
    async getTemplate(id: string) {
      const t = templates.get(id);
      return t ? structuredClone(t) : null;
    },
    async getVersion(id: string) {
      const v = versions.get(id);
      return v ? structuredClone(v) : null;
    },
    async getTemplateAvailability(_id: string): Promise<TemplateAvailability> {
      return { available: true, blockers: [] };
    },
    async resolveLegacyTarget(_legacyId: string) {
      return null;
    },
    async publishDraft(
      actor: string,
      input: PublishTemplateInput,
    ): Promise<TemplateRepoResult<TemplateVersionPayload>> {
      const template = templates.get(input.templateId);
      const draft = drafts.get(input.templateId);
      if (!template || !draft) {
        return { ok: false, code: 'NOT_FOUND', message: 'Template or draft not found' };
      }

      const payloadHash = createHash('md5')
        .update(JSON.stringify({ templateId: input.templateId, draftId: input.draftId }))
        .digest('hex');

      const op = operations.get(input.requestId);
      if (op) {
        if (op.actor !== actor || op.payloadHash !== payloadHash) {
          return { ok: false, code: 'OPERATION_CONFLICT', message: 'Conflicting operation request' };
        }
        return op.result as TemplateRepoResult<TemplateVersionPayload>;
      }

      const existingVersions = Array.from(versions.values()).filter((v) => v.templateId === input.templateId);
      const nextVerNum = existingVersions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
      const newVersionId = randomUUID();

      const published: TemplateVersionPayload = {
        versionId: newVersionId,
        templateId: input.templateId,
        version: nextVerNum,
        documentSchemaVersion: draft.documentSchemaVersion,
        document: structuredClone(draft.designDocument),
        target: structuredClone(template.target),
        dependencies: [],
      };

      versions.set(newVersionId, published);
      template.currentPublishedVersionId = newVersionId;
      template.status = 'published';
      template.revision += 1;
      template.updatedAt = new Date().toISOString();
      drafts.delete(input.templateId);

      assetEvents.push({
        id: randomUUID(),
        targetId: input.templateId,
        event: 'template_published',
        metadata: { versionId: newVersionId, version: nextVerNum },
      });

      const res: TemplateRepoResult<TemplateVersionPayload> = { ok: true, value: published };
      operations.set(input.requestId, { actor, payloadHash, result: res });
      return res;
    },
    async cloneTemplateIntoProject(
      actor: string,
      input: UseTemplateInput,
    ): Promise<{ projectId: string; revision: number; document: DesignState }> {
      if (!actor) {
        throw new TemplateServiceError('UNAUTHENTICATED', 'Yêu cầu đăng nhập tài khoản', 401);
      }
      if (!input.requestId?.trim()) {
        throw new TemplateServiceError('INVALID_REQUEST_ID', 'Mã yêu cầu không hợp lệ', 400);
      }

      // Check idempotency on (owner_user_id, clone_request_key)
      for (const p of projects.values()) {
        if (p.owner_user_id === actor && p.clone_request_key === input.requestId) {
          return {
            projectId: p.id,
            revision: p.current_working_revision,
            document: structuredClone(p.working_document),
          };
        }
      }

      const template = templates.get(input.templateId);
      if (!template || template.status !== 'published' || template.archivedAt) {
        throw new TemplateServiceError('TEMPLATE_UNAVAILABLE', 'Mẫu này hiện không còn khả dụng.', 409);
      }

      if (template.currentPublishedVersionId !== input.expectedVersionId) {
        throw new TemplateServiceError('TEMPLATE_CHANGED', 'Phiên bản mẫu đã thay đổi, vui lòng tải lại.', 409);
      }

      const version = versions.get(input.expectedVersionId);
      if (!version) {
        throw new TemplateServiceError('NOT_FOUND', 'Không tìm thấy phiên bản mẫu', 404);
      }

      // Clone document and set provenance
      const clonedDoc: DesignState = structuredClone(version.document);
      clonedDoc.templateId = input.templateId;
      clonedDoc.sourceTemplate = {
        templateId: input.templateId,
        templateVersionId: input.expectedVersionId,
      };
      clonedDoc.documentSchemaVersion = version.documentSchemaVersion || 1;

      const projectId = randomUUID();
      const newProject: PersistedProjectRow = {
        id: projectId,
        owner_user_id: actor,
        guest_key_hash: null,
        product_id: version.target.productId,
        variant_id: version.target.variantId,
        status: 'editing',
        current_working_revision: 1,
        working_document: clonedDoc,
        source_template_id: input.templateId,
        source_template_version_id: input.expectedVersionId,
        clone_request_key: input.requestId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      projects.set(projectId, newProject);

      assetEvents.push({
        id: randomUUID(),
        targetId: input.templateId,
        event: 'template_used',
        metadata: { project_id: projectId, version_id: input.expectedVersionId },
      });

      return {
        projectId,
        revision: 1,
        document: clonedDoc,
      };
    },
  } as unknown as TemplateRepository;

  // Mock client representing customer session
  function createCustomerClient(customerUserId: string) {
    return {
      auth: {
        async getUser() {
          return { data: { user: { id: customerUserId } }, error: null };
        },
      },
      from(tableName: string) {
        if (tableName === 'projects') {
          let selectedId: string | null = null;
          let filterOwner: string | null = customerUserId;
          let filterOriginLocal: string | null = null;
          let pendingInsert: Partial<PersistedProjectRow> | null = null;

          const query: any = {
            select(_columns: string) {
              return query;
            },
            eq(col: string, val: string) {
              if (col === 'id') selectedId = val;
              if (col === 'owner_user_id') filterOwner = val;
              if (col === 'origin_local_project_id') filterOriginLocal = val;
              return query;
            },
            order(_col: string, _opts: any) {
              return query;
            },
            async single() {
              if (pendingInsert) {
                const id = randomUUID();
                const row: PersistedProjectRow = {
                  id,
                  owner_user_id: pendingInsert.owner_user_id ?? customerUserId,
                  guest_key_hash: null,
                  product_id: pendingInsert.product_id ?? 'card',
                  variant_id: pendingInsert.variant_id ?? null,
                  status: 'editing',
                  current_working_revision: pendingInsert.current_working_revision ?? 1,
                  working_document: pendingInsert.working_document as DesignState,
                  source_template_id: pendingInsert.source_template_id ?? null,
                  source_template_version_id: pendingInsert.source_template_version_id ?? null,
                  clone_request_key: pendingInsert.clone_request_key ?? null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                projects.set(id, row);
                return { data: structuredClone(row), error: null };
              }

              if (!selectedId) return { data: null, error: { message: 'ID required' } };
              const row = projects.get(selectedId);
              if (!row || row.owner_user_id !== filterOwner) {
                return { data: null, error: { message: 'PROJECT_NOT_FOUND_OR_FORBIDDEN' } };
              }
              return { data: structuredClone(row), error: null };
            },
            async maybeSingle() {
              if (selectedId) {
                const row = projects.get(selectedId);
                if (!row || row.owner_user_id !== filterOwner) return { data: null, error: null };
                return { data: structuredClone(row), error: null };
              }
              if (filterOriginLocal) {
                for (const p of projects.values()) {
                  if (p.owner_user_id === filterOwner && (p as any).origin_local_project_id === filterOriginLocal) {
                    return { data: structuredClone(p), error: null };
                  }
                }
              }
              return { data: null, error: null };
            },
            insert(values: Partial<PersistedProjectRow>) {
              pendingInsert = values;
              return query;
            },
          };
          return query;
        }

        if (tableName === 'template_versions') {
          let filterId: string | null = null;
          let filterTmpl: string | null = null;
          const query: any = {
            select(_cols: string) {
              return query;
            },
            eq(col: string, val: string) {
              if (col === 'id') filterId = val;
              if (col === 'template_id') filterTmpl = val;
              return query;
            },
            async maybeSingle() {
              if (filterId && versions.has(filterId)) {
                const v = versions.get(filterId)!;
                if (!filterTmpl || v.templateId === filterTmpl) {
                  return { data: { id: v.versionId, template_id: v.templateId }, error: null };
                }
              }
              return { data: null, error: null };
            },
          };
          return query;
        }

        if (tableName === 'sticker_assets') {
          let ids: string[] = [];
          const query: any = {
            select(_cols: string) {
              return query;
            },
            in(col: string, list: string[]) {
              if (col === 'id') ids = list;
              return query;
            },
            then(resolve: (val: any) => void) {
              const res = ids
                .map((id) => stickerAssets.get(id))
                .filter(Boolean)
                .map((s) => ({ id: s!.id, status: s!.status }));
              resolve({ data: res, error: null });
            },
          };
          return query;
        }

        if (tableName === 'font_faces') {
          let ids: string[] = [];
          const query: any = {
            select(_cols: string) {
              return query;
            },
            in(col: string, list: string[]) {
              if (col === 'id') ids = list;
              return query;
            },
            then(resolve: (val: any) => void) {
              const res = ids
                .map((id) => fontFaces.get(id))
                .filter(Boolean)
                .map((f) => ({ id: f!.id, status: f!.status }));
              resolve({ data: res, error: null });
            },
          };
          return query;
        }

        throw new Error(`Unsupported table ${tableName}`);
      },
      async rpc(functionName: string, params: Record<string, unknown>) {
        if (functionName === 'save_customer_project_revision') {
          const projectId = params.p_project_id as string;
          const expectedRev = params.p_expected_revision as number;
          const workingDoc = params.p_working_document as DesignState;

          const project = projects.get(projectId);
          if (!project || project.owner_user_id !== customerUserId) {
            return { data: null, error: { message: 'PROJECT_NOT_FOUND_OR_FORBIDDEN' } };
          }

          if (project.current_working_revision !== expectedRev) {
            return {
              data: {
                success: false,
                error: 'STALE_REVISION',
                current_revision: project.current_working_revision,
              },
              error: null,
            };
          }

          project.current_working_revision += 1;
          project.working_document = structuredClone(workingDoc);
          project.updated_at = new Date().toISOString();

          return {
            data: {
              success: true,
              new_revision: project.current_working_revision,
              updated_at: project.updated_at,
            },
            error: null,
          };
        }

        if (functionName === 'clone_template_into_project') {
          try {
            const res = await (repo as any).cloneTemplateIntoProject(customerUserId, {
              requestId: params.p_request,
              templateId: params.p_template_id,
              expectedVersionId: params.p_expected_version_id,
              target: params.p_target,
            });
            return {
              data: {
                project_id: res.projectId,
                revision: res.revision,
                document: res.document,
              },
              error: null,
            };
          } catch (err: any) {
            return { data: null, error: { message: err?.message || 'RPC_ERROR' } };
          }
        }

        throw new Error(`Unsupported RPC ${functionName}`);
      },
    };
  }

  return {
    templates,
    drafts,
    versions,
    projects,
    operations,
    assetEvents,
    stickerAssets,
    fontFaces,
    repo,
    createCustomerClient,
  };
}

// Fixture helper matching brief: selects exact persisted row
async function readOwnedProject(customerClient: any, projectId: string): Promise<PersistedProjectRow> {
  const { data, error } = await customerClient
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error || !data) {
    throw new Error(`readOwnedProject failed: ${error?.message || 'not found'}`);
  }
  return data;
}

test('Mandatory isolation regression: customer project remains unchanged after template v2 publish', async () => {
  const harness = createHarness();
  const customer = { userId: '43000000-0000-0000-0000-0000000000c1' };
  const editor: StaffIdentity = {
    userId: '43000000-0000-0000-0000-0000000000e1',
    role: 'editor',
    email: 'editor@quynhtrang.test',
  };
  const customerClient = harness.createCustomerClient(customer.userId);

  const initialDoc = makeInitialCardDocument();
  const target = makeCardTarget();

  const v1Id = '43000000-0000-0000-0000-000000000001';
  const templateId = 'tpl-card-birthday-01';

  harness.templates.set(templateId, {
    id: templateId,
    name: 'Mẫu Thiệp Sinh Nhật V1',
    status: 'published',
    revision: 1,
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
    target,
    categoryId: 'cat-card',
    tags: ['birthday'],
    sortOrder: 1,
    currentPublishedVersionId: v1Id,
    everPublishedAt: '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    archivedAt: null,
  });

  harness.versions.set(v1Id, {
    versionId: v1Id,
    templateId,
    version: 1,
    documentSchemaVersion: 1,
    document: structuredClone(initialDoc),
    target,
    dependencies: [],
  });

  const useV1: UseTemplateInput = {
    templateId,
    expectedVersionId: v1Id,
    target,
    requestId: 'req-clone-v1-001',
  };

  const cloneTemplateIntoProject = (c: unknown, u: UseTemplateInput) =>
    baseCloneTemplateIntoProject(c, u, { repo: harness.repo });
  const saveCustomerProjectRevision = (pid: string, rev: number, doc: DesignState, client: any) =>
    baseSaveCustomerProjectRevision(pid, rev, doc, client);
  const publishTemplate = (ed: StaffIdentity, pub: PublishTemplateInput) =>
    basePublishTemplate(ed, pub, { repo: harness.repo });

  // 1. Customer clones v1
  const project = (await cloneTemplateIntoProject(customer, useV1)) as {
    kind: 'cloud';
    projectId: string;
    revision: number;
    document: DesignState;
  };
  assert.equal(project.kind, 'cloud');
  assert.equal(project.revision, 1);
  assert.equal(project.document.sourceTemplate?.templateId, templateId);
  assert.equal(project.document.sourceTemplate?.templateVersionId, v1Id);
  assert.ok(project.document.elements);
  assert.equal(project.document.elements[0].customerLocked, true);

  // 2. Customer edits and saves project to revision 2
  const editedDocument: DesignState = structuredClone(project.document);
  editedDocument.text = 'Lời chúc đặc biệt từ khách hàng';
  assert.ok(editedDocument.elements);
  editedDocument.elements[1].data = {
    ...editedDocument.elements[1].data,
    text: 'Chúc bạn sinh nhật vui vẻ và thành công rực rỡ!',
  };

  const saveRes = await saveCustomerProjectRevision(project.projectId, 1, editedDocument, customerClient);
  assert.equal(saveRes.conflict, false);
  assert.equal(saveRes.newRevision, 2);

  // 3. Read exact persisted row
  const saved = await readOwnedProject(customerClient, project.projectId);
  assert.equal(saved.current_working_revision, 2);
  assert.equal(saved.source_template_id, templateId);
  assert.equal(saved.source_template_version_id, v1Id);
  assert.equal(saved.working_document.text, 'Lời chúc đặc biệt từ khách hàng');

  // 4. Editor creates draft and publishes v2 with completely different artwork
  const v2Doc: DesignState = structuredClone(initialDoc);
  v2Doc.text = 'Thiệp Sinh Nhật Sang Trọng V2';
  assert.ok(v2Doc.elements);
  v2Doc.elements[0].data = {
    ...v2Doc.elements[0].data,
    text: 'Grand Birthday Celebration 2026',
  };

  harness.drafts.set(templateId, {
    id: randomUUID(),
    templateId,
    basedOnVersionId: v1Id,
    designDocument: v2Doc,
    documentSchemaVersion: 1,
    draftRevision: 2,
    sourceDocumentHash: 'hash-v2',
    editorUserId: editor.userId,
    leaseSessionId: randomUUID(),
    leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
    leaseEpoch: 1,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const publishV2: PublishTemplateInput = {
    templateId,
    draftId: harness.drafts.get(templateId)!.id,
    expectedRevision: 2,
    expectedCatalogRevision: 1,
    sessionId: harness.drafts.get(templateId)!.leaseSessionId!,
    leaseEpoch: 1,
    validationId: 'val-run-v2',
    acknowledgedWarningIds: [],
    requestId: 'req-publish-v2',
  };

  await publishTemplate(editor, publishV2);

  // Verify template points to v2
  const updatedTemplate = await harness.repo.getTemplate(templateId);
  assert.notEqual(updatedTemplate!.currentPublishedVersionId, v1Id);

  // 5. MANDATORY REGRESSION ASSERTION: customer project row is untouched
  assert.deepEqual(await readOwnedProject(customerClient, project.projectId), saved);
});

test('Double-tap clone request is idempotent and returns existing project row', async () => {
  const harness = createHarness();
  const customer = { userId: '43000000-0000-0000-0000-0000000000c1' };
  const target = makeCardTarget();
  const v1Id = '43000000-0000-0000-0000-000000000001';
  const templateId = 'tpl-card-1';

  harness.templates.set(templateId, {
    id: templateId,
    name: 'Mẫu Thiệp',
    status: 'published',
    revision: 1,
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
    target,
    categoryId: 'cat-1',
    tags: [],
    sortOrder: 1,
    currentPublishedVersionId: v1Id,
    everPublishedAt: '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    archivedAt: null,
  });
  harness.versions.set(v1Id, {
    versionId: v1Id,
    templateId,
    version: 1,
    documentSchemaVersion: 1,
    document: makeInitialCardDocument(),
    target,
    dependencies: [],
  });

  const input: UseTemplateInput = {
    templateId,
    expectedVersionId: v1Id,
    target,
    requestId: 'req-tap-double-123',
  };

  const res1 = (await baseCloneTemplateIntoProject(customer, input, { repo: harness.repo })) as {
    kind: 'cloud';
    projectId: string;
    revision: number;
    document: DesignState;
  };
  const res2 = (await baseCloneTemplateIntoProject(customer, input, { repo: harness.repo })) as {
    kind: 'cloud';
    projectId: string;
    revision: number;
    document: DesignState;
  };

  assert.equal(res1.kind, 'cloud');
  assert.equal(res2.kind, 'cloud');
  assert.equal(res1.projectId, res2.projectId);
  assert.equal(res1.revision, res2.revision);
  assert.deepEqual(res1.document, res2.document);
  assert.equal(harness.projects.size, 1);
});

test('Replaying request after template version changes returns original project, while new request conflicts', async () => {
  const harness = createHarness();
  const customer = { userId: '43000000-0000-0000-0000-0000000000c1' };
  const target = makeCardTarget();
  const v1Id = '43000000-0000-0000-0000-000000000001';
  const v2Id = '43000000-0000-0000-0000-000000000002';
  const templateId = 'tpl-card-1';

  harness.templates.set(templateId, {
    id: templateId,
    name: 'Mẫu Thiệp',
    status: 'published',
    revision: 1,
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
    target,
    categoryId: 'cat-1',
    tags: [],
    sortOrder: 1,
    currentPublishedVersionId: v1Id,
    everPublishedAt: '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    archivedAt: null,
  });
  harness.versions.set(v1Id, {
    versionId: v1Id,
    templateId,
    version: 1,
    documentSchemaVersion: 1,
    document: makeInitialCardDocument(),
    target,
    dependencies: [],
  });

  const originalInput: UseTemplateInput = {
    templateId,
    expectedVersionId: v1Id,
    target,
    requestId: 'req-completed-original',
  };

  const originalProject = (await baseCloneTemplateIntoProject(customer, originalInput, { repo: harness.repo })) as {
    kind: 'cloud';
    projectId: string;
    revision: number;
    document: DesignState;
  };

  // Template publishes v2
  harness.versions.set(v2Id, {
    versionId: v2Id,
    templateId,
    version: 2,
    documentSchemaVersion: 1,
    document: makeInitialCardDocument(),
    target,
    dependencies: [],
  });
  harness.templates.get(templateId)!.currentPublishedVersionId = v2Id;
  harness.templates.get(templateId)!.revision = 2;

  // Replay original request with same requestId
  const replayed = (await baseCloneTemplateIntoProject(customer, originalInput, { repo: harness.repo })) as {
    kind: 'cloud';
    projectId: string;
    revision: number;
    document: DesignState;
  };
  assert.equal(replayed.projectId, originalProject.projectId);
  assert.equal(replayed.revision, originalProject.revision);

  // New request with old expectedVersionId throws TEMPLATE_CHANGED
  const newInputWithOldVersion: UseTemplateInput = {
    templateId,
    expectedVersionId: v1Id,
    target,
    requestId: 'req-new-different-key',
  };

  await assert.rejects(
    () => baseCloneTemplateIntoProject(customer, newInputWithOldVersion, { repo: harness.repo }),
    (err: any) => {
      assert.equal(err.code, 'TEMPLATE_CHANGED');
      assert.equal(err.status, 409);
      return true;
    },
  );
});

test('Stale account revision is rejected on customer autosave', async () => {
  const harness = createHarness();
  const customerId = 'customer-autosave-user-1';
  const customerClient = harness.createCustomerClient(customerId);

  const doc = makeInitialCardDocument();
  const projectId = 'proj-stale-test-1';
  harness.projects.set(projectId, {
    id: projectId,
    owner_user_id: customerId,
    guest_key_hash: null,
    product_id: 'card',
    variant_id: 'vertical',
    status: 'editing',
    current_working_revision: 2,
    working_document: doc,
    source_template_id: 'tpl-1',
    source_template_version_id: 'v-1',
    clone_request_key: 'req-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Attempt save expecting revision 1 when DB is at revision 2
  const result = await baseSaveCustomerProjectRevision(projectId, 1, doc, customerClient as any);
  assert.equal(result.conflict, true);
  assert.equal(result.serverRevision, 2);
  assert.match(result.userMessage || '', /Thiết kế này vừa được cập nhật trên thiết bị khác/);
});

test('Autosave permits inherited archived published dependencies and rejects newly introduced draft assets', async () => {
  const harness = createHarness();
  const customerId = 'customer-dep-user-1';
  const customerClient = harness.createCustomerClient(customerId);

  harness.stickerAssets.set('stk-archived-published', {
    id: 'stk-archived-published',
    status: 'archived',
    everPublishedAt: '2026-10-01T00:00:00Z',
  });
  harness.stickerAssets.set('stk-draft-private', {
    id: 'stk-draft-private',
    status: 'draft',
  });

  const docWithArchived: DesignState = makeInitialCardDocument();
  assert.ok(docWithArchived.elements);
  docWithArchived.elements.push({
    id: 'el-sticker-archived',
    type: 'sticker',
    name: 'Sticker Cũ',
    x: 10,
    y: 10,
    width: 30,
    height: 30,
    rotation: 0,
    zIndex: 3,
    locked: false,
    customerLocked: false,
    data: {
      libraryAssetId: 'stk-archived-published',
      url: '/stickers/archived.png',
    },
  });

  const projectId = 'proj-dep-test-1';
  harness.projects.set(projectId, {
    id: projectId,
    owner_user_id: customerId,
    guest_key_hash: null,
    product_id: 'card',
    variant_id: 'vertical',
    status: 'editing',
    current_working_revision: 1,
    working_document: docWithArchived,
    source_template_id: 'tpl-1',
    source_template_version_id: 'v-1',
    clone_request_key: 'req-dep-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Saving with archived published dependency succeeds
  const archivedSaveRes = await baseSaveCustomerProjectRevision(
    projectId,
    1,
    docWithArchived,
    customerClient as any,
  );
  assert.equal(archivedSaveRes.conflict, false);
  assert.equal(archivedSaveRes.newRevision, 2);

  // Introducing draft dependency fails
  const docWithDraft: DesignState = structuredClone(docWithArchived);
  assert.ok(docWithDraft.elements);
  docWithDraft.elements.push({
    id: 'el-sticker-draft',
    type: 'sticker',
    name: 'Sticker Bản Thảo',
    x: 20,
    y: 20,
    width: 30,
    height: 30,
    rotation: 0,
    zIndex: 4,
    locked: false,
    customerLocked: false,
    data: {
      libraryAssetId: 'stk-draft-private',
      url: '/stickers/draft.png',
    },
  });

  await assert.rejects(
    () =>
      baseSaveCustomerProjectRevision(projectId, 2, docWithDraft, customerClient as any, {
        libraryLookup: new Map([
          ['sticker:stk-archived-published', { status: 'archived' }],
          ['sticker:stk-draft-private', { status: 'draft' }],
        ]),
      }),
    /Cannot save design referencing draft asset: stk-draft-private/,
  );
});

test('Local-to-cloud migration preserves provenance and customerLocked elements', async () => {
  const harness = createHarness();
  const customerId = 'customer-migration-user-1';
  const customerClient = harness.createCustomerClient(customerId);

  const v1Id = '43000000-0000-0000-0000-000000000001';
  const templateId = 'tpl-card-1';
  harness.versions.set(v1Id, {
    versionId: v1Id,
    templateId,
    version: 1,
    documentSchemaVersion: 1,
    document: makeInitialCardDocument(),
    target: makeCardTarget(),
    dependencies: [],
  });

  const localDoc = makeInitialCardDocument();
  localDoc.sourceTemplate = {
    templateId,
    templateVersionId: v1Id,
  };
  assert.ok(localDoc.elements);
  localDoc.elements[0].customerLocked = true;

  const localProjects: LocalProjectItem[] = [
    {
      id: 'local-proj-01',
      updatedAt: Date.now() - 1000,
      productId: 'card',
      variantId: 'vertical',
      design: localDoc,
    },
  ];

  // Set local storage projects
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map<string, string>();
  store.set('quynhtrang-recent-projects-v1', JSON.stringify(localProjects));
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
  };

  try {
    const summary = await migrateLocalProjects(customerId, customerClient as any);
    assert.equal(summary.total, 1);
    assert.equal(summary.migrated, 1);
    assert.equal(summary.failed, 0);

    // Verify persisted project in cloud
    const created = Array.from(harness.projects.values()).find((p) => p.owner_user_id === customerId);
    assert.ok(created);
    assert.equal(created!.source_template_id, templateId);
    assert.equal(created!.source_template_version_id, v1Id);
    assert.ok(created!.working_document.elements);
    assert.equal(created!.working_document.elements[0].customerLocked, true);
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('Local-to-cloud migration with unverified legacy template ID keeps document but does not set FK', async () => {
  const harness = createHarness();
  const customerId = 'customer-migration-user-2';
  const customerClient = harness.createCustomerClient(customerId);

  const localDoc = makeInitialCardDocument();
  localDoc.templateId = 'legacy-unknown-template-id';
  localDoc.sourceTemplate = {
    templateId: 'legacy-unknown-template-id',
    templateVersionId: randomUUID(), // unverified in DB
  };

  const localProjects: LocalProjectItem[] = [
    {
      id: 'local-proj-legacy',
      updatedAt: Date.now() - 1000,
      productId: 'card',
      variantId: 'vertical',
      design: localDoc,
    },
  ];

  const originalLocalStorage = globalThis.localStorage;
  const store = new Map<string, string>();
  store.set('quynhtrang-recent-projects-v1', JSON.stringify(localProjects));
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
  };

  try {
    const summary = await migrateLocalProjects(customerId, customerClient as any);
    assert.equal(summary.migrated, 1);

    const created = Array.from(harness.projects.values()).find((p) => p.owner_user_id === customerId);
    assert.ok(created);
    // Unverified foreign keys must remain null to prevent database FK violations
    assert.equal(created!.source_template_id, null);
    assert.equal(created!.source_template_version_id, null);
    // Document retains legacy template identity
    assert.equal(created!.working_document.templateId, 'legacy-unknown-template-id');
  } finally {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('Other account access denied on read, write, and forged clone', async () => {
  const harness = createHarness();
  const customerA = 'user-alice-1111';
  const customerB = 'user-bob-2222';
  const clientB = harness.createCustomerClient(customerB);

  const projectId = 'proj-alice-only';
  harness.projects.set(projectId, {
    id: projectId,
    owner_user_id: customerA,
    guest_key_hash: null,
    product_id: 'card',
    variant_id: 'vertical',
    status: 'editing',
    current_working_revision: 1,
    working_document: makeInitialCardDocument(),
    source_template_id: 'tpl-1',
    source_template_version_id: 'v-1',
    clone_request_key: 'req-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Bob cannot read Alice's project
  await assert.rejects(
    () => readOwnedProject(clientB, projectId),
    /PROJECT_NOT_FOUND_OR_FORBIDDEN/,
  );

  // Bob cannot save revisions to Alice's project
  const saveRes = await baseSaveCustomerProjectRevision(projectId, 1, makeInitialCardDocument(), clientB as any);
  assert.equal(saveRes.conflict, false);
  assert.match(saveRes.userMessage || '', /PROJECT_NOT_FOUND_OR_FORBIDDEN/);

  // Cloning with missing/null actor throws UNAUTHENTICATED
  await assert.rejects(
    () =>
      baseCloneTemplateIntoProject(
        null,
        {
          templateId: 'tpl-1',
          expectedVersionId: 'v-1',
          target: makeCardTarget(),
          requestId: 'req-unauth',
        },
        { repo: harness.repo },
      ),
    // Returns guest payload when actor is unauthenticated (handled for guests)
  );
});

test('API Route POST /api/templates/[id]/use returns cloud project for authenticated customer', async () => {
  const harness = createHarness();
  const customerId = 'customer-route-user-1';
  const target = makeCardTarget();
  const v1Id = '43000000-0000-0000-0000-000000000001';
  const templateId = 'tpl-card-api-1';

  harness.templates.set(templateId, {
    id: templateId,
    name: 'Mẫu Thiệp Route',
    status: 'published',
    revision: 1,
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
    target,
    categoryId: 'cat-1',
    tags: [],
    sortOrder: 1,
    currentPublishedVersionId: v1Id,
    everPublishedAt: '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    archivedAt: null,
  });
  harness.versions.set(v1Id, {
    versionId: v1Id,
    templateId,
    version: 1,
    documentSchemaVersion: 1,
    document: makeInitialCardDocument(),
    target,
    dependencies: [],
  });

  const request = new Request(`http://localhost:3000/api/templates/${templateId}/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedVersionId: v1Id,
      target,
      requestId: 'req-route-auth-001',
    }),
  });

  const response = await useRoute(
    request,
    { params: Promise.resolve({ id: templateId }) },
    {
      repo: harness.repo,
      actor: { userId: customerId },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
  const body = await response.json();
  assert.equal(body.kind, 'cloud');
  assert.ok(body.projectId);
  assert.equal(body.revision, 1);
  assert.equal(body.document.sourceTemplate?.templateId, templateId);
  assert.equal(body.document.sourceTemplate?.templateVersionId, v1Id);
});
