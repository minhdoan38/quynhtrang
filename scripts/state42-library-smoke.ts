import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import type { DesignState } from '../src/lib/product-state.ts';
import { createStickerElement } from '../src/lib/product-state.ts';
import { renderDocument } from '../src/lib/services/document-renderer.ts';
import { validateFont, validateSticker } from '../src/lib/services/library-validation.ts';

export async function runSmoke(): Promise<{
  fontValidation: boolean;
  stickerValidation: boolean;
  documentRender: boolean;
  sha256: string;
}> {
  console.log('[LibrarySmoke] 1. Validating Vietnamese font binary with fontkit...');
  const fontBytes = await readFile(new URL('../src/test/fixtures/library/vietnamese-font.ttf', import.meta.url));
  const fontResult = await validateFont(fontBytes, 'vietnamese-font.ttf');
  assert.equal(fontResult.format, 'ttf');
  assert.equal(fontResult.missingCodepoints.length, 0, 'Must have 100% Vietnamese coverage');
  console.log(`[LibrarySmoke] Font verified: ${fontResult.familyName} (${fontResult.glyphCount} glyphs, SHA256: ${fontResult.checksum.slice(0, 16)}...)`);

  console.log('[LibrarySmoke] 2. Validating SVG sticker binary with xmldom & sharp...');
  const svgBytes = await readFile(new URL('../src/test/fixtures/library/safe-sticker.svg', import.meta.url));
  const stickerResult = await validateSticker(svgBytes, 'safe-sticker.svg');
  assert.equal(stickerResult.format, 'svg');
  assert.ok(stickerResult.canonicalBytes.length > 0);
  assert.ok(stickerResult.thumbnailBytes.length > 0);
  console.log(`[LibrarySmoke] Sticker verified: format SVG, thumbnail PNG ${stickerResult.thumbnailBytes.length} bytes, SHA256: ${stickerResult.checksum.slice(0, 16)}...`);

  console.log('[LibrarySmoke] 3. Exercising real Playwright Chromium document rendering engine...');
  const stickerEl = createStickerElement({
    id: 'smoke-sticker-1',
    stickerId: 'safe-star',
    storagePath: 'stickers/safe-star.svg',
    src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%23315F86"/></svg>',
    title: 'Ngôi sao an toàn',
    x: 50,
    y: 50,
    width: 40,
    height: 40,
  });

  const testDesign: DesignState = {
    productId: 'card',
    variantId: 'horizontal',
    templateId: null,
    text: 'Quỳnh Trang Studio',
    color: '#2E3338',
    backgroundColor: '#FFFDF8',
    image: null,
    quantity: 1,
    productOptions: { surface: 'front', fold: 'half' },
    elements: [stickerEl],
  };

  const renderResult = await renderDocument(testDesign, { surface: 'front' });
  assert.ok(renderResult.png.length > 500, 'Must produce valid rendered PNG');
  assert.equal(renderResult.png[0], 0x89);
  assert.equal(renderResult.png[1], 0x50);
  assert.equal(renderResult.png[2], 0x4e);
  assert.equal(renderResult.png[3], 0x47);
  console.log(`[LibrarySmoke] Render verified: PNG ${renderResult.png.length} bytes (Engine: ${renderResult.engineFingerprint}, SHA256: ${renderResult.sha256.slice(0, 16)}...)`);

  return {
    fontValidation: true,
    stickerValidation: true,
    documentRender: true,
    sha256: renderResult.sha256,
  };
}

if (process.argv[1]?.endsWith('state42-library-smoke.ts')) {
  runSmoke()
    .then((res) => {
      console.log('\n[LibrarySmoke] ALL STATE 42 VERIFICATION SMOKE CHECKS PASSED.');
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('\n[LibrarySmoke] FAILED:', err);
      process.exit(1);
    });
}
