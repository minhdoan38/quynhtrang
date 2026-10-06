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
const objectUrlCache = new Map<string, string>();

export function getRenderableAssetUrl(record: GuestAssetRecord): string {
  if (objectUrlCache.has(record.id)) {
    return objectUrlCache.get(record.id)!;
  }

  if (typeof window !== 'undefined' && typeof window.URL?.createObjectURL === 'function') {
    try {
      let blob: Blob | null = null;
      if (record.payload instanceof Uint8Array) {
        const buf = record.payload.buffer.slice(record.payload.byteOffset, record.payload.byteOffset + record.payload.byteLength) as ArrayBuffer;
        blob = new Blob([buf], { type: record.mimeType || 'image/png' });
      } else if (typeof record.dataUrl === 'string' && record.dataUrl.startsWith('data:')) {
        const parsed = parseInlinePayload(record.dataUrl, record.mimeType);
        if (parsed) {
          const buf = parsed.bytes.buffer.slice(parsed.bytes.byteOffset, parsed.bytes.byteOffset + parsed.bytes.byteLength) as ArrayBuffer;
          blob = new Blob([buf], { type: parsed.mimeType });
        }
      }
      if (blob) {
        const url = window.URL.createObjectURL(blob);
        objectUrlCache.set(record.id, url);
        return url;
      }
    } catch {
      // Fallback to dataUrl
    }
  }

  if (typeof record.dataUrl === 'string' && record.dataUrl.startsWith('data:')) {
    return record.dataUrl;
  }

  if (record.payload instanceof Uint8Array) {
    const base64 = typeof Buffer !== 'undefined'
      ? Buffer.from(record.payload).toString('base64')
      : globalThis.btoa(String.fromCharCode(...record.payload));
    const mime = record.mimeType || 'image/png';
    const dataUrl = `data:${mime};base64,${base64}`;
    record.dataUrl = dataUrl;
    return dataUrl;
  }

  return record.id;
}

export function resolveRenderableAssetUrl(srcOrId: string | null | undefined): string | null {
  if (!srcOrId || typeof srcOrId !== 'string') return null;
  if (!srcOrId.startsWith('asset-')) return srcOrId;
  const cached = getInMemoryAsset(srcOrId);
  if (cached) {
    return getRenderableAssetUrl(cached);
  }
  return null;
}
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

