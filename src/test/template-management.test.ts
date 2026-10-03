import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  TemplateRepository,
  type DatabaseDraftRow,
  type DatabaseTemplateRow,
  type DatabaseVersionRow,
} from '../lib/repositories/template-repository.ts';
import {
  createBlankTemplateDocument,
  TemplateManagementService,
} from '../lib/services/template-management.ts';
import {
  TemplateServiceError,
  type TemplateDraftRecord,
  type TemplateMutation,
  type TemplateRecord,
} from '../lib/domain/template.ts';
import type { DesignState } from '../lib/product-state.ts';
import type { StaffIdentity } from '../lib/domain/order.ts';
import { createTemplateTarget } from '../lib/template-target.ts';

import { GET as listTemplatesRoute, POST as createTemplateRoute } from '../app/api/admin/content/templates/route.ts';
import { GET as getTemplateRoute, PATCH as patchTemplateRoute } from '../app/api/admin/content/templates/[id]/route.ts';

function createMockEditor(): StaffIdentity {
  return {
    userId: '43000000-0000-0000-0000-0000000000e1',
    role: 'editor',
    email: 'editor@quynhtrang.test',
  };
}


describe('State 43 Task 5: Template Management', () => {
  describe('createBlankTemplateDocument', () => {
    it('creates blank document matching card target with no fake images', () => {
      const target = createTemplateTarget({
        productId: 'card',
        variantId: 'horizontal',
        mode: null,
        shape: null,
      });
      const doc = createBlankTemplateDocument(target);
      assert.equal(doc.productId, 'card');
      assert.equal(doc.variantId, 'horizontal');
      assert.equal(doc.elements?.length, 0);
      assert.equal(doc.image, null);
    });

    it('creates blank document matching wrapping target with mode', () => {
      const target = createTemplateTarget({
        productId: 'wrapping',
        variantId: 'a1',
        mode: 'pattern',
        shape: null,
      });
      const doc = createBlankTemplateDocument(target);
      assert.equal(doc.productId, 'wrapping');
      assert.equal(doc.variantId, 'a1');
      assert.equal(doc.elements?.length, 0);
      assert.equal(doc.image, null);
      const options = doc.productOptions as Record<string, unknown>;
      assert.equal(options.mode, 'pattern');
    });

    it('creates blank document matching fixed-shape sticker target', () => {
      const target = createTemplateTarget({
        productId: 'sticker',
        variantId: 'fixed-shape',
        mode: null,
        shape: 'circle',
      });
      const doc = createBlankTemplateDocument(target);
      assert.equal(doc.productId, 'sticker');
      assert.equal(doc.variantId, 'fixed-shape');
      assert.equal(doc.elements?.length, 0);
      const options = doc.productOptions as Record<string, unknown>;
      assert.equal(options.shape, 'circle');
    });
  });

  describe('TemplateRepository', () => {
    it('getTemplate queries templates table and maps record with valid target', async () => {
      const templateRow: DatabaseTemplateRow = {
        id: 'tmpl-card-1',
        name: 'Card Birthday 1',
        status: 'draft',
        revision: 1,
        product_id: 'card',
        variant_id: 'horizontal',
        product_mode: null,
        fixed_sticker_shape: null,
        category_id: 'birthday',
        tags: ['birthday', 'celebration'],
        sort_order: 10,
        target_snapshot: { productId: 'card', variantId: 'horizontal' },
        current_published_version_id: null,
        ever_published_at: null,
        created_at: '2026-10-03T10:00:00Z',
        updated_at: '2026-10-03T10:00:00Z',
        created_by: '43000000-0000-0000-0000-0000000000e1',
        updated_by: '43000000-0000-0000-0000-0000000000e1',
      };

      const mockSupabase = {
        from(table: string) {
          assert.equal(table, 'templates');
          return {
            select(_fields: string) {
              return {
                eq(_column: string, value: string) {
                  assert.equal(value, 'tmpl-card-1');
                  return {
                    async maybeSingle() {
                      return { data: templateRow, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      } as unknown as SupabaseClient;

      const repo = new TemplateRepository(mockSupabase);
      const template = await repo.getTemplate('tmpl-card-1');
      assert(template !== null);
      assert.equal(template.id, 'tmpl-card-1');
      assert.equal(template.name, 'Card Birthday 1');
      assert.equal(template.productId, 'card');
      assert.equal(template.variantId, 'horizontal');
      assert.equal(template.target.surfaces.length, 3);
      assert.equal(template.revision, 1);
    });

    it('createTemplate invokes template_create RPC and returns mapped template and draft', async () => {
      const templateRow: DatabaseTemplateRow = {
        id: 'tmpl-created-1',
        name: 'New Template',
        status: 'draft',
        revision: 1,
        product_id: 'wrapping',
        variant_id: 'a1',
        product_mode: 'pattern',
        fixed_sticker_shape: null,
        category_id: 'cute',
        tags: ['cute'],
        sort_order: 0,
        target_snapshot: {},
        current_published_version_id: null,
        ever_published_at: null,
        created_at: '2026-10-03T10:00:00Z',
        updated_at: '2026-10-03T10:00:00Z',
      };

      const draftRow: DatabaseDraftRow = {
        id: 'draft-1',
        template_id: 'tmpl-created-1',
        based_on_version_id: null,
        design_document: { productId: 'wrapping', variantId: 'a1', elements: [] },
        document_schema_version: 1,
        draft_revision: 1,
        editor_user_id: null,
        lease_session_id: null,
        lease_epoch: 0,
        lease_expires_at: null,
        last_activity_at: null,
        created_at: '2026-10-03T10:00:00Z',
        updated_at: '2026-10-03T10:00:00Z',
      };

      const mockSupabase = {
        async rpc(fn: string, params: Record<string, unknown>) {
          assert.equal(fn, 'template_create');
          assert.equal(params.p_actor, '43000000-0000-0000-0000-0000000000e1');
          assert.equal(params.p_request, 'req-1');
          return {
            data: {
              ok: true,
              template: templateRow,
              draft: draftRow,
            },
            error: null,
          };
        },
      } as unknown as SupabaseClient;

      const repo = new TemplateRepository(mockSupabase);
      const res = await repo.createTemplate('43000000-0000-0000-0000-0000000000e1', {
        requestId: 'req-1',
        id: 'tmpl-created-1',
        name: 'New Template',
        productId: 'wrapping',
        variantId: 'a1',
        productMode: 'pattern',
        fixedStickerShape: null,
        categoryId: 'cute',
        tags: ['cute'],
        sortOrder: 0,
        targetSnapshot: {},
        initialDocument: {
          productId: 'wrapping',
          variantId: 'a1',
          templateId: null,
          text: '',
          color: '#000',
          backgroundColor: '#fff',
          image: null,
          quantity: 1,
          productOptions: {},
          elements: [],
        },
      });

      assert(res.ok);
      assert.equal(res.value.template.id, 'tmpl-created-1');
      assert.equal(res.value.draft.id, 'draft-1');
      assert.equal(res.value.draft.draftRevision, 1);
    });

    it('patchMetadata invokes template_patch_metadata RPC and returns updated template', async () => {
      const updatedRow: DatabaseTemplateRow = {
        id: 'tmpl-patch-1',
        name: 'Patched Name',
        status: 'draft',
        revision: 2,
        product_id: 'card',
        variant_id: 'horizontal',
        product_mode: null,
        fixed_sticker_shape: null,
        category_id: 'thanks',
        tags: ['thanks'],
        sort_order: 20,
        target_snapshot: {},
        current_published_version_id: null,
        ever_published_at: null,
        created_at: '2026-10-03T10:00:00Z',
        updated_at: '2026-10-03T10:05:00Z',
      };

      const mockSupabase = {
        async rpc(fn: string, params: Record<string, unknown>) {
          assert.equal(fn, 'template_patch_metadata');
          assert.equal(params.p_template_id, 'tmpl-patch-1');
          assert.equal(params.p_expected_revision, 1);
          return {
            data: {
              ok: true,
              template: updatedRow,
            },
            error: null,
          };
        },
      } as unknown as SupabaseClient;

      const repo = new TemplateRepository(mockSupabase);
      const res = await repo.patchMetadata(
        '43000000-0000-0000-0000-0000000000e1',
        { templateId: 'tmpl-patch-1', expectedCatalogRevision: 1, requestId: 'req-patch-1' },
        { name: 'Patched Name', categoryId: 'thanks', sortOrder: 20 },
      );

      assert(res.ok);
      assert.equal(res.value.name, 'Patched Name');
      assert.equal(res.value.revision, 2);
    });

    it('maps RPC REVISION_CONFLICT error correctly', async () => {
      const mockSupabase = {
        async rpc() {
          return {
            data: null,
            error: new Error('REVISION_CONFLICT: template was modified by another operator'),
          };
        },
      } as unknown as SupabaseClient;

      const repo = new TemplateRepository(mockSupabase);
      const res = await repo.patchMetadata(
        '43000000-0000-0000-0000-0000000000e1',
        { templateId: 'tmpl-1', expectedCatalogRevision: 1, requestId: 'req-1' },
        { name: 'Test' },
      );

      assert.equal(res.ok, false);
      assert.equal(res.code, 'REVISION_CONFLICT');
    });
  });

  describe('TemplateManagementService', () => {
    function createMockRepo(overrides: Partial<TemplateRepository> = {}): TemplateRepository {
      const templates = new Map<string, TemplateRecord>();
      const drafts = new Map<string, TemplateDraftRecord>();
      const versions = new Map<string, DatabaseVersionRow[]>();
      const operations = new Map<string, { payloadHash: string; result: unknown }>();

      const defaultRepo = {
        async getTemplate(id: string): Promise<TemplateRecord | null> {
          return templates.get(id) ?? null;
        },
        async getDraft(templateId: string): Promise<TemplateDraftRecord | null> {
          return drafts.get(templateId) ?? null;
        },
        async listVersions(templateId: string) {
          const list = versions.get(templateId) ?? [];
          return list.map((v) => ({
            id: String(v.id),
            version: Number(v.version),
            publishedAt: v.published_at ? String(v.published_at) : String(v.created_at),
            publishedBy: v.published_by ? String(v.published_by) : null,
            revisionNote: v.revision_note ? String(v.revision_note) : null,
          }));
        },
        async listAdminTemplates() {
          const items = Array.from(templates.values());
          return { items, total: items.length };
        },
        async createTemplate(actor: string, input: any) {
          const payloadHash = JSON.stringify(input);
          const existingOp = operations.get(input.requestId);
          if (existingOp) {
            if (existingOp.payloadHash !== payloadHash) {
              return { ok: false, code: 'REVISION_CONFLICT', message: 'OPERATION_CONFLICT' };
            }
            return { ok: true, value: existingOp.result as any };
          }

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
            createdAt: '2026-10-03T10:00:00Z',
            updatedAt: '2026-10-03T10:00:00Z',
            archivedAt: null,
            createdBy: actor,
            updatedBy: actor,
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
            createdAt: '2026-10-03T10:00:00Z',
            updatedAt: '2026-10-03T10:00:00Z',
            createdBy: actor,
            updatedBy: actor,
          };

          templates.set(input.id, template);
          drafts.set(input.id, draft);

          const result = { template, draft };
          operations.set(input.requestId, { payloadHash, result });
          return { ok: true, value: result };
        },
        async patchMetadata(actor: string, mutation: TemplateMutation, patch: any) {
          const tmpl = templates.get(mutation.templateId);
          if (!tmpl) {
            return { ok: false, code: 'NOT_FOUND', message: 'Template not found' };
          }
          if (tmpl.revision !== mutation.expectedCatalogRevision) {
            return { ok: false, code: 'REVISION_CONFLICT', message: 'REVISION_CONFLICT' };
          }

          const updated: TemplateRecord = {
            ...tmpl,
            name: patch.name !== undefined ? patch.name : tmpl.name,
            categoryId: patch.categoryId !== undefined ? (patch.categoryId ?? '') : tmpl.categoryId,
            tags: patch.tags !== undefined ? patch.tags : tmpl.tags,
            sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : tmpl.sortOrder,
            revision: tmpl.revision + 1,
            updatedBy: actor,
            updatedAt: '2026-10-03T10:10:00Z',
          };

          templates.set(mutation.templateId, updated);
          return { ok: true, value: updated };
        },
        async createDraft(actor: string, mutation: TemplateMutation) {
          const existing = drafts.get(mutation.templateId);
          if (existing) {
            return { ok: true, value: existing };
          }
          const draft: TemplateDraftRecord = {
            id: `draft-${mutation.templateId}`,
            templateId: mutation.templateId,
            basedOnVersionId: null,
            designDocument: {} as any,
            documentSchemaVersion: 1,
            draftRevision: 1,
            editorUserId: null,
            leaseSessionId: null,
            leaseEpoch: 0,
            leaseExpiresAt: null,
            lastActivityAt: null,
            createdAt: '2026-10-03T10:00:00Z',
            updatedAt: '2026-10-03T10:00:00Z',
            createdBy: actor,
            updatedBy: actor,
          };
          drafts.set(mutation.templateId, draft);
          return { ok: true, value: draft };
        },
      };

      return Object.assign(defaultRepo, overrides) as unknown as TemplateRepository;
    }

    it('incomplete draft is allowed and valid target is accepted', async () => {
      const service = new TemplateManagementService(createMockRepo());
      const editor = createMockEditor();

      const incompleteDoc: DesignState = {
        productId: 'card',
        variantId: 'horizontal',
        templateId: null,
        text: '',
        color: '#000',
        backgroundColor: '#fff',
        image: null,
        quantity: 1,
        productOptions: {},
        elements: [], // 0 elements: incomplete draft!
      };

      const res = await service.createTemplate(editor, {
        requestId: 'req-inc-1',
        name: 'Incomplete Card Draft',
        target: {
          productId: 'card',
          variantId: 'horizontal',
          mode: null,
          shape: null,
        },
        initialDocument: incompleteDoc,
      });

      assert(res.template !== undefined);
      assert.equal(res.template.name, 'Incomplete Card Draft');
      assert.equal(res.draft.designDocument.elements?.length, 0);
    });

    it('rejects invalid exact target (e.g. wrapping without mode)', async () => {
      const service = new TemplateManagementService(createMockRepo());
      const editor = createMockEditor();

      await assert.rejects(
        async () => {
          await service.createTemplate(editor, {
            requestId: 'req-inv-1',
            name: 'Invalid Wrapping',
            target: {
              productId: 'wrapping',
              variantId: 'a1',
              mode: null, // wrapping requires non-null mode
              shape: null,
            },
          });
        },
        (err: unknown) => {
          assert(err instanceof TemplateServiceError);
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });

    it('rejects initial document target mismatch', async () => {
      const service = new TemplateManagementService(createMockRepo());
      const editor = createMockEditor();

      const mismatchedDoc: DesignState = {
        productId: 'notebook', // mismatch! target is card
        variantId: 'standard',
        templateId: null,
        text: '',
        color: '#000',
        backgroundColor: '#fff',
        image: null,
        quantity: 1,
        productOptions: {},
        elements: [],
      };

      await assert.rejects(
        async () => {
          await service.createTemplate(editor, {
            requestId: 'req-mis-1',
            name: 'Mismatched Target',
            target: {
              productId: 'card',
              variantId: 'horizontal',
              mode: null,
              shape: null,
            },
            initialDocument: mismatchedDoc,
          });
        },
        (err: unknown) => {
          assert(err instanceof TemplateServiceError);
          assert.equal(err.code, 'TARGET_MISMATCH');
          return true;
        },
      );
    });

    it('two create requests with same key and same identity are idempotent', async () => {
      const service = new TemplateManagementService(createMockRepo());
      const editor = createMockEditor();

      const reqInput = {
        requestId: 'idem-key-1',
        name: 'Idempotent Template',
        target: {
          productId: 'card' as const,
          variantId: 'horizontal',
          mode: null,
          shape: null,
        },
      };

      const first = await service.createTemplate(editor, reqInput);
      const second = await service.createTemplate(editor, reqInput);

      assert.equal(first.template.id, second.template.id);
      assert.equal(first.draft.id, second.draft.id);
    });

    it('changed payload with same requestId raises conflict', async () => {
      const service = new TemplateManagementService(createMockRepo());
      const editor = createMockEditor();

      await service.createTemplate(editor, {
        requestId: 'conf-key-1',
        name: 'Original Name',
        target: {
          productId: 'card',
          variantId: 'horizontal',
          mode: null,
          shape: null,
        },
      });

      await assert.rejects(
        async () => {
          await service.createTemplate(editor, {
            requestId: 'conf-key-1', // same key!
            name: 'Tampered Changed Name', // changed payload!
            target: {
              productId: 'card',
              variantId: 'horizontal',
              mode: null,
              shape: null,
            },
          });
        },
        (err: unknown) => {
          assert(err instanceof TemplateServiceError);
          assert.equal(err.code, 'REVISION_CONFLICT');
          return true;
        },
      );
    });

    it('metadata edit advances revision and leaves published artwork untouched', async () => {
      const repo = createMockRepo();
      const service = new TemplateManagementService(repo);
      const editor = createMockEditor();

      // Create template
      const created = await service.createTemplate(editor, {
        requestId: 'patch-test-1',
        id: 'tmpl-pub-1',
        name: 'Initial Name',
        categoryId: 'birthday',
        target: {
          productId: 'card',
          variantId: 'horizontal',
          mode: null,
          shape: null,
        },
      });

      assert.equal(created.template.revision, 1);

      // Patch metadata
      const patched = await service.patchTemplateMetadata(
        editor,
        {
          templateId: 'tmpl-pub-1',
          expectedCatalogRevision: 1,
          requestId: 'patch-req-1',
        },
        {
          name: 'Patched Name Only',
          categoryId: 'cute',
          tags: ['cute-card'],
          sortOrder: 42,
        },
      );

      assert.equal(patched.revision, 2);
      assert.equal(patched.name, 'Patched Name Only');
      assert.equal(patched.categoryId, 'cute');
      assert.equal(patched.sortOrder, 42);

      // CAS check on stale revision
      await assert.rejects(
        async () => {
          await service.patchTemplateMetadata(
            editor,
            {
              templateId: 'tmpl-pub-1',
              expectedCatalogRevision: 1, // Stale! Revision is now 2
              requestId: 'patch-req-2',
            },
            {
              name: 'Stale Patch',
            },
          );
        },
        (err: unknown) => {
          assert(err instanceof TemplateServiceError);
          assert.equal(err.code, 'REVISION_CONFLICT');
          return true;
        },
      );
    });

    it('getTemplateDetail returns safe staff metadata without full historical documents', async () => {
      const repo = createMockRepo();
      const service = new TemplateManagementService(repo);
      const editor = createMockEditor();

      await service.createTemplate(editor, {
        requestId: 'detail-test-1',
        id: 'tmpl-detail-1',
        name: 'Detail Test',
        target: {
          productId: 'card',
          variantId: 'horizontal',
          mode: null,
          shape: null,
        },
      });

      const detail = await service.getTemplateDetail('tmpl-detail-1');
      assert.equal(detail.template.id, 'tmpl-detail-1');
      assert(detail.draft !== null);
      assert.equal(Array.isArray(detail.versions), true);
    });

    it('validates name, category, and tags boundaries', async () => {
      const service = new TemplateManagementService(createMockRepo());
      const editor = createMockEditor();

      // Empty name
      await assert.rejects(
        async () => {
          await service.createTemplate(editor, {
            requestId: 'val-1',
            name: '   ',
            target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
          });
        },
        (err: unknown) => {
          assert(err instanceof TemplateServiceError);
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        },
      );

      // Unknown category
      await assert.rejects(
        async () => {
          await service.createTemplate(editor, {
            requestId: 'val-2',
            name: 'Valid Name',
            categoryId: 'non-existent-cat',
            target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
          });
        },
        (err: unknown) => {
          assert(err instanceof TemplateServiceError);
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        },
      );

      // Over 20 tags
      const tooManyTags = Array.from({ length: 25 }, (_, i) => `tag-${i}`);
      await assert.rejects(
        async () => {
          await service.createTemplate(editor, {
            requestId: 'val-3',
            name: 'Valid Name',
            tags: tooManyTags,
            target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
          });
        },
        (err: unknown) => {
          assert(err instanceof TemplateServiceError);
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        },
      );
    });
  });

  describe('HTTP Route Handlers', () => {
    function createMockDeps() {
      const templates = new Map<string, TemplateRecord>();
      const drafts = new Map<string, TemplateDraftRecord>();

      const mockRepo = {
        async getTemplate(id: string) {
          return templates.get(id) ?? null;
        },
        async getDraft(templateId: string) {
          return drafts.get(templateId) ?? null;
        },
        async listVersions() {
          return [];
        },
        async listAdminTemplates() {
          const items = Array.from(templates.values());
          return { items, total: items.length };
        },
        async createTemplate(actor: string, input: any) {
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
            createdAt: '2026-10-03T10:00:00Z',
            updatedAt: '2026-10-03T10:00:00Z',
            archivedAt: null,
            createdBy: actor,
            updatedBy: actor,
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
            createdAt: '2026-10-03T10:00:00Z',
            updatedAt: '2026-10-03T10:00:00Z',
            createdBy: actor,
            updatedBy: actor,
          };
          templates.set(input.id, template);
          drafts.set(input.id, draft);
          return { ok: true, value: { template, draft } };
        },
        async patchMetadata(actor: string, mutation: TemplateMutation, patch: any) {
          const tmpl = templates.get(mutation.templateId);
          if (!tmpl) return { ok: false, code: 'NOT_FOUND', message: 'Not found' };
          if (tmpl.revision !== mutation.expectedCatalogRevision) {
            return { ok: false, code: 'REVISION_CONFLICT', message: 'REVISION_CONFLICT' };
          }
          const updated: TemplateRecord = {
            ...tmpl,
            name: patch.name ?? tmpl.name,
            sortOrder: patch.sortOrder ?? tmpl.sortOrder,
            revision: tmpl.revision + 1,
            updatedBy: actor,
          };
          templates.set(mutation.templateId, updated);
          return { ok: true, value: updated };
        },
      } as unknown as TemplateRepository;

      const service = new TemplateManagementService(mockRepo);
      return {
        service,
        requireStaff: async () => createMockEditor(),
      };
    }

    it('POST /api/admin/content/templates creates catalog template with 201', async () => {
      const deps = createMockDeps();
      const req = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          name: 'Route Test Template',
          target: {
            productId: 'card',
            variantId: 'horizontal',
            mode: null,
            shape: null,
          },
          categoryId: 'floral',
          tags: ['flower'],
        }),
      });

      const res = await createTemplateRoute(req, undefined, deps);
      assert.equal(res.status, 201);
      const data = (await res.json()) as { template: TemplateRecord; draft: TemplateDraftRecord };
      assert.equal(data.template.name, 'Route Test Template');
      assert.equal(data.template.categoryId, 'floral');
      assert(data.draft.id !== undefined);
    });

    it('GET /api/admin/content/templates lists admin templates', async () => {
      const deps = createMockDeps();
      // First create one
      await deps.service.createTemplate(createMockEditor(), {
        requestId: 'list-seed-1',
        name: 'Seed 1',
        target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
      });

      const req = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'GET',
      });
      const res = await listTemplatesRoute(req, undefined, deps);
      assert.equal(res.status, 200);
      const data = (await res.json()) as { items: TemplateRecord[]; total: number };
      assert.equal(data.total, 1);
      assert.equal(data.items[0]?.name, 'Seed 1');
    });

    it('GET /api/admin/content/templates/[id] returns detail and 404 when missing', async () => {
      const deps = createMockDeps();
      await deps.service.createTemplate(createMockEditor(), {
        requestId: 'get-seed-1',
        id: 'seed-id-1',
        name: 'Seed Get',
        target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
      });

      // Existing template
      const req = new Request('http://localhost:3000/api/admin/content/templates/seed-id-1');
      const res = await getTemplateRoute(
        req,
        { params: Promise.resolve({ id: 'seed-id-1' }) },
        deps,
      );
      assert.equal(res.status, 200);
      const data = (await res.json()) as { template: TemplateRecord; draft: TemplateDraftRecord };
      assert.equal(data.template.id, 'seed-id-1');

      // Non-existing template
      const resMissing = await getTemplateRoute(
        req,
        { params: Promise.resolve({ id: 'non-existing-tmpl' }) },
        deps,
      );
      assert.equal(resMissing.status, 404);
    });

    it('PATCH /api/admin/content/templates/[id] updates metadata and enforces CAS', async () => {
      const deps = createMockDeps();
      await deps.service.createTemplate(createMockEditor(), {
        requestId: 'patch-seed-1',
        id: 'patch-id-1',
        name: 'Original Seed',
        target: { productId: 'card', variantId: 'horizontal', mode: null, shape: null },
      });

      // Successful patch
      const patchReq = new Request('http://localhost:3000/api/admin/content/templates/patch-id-1', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          expectedRevision: 1,
          name: 'Patched Route Name',
          sortOrder: 15,
        }),
      });

      const res = await patchTemplateRoute(
        patchReq,
        { params: Promise.resolve({ id: 'patch-id-1' }) },
        deps,
      );
      assert.equal(res.status, 200);
      const data = (await res.json()) as { template: TemplateRecord };
      assert.equal(data.template.name, 'Patched Route Name');
      assert.equal(data.template.revision, 2);

      // Stale revision: 409 Conflict
      const staleReq = new Request('http://localhost:3000/api/admin/content/templates/patch-id-1', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          expectedRevision: 1, // Stale! Revision is now 2
          name: 'Stale Route Patch',
        }),
      });

      const resStale = await patchTemplateRoute(
        staleReq,
        { params: Promise.resolve({ id: 'patch-id-1' }) },
        deps,
      );
      assert.equal(resStale.status, 409);
    });

    it('rejects cross-origin mutations on POST and PATCH with 403', async () => {
      const deps = createMockDeps();
      const crossOriginReq = new Request('http://localhost:3000/api/admin/content/templates', {
        method: 'POST',
        headers: {
          origin: 'https://evil.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Hacked' }),
      });

      const res = await createTemplateRoute(crossOriginReq, undefined, deps);
      assert.equal(res.status, 403);
    });
  });
});
