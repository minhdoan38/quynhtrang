import { CatalogRepository } from './repositories/catalog-repository.ts';
import { isSupabaseConfigured } from './supabase/config.ts';

export interface FontItem {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly category: 'sans' | 'serif' | 'handwriting' | 'display';
  readonly status: 'published' | 'draft' | 'archived';
  readonly googleFont?: string;
  readonly sampleText?: string;
  readonly storagePath?: string;
  readonly faceId?: string;
  readonly cssAlias?: string;
}

export const FONT_REGISTRY: readonly FontItem[] = Object.freeze([
  {
    id: 'be-vietnam-pro',
    name: 'Be Vietnam Pro',
    family: '"Be Vietnam Pro", system-ui, sans-serif',
    category: 'sans',
    status: 'published',
    googleFont: 'Be+Vietnam+Pro:wght@400;600;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'lora',
    name: 'Lora',
    family: 'Lora, Georgia, serif',
    category: 'serif',
    status: 'published',
    googleFont: 'Lora:wght@500;600;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    family: '"Playfair Display", serif',
    category: 'display',
    status: 'published',
    googleFont: 'Playfair+Display:wght@600;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    family: 'Montserrat, sans-serif',
    category: 'sans',
    status: 'published',
    googleFont: 'Montserrat:wght@500;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'merriweather',
    name: 'Merriweather',
    family: 'Merriweather, serif',
    category: 'serif',
    status: 'published',
    googleFont: 'Merriweather:wght@400;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'comfortaa',
    name: 'Comfortaa',
    family: 'Comfortaa, cursive',
    category: 'display',
    status: 'published',
    googleFont: 'Comfortaa:wght@600;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'dancing-script',
    name: 'Dancing Script',
    family: '"Dancing Script", cursive',
    category: 'handwriting',
    status: 'published',
    googleFont: 'Dancing+Script:wght@600;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'quicksand',
    name: 'Quicksand',
    family: 'Quicksand, sans-serif',
    category: 'sans',
    status: 'published',
    googleFont: 'Quicksand:wght@500;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'pacifico',
    name: 'Pacifico',
    family: 'Pacifico, cursive',
    category: 'handwriting',
    status: 'published',
    googleFont: 'Pacifico',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'caveat',
    name: 'Caveat',
    family: 'Caveat, cursive',
    category: 'handwriting',
    status: 'published',
    googleFont: 'Caveat:wght@600;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    family: 'Roboto, sans-serif',
    category: 'sans',
    status: 'published',
    googleFont: 'Roboto:wght@400;700',
    sampleText: 'Cảm ơn Việt Nam',
  },
  // Example archived font for backward compatibility testing
  {
    id: 'old-typewriter',
    name: 'Old Typewriter',
    family: '"Courier New", monospace',
    category: 'display',
    status: 'archived',
    sampleText: 'Cảm ơn Việt Nam',
  },
  // Example draft font not yet published
  {
    id: 'future-display',
    name: 'Future Display Draft',
    family: 'sans-serif',
    category: 'display',
    status: 'draft',
    sampleText: 'Cảm ơn Việt Nam',
  },
]);

export const DEFAULT_FONT_ID = 'be-vietnam-pro';
export const RECENT_FONTS_STORAGE_KEY = 'print-customizer-recent-fonts-v1';
export const MAX_RECENT_FONTS = 6;

export function getPublishedFonts(): FontItem[];
export function getPublishedFonts(repository: CatalogRepository): Promise<FontItem[]>;
export function getPublishedFonts(repository?: CatalogRepository): FontItem[] | Promise<FontItem[]> {
  if (repository) {
    return loadPublishedFonts(repository);
  }
  return FONT_REGISTRY.filter((f) => f.status === 'published');
}

export async function loadPublishedFonts(
  repository?: CatalogRepository
): Promise<FontItem[]> {
  if (!repository && !isSupabaseConfigured()) {
    return FONT_REGISTRY.filter((font) => font.status === 'published');
  }
  const repo = repository ?? new CatalogRepository();
  const fonts = await repo.listPublishedFonts();
  if (!repository && isSupabaseConfigured() && fonts.length === 0) {
    return [];
  }
  return fonts.map((font) => {
    const faceId = typeof font.metadata?.faceId === 'string' ? font.metadata.faceId : font.id;
    const cssAlias = font.storagePath ? `qt-face-${faceId.replace(/[^a-zA-Z0-9_-]/g, '-')}` : undefined;
    return {
      id: font.id,
      name: font.name,
      family: cssAlias ? `"${cssAlias}"` : font.family,
      category: font.category,
      status: 'published' as const,
      googleFont: font.googleFont ?? undefined,
      storagePath: font.storagePath ?? undefined,
      faceId,
      cssAlias,
      sampleText: font.sampleText,
    };
  });
}

