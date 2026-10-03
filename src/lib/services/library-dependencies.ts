import type { LibraryRef } from '../domain/asset-library.ts';
import type {
  DependencyMetadataItem,
  TemplateAvailabilityBlocker,
} from '../domain/template.ts';
import { extractTemplateAssetManifest, type TemplateAssetRef } from './template-assets.ts';
import {
  getStickerData,
  getTextData,
  type CanvasElement,
  type DesignState,
} from '../product-state.ts';

function normalizeAlias(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function resolveLegacyReferences(
  document: DesignState,
  familyAliases: Map<string, string> = new Map(),
): DesignState {
  if (!document.elements?.length || familyAliases.size === 0) return document;

  const aliases = new Map<string, string>();
  for (const [alias, targetId] of familyAliases) {
    const normalized = normalizeAlias(alias);
    const existing = aliases.get(normalized);
    if (existing && existing !== targetId) {
      throw new Error(`Ambiguous font family alias "${alias}": ${existing}, ${targetId}`);
    }
    aliases.set(normalized, targetId);
  }

  let changed = false;
  const elements = document.elements.map((element): CanvasElement => {
    const text = getTextData(element);
    if (!text || text.fontFaceId || !text.fontFamily?.trim()) return element;

    const targetId = aliases.get(normalizeAlias(text.fontFamily));
    if (!targetId) return element;
    changed = true;
    return {
      ...element,
      data: {
        ...element.data,
        fontFamilyId: text.fontFamilyId ?? targetId,
        fontFaceId: targetId,
      },
    };
  });

  return changed ? { ...document, elements } : document;
}

export function extractLibraryDependencies(document: DesignState): LibraryRef[] {
  const refs = new Map<string, LibraryRef>();
  for (const element of document.elements ?? []) {
    const text = getTextData(element);
    if (text?.fontFaceId) {
      const ref: LibraryRef = { kind: 'font-face', id: text.fontFaceId, checksum: text.fontChecksum ?? '' };
      refs.set(`${ref.kind}:${ref.id}:${ref.checksum}`, ref);
    }

    const sticker = getStickerData(element);
    if (sticker?.libraryAssetId) {
      const ref: LibraryRef = { kind: 'sticker', id: sticker.libraryAssetId, checksum: sticker.assetChecksum ?? '' };
      refs.set(`${ref.kind}:${ref.id}:${ref.checksum}`, ref);
    }
  }
  return [...refs.values()];
}

export function isLibraryAssetPath(pathOrUrl: string): boolean {
  const input = pathOrUrl.trim();
  if (!input) return false;

  let path = input;
  try {
    path = new URL(input, 'http://local.invalid').pathname;
  } catch {
    return false;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(path).replace(/^\/+/, '');
  } catch {
    return false;
  }
  if (decoded.startsWith('stickers/') || decoded.startsWith('fonts/')) return true;
  if (decoded.startsWith('api/library/')) return true;
  if (decoded.startsWith('sticker-library/stickers/')) return true;

  const publicObject = decoded.match(/^storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!publicObject) return false;
  const [, bucket, key] = publicObject;
  return (bucket === 'sticker-library' && key.startsWith('stickers/'))
    || (bucket === 'fonts' && key.startsWith('fonts/'));
}

export function validateNoDraftDependencies(
  document: DesignState,
  libraryLookup?: ReadonlyMap<string, { status: string }>,
): void {
  const deps = extractLibraryDependencies(document);
  if (!libraryLookup) return;
  for (const dep of deps) {
    const item = libraryLookup.get(`${dep.kind}:${dep.id}`);
    if (item && item.status === 'draft') {
      throw new Error(`Cannot save design referencing draft asset: ${dep.id}`);
    }
  }
}

export interface ResolveTemplateDependenciesOptions {
  purpose?: 'new-use' | 'historical';
  lookup?: ReadonlyMap<string, DependencyMetadataItem> | Record<string, DependencyMetadataItem>;
  familyAliases?: Map<string, string> | Record<string, string>;
}

export interface ResolvedTemplateDependencies {
  dependencies: LibraryRef[];
  assetRefs: TemplateAssetRef[];
  blockers: TemplateAvailabilityBlocker[];
  valid: boolean;
}

function getLookupItem(
  lookup: ReadonlyMap<string, DependencyMetadataItem> | Record<string, DependencyMetadataItem>,
  key: string,
): DependencyMetadataItem | undefined {
  if (lookup instanceof Map) {
    return lookup.get(key)
      ?? lookup.get(`font-face:${key}`)
      ?? lookup.get(`sticker:${key}`);
  }
  const record = lookup as Record<string, DependencyMetadataItem>;
  return record[key] ?? record[`font-face:${key}`] ?? record[`sticker:${key}`];
}

export function resolveTemplateDependencies(
  document: DesignState,
  options: ResolveTemplateDependenciesOptions = {},
): ResolvedTemplateDependencies {
  const purpose = options.purpose ?? 'new-use';
  const dependencies = extractLibraryDependencies(document);
  const assetRefs = extractTemplateAssetManifest(document);
  const blockers: TemplateAvailabilityBlocker[] = [];

  if (options.lookup) {
    for (const dep of dependencies) {
      const item = getLookupItem(options.lookup, dep.id);
      if (!item) {
        blockers.push({
          code: 'MISSING_DEPENDENCY',
          kind: dep.kind,
          id: dep.id,
          message: `Phụ thuộc không tồn tại: ${dep.id}`,
        });
        continue;
      }

      if (dep.checksum && item.checksum && dep.checksum !== item.checksum) {
        blockers.push({
          code: 'MISSING_DEPENDENCY',
          kind: dep.kind,
          id: dep.id,
          message: `Mã kiểm tra không khớp cho ${dep.id}: mong đợi ${dep.checksum}, nhận được ${item.checksum}`,
        });
      }

      if (item.status === 'archived' || item.familyStatus === 'archived') {
        if (purpose !== 'historical') {
          blockers.push({
            code: 'ARCHIVED_DEPENDENCY',
            kind: dep.kind,
            id: dep.id,
            message: `Phụ thuộc đã bị lưu trữ: ${dep.id}`,
          });
        }
      } else if (item.status === 'draft' || item.familyStatus === 'draft') {
        blockers.push({
          code: 'UNPUBLISHED_DEPENDENCY',
          kind: dep.kind,
          id: dep.id,
          message: `Phụ thuộc chưa được xuất bản: ${dep.id}`,
        });
      }
    }
  }

  if (options.familyAliases) {
    const aliases = options.familyAliases instanceof Map
      ? options.familyAliases
      : new Map(Object.entries(options.familyAliases));

    for (const element of document.elements ?? []) {
      const text = getTextData(element);
      if (text && !text.fontFaceId && text.fontFamily?.trim()) {
        const normalized = normalizeAlias(text.fontFamily);
        if (!aliases.has(normalized)) {
          blockers.push({
            code: 'MISSING_DEPENDENCY',
            kind: 'font-face',
            id: text.fontFamily,
            message: `Phông chữ không xác định: ${text.fontFamily}`,
          });
        }
      }
    }
  }

  return {
    dependencies,
    assetRefs,
    blockers,
    valid: blockers.length === 0,
  };
}