export function rehydrateImageStateSync(image: ImageState | null): ImageState | null {
  if (!image) return null;
  const isBlob = typeof image.src === 'string' && image.src.startsWith('blob:');
  const isAsset = typeof image.src === 'string' && image.src.startsWith('asset-');
  const hasAssetId = typeof image.assetId === 'string' && image.assetId.startsWith('asset-');

  if (!isBlob && !isAsset && !hasAssetId) {
    return image;
  }

  if (isAsset || hasAssetId) {
    const assetKey = (isAsset ? image.src : image.assetId)!;
    const cached = getInMemoryAsset(assetKey) || (image.name ? getInMemoryAsset(image.name) : null);
    if (cached) {
      const renderable = getRenderableAssetUrl(cached);
      return {
        ...image,
        src: renderable,
        assetId: cached.id || assetKey,
        checksum: cached.checksum || image.checksum,
        data: undefined,
        payload: undefined,
      };
    }
    return {
      ...image,
      assetId: image.assetId || (isAsset ? image.src : undefined),
    };
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

  const cached = (image.name ? getInMemoryAsset(image.name) : null) || getInMemoryAsset(image.src);
  if (cached) {
    const renderable = getRenderableAssetUrl(cached);
    return {
      ...image,
      src: renderable,
      data: cached.dataUrl || renderable,
    };
  }

  return image;
}

export async function rehydrateImageState(image: ImageState | null): Promise<ImageState | null> {
  if (!image) return null;
  const syncRes = rehydrateImageStateSync(image);
  if (!syncRes) return null;

  const isAsset = typeof syncRes.src === 'string' && syncRes.src.startsWith('asset-');
  const hasAssetId = typeof syncRes.assetId === 'string' && syncRes.assetId.startsWith('asset-');
  const isDeadBlob = typeof syncRes.src === 'string' && syncRes.src.startsWith('blob:') && !objectUrlCache.has(syncRes.src);

  if (isAsset || hasAssetId || isDeadBlob) {
    const assetKey = (isAsset ? syncRes.src : syncRes.assetId) || syncRes.name;
    if (assetKey) {
      const loaded = await loadGuestAsset(assetKey);
      if (loaded) {
        const renderable = getRenderableAssetUrl(loaded);
        return {
          ...syncRes,
          src: renderable,
          assetId: loaded.id || syncRes.assetId,
          checksum: loaded.checksum || syncRes.checksum,
          data: undefined,
          payload: undefined,
        };
      }
    }
  }

  return syncRes;
}

export async function rehydrateDesignImages(design: DesignState): Promise<DesignState> {
  const rehydratedMain = await rehydrateImageState(design.image ?? null);
  let elementsChanged = false;

  const elements = design.elements ? await Promise.all(design.elements.map(async (el: CanvasElement) => {
    if (el.type === 'image' && el.data) {
      const imgData = el.data as Record<string, unknown>;
      const imageCandidate: ImageState = {
        name: typeof imgData.name === 'string' ? imgData.name : '',
        type: typeof imgData.type === 'string' ? imgData.type : undefined,
        size: typeof imgData.size === 'number' ? imgData.size : undefined,
        src: typeof imgData.src === 'string' ? imgData.src : '',
        data: typeof imgData.data === 'string' ? imgData.data : undefined,
        payload: typeof imgData.payload === 'string' ? imgData.payload : undefined,
        assetId: typeof imgData.assetId === 'string' ? imgData.assetId : undefined,
        checksum: typeof imgData.checksum === 'string' ? imgData.checksum : undefined,
      };
      const rehydratedElImg = await rehydrateImageState(imageCandidate);
      if (rehydratedElImg && rehydratedElImg.src && rehydratedElImg.src !== imgData.src) {
        elementsChanged = true;
        return {
          ...el,
          data: {
            ...imgData,
            src: rehydratedElImg.src,
            assetId: rehydratedElImg.assetId || imgData.assetId,
            checksum: rehydratedElImg.checksum || imgData.checksum,
            originalSrc: typeof imgData.originalSrc === 'string' && imgData.originalSrc.startsWith('blob:')
              ? rehydratedElImg.src
              : imgData.originalSrc,
            data: undefined,
            payload: undefined,
          },
        };
      }
    }
    return el;
  })) : design.elements;

  return {
    ...design,
    image: rehydratedMain,
    elements: elementsChanged ? elements : design.elements,
  };
}

export async function extractAndPersistImageAssets(design: DesignState): Promise<DesignState> {
  let mainImage = design.image ? { ...design.image } : null;
  if (mainImage) {
    const source = (mainImage.data || mainImage.payload || (typeof mainImage.src === 'string' && mainImage.src.startsWith('data:') ? mainImage.src : null));
    if (typeof source === 'string') {
      const parsed = parseInlinePayload(source, mainImage.type);
      if (parsed) {
        const checksum = mainImage.checksum || await sha256Hex(parsed.bytes);
        const assetId = mainImage.assetId || `asset-${checksum}`;
        await saveGuestAsset({
          id: assetId,
          name: mainImage.name || assetId,
          mimeType: parsed.mimeType || mainImage.type || 'image/png',
          size: parsed.bytes.byteLength,
          payload: parsed.bytes,
          dataUrl: parsed.dataUrl,
          checksum,
          lastUsedAt: Date.now(),
        });
        mainImage = {
          ...mainImage,
          src: assetId,
          assetId,
          checksum,
          size: parsed.bytes.byteLength,
          data: undefined,
          payload: undefined,
        };
      }
    } else if (mainImage.assetId && (mainImage.src.startsWith('blob:') || !mainImage.src)) {
      mainImage = {
        ...mainImage,
        src: mainImage.assetId,
        data: undefined,
        payload: undefined,
      };
    }
  }

  let elementsChanged = false;
  const elements = design.elements ? await Promise.all(design.elements.map(async (el) => {
    if (el.type === 'image' && el.data) {
      const imgData = { ...el.data } as Record<string, unknown>;
      const source = (imgData.data || imgData.payload || (typeof imgData.src === 'string' && imgData.src.startsWith('data:') ? imgData.src : null));
      if (typeof source === 'string') {
        const parsed = parseInlinePayload(source, typeof imgData.type === 'string' ? imgData.type : undefined);
        if (parsed) {
          const checksum = (typeof imgData.checksum === 'string' ? imgData.checksum : null) || await sha256Hex(parsed.bytes);
          const assetId = (typeof imgData.assetId === 'string' ? imgData.assetId : null) || `asset-${checksum}`;
          await saveGuestAsset({
            id: assetId,
            name: typeof imgData.name === 'string' ? imgData.name : assetId,
            mimeType: parsed.mimeType || (typeof imgData.type === 'string' ? imgData.type : 'image/png'),
            size: parsed.bytes.byteLength,
            payload: parsed.bytes,
            dataUrl: parsed.dataUrl,
            checksum,
            lastUsedAt: Date.now(),
          });
          delete imgData.data;
          delete imgData.payload;
          imgData.src = assetId;
          imgData.assetId = assetId;
          imgData.checksum = checksum;
          imgData.size = parsed.bytes.byteLength;
          elementsChanged = true;
          return { ...el, data: imgData };
        }
      } else if (typeof imgData.assetId === 'string' && imgData.assetId) {
        if (typeof imgData.src === 'string' && imgData.src.startsWith('blob:')) {
          imgData.src = imgData.assetId;
          delete imgData.data;
          delete imgData.payload;
          elementsChanged = true;
          return { ...el, data: imgData };
        }
      }
    }
    return el;
  })) : design.elements;

  return {
    ...design,
    image: mainImage,
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
