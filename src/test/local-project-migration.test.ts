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

  assert.equal(summary.migrated, 1);
  assert.equal(summary.failed, 1);
  assert.ok(summary.errors.some((e) => e.includes('proj-unrecoverable')));

  // Verify rehydrated document stored in cloud has dataUrl, not dead blob
  const migratedDoc = insertedDocuments[0] as DesignState;
  assert.equal(migratedDoc.image?.src, 'data:image/png;base64,validbytes');

  // Verify unrecoverable local project remains unmigrated
  const currentList = getRecentProjects();
  const unrec = currentList.find((p) => p.id === 'proj-unrecoverable');
  assert.equal(unrec?.syncedCloudProjectId, undefined);
});
