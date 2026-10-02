import type { LibraryRef } from '../domain/asset-library.ts';
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
