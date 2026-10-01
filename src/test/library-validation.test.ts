import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { probeLibraryBinary } from '../lib/services/library-render-probe.ts';
import { validateFont, validateSticker } from '../lib/services/library-validation.ts';
const FIXTURES = join(process.cwd(), 'src', 'test', 'fixtures', 'library');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fixture(name: string): Promise<Buffer> {
  return readFile(join(FIXTURES, name));
}

function assertPng(bytes: Uint8Array): void {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true);
}

test('validateFont parses a real Vietnamese TTF with complete Vietnamese coverage', async () => {
  const result = await validateFont(await fixture('vietnamese-font.ttf'), 'vietnamese-font.ttf');

  assert.equal(result.format, 'ttf');
  assert.equal(result.missingCodepoints.length, 0);
  assert.ok(result.familyName.length > 0);
  assert.ok(result.postscriptName.length > 0);
  assert.ok(result.glyphCount > 0);
  assert.ok(result.unitsPerEm > 0);
  assert.match(result.checksum, /^[0-9a-f]{64}$/);
});

for (const [filename, format] of [
  ['sample-font.otf', 'otf'],
  ['sample-font.woff', 'woff'],
  ['sample-font.woff2', 'woff2'],
] as const) {
  test(`validateFont parses ${format.toUpperCase()} through fontkit`, async () => {
    const result = await validateFont(await fixture(filename), filename);
    assert.equal(result.format, format);
    assert.ok(result.familyName.length > 0);
    assert.ok(result.glyphCount > 0);
  });
}

test('validateFont rejects a forged WOFF2 signature when font parsing fails', async () => {
  await assert.rejects(
    validateFont(Buffer.from('wOF2invalid'), 'forged.woff2'),
    /invalid font|parse font/i,
  );
});

test('validateSticker canonicalizes safe SVG and creates a PNG thumbnail', async () => {
  const result = await validateSticker(await fixture('safe-sticker.svg'), 'safe-sticker.svg');

  assert.equal(result.format, 'svg');
  assert.equal(result.width, 120);
  assert.equal(result.height, 120);
  assert.match(result.checksum, /^[0-9a-f]{64}$/);
  assertPng(result.thumbnailBytes);
  assert.match(Buffer.from(result.canonicalBytes).toString('utf8'), /^<svg\b/);
});

for (const [filename, format] of [
  ['sample.png', 'png'],
  ['sample.webp', 'webp'],
  ['sample.jpg', 'jpeg'],
] as const) {
  test(`validateSticker decodes ${format.toUpperCase()} and creates a PNG thumbnail`, async () => {
    const result = await validateSticker(await fixture(filename), filename);
    assert.equal(result.format, format);
    assert.equal(result.width, 2);
    assert.equal(result.height, 2);
    assertPng(result.thumbnailBytes);
  });
}

const hostileSvgCases = [
  ['malicious-doctype.svg', /doctype/i],
  ['malicious-script.svg', /element.*script|script.*element/i],
  ['malicious-event.svg', /event handler|attribute.*onload/i],
  ['malicious-external-href.svg', /external url|element.*image|attribute.*href/i],
  ['malicious-css-url.svg', /external url|style/i],
  ['malicious-foreign-object.svg', /element.*foreignobject|foreignobject.*element/i],
  ['malicious-cycle.svg', /circular/i],
  ['malicious-malformed.svg', /malformed|parse svg|xml/i],
] as const;

for (const [filename, expectedError] of hostileSvgCases) {
  test(`validateSticker rejects hostile SVG fixture ${filename}`, async () => {
    await assert.rejects(validateSticker(await fixture(filename), filename), expectedError);
  });
}

test('validateSticker rejects corrupted SVG', async () => {
  await assert.rejects(
    validateSticker(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path></svg>'), 'broken.svg'),
    /malformed|parse svg|xml/i,
  );
});

test('validateSticker rejects SVG text that depends on unmanaged fonts', async () => {
  await assert.rejects(
    validateSticker(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text>Hello</text></svg>'), 'text.svg'),
    /element.*text|text.*element/i,
  );
});

test('probeLibraryBinary produces valid receipt for real Vietnamese font', async () => {
  const bytes = await fixture('vietnamese-font.ttf');
  const receipt = await probeLibraryBinary(
    { kind: 'font-face', id: 'font-1', checksum: 'test-check' },
    bytes,
    'font-face',
  );

  assert.equal(receipt.passed, true);
  assert.equal(receipt.failures.length, 0);
  assert.equal(receipt.missingCodepoints.length, 0);
  assert.equal(receipt.validatorVersion, '1.0.0');
  assert.ok(receipt.engineFingerprint.startsWith('chromium-'));
  assert.match(receipt.browserProofHash ?? '', /^[0-9a-f]{64}$/);
  assert.match(receipt.productionProofHash ?? '', /^[0-9a-f]{64}$/);
});

test('probeLibraryBinary produces valid receipt for safe sticker', async () => {
  const bytes = await fixture('safe-sticker.svg');
  const receipt = await probeLibraryBinary(
    { kind: 'sticker', id: 'sticker-1', checksum: 'test-check' },
    bytes,
    'sticker',
  );

  assert.equal(receipt.passed, true);
  assert.equal(receipt.failures.length, 0);
  assert.equal(receipt.validatorVersion, '1.0.0');
  assert.ok(receipt.engineFingerprint.startsWith('chromium-'));
  assert.match(receipt.browserProofHash ?? '', /^[0-9a-f]{64}$/);
  assert.match(receipt.productionProofHash ?? '', /^[0-9a-f]{64}$/);
});

test('probeLibraryBinary captures failures for corrupted binaries', async () => {
  const fontReceipt = await probeLibraryBinary(
    { kind: 'font-face', id: 'bad-font', checksum: 'none' },
    Buffer.from('not-a-font'),
    'font-face',
  );
  assert.equal(fontReceipt.passed, false);
  assert.ok(fontReceipt.failures.length > 0);

  const stickerReceipt = await probeLibraryBinary(
    { kind: 'sticker', id: 'bad-sticker', checksum: 'none' },
    Buffer.from('not-a-sticker'),
    'sticker',
  );
  assert.equal(stickerReceipt.passed, false);
  assert.ok(stickerReceipt.failures.length > 0);
});
