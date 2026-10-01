import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  unlinkSync,
  statSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import type { PromotedAsset } from './order-types.ts';
import type { DesignState } from './product-state.ts';
import { isLibraryAssetPath } from './services/library-dependencies.ts';

export interface AssetPromotionResult {
  promotedAssets: PromotedAsset[];
  rewrittenDesign: DesignState;
}

export interface AssetPromotionRepository {
  promoteAsset(input: {
    projectId: string;
    storageBucket: 'customer-assets';
    kind: string;
    originalName?: string | null;
    mimeType: string;
    bytes: Uint8Array;
    pixelWidth?: number | null;
    pixelHeight?: number | null;
    checksum?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
}

export interface AssetPromotionOptions {
  projectId: string;
  assetRepo: AssetPromotionRepository;
}

const MAX_FS_ASSETS = 300;
const STORAGE_DIR = process.env.ASSET_STORAGE_DIR || join(process.cwd(), 'node_modules', '.cache', 'quynhtrang-assets');

function ensureStorageDir(): boolean {
  try {
    if (!existsSync(STORAGE_DIR)) {
      mkdirSync(STORAGE_DIR, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

function getSafeDiskFilename(id: string): string {
  const cleanId = id.split('?')[0].split('#')[0].replace(/^\/api\/assets\//, '');
  return cleanId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
}

function writeAssetToDisk(asset: PromotedAsset): void {
  try {
    if (!ensureStorageDir()) return;
    const filename = getSafeDiskFilename(asset.id);
    const filepath = join(STORAGE_DIR, filename);
    const tempPath = filepath + `.tmp.${randomUUID()}`;
    writeFileSync(tempPath, JSON.stringify(asset), 'utf8');
    renameSync(tempPath, filepath);

    const files = readdirSync(STORAGE_DIR).filter((f) => f.endsWith('.json'));
    if (files.length > MAX_FS_ASSETS) {
      const stats = files.map((file) => {
        const fp = join(STORAGE_DIR, file);
        return { fp, mtime: statSync(fp).mtimeMs };
      });
      stats.sort((a, b) => a.mtime - b.mtime);
      for (let i = 0; i < stats.length - MAX_FS_ASSETS; i++) {
        try { unlinkSync(stats[i].fp); } catch { /* ignore */ }
      }
    }
  } catch {
    // Graceful fallback: memory cache remains intact
  }
}

function readAssetFromDisk(id: string): PromotedAsset | null {
  try {
    const filename = getSafeDiskFilename(id);
    const filepath = join(STORAGE_DIR, filename);
    if (!existsSync(filepath)) return null;
    const content = readFileSync(filepath, 'utf8');
    const asset = JSON.parse(content) as PromotedAsset;
    if (asset && typeof asset === 'object' && typeof asset.id === 'string') {
      return asset;
    }
    return null;
  } catch {
    return null;
  }
}

function clearDiskAssets(): void {
  try {
    if (existsSync(STORAGE_DIR)) {
      rmSync(STORAGE_DIR, { recursive: true, force: true });
    }
  } catch {
    // Graceful fallback
  }
}

const assetRegistryKey = Symbol.for('quynhtrang.serverAssetStore');
const globalAssetRegistry = globalThis as unknown as { [key: symbol]: Map<string, PromotedAsset> };
if (!globalAssetRegistry[assetRegistryKey]) globalAssetRegistry[assetRegistryKey] = new Map();
const assetRegistry = globalAssetRegistry[assetRegistryKey];
function normalizePayload(payload: unknown): string | undefined {
  if (payload === undefined || payload === null) return undefined;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed.startsWith('data:')) return payload;
    if (trimmed.startsWith('<') || trimmed.includes('xmlns') || !/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
      return Buffer.from(payload, 'utf8').toString('base64');
    }
    return payload;
  }
  if (payload instanceof Uint8Array || Buffer.isBuffer(payload)) {
    return Buffer.from(payload).toString('base64');
  }
  return undefined;
}

export function storeAsset(
  asset: Omit<PromotedAsset, 'payload'> & { payload?: string | Uint8Array },
): PromotedAsset {
  const normalizedPayload = normalizePayload(asset.payload);
  const { payload: _ignored, ...rest } = asset;
  const copy: PromotedAsset = {
    ...rest,
    ...(normalizedPayload !== undefined ? { payload: normalizedPayload } : {}),
    derivedUrls: asset.derivedUrls ? { ...asset.derivedUrls } : undefined,
  };
  const cleanId = asset.id.split('?')[0].split('#')[0];
  const idWithoutPrefix = cleanId.replace(/^\/api\/assets\//, '');
  const idWithPrefix = cleanId.startsWith('/api/assets/') ? cleanId : `/api/assets/${cleanId}`;

  assetRegistry.set(asset.id, copy);
  assetRegistry.set(cleanId, copy);
  assetRegistry.set(idWithoutPrefix, copy);
  assetRegistry.set(idWithPrefix, copy);

  writeAssetToDisk(copy);
  return copy;
}

export function getAsset(id: string): PromotedAsset | null {
  const cleanId = id.split('?')[0].split('#')[0];
  const idWithoutPrefix = cleanId.replace(/^\/api\/assets\//, '');
  const idWithPrefix = cleanId.startsWith('/api/assets/') ? cleanId : `/api/assets/${cleanId}`;
  let asset =
    assetRegistry.get(id) ??
    assetRegistry.get(cleanId) ??
    assetRegistry.get(idWithoutPrefix) ??
    assetRegistry.get(idWithPrefix);

  if (!asset) {
    const fromDisk = readAssetFromDisk(cleanId);
    if (fromDisk) {
      asset = fromDisk;
      assetRegistry.set(fromDisk.id, fromDisk);
      assetRegistry.set(idWithoutPrefix, fromDisk);
      assetRegistry.set(idWithPrefix, fromDisk);
    }
  }

  if (!asset) return null;
  return {
    ...asset,
    derivedUrls: asset.derivedUrls ? { ...asset.derivedUrls } : undefined,
  };
}

export function clearAssetStore(): void {
  assetRegistry.clear();
  clearDiskAssets();
}

function collectPromotedUrls(design: DesignState): string[] {
  const urls = new Set<string>();
  function scan(value: unknown) {
    if (typeof value === 'string' && value.startsWith('/api/assets/')) urls.add(value);
    else if (Array.isArray(value)) for (const item of value) scan(item);
    else if (value !== null && typeof value === 'object') for (const item of Object.values(value)) scan(item);
  }
  scan(design);
  return [...urls];
}

interface ScannedAssetMeta {
  sourceKey: string;
  mimeType?: string;
  byteSize?: number;
  width?: number;
  height?: number;
  name?: string;
  data?: string;
  payload?: string;
}

function inferMimeType(urlOrName: string): string {
  const lower = urlOrName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

function computeChecksum(meta: ScannedAssetMeta): string {
  // If distinctive metadata exists (name, size > 0, or dimensions), use content-characteristic hash
  if (meta.name || (meta.byteSize !== undefined && meta.byteSize > 0) || meta.width || meta.height) {
    const payload = [
      meta.name ?? '',
      meta.mimeType ?? '',
      meta.byteSize ?? 0,
      meta.width ?? 0,
      meta.height ?? 0,
    ].join('|');
    return createHash('sha256').update(payload).digest('hex');
  }
  // Fallback when no metadata attributes are present
  return createHash('sha256').update(meta.sourceKey).digest('hex');
}

function collectBlobUrlsAndMeta(design: DesignState): Map<string, ScannedAssetMeta> {
  const metaMap = new Map<string, ScannedAssetMeta>();

  function record(url: string, partial?: Partial<ScannedAssetMeta> & { payload?: string | Uint8Array }) {
    if (!url || typeof url !== 'string' || isLibraryAssetPath(url)) return;
    if (!url.startsWith('blob:') && !url.startsWith('data:image/')) return;
    const existing = metaMap.get(url);
    const mimeType = partial?.mimeType ?? existing?.mimeType ?? (partial?.name ? inferMimeType(partial.name) : undefined);
    const byteSize = partial?.byteSize ?? existing?.byteSize;
    const width = partial?.width ?? existing?.width;
    const height = partial?.height ?? existing?.height;
    const name = partial?.name ?? existing?.name;
    const data = partial?.data ?? existing?.data;
    const rawPayload = partial?.payload ?? existing?.payload ?? (url.startsWith('data:image/') ? url : undefined);
    const payload = normalizePayload(rawPayload);

    metaMap.set(url, {
      sourceKey: url,
      mimeType: mimeType ?? inferMimeType(url),
      byteSize: byteSize ?? 0,
      width,
      height,
      name,
      data,
      payload,
    });
  }

  // 1. Check design.image
  if (design.image?.src) {
    const rawImg = design.image as { payload?: string | Uint8Array; data?: string };
    record(design.image.src, {
      name: design.image.name,
      mimeType: design.image.type,
      byteSize: design.image.size,
      width: design.image.width,
      height: design.image.height,
      data: rawImg.data,
      payload: normalizePayload(rawImg.payload ?? (rawImg.data ? rawImg.data : undefined)),
    });
  }

  // 2. Check design.elements
  if (Array.isArray(design.elements)) {
    for (const el of design.elements) {
      const data = el.data as Record<string, unknown> | undefined;
      if (!data) continue;
      const isLibraryElement = el.type === 'sticker' && (
        typeof data.libraryAssetId === 'string'
        || (typeof data.storagePath === 'string' && isLibraryAssetPath(data.storagePath))
        || (typeof data.src === 'string' && isLibraryAssetPath(data.src))
      );
      if (isLibraryElement) continue;

      const rawPayload = (data.payload as string | Uint8Array | undefined) ?? (typeof data.data === 'string' ? data.data : undefined);
      const elementMeta: Partial<ScannedAssetMeta> = {
        name: typeof data.name === 'string' ? data.name : undefined,
        mimeType: typeof data.type === 'string' ? data.type : typeof data.mimeType === 'string' ? data.mimeType : undefined,
        byteSize: typeof data.size === 'number' ? data.size : typeof data.byteSize === 'number' ? data.byteSize : undefined,
        width: typeof data.sourceWidth === 'number' ? data.sourceWidth : typeof data.width === 'number' ? data.width : undefined,
        height: typeof data.sourceHeight === 'number' ? data.sourceHeight : typeof data.height === 'number' ? data.height : undefined,
        data: typeof data.data === 'string' ? data.data : undefined,
        payload: normalizePayload(rawPayload),
      };
      if (typeof data.url === 'string') record(data.url, elementMeta);
      if (typeof data.src === 'string') record(data.src, elementMeta);
      if (typeof data.originalSrc === 'string') record(data.originalSrc, elementMeta);
      if (typeof data.removedBackgroundSrc === 'string') record(data.removedBackgroundSrc, elementMeta);
      if (typeof data.previewSrc === 'string') record(data.previewSrc, elementMeta);
    }
  }

  // 3. Recursive fallback scan for any other blob: strings (e.g. in productOptions)
  function scanGeneric(val: unknown) {
    if (typeof val === 'string' && (val.startsWith('blob:') || val.startsWith('data:image/'))) {
      if (!metaMap.has(val)) {
        record(val);
      }
    } else if (Array.isArray(val)) {
      for (const item of val) scanGeneric(item);
    } else if (val !== null && typeof val === 'object') {
      for (const v of Object.values(val)) scanGeneric(v);
    }
  }

  scanGeneric(design.productOptions);

  return metaMap;
}

function replaceStrings(obj: unknown, mapping: Map<string, string>): unknown {
  if (typeof obj === 'string') {
    return mapping.get(obj) ?? obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => replaceStrings(item, mapping));
  }
  if (obj !== null && typeof obj === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      next[key] = replaceStrings(val, mapping);
    }
    return next;
  }
  return obj;
}

export async function promoteDesignAssets(
  design: DesignState,
  existingAssets: PromotedAsset[] = [],
  options?: AssetPromotionOptions,
): Promise<AssetPromotionResult> {
  const scannedBlobs = collectBlobUrlsAndMeta(design);
  const promotedAssets: PromotedAsset[] = [];
  const seenAssetIds = new Set<string>();
  const urlMapping = new Map<string, string>();

  // 1. Process any blob: URLs that need promotion
  for (const [url, meta] of scannedBlobs.entries()) {
    const checksum = computeChecksum(meta);

    // Match existing assets strictly by exact sourceKey or existing asset ID/URL
    const matched = options ? undefined : (
      existingAssets.find((ea) => ea.sourceKey === url || ea.id === url || ea.originalUrl === url) ??
      getAsset(url) ??
      Array.from(assetRegistry.values()).find((a) => a.sourceKey === url)
    );

    if (matched) {
      if (meta.payload !== undefined && matched.payload === undefined) {
        matched.payload = meta.payload;
      }
      if (meta.data !== undefined && matched.data === undefined) {
        matched.data = meta.data;
      }
      if (matched.payload !== undefined) {
        matched.payload = normalizePayload(matched.payload);
      }
      if (!seenAssetIds.has(matched.id)) {
        seenAssetIds.add(matched.id);
        promotedAssets.push(matched);
      }
      storeAsset(matched);
      urlMapping.set(url, matched.id);
    } else {
      const resolvedPayload = meta.payload ?? (meta.data ? normalizePayload(meta.data) : undefined);
      if (options && resolvedPayload === undefined) {
        throw new Error(`Tài nguyên không có dữ liệu để tải lên: ${url}`);
      }
      let bytes = Buffer.alloc(0);
      if (resolvedPayload) {
        const dataUrl = /^data:([^,]*),(.*)$/s.exec(resolvedPayload);
        bytes = dataUrl && !dataUrl[1].includes(';base64')
          ? Buffer.from(decodeURIComponent(dataUrl[2]), 'utf8')
          : Buffer.from(dataUrl ? dataUrl[2] : resolvedPayload, 'base64');
      }
      if (options && bytes.byteLength === 0) {
        throw new Error(`Tài nguyên không có dữ liệu để tải lên: ${url}`);
      }
      const byteSize = options ? bytes.byteLength : (meta.byteSize && meta.byteSize > 0 ? meta.byteSize : bytes.byteLength);
      const stored = options
        ? await options.assetRepo.promoteAsset({
          projectId: options.projectId,
          storageBucket: 'customer-assets',
          kind: 'customer_upload',
          originalName: meta.name,
          mimeType: meta.mimeType ?? 'image/png',
          bytes,
          pixelWidth: meta.width,
          pixelHeight: meta.height,
          checksum: createHash('sha256').update(bytes).digest('hex'),
          metadata: { sourceKey: url },
        })
        : null;
      const assetId = `/api/assets/${stored?.id ?? `asset-${randomUUID().replace(/-/g, '').slice(0, 12)}`}`;
      const newAsset: PromotedAsset = {
        id: assetId,
        sourceKey: url,
        mimeType: meta.mimeType ?? 'image/png',
        byteSize,
        ...(meta.width !== undefined ? { width: meta.width } : {}),
        ...(meta.height !== undefined ? { height: meta.height } : {}),
        originalUrl: assetId,
        checksum,
        ...(meta.data ? { data: meta.data } : {}),
        ...(resolvedPayload !== undefined ? { payload: resolvedPayload } : {}),
      };
      if (!seenAssetIds.has(newAsset.id)) {
        seenAssetIds.add(newAsset.id);
        promotedAssets.push(newAsset);
      }
      if (!options) storeAsset(newAsset);
      urlMapping.set(url, assetId);
    }
  }

  // 2. Retain existing assets when design already references promoted /api/assets/ URLs
  const referencedPromotedUrls = collectPromotedUrls(design);
  for (const pUrl of referencedPromotedUrls) {
    const matched =
      existingAssets.find((ea) => ea.id === pUrl || ea.originalUrl === pUrl || ea.sourceKey === pUrl) ??
      getAsset(pUrl);

    if (matched) {
      if (!seenAssetIds.has(matched.id)) {
        if (matched.payload !== undefined) {
          matched.payload = normalizePayload(matched.payload);
        }
        seenAssetIds.add(matched.id);
        promotedAssets.push(matched);
        storeAsset(matched);
      }
    } else {
      throw new Error(`Tài nguyên máy chủ không tồn tại: ${pUrl}`);
    }
  }
  const rewrittenDesign = replaceStrings(
    JSON.parse(JSON.stringify(design)),
    urlMapping,
  ) as DesignState;

  return {
    promotedAssets,
    rewrittenDesign,
  };
}
