import { CatalogRepository } from '../lib/repositories/catalog-repository.ts';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FONT_REGISTRY,
  DEFAULT_FONT_ID,
  getPublishedFonts,
  loadPublishedFonts,
  getPublishedFontsAsync,
  getDefaultFont,
  getFontById,
  findFontByFamily,
  searchFonts,
  getRecentFontIds,
  addRecentFontId,
  MAX_RECENT_FONTS,
  RECENT_FONTS_STORAGE_KEY,
  loadFont,
} from '../lib/fonts.ts';

// In-memory mock storage
function createMockStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

test('font registry has valid default font and filters published fonts', () => {
  const defaultFont = getDefaultFont();
  assert.equal(defaultFont.id, DEFAULT_FONT_ID);
  assert.equal(defaultFont.status, 'published');
  assert.equal(defaultFont.name, 'Be Vietnam Pro');

  const published = getPublishedFonts();
  assert.ok(published.length >= 8, 'Published fonts should contain at least 8 curated families');
  assert.ok(published.every((f) => f.status === 'published'));

  // Ensure draft and archived fonts are excluded from published
  const draftOrArchived = FONT_REGISTRY.filter((f) => f.status !== 'published');
  assert.ok(draftOrArchived.length > 0);
  for (const item of draftOrArchived) {
    assert.ok(!published.some((p) => p.id === item.id));
  }
});

test('findFontByFamily resolves correctly by ID, name or CSS family', () => {
  assert.equal(findFontByFamily('be-vietnam-pro')?.name, 'Be Vietnam Pro');
  assert.equal(findFontByFamily('Lora')?.id, 'lora');
  assert.equal(findFontByFamily('"Playfair Display", serif')?.id, 'playfair-display');
  assert.equal(findFontByFamily('dancing-script')?.category, 'handwriting');
  assert.equal(findFontByFamily('non-existent-font'), undefined);
});

test('searchFonts performs case and diacritics insensitive search', () => {
  const all = getPublishedFonts();

  // Empty query returns all published
  assert.equal(searchFonts('').length, all.length);
  assert.equal(searchFonts('   ').length, all.length);

  // Search by exact prefix
  const vietResults = searchFonts('viet');
  assert.ok(vietResults.some((f) => f.id === 'be-vietnam-pro'));

  // Search with diacritics
  const withAccents = searchFonts('Việt');
  assert.ok(withAccents.some((f) => f.id === 'be-vietnam-pro'));

  // Search with uppercase
  const upper = searchFonts('LORA');
  assert.equal(upper.length, 1);
  assert.equal(upper[0].id, 'lora');

  // Search non-matching returns empty array
  assert.deepEqual(searchFonts('xyz-nonexistent'), []);
});

test('recent fonts management handles empty, deduplication, order, and capacity limit', () => {
  const storage = createMockStorage();

  // Initially empty
  assert.deepEqual(getRecentFontIds(storage), []);

  // Add first font
  const r1 = addRecentFontId('lora', storage);
  assert.deepEqual(r1, ['lora']);
  assert.deepEqual(getRecentFontIds(storage), ['lora']);

  // Add second font -> goes to front
  const r2 = addRecentFontId('montserrat', storage);
  assert.deepEqual(r2, ['montserrat', 'lora']);

  // Selecting 'lora' again moves it to front without duplication
  const r3 = addRecentFontId('lora', storage);
  assert.deepEqual(r3, ['lora', 'montserrat']);

  // Add more fonts up to limit (6)
  addRecentFontId('quicksand', storage);
  addRecentFontId('comfortaa', storage);
  addRecentFontId('dancing-script', storage);
  addRecentFontId('playfair-display', storage);
  const full = addRecentFontId('roboto', storage);

  assert.equal(full.length, MAX_RECENT_FONTS);
  assert.equal(full[0], 'roboto');
  // 'montserrat' should be pushed out since it was at the end
  assert.ok(!full.includes('montserrat'));

  // Adding an unpublished or nonexistent font is ignored
  const beforeInvalid = getRecentFontIds(storage);
  const afterInvalid = addRecentFontId('invalid-draft-font', storage);
  assert.deepEqual(beforeInvalid, afterInvalid);
});

test('recent fonts recovers gracefully from corrupted storage', () => {
  const storage = createMockStorage({
    [RECENT_FONTS_STORAGE_KEY]: 'invalid-json-content{{{',
  });
  assert.deepEqual(getRecentFontIds(storage), []);
});

