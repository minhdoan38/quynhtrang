import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRecentProject,
  getInMemoryProject,
  getLastPersistenceError,
  getRecentProjects,
  saveRecentProject,
  saveRecentProjectAsync,
  saveRecentProjectWithResult,
  saveRecentProjectWithResultAsync,
  pruneExpiredRecentProjects,
  markProjectMigrated,
  type RecentProject,
} from '../lib/storage.ts';
import {
  rehydrateImageState,
  rehydrateDesignImages,
  migrateLegacyLocalStorageAssets,
  loadGuestAsset,
} from '../lib/browser-storage/guest-project-store.ts';
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

test('rehydrates a dead blob URL from durable base64 data', async () => {
  const dataUrl = 'data:image/png;base64,aGVsbG8=';
  const restored = await rehydrateImageState({
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

interface MockIDBTransaction {
  oncomplete?: ((ev: Event) => void) | null;
  onabort?: ((ev: Event) => void) | null;
  onerror?: ((ev: Event) => void) | null;
  objectStore: (name: string) => { put: (record: unknown) => { onerror?: () => void; onsuccess?: () => void } };
}

interface MockIDBOpenRequest {
  onsuccess?: ((ev: { target: { result: unknown } }) => void) | null;
  onerror?: ((ev: unknown) => void) | null;
  onblocked?: (() => void) | null;
  onupgradeneeded?: ((ev: unknown) => void) | null;
}

test('saveRecentProjectAsync awaits IndexedDB write and fails gracefully if IndexedDB aborts', async () => {
  const dummyStorage: Record<string, string> = {};
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

  const design: DesignState = {
    productId: 'card',
    variantId: 'h',
    templateId: null,
    text: 'test async save',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    quantity: 1,
  };

  // 1. Test failure when IndexedDB transaction aborts
  const mockDbAbort = {
    objectStoreNames: { contains: () => true },
    transaction: (): MockIDBTransaction => {
      const tx: MockIDBTransaction = {
        objectStore: () => ({
          put: () => {
            queueMicrotask(() => {
              if (tx.onabort) tx.onabort(new Event('abort'));
            });
            return {};
          },
        }),
      };
      return tx;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      indexedDB: {
        open: (): MockIDBOpenRequest => {
          const req: MockIDBOpenRequest = {};
          queueMicrotask(() => {
            if (req.onsuccess) req.onsuccess({ target: { result: mockDbAbort } });
          });
          return req;
        },
      },
    },
  });

  const abortOk = await saveRecentProjectAsync(design, 'proj-abort-test');
  assert.equal(abortOk, false);
  const res = await saveRecentProjectWithResultAsync(design, 'proj-abort-test');
  assert.equal(res.ok, false);
  assert.equal(res.code, 'CLIENT_PERSISTENCE_ERROR');
  const err = getLastPersistenceError();
  assert.equal(err?.code, 'CLIENT_PERSISTENCE_ERROR');
  // In-memory document must remain intact despite persistence failure
  assert.equal(getInMemoryProject('proj-abort-test')?.text, 'test async save');

  // 2. Test that saveRecentProjectAsync awaits transaction completion before returning true
  let completeTx: (() => void) | null = null;
  const mockDbComplete = {
    objectStoreNames: { contains: () => true },
    transaction: (): MockIDBTransaction => {
      const tx: MockIDBTransaction = {
        objectStore: () => ({
          put: () => ({}),
        }),
      };
      completeTx = () => {
        if (tx.oncomplete) tx.oncomplete(new Event('complete'));
      };
      return tx;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      indexedDB: {
        open: (): MockIDBOpenRequest => {
          const req: MockIDBOpenRequest = {};
          queueMicrotask(() => {
            if (req.onsuccess) req.onsuccess({ target: { result: mockDbComplete } });
          });
          return req;
        },
      },
    },
  });

  let settled = false;
  const pendingPromise = saveRecentProjectAsync({ ...design, text: 'durable completed' }, 'proj-complete-test').then((r: boolean) => {
    settled = true;
    return r;
  });

  // Flush microtasks to allow open and transaction to initialize
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'saveRecentProjectAsync must not resolve before transaction finishes');

  // Complete transaction
  const triggerComplete = completeTx as (() => void) | null;
  triggerComplete?.();
  const successRes = await pendingPromise;
  assert.equal(successRes, true);
  assert.equal(settled, true);
});


test('migrateLegacyLocalStorageAssets extracts base64, stores binary in IndexedDB, strips large payload from localStorage, and isolates corrupt records into quarantine', async () => {
  const dummyStorage: Record<string, string> = {};
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
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {}, // fallback memory mode for guest-project-store
  });

  const validBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const validProject: RecentProject = {
    id: 'legacy-valid-1',
    productId: 'card',
    variantId: 'v1',
    templateId: null,
    text: 'Hợp lệ',
    color: '#000',
    backgroundColor: '#fff',
    image: {
      name: 'photo.png',
      type: 'image/png',
      src: validBase64,
      data: validBase64,
      payload: validBase64,
      size: 68,
    },
    productOptions: {},
    updatedAt: Date.now(),
  };

  const corruptProject = {
    id: 'legacy-corrupt-2',
    productId: 'sticker',
    variantId: 'v1',
    templateId: null,
    text: 'Dữ liệu hỏng',
    color: '#000',
    backgroundColor: '#fff',
    image: {
      name: 'broken.png',
      type: 'image/png',
      src: 'data:image/png;base64,INVALID_MALFORMED_CHARS_!@#$%',
      data: 'data:image/png;base64,INVALID_MALFORMED_CHARS_!@#$%',
      size: 50,
    },
    productOptions: {},
    updatedAt: Date.now(),
  };

  const cleanNoImgProject: RecentProject = {
    id: 'legacy-clean-3',
    productId: 'wrapping',
    variantId: 'v1',
    templateId: null,
    text: 'Không có ảnh',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    updatedAt: Date.now(),
  };

  dummyStorage['quynhtrang-recent-projects-v1'] = JSON.stringify([validProject, corruptProject, cleanNoImgProject]);

  const stats = await migrateLegacyLocalStorageAssets();
  assert.equal(stats.migratedCount, 1);
  assert.equal(stats.quarantinedCount, 1);

  // Check clean metadata rewritten to localStorage
  const remaining = JSON.parse(dummyStorage['quynhtrang-recent-projects-v1']) as Array<{ id: string; image?: { assetId?: string; checksum?: string; src?: string; data?: string; payload?: string; name?: string } }>;
  assert.equal(remaining.length, 2);
  const remainingIds = remaining.map((p) => p.id);
  assert.ok(remainingIds.includes('legacy-valid-1'));
  assert.ok(remainingIds.includes('legacy-clean-3'));
  assert.ok(!remainingIds.includes('legacy-corrupt-2'));

  // Valid project has inline base64 stripped and replaced with lightweight asset reference
  const migratedItem = remaining.find((p) => p.id === 'legacy-valid-1');
  assert.ok(migratedItem?.image?.assetId);
  assert.ok(migratedItem?.image?.checksum);
  assert.equal(migratedItem.image.src, migratedItem.image.assetId);
  assert.equal(migratedItem.image.data, undefined);
  assert.equal(migratedItem.image.payload, undefined);
  assert.equal(migratedItem.image.name, 'photo.png');

  // Binary record exists in guest asset store with verified checksum
  const assetRecord = await loadGuestAsset(migratedItem.image.assetId!);
  assert.ok(assetRecord);
  assert.equal(assetRecord.checksum, migratedItem.image.checksum);
  assert.ok(assetRecord.size > 0);

  // Corrupt record isolated into quarantine store
  const quarantined = JSON.parse(dummyStorage['quynhtrang-quarantined-projects-v1']) as Array<{ id?: string; project?: { id?: string } }>;
  assert.equal(quarantined.length, 1);
  assert.equal(quarantined[0].project?.id || quarantined[0].id, 'legacy-corrupt-2');
});