export const getPublishedFontsAsync = loadPublishedFonts;

export function getDefaultFont(): FontItem {
  const found = FONT_REGISTRY.find((f) => f.id === DEFAULT_FONT_ID);
  return found || FONT_REGISTRY[0];
}

export function getFontById(id: string): FontItem | undefined {
  return FONT_REGISTRY.find((f) => f.id === id);
}

export function findFontByFamily(familyOrName: string): FontItem | undefined {
  if (!familyOrName) return undefined;
  const clean = familyOrName.toLowerCase().replace(/['"]/g, '').trim();

  // Try exact ID match
  const byId = FONT_REGISTRY.find((f) => f.id.toLowerCase() === clean);
  if (byId) return byId;

  // Try name match
  const byName = FONT_REGISTRY.find((f) => f.name.toLowerCase() === clean);
  if (byName) return byName;

  // Try family string containment
  return FONT_REGISTRY.find((f) => {
    const fClean = f.family.toLowerCase().replace(/['"]/g, '');
    return fClean.includes(clean) || clean.includes(f.name.toLowerCase());
  });
}

export function normalizeSearchTerm(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function searchFonts(query: string, fonts: FontItem[] = getPublishedFonts()): FontItem[] {
  const clean = normalizeSearchTerm(query);
  if (!clean) return [...fonts];

  return fonts.filter((f) => {
    const normName = normalizeSearchTerm(f.name);
    const normId = normalizeSearchTerm(f.id);
    return normName.includes(clean) || normId.includes(clean);
  });
}

export function getRecentFontIds(storage?: Storage): string[] {
  try {
    const targetStorage = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!targetStorage) return [];
    const raw = targetStorage.getItem(RECENT_FONTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Ensure all returned IDs exist in registry and are published
    const publishedIds = new Set(getPublishedFonts().map((f) => f.id));
    return parsed.filter((id): id is string => typeof id === 'string' && publishedIds.has(id)).slice(0, MAX_RECENT_FONTS);
  } catch {
    return [];
  }
}

export function addRecentFontId(id: string, storage?: Storage): string[] {
  try {
    const targetStorage = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    const publishedIds = new Set(getPublishedFonts().map((f) => f.id));
    if (!publishedIds.has(id)) return getRecentFontIds(targetStorage);

    const current = getRecentFontIds(targetStorage);
    const next = [id, ...current.filter((item) => item !== id)].slice(0, MAX_RECENT_FONTS);

    if (targetStorage) {
      targetStorage.setItem(RECENT_FONTS_STORAGE_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    return [];
  }
}

// Module-level font loading cache
const fontLoadPromiseCache = new Map<string, Promise<boolean>>();

export function loadFont(font: FontItem): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(true);
  }

  const cacheKey = `${font.id}:${font.faceId ?? ''}:${font.storagePath ?? font.googleFont ?? ''}`;
  const cached = fontLoadPromiseCache.get(cacheKey);
  if (cached) return cached;

  if (font.storagePath && typeof FontFace !== 'undefined' && 'fonts' in document) {
    const alias = font.cssAlias ?? `qt-face-${(font.faceId ?? font.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const url = `/api/library/font/${encodeURIComponent(font.faceId ?? font.id)}`;
    const loadPromise = new FontFace(alias, `url("${url}")`)
      .load()
      .then((face) => {
        document.fonts.add(face);
        return true;
      })
      .catch(() => false);
    fontLoadPromiseCache.set(cacheKey, loadPromise);
    return loadPromise;
  }

  if (!font.googleFont) return Promise.resolve(true);

  const loadPromise = new Promise<boolean>((resolve) => {
    try {
      const linkId = `google-font-${font.id}`;
      let linkEl = document.getElementById(linkId) as HTMLLinkElement | null;
      if (!linkEl) {
        linkEl = document.createElement('link');
        linkEl.id = linkId;
        linkEl.rel = 'stylesheet';
        linkEl.href = `https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap`;
        document.head.appendChild(linkEl);
      }
      if ('fonts' in document) {
        const timeoutId = setTimeout(() => resolve(true), 3000);
        document.fonts.load(`16px "${font.name}"`).then(() => {
          clearTimeout(timeoutId);
          resolve(true);
        }).catch(() => {
          clearTimeout(timeoutId);
          resolve(false);
        });
      } else {
        linkEl.onload = () => resolve(true);
        linkEl.onerror = () => resolve(false);
      }
    } catch {
      resolve(false);
    }
  });
  fontLoadPromiseCache.set(cacheKey, loadPromise);
  return loadPromise;
}
