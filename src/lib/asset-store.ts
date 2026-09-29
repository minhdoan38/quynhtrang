import { createHash, randomUUID } from 'node:crypto';
import type { PromotedAsset } from './order-types.ts';
import type { DesignState } from './product-state.ts';

export interface AssetPromotionResult {
  promotedAssets: PromotedAsset[];
  rewrittenDesign: DesignState;
}

const assetRegistryKey = Symbol.for('quynhtrang.serverAssetStore');
const globalAssetRegistry = globalThis as unknown as { [key: symbol]: Map<string, PromotedAsset> };
if (!globalAssetRegistry[assetRegistryKey]) globalAssetRegistry[assetRegistryKey] = new Map();
const assetRegistry = globalAssetRegistry[assetRegistryKey];

export function storeAsset(asset: PromotedAsset): PromotedAsset {
  assetRegistry.set(asset.id, JSON.parse(JSON.stringify(asset)) as PromotedAsset);
  return JSON.parse(JSON.stringify(asset)) as PromotedAsset;
}

export function getAsset(id: string): PromotedAsset | null {
  const asset = assetRegistry.get(id);
  return asset ? JSON.parse(JSON.stringify(asset)) as PromotedAsset : null;
}

export function clearAssetStore(): void {
  assetRegistry.clear();
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

  function record(url: string, partial?: Partial<ScannedAssetMeta>) {
    if (!url || typeof url !== 'string' || !url.startsWith('blob:')) return;
    const existing = metaMap.get(url);
    const mimeType = partial?.mimeType ?? existing?.mimeType ?? (partial?.name ? inferMimeType(partial.name) : undefined);
    const byteSize = partial?.byteSize ?? existing?.byteSize;
    const width = partial?.width ?? existing?.width;
    const height = partial?.height ?? existing?.height;
    const name = partial?.name ?? existing?.name;

    metaMap.set(url, {
      sourceKey: url,
      mimeType: mimeType ?? inferMimeType(url),
      byteSize: byteSize ?? 0,
      width,
      height,
      name,
    });
  }

  // 1. Check design.image
  if (design.image?.src) {
    record(design.image.src, {
      name: design.image.name,
      mimeType: design.image.type,
      byteSize: design.image.size,
      width: design.image.width,
      height: design.image.height,
    });
  }

  // 2. Check design.elements
  if (Array.isArray(design.elements)) {
    for (const el of design.elements) {
      const data = el.data as Record<string, unknown> | undefined;
      if (!data) continue;

      const elementMeta: Partial<ScannedAssetMeta> = {
        name: typeof data.name === 'string' ? data.name : undefined,
        mimeType: typeof data.type === 'string' ? data.type : typeof data.mimeType === 'string' ? data.mimeType : undefined,
        byteSize: typeof data.size === 'number' ? data.size : typeof data.byteSize === 'number' ? data.byteSize : undefined,
        width: typeof data.sourceWidth === 'number' ? data.sourceWidth : typeof data.width === 'number' ? data.width : undefined,
        height: typeof data.sourceHeight === 'number' ? data.sourceHeight : typeof data.height === 'number' ? data.height : undefined,
      };

      if (typeof data.src === 'string') record(data.src, elementMeta);
      if (typeof data.originalSrc === 'string') record(data.originalSrc, elementMeta);
      if (typeof data.removedBackgroundSrc === 'string') record(data.removedBackgroundSrc, elementMeta);
      if (typeof data.previewSrc === 'string') record(data.previewSrc, elementMeta);
    }
  }

  // 3. Recursive fallback scan for any other blob: strings (e.g. in productOptions)
  function scanGeneric(val: unknown) {
    if (typeof val === 'string' && val.startsWith('blob:')) {
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
): Promise<AssetPromotionResult> {
  const scannedBlobs = collectBlobUrlsAndMeta(design);
  const promotedAssets: PromotedAsset[] = [];
  const seenAssetIds = new Set<string>();
  const urlMapping = new Map<string, string>();

  // 1. Process any blob: URLs that need promotion
  for (const [url, meta] of scannedBlobs.entries()) {
    const checksum = computeChecksum(meta);

    // Match existing assets strictly by exact sourceKey or existing asset ID/URL
    const matched =
      existingAssets.find((ea) => ea.sourceKey === url || ea.id === url || ea.originalUrl === url) ??
      getAsset(url) ??
      Array.from(assetRegistry.values()).find((a) => a.sourceKey === url);

    if (matched) {
      if (!seenAssetIds.has(matched.id)) {
        seenAssetIds.add(matched.id);
        promotedAssets.push(matched);
      }
      storeAsset(matched);
      urlMapping.set(url, matched.id);
    } else {
      const assetId = `/api/assets/asset-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const newAsset: PromotedAsset = {
        id: assetId,
        sourceKey: url,
        mimeType: meta.mimeType ?? 'image/png',
        byteSize: meta.byteSize ?? 0,
        ...(meta.width !== undefined ? { width: meta.width } : {}),
        ...(meta.height !== undefined ? { height: meta.height } : {}),
        originalUrl: assetId,
        checksum,
      };
      if (!seenAssetIds.has(newAsset.id)) {
        seenAssetIds.add(newAsset.id);
        promotedAssets.push(newAsset);
      }
      storeAsset(newAsset);
      urlMapping.set(url, assetId);
    }
  }

  // 2. Retain existing assets when design already references promoted /api/assets/ URLs
  const referencedPromotedUrls = collectPromotedUrls(design);
  for (const pUrl of referencedPromotedUrls) {
    const matched =
      existingAssets.find((ea) => ea.id === pUrl || ea.originalUrl === pUrl || ea.sourceKey === pUrl) ??
      getAsset(pUrl);

    if (matched && !seenAssetIds.has(matched.id)) {
      seenAssetIds.add(matched.id);
      promotedAssets.push(matched);
      storeAsset(matched);
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
