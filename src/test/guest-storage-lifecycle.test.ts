import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRecentProjects,
  saveRecentProject,
  pruneExpiredRecentProjects,
  markProjectMigrated,
  type RecentProject,
} from '../lib/storage.ts';
import type { DesignState } from '../lib/product-state.ts';

test('maintains stable project ID across multiple autosave flushes', () => {
  const dummyStorage: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => dummyStorage[k] ?? null,
    setItem: (k: string, v: string) => { dummyStorage[k] = v; },
    removeItem: (k: string) => { delete dummyStorage[k]; },
    clear: () => { },
    key: () => null,
    length: 0,
  } as Storage;

  const initialDesign: DesignState = {
    productId: 'wrapping',
    variantId: 'a1',
    templateId: null,
    text: 'Bản thảo 1',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    quantity: 1,
  };

  saveRecentProject(initialDesign, 'stable-proj-uuid-1');
  const firstList = getRecentProjects();
  assert.equal(firstList.length, 1);
  assert.equal(firstList[0].id, 'stable-proj-uuid-1');

  // Save again with same stable ID
  saveRecentProject({ ...initialDesign, text: 'Bản thảo 1 cập nhật' }, 'stable-proj-uuid-1');
  const secondList = getRecentProjects();
  assert.equal(secondList.length, 1);
  assert.equal(secondList[0].id, 'stable-proj-uuid-1');
  assert.equal(secondList[0].text, 'Bản thảo 1 cập nhật');
});

test('prunes projects older than 30 days', () => {
  const dummyStorage: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => dummyStorage[k] ?? null,
    setItem: (k: string, v: string) => { dummyStorage[k] = v; },
    removeItem: (k: string) => { delete dummyStorage[k]; },
    clear: () => { },
    key: () => null,
    length: 0,
  } as Storage;

  const now = Date.now();
  const validProject: RecentProject = {
    id: 'valid-1',
    productId: 'card',
    variantId: 'horizontal',
    templateId: null,
    text: 'Mới tạo',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    updatedAt: now - 5 * 24 * 60 * 60 * 1000, // 5 days ago
  };

  const expiredProject: RecentProject = {
    id: 'expired-1',
    productId: 'sticker',
    variantId: 'die-cut',
    templateId: null,
    text: 'Quá hạn',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    updatedAt: now - 35 * 24 * 60 * 60 * 1000, // 35 days ago
  };

  dummyStorage['quynhtrang-recent-projects-v1'] = JSON.stringify([validProject, expiredProject]);
  const active = pruneExpiredRecentProjects();
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'valid-1');
});

test('markProjectMigrated sets cloud project id and revision metadata', () => {
  const dummyStorage: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => dummyStorage[k] ?? null,
    setItem: (k: string, v: string) => { dummyStorage[k] = v; },
    removeItem: (k: string) => { delete dummyStorage[k]; },
    clear: () => { },
    key: () => null,
    length: 0,
  } as Storage;

  const project: RecentProject = {
    id: 'local-proj-1',
    productId: 'card',
    variantId: 'horizontal',
    templateId: null,
    text: 'Đã lưu',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    updatedAt: Date.now(),
  };

  dummyStorage['quynhtrang-recent-projects-v1'] = JSON.stringify([project]);
  markProjectMigrated('local-proj-1', 'cloud-proj-999', 3);

  const updatedList = getRecentProjects();
  assert.equal(updatedList[0].syncedCloudProjectId, 'cloud-proj-999');
  assert.equal(updatedList[0].syncedRevision, 3);
  assert.ok(typeof updatedList[0].migratedAt === 'number');
});