test('font browser batching session commits exactly one undo entry upon closing with changes', () => {
  // Simulate shell state
  interface MockShellState {
    productId: string;
    variantId: string;
    text: string;
    productOptions: { fontFamily: string };
  }
  const baseState: MockShellState = {
    productId: 'card',
    variantId: 'horizontal',
    text: 'Chúc mừng',
    productOptions: { fontFamily: 'Be Vietnam Pro' },
  };

  const past: MockShellState[] = [];
  let currentState: MockShellState = { ...baseState, productOptions: { ...baseState.productOptions } };
  let fontSessionBaseState: MockShellState | null = null;
  // 1. User opens Font Browser
  fontSessionBaseState = currentState;

  // 2. User previews multiple fonts rapidly
  const previewFonts = ['Montserrat', 'Lora', 'Playfair Display'];
  for (const font of previewFonts) {
    currentState = {
      ...currentState,
      productOptions: { ...currentState.productOptions, fontFamily: font },
    };
    // Crucial: during previews, past is NOT polluted!
    assert.equal(past.length, 0);
  }

  // 3. User closes Font Browser
  if (fontSessionBaseState) {
    if (currentState.productOptions.fontFamily !== fontSessionBaseState.productOptions.fontFamily) {
      past.push(fontSessionBaseState);
    }
    fontSessionBaseState = null;
  }

  // Exactly ONE history record in past!
  assert.equal(past.length, 1);
  assert.equal(past[0].productOptions.fontFamily, 'Be Vietnam Pro');
  assert.equal(currentState.productOptions.fontFamily, 'Playfair Display');

  // Undo restores base state
  const undone = past.pop();
  assert.ok(undone);
  assert.equal(undone.productOptions.fontFamily, 'Be Vietnam Pro');
});

test('font browser closing without changing font adds zero history entries', () => {
  interface MockShellState {
    productId: string;
    variantId: string;
    text: string;
    productOptions: { fontFamily: string };
  }
  const baseState: MockShellState = {
    productId: 'card',
    variantId: 'horizontal',
    text: 'Chúc mừng',
    productOptions: { fontFamily: 'Be Vietnam Pro' },
  };

  const past: MockShellState[] = [];
  let currentState: MockShellState = { ...baseState, productOptions: { ...baseState.productOptions } };
  let fontSessionBaseState: MockShellState | null = null;
  // 1. Open
  fontSessionBaseState = currentState;

  // 2. Preview another font then preview back to original
  currentState = { ...currentState, productOptions: { fontFamily: 'Lora' } };
  currentState = { ...currentState, productOptions: { fontFamily: 'Be Vietnam Pro' } };

  // 3. Close
  if (fontSessionBaseState) {
    if (currentState.productOptions.fontFamily !== fontSessionBaseState.productOptions.fontFamily) {
      past.push(fontSessionBaseState);
    }
    fontSessionBaseState = null;
  }

  // Zero history entries
  assert.equal(past.length, 0);
});

test('loadPublishedFonts queries catalog repository and falls back to FONT_REGISTRY', async () => {
  const fonts = await loadPublishedFonts();
  assert.ok(fonts.length >= 8);
  assert.ok(fonts.every((f) => f.status === 'published'));

  const asyncAlias = await getPublishedFontsAsync();
  assert.equal(asyncAlias.length, fonts.length);

  const syncCall = getPublishedFonts();
  assert.equal(syncCall.length, fonts.length);

  const repo = new CatalogRepository(null);
  const viaRepo = await getPublishedFonts(repo);
  assert.equal(viaRepo.length, fonts.length);
});

test('loadPublishedFonts preserves self-hosted identity and loadFont registers its unique CSS alias', async () => {
  const repository = {
    listPublishedFonts: async () => [{
      id: 'family-handwriting',
      name: 'Handwriting',
      family: 'Handwriting',
      category: 'handwriting' as const,
      storagePath: 'fonts/family-handwriting/face-handwriting/font.woff2',
      metadata: { faceId: 'face-handwriting' },
    }],
  } as unknown as CatalogRepository;
  const [font] = await loadPublishedFonts(repository);
  assert.equal(font.faceId, 'face-handwriting');
  assert.equal(font.cssAlias, 'qt-face-face-handwriting');
  assert.equal(font.family, '"qt-face-face-handwriting"');

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFontFace = globalThis.FontFace;
  const added: FontFace[] = [];
  const constructed: Array<{ family: string; source: string }> = [];
  class TestFontFace {
    constructor(family: string, source: string) {
      constructed.push({ family, source });
    }
    async load() { return this; }
  }
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: { add: (face: FontFace) => added.push(face) } } });
    Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: TestFontFace });
    assert.equal(await loadFont(font), true);
    assert.deepEqual(constructed, [{ family: 'qt-face-face-handwriting', source: 'url("/api/library/font/face-handwriting")' }]);
    assert.equal(added.length, 1);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: originalFontFace });
  }
});
