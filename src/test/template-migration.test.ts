import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  migrateTemplates,
  loadDefaultManifest,
  type LegacyTemplatesManifest,
} from '../../scripts/state43-template-migrate.ts';
import { resolveTemplateForUse } from '../lib/services/template-clone.ts';
import { TemplateRepository } from '../lib/repositories/template-repository.ts';

interface MockTables {
  templates: Map<string, Record<string, unknown>>;
  template_versions: Map<string, Record<string, unknown>>;
  template_legacy_targets: Map<string, Record<string, unknown>>;
  projects: Map<string, Record<string, unknown>>;
  template_categories: Map<string, Record<string, unknown>>;
}

export function createMigrationMockClient(initialTables?: Partial<MockTables>): {
  client: SupabaseClient;
  tables: MockTables;
} {
  const tables: MockTables = {
    templates: initialTables?.templates ?? new Map(),
    template_versions: initialTables?.template_versions ?? new Map(),
    template_legacy_targets: initialTables?.template_legacy_targets ?? new Map(),
    projects: initialTables?.projects ?? new Map(),
    template_categories: initialTables?.template_categories ?? new Map(),
  };

  function from(tableName: string) {
    const table = (tables as unknown as Record<string, Map<string, Record<string, unknown>>>)[tableName] ?? new Map();
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let sortCol: string | null = null;
    let sortAsc = true;
    let updatePatch: Record<string, unknown> | null = null;
    let insertPayload: unknown = null;

    const builder = {
      select(_cols?: string) {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => row[col] === val);
        return builder;
      },
      order(col: string, { ascending = true }: { ascending?: boolean } = {}) {
        sortCol = col;
        sortAsc = ascending;
        return builder;
      },
      insert(payload: unknown) {
        insertPayload = payload;
        return builder;
      },
      update(patch: Record<string, unknown>) {
        updatePatch = patch;
        return builder;
      },
      async maybeSingle() {
        for (const row of table.values()) {
          if (filters.every((f) => f(row))) {
            return { data: structuredClone(row), error: null };
          }
        }
        return { data: null, error: null };
      },
      async single() {
        return builder.maybeSingle();
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        if (insertPayload) {
          const rows = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
          for (const row of rows) {
            const cloned = structuredClone(row);
            let key: string;
            if (tableName === 'template_legacy_targets') {
              key = `${row.legacy_id}:${row.target_key}`;
            } else {
              key = row.id ?? `${row.template_id}:${row.version}`;
            }
            table.set(key, cloned);
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
        if (updatePatch) {
          for (const [key, row] of table.entries()) {
            if (filters.every((f) => f(row))) {
              table.set(key, { ...row, ...updatePatch });
            }
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        let results = Array.from(table.values()).filter((row) => filters.every((f) => f(row)));
        if (sortCol) {
          const sc = sortCol;
          results.sort((a, b) => {
            const va = a[sc] as string | number;
            const vb = b[sc] as string | number;
            return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
          });
        }
        return Promise.resolve({ data: structuredClone(results), error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  const client = {
    from,
    rpc(_fn: string, _args: unknown) {
      return Promise.resolve({ data: { available: true, blockers: [] }, error: null });
    },
  } as unknown as SupabaseClient;

  return { client, tables };
}

export async function snapshotTemplateMigration(client: SupabaseClient) {
  const { data: templates } = await client.from('templates').select('*').order('id');
  const { data: versions } = await client.from('template_versions').select('*').order('template_id').order('version');
  const { data: mappings } = await client.from('template_legacy_targets').select('*').order('legacy_id').order('target_key');

  return {
    templates: (templates ?? []).map((t: Record<string, unknown>) => ({
      id: t.id,
      product_id: t.product_id,
      variant_id: t.variant_id,
      product_mode: t.product_mode,
      fixed_sticker_shape: t.fixed_sticker_shape,
      status: t.status,
      category_id: t.category_id,
      current_published_version_id: t.current_published_version_id,
    })),
    versions: (versions ?? []).map((v: Record<string, unknown>) => ({
      template_id: v.template_id,
      version: v.version,
      document_schema_version: v.document_schema_version,
      has_target_snapshot: Boolean(v.target_snapshot),
    })),
    mappings: (mappings ?? []).map((m: Record<string, unknown>) => ({
      legacy_id: m.legacy_id,
      target_key: m.target_key,
      template_id: m.template_id,
      version_id: m.version_id,
    })),
  };
}

export async function snapshotExistingProjects(client: SupabaseClient) {
  const { data: projects } = await client.from('projects').select('*').order('id');
  return projects ?? [];
}

export async function snapshotLegacyVersionJson(client: SupabaseClient) {
  const { data: versions } = await client
    .from('template_versions')
    .select('template_id, version, design_document')
    .eq('document_schema_version', 0)
    .order('template_id');

  return (versions ?? []).map((v: Record<string, unknown>) => ({
    template_id: v.template_id,
    version: v.version,
    design_document: v.design_document,
  }));
}

test('reproducible legacy migration satisfies idempotency contract and preserves projects and v1 JSON', async () => {
  const { client, tables } = createMigrationMockClient();

  // Populate preexisting legacy database state before migration
  tables.templates.set('blank', {
    id: 'blank',
    slug: 'blank',
    name: 'Trống',
    product_id: null,
    variant_id: null,
    status: 'draft',
    metadata: { category: 'minimal', previewHint: 'Bắt đầu từ trang trắng' },
  });
  tables.template_versions.set('blank:1', {
    id: '00000000-0000-4000-9000-000000000001',
    template_id: 'blank',
    version: 1,
    document_schema_version: 0,
    design_document: { text: '', color: '#111827', backgroundColor: '#ffffff', elements: [] },
  });

  tables.templates.set('card-h-birthday', {
    id: 'card-h-birthday',
    slug: 'card-h-birthday',
    name: 'Sinh nhật ấm áp',
    product_id: 'card',
    variant_id: null,
    status: 'draft',
    metadata: { category: 'birthday' },
  });
  tables.template_versions.set('card-h-birthday:1', {
    id: '00000000-0000-4000-9000-000000000002',
    template_id: 'card-h-birthday',
    version: 1,
    document_schema_version: 0,
    design_document: { text: 'Happy Birthday', color: '#B86C84', backgroundColor: '#FFFDF8', elements: [] },
  });

  // Preexisting customer project referencing legacy template
  tables.projects.set('cust-proj-1', {
    id: 'cust-proj-1',
    template_id: 'blank',
    product_id: 'wrapping',
    variant_id: 'a1',
    current_working_revision: 3,
    design_document: { text: 'Customer Custom Wrapping Paper', color: '#111827' },
  });

  const manifest = loadDefaultManifest();
  const projectsBefore = await snapshotExistingProjects(client);
  const legacyVersionsBefore = await snapshotLegacyVersionJson(client);

  // First run: prepare
  const firstRun = await migrateTemplates({ mode: 'prepare', manifest, client });
  assert.equal(firstRun.success, true);
  assert.ok(firstRun.mappedCount > 0);

  const firstSnapshot = await snapshotTemplateMigration(client);

  // Second run: prepare (idempotency check)
  const secondRun = await migrateTemplates({ mode: 'prepare', manifest, client });
  assert.equal(secondRun.success, true);
  assert.equal(secondRun.createdTemplates, 0, 'No duplicate templates on re-run');
  assert.equal(secondRun.createdVersions, 0, 'No duplicate versions on re-run');

  const secondSnapshot = await snapshotTemplateMigration(client);

  // Assert idempotency invariants
  assert.deepEqual(secondSnapshot, firstSnapshot);
  assert.deepEqual(await snapshotExistingProjects(client), projectsBefore);
  assert.deepEqual(await snapshotLegacyVersionJson(client), legacyVersionsBefore);
});

test('legacy URL resolution routes old IDs and target combinations to valid successors', async () => {
  const { client } = createMigrationMockClient();
  const manifest = loadDefaultManifest();
  await migrateTemplates({ mode: 'prepare', manifest, client });

  const repo = new TemplateRepository(client);

  // 1. Direct canonical resolution (retains original ID)
  const canonicalCard = await resolveTemplateForUse('card-h-birthday', { repo });
  assert.ok(canonicalCard);
  assert.equal(canonicalCard.templateId, 'card-h-birthday');
  assert.ok(canonicalCard.versionId);

  // 2. Wildcard blank with card horizontal target resolves to deterministic successor
  const blankCard = await resolveTemplateForUse('blank', {
    repo,
    target: { productId: 'card', variantId: 'horizontal' },
  });
  assert.ok(blankCard);
  assert.equal(blankCard.templateId, 'blank--card--horizontal--none--none');
  assert.ok(blankCard.versionId);

  // 3. Celebrate with sticker die-cut target resolves to deterministic successor
  const celebrateSticker = await resolveTemplateForUse('celebrate', {
    repo,
    target: { productId: 'sticker', variantId: 'die-cut' },
  });
  assert.ok(celebrateSticker);
  assert.equal(celebrateSticker.templateId, 'celebrate--sticker--die-cut--none--none');

  // 4. Verify mode reports complete coverage after preparation
  const verifyResult = await migrateTemplates({ mode: 'verify', manifest, client });
  assert.equal(verifyResult.success, true);
  assert.equal(verifyResult.errors.length, 0);
  assert.equal(verifyResult.mappedCount, verifyResult.totalTargets);
});

test('inventory mode extracts deterministic catalog metrics without database access', async () => {
  const manifest = loadDefaultManifest();
  const result = await migrateTemplates({ mode: 'inventory', manifest });

  assert.equal(result.mode, 'inventory');
  assert.equal(result.success, true);
  assert.equal(result.totalTemplates, 18);
  assert.ok(result.totalTargets >= 40);
  assert.equal(result.errors.length, 0);
  assert.ok(result.summary);
});
