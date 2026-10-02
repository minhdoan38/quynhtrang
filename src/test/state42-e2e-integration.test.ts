import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  canDeleteDraft,
  canManageLibrary,
  type StaffRole,
} from '../lib/domain/asset-library.ts';
import type { DesignState } from '../lib/product-state.ts';
import { createStickerElement } from '../lib/product-state.ts';
import { renderDocument } from '../lib/services/document-renderer.ts';
import {
  extractLibraryDependencies,
  isLibraryAssetPath,
  resolveLegacyReferences,
} from '../lib/services/library-dependencies.ts';
import {
  validateFont,
  validateSticker,
} from '../lib/services/library-validation.ts';

test('State 42 End-to-End Integration Contracts', async (t) => {
  await t.test('1. Role authorization matrix: Editor & Admin manage content, Admin only deletes drafts', () => {
    const roles: StaffRole[] = ['editor', 'admin'];
    for (const r of roles) {
      assert.equal(canManageLibrary(r, 'sticker'), true, `${r} can manage stickers`);
      assert.equal(canManageLibrary(r, 'font-face'), true, `${r} can manage fonts`);
    }

    assert.equal(canDeleteDraft('editor', 'draft', null), false, 'Editor cannot delete draft');
    assert.equal(canDeleteDraft('admin', 'draft', null), true, 'Admin can delete unreferenced draft');
    assert.equal(canDeleteDraft('admin', 'published', null), false, 'Cannot delete published asset');
    assert.equal(canDeleteDraft('admin', 'draft', '2026-10-02T00:00:00Z'), false, 'Cannot delete previously published asset');
  });

  await t.test('2. Real font validation: decodes valid Vietnamese font, rejects forged signature', async () => {
    const fontBytes = await readFile(new URL('./fixtures/library/vietnamese-font.ttf', import.meta.url));
    const fontResult = await validateFont(fontBytes, 'vietnamese-font.ttf');
    assert.equal(fontResult.format, 'ttf');
    assert.equal(fontResult.missingCodepoints.length, 0, 'Must have 100% Vietnamese coverage');
    assert.ok(fontResult.checksum.length === 64, 'Must have 64-char SHA256 checksum');

    await assert.rejects(
      () => validateFont(Buffer.from('wOF2invalid_payload'), 'fake.woff2'),
      /Invalid font binary/i
    );
  });

  await t.test('3. Sticker security: validates safe SVG, rejects hostile SVGs', async () => {
    const safeSvgBytes = await readFile(new URL('./fixtures/library/safe-sticker.svg', import.meta.url));
    const safeResult = await validateSticker(safeSvgBytes, 'safe.svg');
    assert.equal(safeResult.format, 'svg');
    assert.ok(safeResult.canonicalBytes.length > 0);
    assert.ok(safeResult.thumbnailBytes.length > 0, 'Thumbnail PNG generated');

    const hostileDoctype = await readFile(new URL('./fixtures/library/malicious-doctype.svg', import.meta.url));
    await assert.rejects(() => validateSticker(hostileDoctype, 'bad.svg'), /DOCTYPE/i);

    const hostileScript = await readFile(new URL('./fixtures/library/malicious-script.svg', import.meta.url));
    await assert.rejects(() => validateSticker(hostileScript, 'bad.svg'), /element <script> is not allowed/i);
  });

  await t.test('4. Design dependencies: stickers are recognized as library assets and never promoted to customer assets', () => {
    assert.equal(isLibraryAssetPath('/api/library/sticker/cat-1'), true);
    assert.equal(isLibraryAssetPath('stickers/cat-1/abc.svg'), true);
    assert.equal(isLibraryAssetPath('/api/assets/cust-123'), false, 'Customer upload is not library asset');

    const stickerEl = createStickerElement({
      id: 'sticker-el-1',
      stickerId: 'cat-1',
      storagePath: 'stickers/cat-1/abc.svg',
      src: '/api/library/sticker/cat-1',
      title: 'Mèo dễ thương',
      checksum: 'chk123',
    });

    const doc: DesignState = {
      productId: 'card',
      variantId: 'horizontal',
      templateId: null,
      text: 'Chúc mừng',
      color: '#000',
      backgroundColor: '#fff',
      image: null,
      quantity: 1,
      productOptions: {},
      elements: [stickerEl],
    };

    const deps = extractLibraryDependencies(doc);
    assert.equal(deps.length, 1);
    assert.equal(deps[0].kind, 'sticker');
    assert.equal(deps[0].id, 'cat-1');
    assert.equal(deps[0].checksum, 'chk123');

    // Legacy resolver is strictly non-mutating
    const textDoc: DesignState = {
      ...doc,
      elements: [
        {
          id: 'text-1',
          type: 'text',
          x: 50,
          y: 50,
          width: 50,
          height: 20,
          rotation: 0,
          data: { text: 'Hello', color: '#000', fontFamily: 'Lora', fontSize: 16, fontWeight: 'regular', fontStyle: 'normal', align: 'center', lineHeight: 1.4, letterSpacing: 0 },
        },
      ],
    };
    const resolved = resolveLegacyReferences(textDoc, new Map([['lora', 'face-lora-1']]));
    assert.notStrictEqual(resolved, textDoc);
    assert.equal(resolved.elements?.[0].data?.fontFaceId, 'face-lora-1');
    assert.equal(textDoc.elements?.[0].data?.fontFaceId, undefined, 'Input document is untouched');
  });

  await t.test('5. Real Chromium document renderer: renders design containing sticker to valid PNG > 1x1', async () => {
    const stickerEl = createStickerElement({
      id: 'sticker-el-1',
      stickerId: 'star-1',
      storagePath: 'stickers/star-1/star.svg',
      src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 64,36 98,36 70,57 81,91 50,70 19,91 30,57 2,36 36,36" fill="%23f59e0b"/></svg>',
      title: 'Ngôi sao',
      x: 50,
      y: 50,
      width: 40,
      height: 40,
    });

    const design: DesignState = {
      productId: 'sticker',
      variantId: 'die-cut',
      templateId: null,
      text: '',
      color: '#000',
      backgroundColor: '#ffffff',
      image: null,
      quantity: 10,
      productOptions: { hasWhiteBorder: true, borderWidth: 4 },
      elements: [stickerEl],
    };

    const result = await renderDocument(design, { surface: 'front' });
    assert.ok(result.png.length > 100, 'Must produce real PNG binary');
    assert.equal(result.png[0], 0x89);
    assert.equal(result.png[1], 0x50); // 'P'
    assert.equal(result.png[2], 0x4e); // 'N'
    assert.equal(result.png[3], 0x47); // 'G'
    assert.ok(result.sha256.length === 64, 'Must output 64-char SHA256 hex checksum');
    assert.ok(result.engineFingerprint.startsWith('chromium-'), 'Must record engine fingerprint');
  });
});
