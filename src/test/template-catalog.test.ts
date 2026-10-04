import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createTemplateTarget } from '../lib/template-target.ts';
import {
  TemplateRepository,
  type DatabaseTemplateRow,
  type DatabaseVersionRow,
} from '../lib/repositories/template-repository.ts';
import { CatalogRepository } from '../lib/repositories/catalog-repository.ts';
import type {
  TemplateCard,
} from '../lib/domain/template.ts';
import { GET as getTemplatesRoute } from '../app/api/templates/route.ts';
import { GET as getTemplateByIdRoute } from '../app/api/templates/[id]/route.ts';
import { GET as getVersionRoute } from '../app/api/templates/versions/[versionId]/route.ts';
import { createInitialState } from '../lib/product-state.ts';

interface MockDependency {
  kind: 'font-face' | 'sticker';
  assetId: string;
  familyId?: string;
  checksum?: string;
}

interface MockAssetStatus {
  id: string;
  status: 'draft' | 'published' | 'archived';
  checksum?: string;
  familyId?: string;
}

function createLocalCatalogFixtureHarness() {
  const templates = new Map<string, DatabaseTemplateRow & { thumbnail_path?: string | null }>();
  const versions = new Map<string, DatabaseVersionRow & { thumbnail_path?: string | null }>();
  const versionDeps = new Map<string, MockDependency[]>();
  const fontFaces = new Map<string, MockAssetStatus>();
  const fontFamilies = new Map<string, MockAssetStatus>();
  const stickers = new Map<string, MockAssetStatus>();
  const projects = new Map<
    string,
    {
      id: string;
      user_id: string;
      source_template_version_id?: string | null;
      working_document?: Record<string, unknown>;
    }
  >();

  let availabilityRpcError: Error | null = null;

  function evaluateAvailability(templateId: string): { available: boolean; blockers: unknown[] } {
    const tmpl = templates.get(templateId);
    if (!tmpl) return { available: false, blockers: [{ code: 'NOT_FOUND' }] };
    if (tmpl.status !== 'published' || tmpl.archived_at) {
      return { available: false, blockers: [{ code: 'TEMPLATE_ARCHIVED' }] };
    }
    if (!tmpl.current_published_version_id) {
      return { available: false, blockers: [{ code: 'NO_PUBLISHED_VERSION' }] };
    }
    const ver = versions.get(tmpl.current_published_version_id);
    if (!ver) {
      return { available: false, blockers: [{ code: 'NO_PUBLISHED_VERSION' }] };
    }

    const blockers: unknown[] = [];
    const deps = versionDeps.get(ver.id) ?? [];
    for (const dep of deps) {
      if (dep.kind === 'sticker') {
        const stk = stickers.get(dep.assetId);
        if (!stk || stk.status !== 'published') {
          blockers.push({ code: 'ARCHIVED_DEPENDENCY', kind: 'sticker', id: dep.assetId });
        }
      } else if (dep.kind === 'font-face') {
        const face = fontFaces.get(dep.assetId);
        if (!face || face.status !== 'published') {
          blockers.push({ code: 'ARCHIVED_DEPENDENCY', kind: 'font-face', id: dep.assetId });
        }
        if (face?.familyId) {
          const fam = fontFamilies.get(face.familyId);
          if (!fam || fam.status !== 'published') {
            blockers.push({ code: 'ARCHIVED_DEPENDENCY', kind: 'font-face', id: face.familyId });
          }
        }
      }
    }

    return { available: blockers.length === 0, blockers };
  }

  function executeBrowseSql(params: {
    p_product_id?: string | null;
    p_variant_id?: string | null;
    p_mode?: string | null;
    p_shape?: string | null;
    p_category_id?: string | null;
    p_query?: string | null;
    p_cursor_sort_order?: number | null;
    p_cursor_id?: string | null;
    p_limit?: number;
  }) {
    const all = Array.from(templates.values());
    const filtered = all.filter((t) => {
      if (t.status !== 'published' || t.archived_at) return false;
      if (!t.current_published_version_id) return false;

      // target matching
      if (params.p_product_id && t.product_id !== params.p_product_id) return false;
      if (params.p_variant_id && t.variant_id !== params.p_variant_id) return false;
      // mode matching
      if (params.p_mode !== undefined && params.p_mode !== null) {
        if (params.p_mode === 'none') {
          if (t.product_mode !== null && t.product_mode !== undefined) return false;
        } else if (t.product_mode !== params.p_mode) {
          return false;
        }
      }

      // shape matching
      if (params.p_shape !== undefined && params.p_shape !== null) {
        if (params.p_shape === 'none') {
          if (t.fixed_sticker_shape !== null && t.fixed_sticker_shape !== undefined) return false;
        } else if (t.fixed_sticker_shape !== params.p_shape) {
          return false;
        }
      }
      // category
      if (params.p_category_id && params.p_category_id !== 'all' && t.category_id !== params.p_category_id) return false;

      // query
      if (params.p_query && params.p_query.trim()) {
        const q = params.p_query.trim().toLowerCase();
        const nameMatch = t.name.toLowerCase().includes(q);
        const idMatch = t.id.toLowerCase().includes(q);
        const tagMatch = Array.isArray(t.tags) && t.tags.some((tg) => tg.toLowerCase() === q);
        if (!nameMatch && !idMatch && !tagMatch) return false;
      }

      // availability check before LIMIT
      const avail = evaluateAvailability(t.id);
      if (!avail.available) return false;

      return true;
    });

    // Keyset sort: sort_order asc, id asc
    filtered.sort((a, b) => {
      const soDiff = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
      if (soDiff !== 0) return soDiff;
      return a.id.localeCompare(b.id);
    });

    // Cursor pagination
    let afterCursor = filtered;
    if (params.p_cursor_sort_order !== null && params.p_cursor_sort_order !== undefined && params.p_cursor_id) {
      afterCursor = filtered.filter((t) => {
        const tSort = Number(t.sort_order ?? 0);
        if (tSort > params.p_cursor_sort_order!) return true;
        if (tSort === params.p_cursor_sort_order! && t.id > params.p_cursor_id!) return true;
        return false;
      });
    }

    const limit = params.p_limit ?? 24;
    const pageRows = afterCursor.slice(0, limit);

    return pageRows.map((t) => {
      const ver = versions.get(t.current_published_version_id!);
      return {
        id: t.id,
        slug: t.slug ?? t.id,
        name: t.name,
        product_id: t.product_id,
        variant_id: t.variant_id,
        product_mode: t.product_mode,
        fixed_sticker_shape: t.fixed_sticker_shape,
        category_id: t.category_id,
        tags: t.tags ?? [],
        sort_order: Number(t.sort_order ?? 0),
        thumbnail_path: ver?.thumbnail_path ?? t.thumbnail_path ?? null,
        target_snapshot: t.target_snapshot ?? null,
        updated_at: t.updated_at,
      };
    });
  }

  const mockClient = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'browse_available_templates') {
        const rows = executeBrowseSql(args as Parameters<typeof executeBrowseSql>[0]);
        return { data: rows, error: null };
      }
      if (fn === 'get_template_availability') {
        if (availabilityRpcError) {
          return { data: null, error: availabilityRpcError };
        }
        const templateId = String(args.p_template_id);
        const avail = evaluateAvailability(templateId);
        return { data: avail, error: null };
      }
      return { data: null, error: new Error(`Unknown RPC ${fn}`) };
    },
    from: (table: string) => {
      return {
        select: (cols: string) => {
          let rows: unknown[] = [];
          if (table === 'templates') {
            rows = Array.from(templates.values());
          } else if (table === 'template_versions') {
            rows = Array.from(versions.values());
          } else if (table === 'projects') {
            rows = Array.from(projects.values());
          }

          const builder = {
            eq: (col: string, val: unknown) => {
              rows = rows.filter((r) => {
                const rec = r as Record<string, unknown>;
                return rec[col] === val;
              });
              return builder;
            },
            is: (col: string, val: unknown) => {
              rows = rows.filter((r) => {
                const rec = r as Record<string, unknown>;
                return rec[col] === val;
              });
              return builder;
            },
            not: (col: string, op: string, val: unknown) => {
              if (op === 'is' && val === null) {
                rows = rows.filter((r) => {
                  const rec = r as Record<string, unknown>;
                  return rec[col] !== null && rec[col] !== undefined;
                });
              }
              return builder;
            },
            or: (clause: string) => {
              // basic match for query / id
              return builder;
            },
            order: (col: string, opts?: { ascending?: boolean }) => {
              return builder;
            },
            maybeSingle: async () => {
              return { data: rows[0] ?? null, error: null };
            },
            then: (resolve: (val: { data: unknown[]; error: null }) => void) => {
              resolve({ data: rows, error: null });
            },
          };
          return builder;
        },
      };
    },
  };

  const templateRepo = new TemplateRepository(mockClient as unknown as SupabaseClient);
  const catalogRepo = new CatalogRepository(mockClient as unknown as SupabaseClient);

  return {
    templates,
    versions,
    versionDeps,
    fontFaces,
    fontFamilies,
    stickers,
    projects,
    templateRepo,
    catalogRepo,
    archiveReferencedSticker: async (stickerId: string) => {
      const stk = stickers.get(stickerId);
      if (stk) {
        stk.status = 'archived';
      }
    },
    archiveReferencedFont: async (faceId: string) => {
      const face = fontFaces.get(faceId);
      if (face) {
        face.status = 'archived';
      }
    },
    setAvailabilityRpcError: (err: Error | null) => {
      availabilityRpcError = err;
    },
  };
}

