import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRecentProject,
  getInMemoryProject,
  getLastPersistenceError,
  getRecentProjects,
  saveRecentProject,
  saveRecentProjectWithResult,
  pruneExpiredRecentProjects,
  markProjectMigrated,
  type RecentProject,
} from '../lib/storage.ts';
import { rehydrateImageState } from '../lib/browser-storage/guest-project-store.ts';
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

test('saveRecentProject and addRecentProject preserve template provenance and schema version', () => {
  const dummyStorage: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => dummyStorage[key] || null,
    setItem: (key: string, val: string) => { dummyStorage[key] = val; },
    removeItem: (key: string) => { delete dummyStorage[key]; },
    clear: () => { Object.keys(dummyStorage).forEach(k => delete dummyStorage[k]); },
    length: 0,
    key: () => null,
  } as Storage;

  const designWithTemplate: DesignState = {
    productId: 'wrapping',
    variantId: 'default',
    templateId: 'tpl-minimal-01',
    text: 'Sinh nhật vui vẻ',
    color: '#000000',
    backgroundColor: '#ffffff',
    image: null,
    quantity: 1,
    productOptions: {},
    sourceTemplate: {
      templateId: 'tpl-minimal-01',
      templateVersionId: 'ver-uuid-1234',
    },
    documentSchemaVersion: 1,
  };

  saveRecentProject(designWithTemplate, 'proj-tpl-1');
  const list = getRecentProjects();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'proj-tpl-1');
  assert.deepEqual(list[0].sourceTemplate, {
    templateId: 'tpl-minimal-01',
    templateVersionId: 'ver-uuid-1234',
  });
  assert.equal(list[0].documentSchemaVersion, 1);

  // addRecentProject also preserves provenance
  const project2: RecentProject = {
    id: 'proj-tpl-2',
    productId: 'card',
    variantId: 'horizontal',
    templateId: 'tpl-card-02',
    text: 'Chúc mừng',
    color: '#222222',
    backgroundColor: '#fffdf8',
    image: null,
    productOptions: {},
    sourceTemplate: {
      templateId: 'tpl-card-02',
      templateVersionId: 'ver-uuid-5678',
    },
    documentSchemaVersion: 1,
    updatedAt: Date.now(),
  };

  addRecentProject(project2);
  const list2 = getRecentProjects();
  assert.equal(list2.length, 2);
  assert.equal(list2[0].id, 'proj-tpl-2');
  assert.deepEqual(list2[0].sourceTemplate, {
    templateId: 'tpl-card-02',
    templateVersionId: 'ver-uuid-5678',
  });
});

test('rehydrates a dead blob URL from durable base64 data', () => {
  const dataUrl = 'data:image/png;base64,aGVsbG8=';
  const restored = rehydrateImageState({
    name: 'recover.png',
    type: 'image/png',
    src: 'blob:https://example.test/revoked',
    data: dataUrl,
  });

  assert.equal(restored?.src, dataUrl);
  assert.equal(restored?.data, dataUrl);
});

test('quota failure preserves the newest document in memory and returns a persistence error', () => {
  const previous = getInMemoryProject('quota-project');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    },
  });

  const design: DesignState = {
    productId: 'card',
    variantId: 'horizontal',
    templateId: null,
    text: 'must survive in memory',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    quantity: 1,
  };
  const ok = saveRecentProject(design, 'quota-project');
  const error = getLastPersistenceError();
  const result = saveRecentProjectWithResult(design, 'quota-project');

  assert.equal(ok, false);
  assert.equal(error?.code, 'CLIENT_PERSISTENCE_ERROR');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CLIENT_PERSISTENCE_ERROR');
  assert.equal(getInMemoryProject('quota-project')?.text, 'must survive in memory');
  assert.notDeepEqual(getInMemoryProject('quota-project'), previous);
});

test('retention pruning protects currently open project from eviction', () => {
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
  const p1: RecentProject = { id: 'p1', productId: 'card', variantId: 'h', templateId: null, text: '1', color: '#000', backgroundColor: '#fff', image: null, productOptions: {}, updatedAt: now - 1000 };
  const p2: RecentProject = { id: 'p2', productId: 'card', variantId: 'h', templateId: null, text: '2', color: '#000', backgroundColor: '#fff', image: null, productOptions: {}, updatedAt: now - 2000 };
  const p3: RecentProject = { id: 'p3', productId: 'card', variantId: 'h', templateId: null, text: '3', color: '#000', backgroundColor: '#fff', image: null, productOptions: {}, updatedAt: now - 3000 };
  const p4: RecentProject = { id: 'p4', productId: 'card', variantId: 'h', templateId: null, text: '4', color: '#000', backgroundColor: '#fff', image: null, productOptions: {}, updatedAt: now - 4000 };

  dummyStorage['quynhtrang-recent-projects-v1'] = JSON.stringify([p1, p2, p3, p4]);

  // Without protection: only top 3 (p1, p2, p3)
  const standard = getRecentProjects(now);
  assert.deepEqual(standard.map((p) => p.id), ['p1', 'p2', 'p3']);

  // With protection of open project 'p4': p4 is preserved
  dummyStorage['quynhtrang-recent-projects-v1'] = JSON.stringify([p1, p2, p3, p4]);
  const protectedList = getRecentProjects(now, { currentProjectId: 'p4' });
  assert.ok(protectedList.some((p) => p.id === 'p4'));
});
