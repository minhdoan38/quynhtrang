import assert from 'node:assert/strict';
import test from 'node:test';

import { promoteDesignAssets } from '../lib/asset-store.ts';
import {
  createInitialState,
  createStickerElement,
  createTextElement,
  getStickerData,
  getTextData,
  type DesignState,
} from '../lib/product-state.ts';
import {
  extractLibraryDependencies,
  isLibraryAssetPath,
  resolveLegacyReferences,
} from '../lib/services/library-dependencies.ts';

function designWithElements(elements: NonNullable<DesignState['elements']>): DesignState {
  return { ...createInitialState('card'), elements };
}

test('resolves exact legacy font aliases without mutating source document', () => {
  const text = createTextElement({ id: 'text-1', preset: 'body', fontFamily: 'Legacy Serif' });
  const document = designWithElements([text]);
  const before = structuredClone(document);

  const resolved = resolveLegacyReferences(document, new Map([
    ['Legacy Serif', 'face-serif-regular'],
  ]));

  assert.deepEqual(document, before);
  assert.notEqual(resolved, document);
  assert.notEqual(resolved.elements?.[0], document.elements?.[0]);
  assert.equal(getTextData(resolved.elements![0])?.fontFamilyId, 'face-serif-regular');
  assert.equal(getTextData(resolved.elements![0])?.fontFaceId, 'face-serif-regular');
  assert.equal(getTextData(document.elements![0])?.fontFaceId, undefined);
});

test('legacy alias resolution is deterministic and rejects normalized ambiguity', () => {
  const document = designWithElements([
    createTextElement({ id: 'text-1', preset: 'body', fontFamily: ' Legacy Serif ' }),
  ]);
  const aliases = new Map([
    ['Legacy Serif', 'face-serif-regular'],
    ['Other Font', 'face-other-regular'],
  ]);
  assert.equal(getTextData(resolveLegacyReferences(document, aliases).elements![0])?.fontFaceId, 'face-serif-regular');

  assert.throws(
    () => resolveLegacyReferences(document, new Map([
      ['Legacy Serif', 'face-serif-regular'],
      [' legacy serif ', 'face-serif-bold'],
    ])),
    /Ambiguous font family alias " legacy serif ": face-serif-regular, face-serif-bold/,
  );
});

test('keeps existing stable and unknown legacy references unchanged', () => {
  const stable = createTextElement({ id: 'stable', preset: 'body', fontFamily: 'Legacy Serif' });
  Object.assign(stable.data!, {
    fontFamilyId: 'family-retained',
    fontFaceId: 'face-archived',
    fontChecksum: 'sha-font',
  });
  const unknown = createTextElement({ id: 'unknown', preset: 'body', fontFamily: 'Unknown Font' });
  const document = designWithElements([stable, unknown]);
  const resolved = resolveLegacyReferences(document, new Map([['Legacy Serif', 'face-new']]));

  assert.equal(resolved, document);
  assert.equal(getTextData(resolved.elements![0])?.fontFaceId, 'face-archived');
  assert.equal(getTextData(resolved.elements![1])?.fontFaceId, undefined);
});

test('extracts unique immutable font and sticker dependencies', () => {
  const text = createTextElement({ id: 'text-1', preset: 'heading' });
  Object.assign(text.data!, {
    fontFamilyId: 'family-1',
    fontFaceId: 'face-1',
    fontChecksum: 'sha-font',
  });
  const sticker = createStickerElement({
    id: 'sticker-1',
    stickerId: 'flower-1',
    storagePath: 'stickers/flower-1/sha-sticker.svg',
    src: '/api/library/sticker/flower-1',
    title: 'Flower',
    checksum: 'sha-sticker',
  });
  const duplicateSticker = structuredClone(sticker);
  duplicateSticker.id = 'sticker-2';

  assert.deepEqual(extractLibraryDependencies(designWithElements([text, sticker, duplicateSticker])), [
    { kind: 'font-face', id: 'face-1', checksum: 'sha-font' },
    { kind: 'sticker', id: 'flower-1', checksum: 'sha-sticker' },
  ]);
  assert.equal(getStickerData(sticker)?.libraryAssetId, 'flower-1');
});

test('recognizes canonical library paths without matching customer uploads', () => {
  for (const path of [
    'stickers/flower/sha.svg',
    '/fonts/family/face/sha.woff2',
    '/api/library/sticker/flower',
    'sticker-library/stickers/flower/sha.svg',
    'https://project.supabase.co/storage/v1/object/public/sticker-library/stickers/flower/sha.svg',
    'https://project.supabase.co/storage/v1/object/public/fonts/fonts/family/face/sha.woff2',
  ]) {
    assert.equal(isLibraryAssetPath(path), true, path);
  }
  for (const path of [
    'customer-assets/project/stickers-upload.png',
    '/api/assets/customer-sticker',
    'https://example.com/uploads/stickers/flower.svg',
    'blob:customer-upload',
  ]) {
    assert.equal(isLibraryAssetPath(path), false, path);
  }
});

test('promotion bypasses canonical library stickers and promotes uploaded images only', async () => {
  const librarySticker = createStickerElement({
    id: 'sticker-1',
    stickerId: 'flower-1',
    storagePath: 'stickers/flower-1/sha-sticker.svg',
    src: 'blob:library-sticker-preview',
    title: 'Flower',
    checksum: 'sha-sticker',
  });
  Object.assign(librarySticker.data!, {
    type: 'image/svg+xml',
    payload: 'data:image/svg+xml;base64,PHN2Zy8+',
  });
  const customerImage = {
    id: 'image-1',
    type: 'image' as const,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    data: {
      src: 'blob:customer-image',
      originalSrc: 'blob:customer-image',
      name: 'photo.png',
      type: 'image/png',
      payload: 'data:image/png;base64,aW1hZ2U=',
    },
  };
  const uploads: Array<{ storageBucket: string; metadata?: Record<string, unknown> }> = [];

  const result = await promoteDesignAssets(designWithElements([librarySticker, customerImage]), [], {
    projectId: 'project-1',
    assetRepo: {
      async promoteAsset(input) {
        uploads.push(input);
        return { id: 'customer-asset-1' };
      },
    },
  });

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0]?.storageBucket, 'customer-assets');
  assert.deepEqual(uploads[0]?.metadata, { sourceKey: 'blob:customer-image' });
  assert.equal(result.promotedAssets.length, 1);
  assert.equal(getStickerData(result.rewrittenDesign.elements![0])?.src, 'blob:library-sticker-preview');
  assert.equal(result.rewrittenDesign.elements![1]?.data?.src, '/api/assets/customer-asset-1');
});
