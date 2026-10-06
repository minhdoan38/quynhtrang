import type { DesignState, ImageState, CanvasElement } from '../product-state.ts';

export interface GuestAssetRecord {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  payload?: string | Uint8Array;
  checksum?: string;
  lastUsedAt: number;
}

export interface GuestProjectRecord {
  id: string;
  document: DesignState;
  updatedAt: number;
  schemaVersion: number;
  recoveryPending?: boolean;
  syncedCloudProjectId?: string;
  syncedRevision?: number;
}

const DB_NAME = 'quynhtrang_guest_storage_v1';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_ASSETS = 'assets';

// In-memory fallback caches for SSR and private browsing
const inMemoryProjects = new Map<string, GuestProjectRecord>();
const inMemoryAssets = new Map<string, GuestAssetRecord>();

export function getInMemoryProject(id: string): GuestProjectRecord | null {
  return inMemoryProjects.get(id) ?? null;
}

export function setInMemoryProject(record: GuestProjectRecord): void {
  inMemoryProjects.set(record.id, record);
}

export function getInMemoryAsset(key: string): GuestAssetRecord | null {
  return inMemoryAssets.get(key) ?? null;
}

export function setInMemoryAsset(record: GuestAssetRecord): void {
  inMemoryAssets.set(record.id, record);
  if (record.name) inMemoryAssets.set(record.name, record);
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  const { promise, resolve } = Promise.withResolvers<IDBDatabase | null>();
  try {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
  } catch {
    resolve(null);
  }
  return promise;
}

export async function saveGuestProject(record: GuestProjectRecord): Promise<boolean> {
  setInMemoryProject(record);
  const db = await openDatabase();
  if (!db) return true;

  const { promise, resolve } = Promise.withResolvers<boolean>();
  try {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.put(record);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  } catch {
    resolve(false);
  }
  return promise;
}

export async function loadGuestProject(id: string): Promise<GuestProjectRecord | null> {
  const mem = getInMemoryProject(id);
  const db = await openDatabase();
  if (!db) return mem;

  const { promise, resolve } = Promise.withResolvers<GuestProjectRecord | null>();
  try {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.get(id);
    req.onsuccess = () => {
      const result = (req.result as GuestProjectRecord) || mem;
      if (result) setInMemoryProject(result);
      resolve(result);
    };
    req.onerror = () => resolve(mem);
  } catch {
    resolve(mem);
  }
  return promise;
}

export async function deleteGuestProject(id: string): Promise<boolean> {
  inMemoryProjects.delete(id);
  const db = await openDatabase();
  if (!db) return true;

  const { promise, resolve } = Promise.withResolvers<boolean>();
  try {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
  } catch {
    resolve(false);
  }
  return promise;
}

export async function saveGuestAsset(record: GuestAssetRecord): Promise<boolean> {
  setInMemoryAsset(record);
  const db = await openDatabase();
  if (!db) return true;

  const { promise, resolve } = Promise.withResolvers<boolean>();
  try {
    const tx = db.transaction(STORE_ASSETS, 'readwrite');
    const store = tx.objectStore(STORE_ASSETS);
    const req = store.put(record);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
  } catch {
    resolve(false);
  }
  return promise;
}

export async function loadGuestAsset(id: string): Promise<GuestAssetRecord | null> {
  const mem = getInMemoryAsset(id);
  const db = await openDatabase();
  if (!db) return mem;

  const { promise, resolve } = Promise.withResolvers<GuestAssetRecord | null>();
  try {
    const tx = db.transaction(STORE_ASSETS, 'readonly');
    const store = tx.objectStore(STORE_ASSETS);
    const req = store.get(id);
    req.onsuccess = () => {
      const result = (req.result as GuestAssetRecord) || mem;
      if (result) setInMemoryAsset(result);
      resolve(result);
    };
    req.onerror = () => resolve(mem);
  } catch {
    resolve(mem);
  }
  return promise;
}

export function rehydrateImageState(image: ImageState | null): ImageState | null {
  if (!image) return null;
  const isBlob = typeof image.src === 'string' && image.src.startsWith('blob:');
  if (!isBlob) {
    return image;
  }

  // Restore dead blob: URL from base64 dataUrl or payload
  if (typeof image.data === 'string' && image.data.startsWith('data:')) {
    return {
      ...image,
      src: image.data,
    };
  }

  if (typeof image.payload === 'string' && image.payload.startsWith('data:')) {
    return {
      ...image,
      src: image.payload,
      data: image.data || image.payload,
    };
  }

  const cached = getInMemoryAsset(image.name) || getInMemoryAsset(image.src);
  if (cached?.dataUrl) {
    return {
      ...image,
      src: cached.dataUrl,
      data: cached.dataUrl,
    };
  }

  return image;
}

export function rehydrateDesignImages(design: DesignState): DesignState {
  const rehydratedMain = rehydrateImageState(design.image ?? null);
  let elementsChanged = false;

  const elements = design.elements?.map((el: CanvasElement) => {
    if (el.type === 'image' && el.data) {
      const imgData = el.data as Record<string, unknown>;
      const src = typeof imgData.src === 'string' ? imgData.src : '';
      if (src.startsWith('blob:')) {
        let restored = '';
        if (typeof imgData.data === 'string' && imgData.data.startsWith('data:')) {
          restored = imgData.data;
        } else if (typeof imgData.payload === 'string' && imgData.payload.startsWith('data:')) {
          restored = imgData.payload;
        } else if (rehydratedMain && rehydratedMain.src && !rehydratedMain.src.startsWith('blob:')) {
          restored = rehydratedMain.src;
        } else {
          const cached = (typeof imgData.name === 'string' ? getInMemoryAsset(imgData.name) : null) || getInMemoryAsset(src);
          if (cached?.dataUrl) restored = cached.dataUrl;
        }

        if (restored) {
          elementsChanged = true;
          return {
            ...el,
            data: {
              ...imgData,
              src: restored,
              originalSrc: typeof imgData.originalSrc === 'string' && imgData.originalSrc.startsWith('blob:')
                ? restored
                : imgData.originalSrc,
            },
          };
        }
      }
    }
    return el;
  });

  return {
    ...design,
    image: rehydratedMain,
    elements: elementsChanged ? elements : design.elements,
  };
}

export async function estimateStorage(): Promise<{ usage?: number; quota?: number } | null> {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      const est = await navigator.storage.estimate();
      return { usage: est.usage, quota: est.quota };
    } catch {
      return null;
    }
  }
  return null;
}