test('saveRecentProjectAsync stores image bytes outside localStorage and rehydrates a renderable source', async () => {
  const local: Record<string, string> = {};
  const stores = new Map<string, Map<string, unknown>>([
    ['projects', new Map()],
    ['assets', new Map()],
  ]);
  const db = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    transaction: (storeName: string) => {
      const tx: MockIDBTransaction = {
        objectStore: () => ({
          put: (record: unknown) => {
            const item = record as { id: string };
            stores.get(storeName)?.set(item.id, structuredClone(record));
            queueMicrotask(() => tx.oncomplete?.(new Event('complete')));
            return {};
          },
          get: (id: string) => {
            const req: { result?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
            queueMicrotask(() => {
              req.result = stores.get(storeName)?.get(id);
              req.onsuccess?.();
            });
            return req;
          },
        }),
      };
      return tx;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => local[key] ?? null,
      setItem: (key: string, value: string) => { local[key] = value; },
      removeItem: (key: string) => { delete local[key]; },
      clear: () => undefined,
      key: () => null,
      length: 0,
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      indexedDB: {
        open: () => {
          const req: MockIDBOpenRequest = {};
          queueMicrotask(() => req.onsuccess?.({ target: { result: db } }));
          return req;
        },
      },
    },
  });

  const base64 = Buffer.alloc(256 * 1024, 7).toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;
  const design: DesignState = {
    productId: 'card',
    variantId: 'horizontal',
    templateId: null,
    text: '',
    color: '#000',
    backgroundColor: '#fff',
    image: {
      name: 'large.png',
      type: 'image/png',
      size: 256 * 1024,
      src: dataUrl,
      data: dataUrl,
      payload: dataUrl,
    },
    productOptions: {},
    quantity: 1,
  };

  assert.equal(await saveRecentProjectAsync(design, 'large-image-project'), true);
  const serialized = local['quynhtrang-recent-projects-v1'];
  assert.ok(serialized.length < 10_000, `localStorage metadata was ${serialized.length} bytes`);
  assert.equal(serialized.includes(base64), false);
  const [storedProject] = JSON.parse(serialized) as RecentProject[];
  assert.ok(storedProject.image?.assetId?.startsWith('asset-'));
  assert.equal(storedProject.image?.src, storedProject.image?.assetId);
  assert.equal(storedProject.image?.data, undefined);
  assert.equal(storedProject.image?.payload, undefined);
  assert.ok(stores.get('assets')?.has(storedProject.image!.assetId!));

  const restored = await rehydrateDesignImages({ ...design, image: storedProject.image });
  assert.ok(restored.image?.src.startsWith('blob:') || restored.image?.src.startsWith('data:image/png;base64,'));
  assert.notEqual(restored.image?.src, storedProject.image?.assetId);
});

test('rehydrateImageState resolves a bare asset checksum reference to a renderable URL', async () => {
  const assetId = `asset-${'a'.repeat(64)}`;
  const dataUrl = 'data:image/png;base64,aGVsbG8=';
  const asset = {
    id: assetId,
    name: 'checksum.png',
    mimeType: 'image/png',
    size: 5,
    payload: Uint8Array.from([104, 101, 108, 108, 111]),
    dataUrl,
    lastUsedAt: Date.now(),
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => ({
      objectStore: () => ({
        get: () => {
          const req: { result?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
          queueMicrotask(() => {
            req.result = asset;
            req.onsuccess?.();
          });
          return req;
        },
      }),
    }),
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      indexedDB: {
        open: () => {
          const req: MockIDBOpenRequest = {};
          queueMicrotask(() => req.onsuccess?.({ target: { result: db } }));
          return req;
        },
      },
    },
  });

  const restored = await rehydrateImageState({
    name: 'checksum.png',
    type: 'image/png',
    src: assetId,
  });

  assert.equal(restored?.assetId, assetId);
  assert.ok(restored?.src.startsWith('blob:') || restored?.src.startsWith('data:image/png;base64,'));
  assert.notEqual(restored?.src, assetId);
});
