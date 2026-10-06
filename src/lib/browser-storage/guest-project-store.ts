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
    store.put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
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
    store.put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
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

const LEGACY_PROJECTS_KEY = 'quynhtrang-recent-projects-v1';
const QUARANTINED_PROJECTS_KEY = 'quynhtrang-quarantined-projects-v1';

type LegacyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is LegacyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInlinePayload(value: string, fallbackMimeType?: string): { bytes: Uint8Array; mimeType: string; dataUrl: string } | null {
  const dataMatch = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  const raw = dataMatch ? dataMatch[2] : value;
  if (!raw || raw.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.indexOf('=') >= 0 && !raw.endsWith('='.repeat(raw.length - raw.indexOf('=')))) return null;
  try {
    const decoded = globalThis.atob(raw);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    if (!bytes.length) return null;
    const mimeType = dataMatch?.[1] || fallbackMimeType || 'application/octet-stream';
    return { bytes, mimeType, dataUrl: `data:${mimeType};base64,${raw}` };
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto unavailable');
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function migrateLegacyImage(image: LegacyRecord): Promise<boolean> {
  const sourceKey = ['data', 'payload', 'src'].find((key) => {
    const value = image[key];
    return typeof value === 'string' && (key !== 'src' || value.startsWith('data:'));
  });
  if (!sourceKey) return false;
  const payload = image[sourceKey];
  if (typeof payload !== 'string') throw new Error('Invalid inline image payload');
  const parsed = parseInlinePayload(payload, typeof image.type === 'string' ? image.type : undefined);
  if (!parsed) throw new Error('Invalid inline image payload');
  const checksum = await sha256Hex(parsed.bytes);
  if (typeof image.checksum === 'string' && image.checksum !== checksum) throw new Error('Image checksum mismatch');
  const assetId = typeof image.assetId === 'string' && image.assetId ? image.assetId : `asset-${checksum}`;
  const saved = await saveGuestAsset({
    id: assetId,
    name: typeof image.name === 'string' ? image.name : assetId,
    mimeType: parsed.mimeType,
    size: parsed.bytes.byteLength,
    payload: parsed.bytes,
    dataUrl: parsed.dataUrl,
    checksum,
    lastUsedAt: Date.now(),
  });
  if (!saved) throw new Error('Asset transaction failed');
  delete image.data;
  delete image.payload;
  image.src = assetId;
  image.assetId = assetId;
  image.checksum = checksum;
  image.size = parsed.bytes.byteLength;
  return true;
}

export async function migrateLegacyLocalStorageAssets(): Promise<{ migratedCount: number; quarantinedCount: number }> {
  if (typeof localStorage === 'undefined') return { migratedCount: 0, quarantinedCount: 0 };
  const raw = localStorage.getItem(LEGACY_PROJECTS_KEY);
  if (!raw) return { migratedCount: 0, quarantinedCount: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.setItem(QUARANTINED_PROJECTS_KEY, JSON.stringify([{ raw, reason: 'Invalid project JSON' }]));
    localStorage.removeItem(LEGACY_PROJECTS_KEY);
    return { migratedCount: 0, quarantinedCount: 1 };
  }
  if (!Array.isArray(parsed)) {
    localStorage.setItem(QUARANTINED_PROJECTS_KEY, JSON.stringify([{ project: parsed, reason: 'Projects must be an array' }]));
    localStorage.removeItem(LEGACY_PROJECTS_KEY);
    return { migratedCount: 0, quarantinedCount: 1 };
  }
  const clean: unknown[] = [];
  const quarantined: unknown[] = [];
  let migratedCount = 0;
  for (const project of parsed) {
    if (!isRecord(project) || typeof project.id !== 'string') {
      quarantined.push({ project, reason: 'Malformed project record' });
      continue;
    }
    try {
      let migrated = false;
      if (isRecord(project.image)) migrated = await migrateLegacyImage(project.image) || migrated;
      if (Array.isArray(project.elements)) {
        for (const element of project.elements) {
          if (isRecord(element) && element.type === 'image' && isRecord(element.data)) {
            migrated = await migrateLegacyImage(element.data) || migrated;
          }
        }
      }
      if (migrated) migratedCount++;
      clean.push(project);
    } catch (error) {
      quarantined.push({ project, reason: error instanceof Error ? error.message : 'Invalid project asset' });
    }
  }
  if (quarantined.length) {
    let existing: unknown[] = [];
    try {
      const prior = JSON.parse(localStorage.getItem(QUARANTINED_PROJECTS_KEY) || '[]');
      if (Array.isArray(prior)) existing = prior;
    } catch { /* overwrite malformed quarantine with valid records */ }
    localStorage.setItem(QUARANTINED_PROJECTS_KEY, JSON.stringify([...existing, ...quarantined]));
  }
  localStorage.setItem(LEGACY_PROJECTS_KEY, JSON.stringify(clean));
  return { migratedCount, quarantinedCount: quarantined.length };
}
