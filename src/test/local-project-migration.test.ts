import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterMigratableProjects,
  migrateLocalProjects,
  type LocalProjectItem,
} from '../lib/services/local-project-migration.ts';
import type { DesignState } from '../lib/product-state.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRecentProjects } from '../lib/storage.ts';

test('skips expired and already synced projects', () => {
  const now = Date.now();
  const projects: LocalProjectItem[] = [
    { id: 'p1', updatedAt: now - 1000, syncedCloudProjectId: 'cloud-1' },
    { id: 'p2', updatedAt: now - 35 * 24 * 3600 * 1000 },
    { id: 'p3', updatedAt: now - 2 * 24 * 3600 * 1000, design: { productId: 'card' } as unknown as DesignState },
  ];

  const migratable = filterMigratableProjects(projects, now);
  assert.equal(migratable.length, 1);
  assert.equal(migratable[0].id, 'p3');
});

test('migrateLocalProjects rehydrates dead blob URLs with backing data and fails dead blobs without bytes', async () => {
  const dummyStorage: Record<string, string> = {};
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => dummyStorage[k] ?? null,
      setItem: (k: string, v: string) => { dummyStorage[k] = v; },
      removeItem: (k: string) => { delete dummyStorage[k]; },
      clear: () => undefined,
      key: () => null,
      length: 0,
    },
  });

  const now = Date.now();
  const recoverable: LocalProjectItem = {
    id: 'proj-recoverable',
    updatedAt: now,
    design: {
      productId: 'card',
      variantId: 'default',
      templateId: null,
      text: '',
      color: '#000',
      backgroundColor: '#fff',
      quantity: 1,
      productOptions: {},
      image: {
        name: 'sample.png',
        src: 'blob:https://test.local/dead-1',
        data: 'data:image/png;base64,validbytes',
      },
    },
  };

  const unrecoverable: LocalProjectItem = {
    id: 'proj-unrecoverable',
    updatedAt: now,
    design: {
      productId: 'card',
      variantId: 'default',
      templateId: null,
      text: '',
      color: '#000',
      backgroundColor: '#fff',
      quantity: 1,
      productOptions: {},
      image: {
        name: 'dead.png',
        src: 'blob:https://test.local/dead-2',
      },
    },
  };

  dummyStorage['quynhtrang-recent-projects-v1'] = JSON.stringify([recoverable, unrecoverable]);

  const insertedDocuments: unknown[] = [];
  const mockClient = {
    from(table: string) {
      if (table === 'projects') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({ data: null }),
                    };
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            insertedDocuments.push(payload.working_document);
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: `cloud-${payload.origin_local_project_id}`, current_working_revision: 1 },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      };
    },
  } as unknown as SupabaseClient;

  const summary = await migrateLocalProjects('user-123', mockClient);

  assert.equal(summary.migratedCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.deepEqual(summary.failedProjectIds, ['proj-unrecoverable']);
  assert.ok(summary.errors.some((e) => e.includes('proj-unrecoverable')));

  // Verify rehydrated document stored in cloud has dataUrl, not dead blob
  const migratedDoc = insertedDocuments[0] as DesignState;
  assert.equal(migratedDoc.image?.src, 'data:image/png;base64,validbytes');

  // Verify unrecoverable local project remains unmigrated
  const currentList = getRecentProjects();
  const unrec = currentList.find((p) => p.id === 'proj-unrecoverable');
  assert.equal(unrec?.syncedCloudProjectId, undefined);
});

test('migrateLocalProjects commits each success and retries only failed projects', async () => {
  const dummyStorage: Record<string, string> = {};
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => dummyStorage[key] ?? null,
      setItem: (key: string, value: string) => { dummyStorage[key] = value; },
      removeItem: (key: string) => { delete dummyStorage[key]; },
      clear: () => undefined,
      key: () => null,
      length: 0,
    },
  });

  const now = Date.now();
  dummyStorage['quynhtrang-recent-projects-v1'] = JSON.stringify([
    { id: 'project-1', updatedAt: now, productId: 'card', variantId: 'default' },
    { id: 'project-2', updatedAt: now, productId: 'card', variantId: 'default' },
  ] satisfies LocalProjectItem[]);

  const insertedIds: string[] = [];
  let failProject2 = true;
  const mockClient = {
    from(table: string) {
      if (table !== 'projects') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };
      }
      return {
        select() {
          return { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
        },
        insert(payload: Record<string, unknown>) {
          const localId = String(payload.origin_local_project_id);
          insertedIds.push(localId);
          return {
            select() {
              return {
                single: async () => failProject2 && localId === 'project-2'
                  ? { data: null, error: { message: 'temporary failure' } }
                  : { data: { id: `cloud-${localId}`, current_working_revision: 1 }, error: null },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const first = await migrateLocalProjects('user-123', mockClient);
  assert.deepEqual(first, {
    migratedCount: 1,
    failedCount: 1,
    failedProjectIds: ['project-2'],
    errors: ['Dự án project-2: temporary failure'],
  });
  assert.equal(getRecentProjects().find((project) => project.id === 'project-1')?.syncedCloudProjectId, 'cloud-project-1');
  assert.equal(getRecentProjects().find((project) => project.id === 'project-2')?.syncedCloudProjectId, undefined);

  failProject2 = false;
  const retry = await migrateLocalProjects('user-123', mockClient);
  assert.deepEqual(retry, { migratedCount: 1, failedCount: 0, failedProjectIds: [], errors: [] });
  assert.deepEqual(insertedIds, ['project-1', 'project-2', 'project-2']);
  assert.equal(getRecentProjects().find((project) => project.id === 'project-2')?.syncedCloudProjectId, 'cloud-project-2');
});