describe('State 43 Task 15: Available-only catalog and current-version preview', () => {
  it('browseAvailableTemplates filters exact target and hides when dependency is archived (Case test)', async () => {
    const harness = createLocalCatalogFixtureHarness();

    const circleTarget = createTemplateTarget({
      productId: 'sticker',
      variantId: 'fixed-shape',
      mode: null,
      shape: 'circle',
    });

    const squareTarget = createTemplateTarget({
      productId: 'sticker',
      variantId: 'fixed-shape',
      mode: null,
      shape: 'square',
    });

    const stickerId = 'sticker-cat-1';
    harness.stickers.set(stickerId, { id: stickerId, status: 'published' });

    const templateId = 'tmpl-sticker-circle';
    const versionId = '43000000-0000-0000-0000-000000000001';

    // 1. Circle template with dependency sticker
    harness.templates.set(templateId, {
      id: templateId,
      name: 'Sticker Mèo Tròn',
      product_id: 'sticker',
      variant_id: 'fixed-shape',
      product_mode: null,
      fixed_sticker_shape: 'circle',
      status: 'published',
      sort_order: 1,
      current_published_version_id: versionId,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
      thumbnail_path: 'https://storage.local/thumb-circle.png',
    });

    const docState = { ...createInitialState('sticker'), variantId: 'fixed-shape' };
    harness.versions.set(versionId, {
      id: versionId,
      template_id: templateId,
      version: 1,
      design_document: docState as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
      thumbnail_path: 'https://storage.local/thumb-circle.png',
    });

    harness.versionDeps.set(versionId, [
      { kind: 'sticker', assetId: stickerId },
    ]);

    // 2. Square template
    const squareTemplateId = 'tmpl-sticker-square';
    const squareVersionId = '43000000-0000-0000-0000-000000000002';
    harness.templates.set(squareTemplateId, {
      id: squareTemplateId,
      name: 'Sticker Vuông Đơn Giản',
      product_id: 'sticker',
      variant_id: 'fixed-shape',
      product_mode: null,
      fixed_sticker_shape: 'square',
      status: 'published',
      sort_order: 2,
      current_published_version_id: squareVersionId,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    });
    harness.versions.set(squareVersionId, {
      id: squareVersionId,
      template_id: squareTemplateId,
      version: 1,
      design_document: { ...createInitialState('sticker'), variantId: 'fixed-shape' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
    });

    // Test case from brief:
    const catalog = harness.catalogRepo;
    const first = await catalog.browseAvailableTemplates({ target: circleTarget, limit: 1 });

    assert.equal(first.items.length, 1);
    assert.equal(first.items[0]?.target.shape, 'circle');
    assert.ok(first.items.every((x) => !('document' in x)));
    assert.ok(first.items.every((x) => !('design_document' in x)));

    // Archive the referenced sticker
    await harness.archiveReferencedSticker(stickerId);

    // Template MUST disappear from available catalog!
    const afterArchive = await catalog.browseAvailableTemplates({ target: circleTarget });
    assert.equal(afterArchive.items.some((x) => x.id === templateId), false);
  });

  it('hides template when referenced font family is archived', async () => {
    const harness = createLocalCatalogFixtureHarness();

    const cardTarget = createTemplateTarget({
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
    });

    const faceId = 'font-face-1';
    const familyId = 'font-family-1';
    harness.fontFamilies.set(familyId, { id: familyId, status: 'published' });
    harness.fontFaces.set(faceId, { id: faceId, status: 'published', familyId });

    const tmplId = 'tmpl-card-font';
    const verId = '43000000-0000-0000-0000-000000000003';
    harness.templates.set(tmplId, {
      id: tmplId,
      name: 'Thiệp Cảm Ơn Sang Trọng',
      product_id: 'card',
      variant_id: 'horizontal',
      status: 'published',
      sort_order: 1,
      current_published_version_id: verId,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    });
    harness.versions.set(verId, {
      id: verId,
      template_id: tmplId,
      version: 1,
      design_document: { ...createInitialState('card'), variantId: 'horizontal' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
    });
    harness.versionDeps.set(verId, [
      { kind: 'font-face', assetId: faceId, familyId },
    ]);

    const res1 = await harness.templateRepo.browseAvailableTemplates({ target: cardTarget });
    assert.equal(res1.items.some((t) => t.id === tmplId), true);

    // Archive the parent font family
    const fam = harness.fontFamilies.get(familyId);
    if (fam) fam.status = 'archived';

    const res2 = await harness.templateRepo.browseAvailableTemplates({ target: cardTarget });
    assert.equal(res2.items.some((t) => t.id === tmplId), false);
  });

  it('supports stable keyset pagination across multiple pages with cursor', async () => {
    const harness = createLocalCatalogFixtureHarness();

    // Create 3 available templates
    for (let i = 1; i <= 3; i++) {
      const id = `tmpl-page-${i}`;
      const vId = `43000000-0000-0000-0000-00000000001${i}`;
      harness.templates.set(id, {
        id,
        name: `Mẫu số ${i}`,
        product_id: 'card',
        variant_id: 'horizontal',
        status: 'published',
        sort_order: i * 10,
        current_published_version_id: vId,
        created_at: '2026-10-04T00:00:00Z',
        updated_at: '2026-10-04T00:00:00Z',
      });
      harness.versions.set(vId, {
        id: vId,
        template_id: id,
        version: 1,
        design_document: { ...createInitialState('card'), variantId: 'horizontal' } as unknown as Record<string, unknown>,
        created_at: '2026-10-04T00:00:00Z',
      });
    }

    const cardTarget = createTemplateTarget({
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
    });

    const page1 = await harness.templateRepo.browseAvailableTemplates({
      target: cardTarget,
      limit: 1,
    });
    assert.equal(page1.items.length, 1);
    assert.equal(page1.items[0]?.id, 'tmpl-page-1');
    assert.ok(page1.nextCursor !== null);

    const page2 = await harness.templateRepo.browseAvailableTemplates({
      target: cardTarget,
      limit: 1,
      cursor: page1.nextCursor,
    });
    assert.equal(page2.items.length, 1);
    assert.equal(page2.items[0]?.id, 'tmpl-page-2');
    assert.ok(page2.nextCursor !== null);

    const page3 = await harness.templateRepo.browseAvailableTemplates({
      target: cardTarget,
      limit: 1,
      cursor: page2.nextCursor,
    });
    assert.equal(page3.items.length, 1);
    assert.equal(page3.items[0]?.id, 'tmpl-page-3');
    assert.equal(page3.nextCursor, null);
  });

  it('resolveTemplateVersionById allows public current version resolution and restricts historical versions', async () => {
    const harness = createLocalCatalogFixtureHarness();

    const tmplId = 'tmpl-versions-test';
    const v1Id = '43000000-0000-0000-0000-000000000021';
    const v2Id = '43000000-0000-0000-0000-000000000022';

    harness.templates.set(tmplId, {
      id: tmplId,
      name: 'Mẫu Đa Phiên Bản',
      product_id: 'wrapping',
      variant_id: 'a1',
      product_mode: 'pattern',
      status: 'published',
      sort_order: 1,
      current_published_version_id: v2Id, // v2 is current
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    });

    harness.versions.set(v1Id, {
      id: v1Id,
      template_id: tmplId,
      version: 1,
      design_document: { ...createInitialState('wrapping'), variantId: 'a1' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
    });

    harness.versions.set(v2Id, {
      id: v2Id,
      template_id: tmplId,
      version: 2,
      design_document: { ...createInitialState('wrapping'), variantId: 'a1' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T01:00:00Z',
    });

    // 1. Current published version resolves publicly without credentials
    const current = await harness.templateRepo.resolveTemplateVersionById(v2Id);
    assert.equal(current.versionId, v2Id);
    assert.equal(current.version, 2);

    // 2. Historical version (v1) without credentials throws UNAUTHENTICATED
    await assert.rejects(
      () => harness.templateRepo.resolveTemplateVersionById(v1Id),
      /Authentication required to access historical template version/,
    );

    // 3. Historical version (v1) with staff access succeeds
    const staffResolved = await harness.templateRepo.resolveTemplateVersionById(v1Id, {
      role: 'editor',
      userId: '43000000-0000-0000-0000-0000000000e1',
    });
    assert.equal(staffResolved.versionId, v1Id);
    assert.equal(staffResolved.version, 1);

    // 4. Historical version (v1) with project owner provenance succeeds
    const customerUserId = '43000000-0000-0000-0000-0000000000c1';
    harness.projects.set('proj-1', {
      id: 'proj-1',
      user_id: customerUserId,
      source_template_version_id: v1Id,
    });

    const customerResolved = await harness.templateRepo.resolveTemplateVersionById(v1Id, {
      role: 'customer',
      userId: customerUserId,
    });
    assert.equal(customerResolved.versionId, v1Id);
  });

  it('GET /api/templates returns safe TemplateCard[] with no design document and no-store headers', async () => {
    const harness = createLocalCatalogFixtureHarness();

    const tmplId = 'tmpl-api-1';
    const verId = '43000000-0000-0000-0000-000000000031';
    harness.templates.set(tmplId, {
      id: tmplId,
      name: 'Mẫu Giấy Gói Sinh Nhật',
      product_id: 'wrapping',
      variant_id: 'a1',
      product_mode: 'pattern',
      status: 'published',
      sort_order: 1,
      current_published_version_id: verId,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
      thumbnail_path: 'https://storage.local/thumb-api.png',
    });
    harness.versions.set(verId, {
      id: verId,
      template_id: tmplId,
      version: 1,
      design_document: { ...createInitialState('wrapping'), variantId: 'a1' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
    });

    const request = new Request('http://localhost:3000/api/templates?productId=wrapping&mode=pattern');
    const response = await getTemplatesRoute(request, { repo: harness.templateRepo });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');

    const body = (await response.json()) as { items: TemplateCard[]; nextCursor: string | null };
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0]?.id, tmplId);
    assert.equal(body.items[0]?.name, 'Mẫu Giấy Gói Sinh Nhật');
    assert.equal(body.items[0]?.target.productId, 'wrapping');
    assert.equal(body.items[0]?.target.mode, 'pattern');
    assert.equal(body.items[0]?.thumbnailUrl, 'https://storage.local/thumb-api.png');

    // Invariant: Card DTO MUST NOT contain design document
    assert.equal('document' in body.items[0]!, false);
    assert.equal('design_document' in body.items[0]!, false);
  });

  it('GET /api/templates/[id] returns template metadata and version summary', async () => {
    const harness = createLocalCatalogFixtureHarness();

    const tmplId = 'tmpl-api-detail';
    const verId = '43000000-0000-0000-0000-000000000041';
    harness.templates.set(tmplId, {
      id: tmplId,
      name: 'Mẫu Thiệp Chi Tiết',
      product_id: 'card',
      variant_id: 'horizontal',
      status: 'published',
      sort_order: 1,
      current_published_version_id: verId,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    });
    harness.versions.set(verId, {
      id: verId,
      template_id: tmplId,
      version: 1,
      design_document: { ...createInitialState('card'), variantId: 'horizontal' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
    });

    const request = new Request(`http://localhost:3000/api/templates/${tmplId}`);
    const response = await getTemplateByIdRoute(
      request,
      { params: Promise.resolve({ id: tmplId }), repo: harness.templateRepo },
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as { template: { id: string }; currentVersion: { version: number } };
    assert.equal(body.template.id, tmplId);
    assert.equal(body.currentVersion.version, 1);

    // 404 on missing template
    const missingRes = await getTemplateByIdRoute(
      new Request('http://localhost:3000/api/templates/nonexistent'),
      { params: Promise.resolve({ id: 'nonexistent' }), repo: harness.templateRepo },
    );
    assert.equal(missingRes.status, 404);
  });

  it('GET /api/templates/versions/[versionId] resolves payload and enforces provenance security', async () => {
    const harness = createLocalCatalogFixtureHarness();

    const tmplId = 'tmpl-sec';
    const currentVerId = '43000000-0000-0000-0000-000000000051';
    const oldVerId = '43000000-0000-0000-0000-000000000052';

    harness.templates.set(tmplId, {
      id: tmplId,
      name: 'Mẫu Bảo Mật',
      product_id: 'sticker',
      variant_id: 'fixed-shape',
      product_mode: null,
      fixed_sticker_shape: 'circle',
      status: 'published',
      sort_order: 1,
      current_published_version_id: currentVerId,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    });

    harness.versions.set(currentVerId, {
      id: currentVerId,
      template_id: tmplId,
      version: 2,
      design_document: { ...createInitialState('sticker'), variantId: 'fixed-shape' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T01:00:00Z',
    });

    harness.versions.set(oldVerId, {
      id: oldVerId,
      template_id: tmplId,
      version: 1,
      design_document: { ...createInitialState('sticker'), variantId: 'fixed-shape' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
    });

    // Current version resolves publicly
    const reqCurrent = new Request(`http://localhost:3000/api/templates/versions/${currentVerId}`);
    const resCurrent = await getVersionRoute(
      reqCurrent,
      { params: Promise.resolve({ versionId: currentVerId }), repo: harness.templateRepo },
    );
    assert.equal(resCurrent.status, 200);

    // Old version resolves with 401 for anonymous caller
    const reqOldAnon = new Request(`http://localhost:3000/api/templates/versions/${oldVerId}`);
    const resOldAnon = await getVersionRoute(
      reqOldAnon,
      {
        params: Promise.resolve({ versionId: oldVerId }),
        repo: harness.templateRepo,
        getAuthIdentity: async () => null,
      },
    );
    assert.equal(resOldAnon.status, 401);

    // Old version resolves with 200 for staff
    const resOldStaff = await getVersionRoute(
      reqOldAnon,
      {
        params: Promise.resolve({ versionId: oldVerId }),
        repo: harness.templateRepo,
        getAuthIdentity: async () => ({ role: 'admin', userId: '43000000-0000-0000-0000-0000000000a1' }),
      },
    );
    assert.equal(resOldStaff.status, 200);
  });

  it('exact target query with shape: null (die-cut) returns only die-cut templates, excluding fixed-shape stickers', async () => {
    const harness = createLocalCatalogFixtureHarness();

    // 1. Die-cut template (shape: null)
    const dieCutId = 'tmpl-sticker-die-cut';
    const dieCutVerId = '43000000-0000-0000-0000-0000000000d1';
    harness.templates.set(dieCutId, {
      id: dieCutId,
      name: 'Sticker Die-cut Cắt Theo Hình',
      product_id: 'sticker',
      variant_id: 'die-cut',
      product_mode: null,
      fixed_sticker_shape: null,
      status: 'published',
      sort_order: 1,
      current_published_version_id: dieCutVerId,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    });
    harness.versions.set(dieCutVerId, {
      id: dieCutVerId,
      template_id: dieCutId,
      version: 1,
      design_document: { ...createInitialState('sticker'), variantId: 'die-cut' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
    });

    // 2. Fixed-shape circle template
    const circleId = 'tmpl-sticker-circle-fixed';
    const circleVerId = '43000000-0000-0000-0000-0000000000c2';
    harness.templates.set(circleId, {
      id: circleId,
      name: 'Sticker Tròn Cố Định',
      product_id: 'sticker',
      variant_id: 'fixed-shape',
      product_mode: null,
      fixed_sticker_shape: 'circle',
      status: 'published',
      sort_order: 2,
      current_published_version_id: circleVerId,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    });
    harness.versions.set(circleVerId, {
      id: circleVerId,
      template_id: circleId,
      version: 1,
      design_document: { ...createInitialState('sticker'), variantId: 'fixed-shape' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
    });

    // Direct repo query with target specifying shape: null
    const dieCutTarget = createTemplateTarget({
      productId: 'sticker',
      variantId: 'die-cut',
      mode: null,
      shape: null,
    });
    const dieCutResult = await harness.templateRepo.browseAvailableTemplates({
      target: dieCutTarget,
    });
    assert.equal(dieCutResult.items.length, 1);
    assert.equal(dieCutResult.items[0]?.id, dieCutId);
    assert.equal(dieCutResult.items[0]?.target.shape, null);

    // API query with shape=none
    const apiReqNone = new Request('http://localhost:3000/api/templates?productId=sticker&variantId=die-cut&shape=none');
    const apiResNone = await getTemplatesRoute(apiReqNone, { repo: harness.templateRepo });
    assert.equal(apiResNone.status, 200);
    const bodyNone = (await apiResNone.json()) as { items: TemplateCard[] };
    assert.equal(bodyNone.items.length, 1);
    assert.equal(bodyNone.items[0]?.id, dieCutId);

    // API query with shape=circle returns only circle template
    const apiReqCircle = new Request('http://localhost:3000/api/templates?productId=sticker&variantId=fixed-shape&shape=circle');
    const apiResCircle = await getTemplatesRoute(apiReqCircle, { repo: harness.templateRepo });
    assert.equal(apiResCircle.status, 200);
    const bodyCircle = (await apiResCircle.json()) as { items: TemplateCard[] };
    assert.equal(bodyCircle.items.length, 1);
    assert.equal(bodyCircle.items[0]?.id, circleId);
  });

  it('DB failure during availability check throws error rather than marking available', async () => {
    const harness = createLocalCatalogFixtureHarness();

    const tmplId = 'tmpl-db-failure-test';
    const verId = '43000000-0000-0000-0000-0000000000f1';
    harness.templates.set(tmplId, {
      id: tmplId,
      name: 'Mẫu Kiểm Tra Lỗi DB',
      product_id: 'card',
      variant_id: 'horizontal',
      status: 'published',
      sort_order: 1,
      current_published_version_id: verId,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    });
    harness.versions.set(verId, {
      id: verId,
      template_id: tmplId,
      version: 1,
      design_document: { ...createInitialState('card'), variantId: 'horizontal' } as unknown as Record<string, unknown>,
      created_at: '2026-10-04T00:00:00Z',
    });

    // Simulate DB failure on availability RPC
    harness.setAvailabilityRpcError(new Error('connection to database server lost'));

    // 1. Repo method must throw
    await assert.rejects(
      () => harness.templateRepo.getTemplateAvailability(tmplId),
      /connection to database server lost/,
    );

    // 2. resolveTemplateVersionById must propagate error and NOT mark available
    await assert.rejects(
      () => harness.templateRepo.resolveTemplateVersionById(verId),
      /connection to database server lost/,
    );

    // 3. GET /api/templates/[id] must yield 500 error, not 200 available
    const req = new Request(`http://localhost:3000/api/templates/${tmplId}`);
    const res = await getTemplateByIdRoute(
      req,
      { params: Promise.resolve({ id: tmplId }), repo: harness.templateRepo },
    );
    assert.equal(res.status, 500);
    const body = (await res.json()) as { code: string; message: string };
    assert.equal(body.code, 'INTERNAL_ERROR');
    assert.ok(body.message.includes('connection to database server lost'));
  });

  it('keyset pagination across items with null/0 sort_order progresses cleanly without infinite loop', async () => {
    const harness = createLocalCatalogFixtureHarness();

    // Create 5 templates with null or 0 sort_order
    const itemsData = [
      { id: 'tmpl-sort-null-1', sort_order: null },
      { id: 'tmpl-sort-zero-2', sort_order: 0 },
      { id: 'tmpl-sort-null-3', sort_order: null },
      { id: 'tmpl-sort-pos-4', sort_order: 5 },
      { id: 'tmpl-sort-null-5', sort_order: null },
    ];

    for (const item of itemsData) {
      const vId = `43000000-0000-0000-0000-${item.id.slice(-12).padStart(12, '0')}`;
      harness.templates.set(item.id, {
        id: item.id,
        name: `Mẫu ${item.id}`,
        product_id: 'card',
        variant_id: 'horizontal',
        status: 'published',
        sort_order: item.sort_order,
        current_published_version_id: vId,
        created_at: '2026-10-04T00:00:00Z',
        updated_at: '2026-10-04T00:00:00Z',
      });
      harness.versions.set(vId, {
        id: vId,
        template_id: item.id,
        version: 1,
        design_document: { ...createInitialState('card'), variantId: 'horizontal' } as unknown as Record<string, unknown>,
        created_at: '2026-10-04T00:00:00Z',
      });
    }

    const cardTarget = createTemplateTarget({
      productId: 'card',
      variantId: 'horizontal',
      mode: null,
      shape: null,
    });

    const collectedIds: string[] = [];
    let currentCursor: string | null = null;
    let pageCount = 0;
    const maxPagesSafetyBound = 10;

    while (pageCount < maxPagesSafetyBound) {
      pageCount++;
      const page = await harness.templateRepo.browseAvailableTemplates({
        target: cardTarget,
        limit: 2,
        cursor: currentCursor,
      });

      for (const t of page.items) {
        collectedIds.push(t.id);
      }

      if (!page.nextCursor) {
        break;
      }
      currentCursor = page.nextCursor;
    }

    // Safety: must have terminated without hitting the bound
    assert.ok(pageCount < maxPagesSafetyBound, `Exceeded safety bound (${pageCount} pages), potential infinite loop`);
    assert.equal(pageCount, 3, '5 items with limit 2 should paginate in exactly 3 pages');
    assert.equal(collectedIds.length, 5, 'Should collect exactly 5 items');
    assert.equal(new Set(collectedIds).size, 5, 'All collected items should be distinct (no repeat/loop)');
  });

  it('browseAvailableTemplates fallback query escapes quotes and wraps search query containing commas in quotes', async () => {
    let orClause = '';
    const mockSupabase = {
      from(table: string) {
        assert.equal(table, 'templates');
        const builder = {
          select(_fields: string) {
            return builder;
          },
          eq(_column: string, _value: unknown) {
            return builder;
          },
          is(_column: string, _value: unknown) {
            return builder;
          },
          not(_column: string, _op: string, _value: unknown) {
            return builder;
          },
          or(clause: string) {
            orClause = clause;
            return builder;
          },
          order(_column: string, _opts?: unknown) {
            return builder;
          },
          then(resolve: (val: { data: unknown[]; error: null }) => void) {
            resolve({ data: [], error: null });
          },
        };
        return builder;
      },
    } as unknown as SupabaseClient;

    const repo = new TemplateRepository(mockSupabase);
    await repo.browseAvailableTemplates({ query: 'hoa, "la"' });
    assert.equal(orClause, 'name.ilike."%hoa, ""la""%",id.ilike."%hoa, ""la""%",slug.ilike."%hoa, ""la""%"');
  });

  it('GET /api/templates handles query with commas and non-numeric limit safely', async () => {
    const harness = createLocalCatalogFixtureHarness();
    const req = new Request('http://localhost:3000/api/templates?productId=card&variantId=horizontal&limit=invalid&query=hoa%2C%20la');
    const res = await getTemplatesRoute(req, { repo: harness.templateRepo });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: TemplateCard[] };
    assert.ok(Array.isArray(body.items));
  });
});

// ponytail: in-memory mock harness for catalog browse verification → skipped: testcontainers Docker postgres instance, add when CI container runner is provisioned.
