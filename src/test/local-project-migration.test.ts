import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterMigratableProjects,
  type LocalProjectItem,
} from '../lib/services/local-project-migration.ts';
import type { DesignState } from '../lib/product-state.ts';

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
