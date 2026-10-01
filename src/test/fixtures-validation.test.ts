import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import * as fontkit from 'fontkit';
import sharp from 'sharp';

const FIXTURES_DIR = join(process.cwd(), 'src', 'test', 'fixtures', 'library');

const EXPECTED_FIXTURES = [
  'vietnamese-font.ttf',
  'sample-font.otf',
  'sample-font.woff',
  'sample-font.woff2',
  'vietnamese-font.LICENSE',
  'sample.png',
  'sample.webp',
  'sample.jpg',
  'safe-sticker.svg',
  'malicious-doctype.svg',
  'malicious-script.svg',
  'malicious-event.svg',
  'malicious-external-href.svg',
  'malicious-css-url.svg',
  'malicious-foreign-object.svg',
  'malicious-cycle.svg',
  'malicious-malformed.svg',
  'README.md',
] as const;

test('all library fixture files exist and are non-empty', () => {
  for (const filename of EXPECTED_FIXTURES) {
    const filePath = join(FIXTURES_DIR, filename);
    assert.equal(existsSync(filePath), true, `Fixture missing: ${filename}`);
    const stat = statSync(filePath);
    assert.equal(stat.isFile(), true, `Fixture is not a file: ${filename}`);
    assert.ok(stat.size > 0, `Fixture is empty: ${filename}`);
  }
});

test('sharp decodes raster sample images with correct attributes', async () => {
  // 1. PNG with alpha
  const pngPath = join(FIXTURES_DIR, 'sample.png');
  const pngImage = sharp(pngPath);
  const pngMeta = await pngImage.metadata();
  assert.equal(pngMeta.format, 'png');
  assert.equal(pngMeta.width, 2);
  assert.equal(pngMeta.height, 2);
  assert.equal(pngMeta.hasAlpha, true);
  assert.equal(pngMeta.channels, 4);

  // 2. WebP
  const webpPath = join(FIXTURES_DIR, 'sample.webp');
  const webpImage = sharp(webpPath);
  const webpMeta = await webpImage.metadata();
  assert.equal(webpMeta.format, 'webp');
  assert.equal(webpMeta.width, 2);
  assert.equal(webpMeta.height, 2);

  // 3. JPEG
  const jpgPath = join(FIXTURES_DIR, 'sample.jpg');
  const jpgImage = sharp(jpgPath);
  const jpgMeta = await jpgImage.metadata();
  assert.equal(jpgMeta.format, 'jpeg');
  assert.equal(jpgMeta.width, 2);
  assert.equal(jpgMeta.height, 2);
});

test('fontkit decodes valid TTF, OTF, WOFF, and WOFF2 fonts with Vietnamese coverage', () => {
  const fontFiles = [
    { file: 'vietnamese-font.ttf', expectedType: 'TTF' },
    { file: 'sample-font.otf', expectedType: 'TTF' },
    { file: 'sample-font.woff', expectedType: 'WOFF' },
    { file: 'sample-font.woff2', expectedType: 'WOFF2' },
  ] as const;

  const testCodepoints = ['a', 'ă', 'â', 'đ', 'ê', 'ô', 'ơ', 'ư', 'Ắ', 'ệ', 'ờ', 'Ự'];

  for (const { file, expectedType } of fontFiles) {
    const fontPath = join(FIXTURES_DIR, file);
    const font = fontkit.openSync(fontPath);

    assert.ok(font, `Failed to open font: ${file}`);
    assert.equal(font.type, expectedType, `Unexpected font type for ${file}`);
    assert.ok(font.numGlyphs > 0, `Font has no glyphs: ${file}`);
    assert.ok(font.fullName.length > 0, `Font missing fullName: ${file}`);

    for (const char of testCodepoints) {
      const codePoint = char.codePointAt(0)!;
      assert.equal(
        font.hasGlyphForCodePoint(codePoint),
        true,
        `Font ${file} missing glyph for Vietnamese character '${char}' (U+${codePoint.toString(16)})`,
      );
    }
  }
});

test('xmldom parses safe SVG sticker without errors', () => {
  const svgPath = join(FIXTURES_DIR, 'safe-sticker.svg');
  const svgContent = readFileSync(svgPath, 'utf8');

  const parseErrors: string[] = [];
  const parseWarnings: string[] = [];
  const parser = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level === 'warning') {
        parseWarnings.push(msg);
      } else {
        parseErrors.push(msg);
      }
    },
  });

  const doc = parser.parseFromString(svgContent, 'image/svg+xml');

  assert.equal(parseErrors.length, 0, `Parse errors in safe SVG: ${parseErrors.join('; ')}`);
  assert.equal(parseWarnings.length, 0, `Parse warnings in safe SVG: ${parseWarnings.join('; ')}`);

  const root = doc.documentElement;
  assert.ok(root, 'safe-sticker.svg must have root element');
  assert.equal(root.tagName.toLowerCase(), 'svg');
  assert.equal(root.getAttribute('viewBox'), '0 0 120 120');
  const linearGradients = doc.getElementsByTagName('linearGradient');
  assert.ok(linearGradients.length > 0, 'safe-sticker.svg should contain linearGradient');
  assert.equal(linearGradients.item(0)?.getAttribute('id'), 'petal-gradient');

  const useElements = doc.getElementsByTagName('use');
  assert.ok(useElements.length >= 4, 'safe-sticker.svg should contain use tags');
  for (let i = 0; i < useElements.length; i++) {
    const use = useElements.item(i);
    assert.equal(use?.getAttribute('href'), '#petal');
  }
});

test('hostile SVG fixtures contain expected security attack patterns', () => {
  const maliciousChecks: Record<string, RegExp> = {
    'malicious-doctype.svg': /<!DOCTYPE\s+svg[^>]*<!ENTITY/i,
    'malicious-script.svg': /<script[\s>]/i,
    'malicious-event.svg': /\bon(load|click)\s*=/i,
    'malicious-external-href.svg': /(xlink:href|href)\s*=\s*["']https?:\/\//i,
    'malicious-css-url.svg': /style\s*=.*url\(https?:\/\//i,
    'malicious-foreign-object.svg': /<foreignObject[\s>]/i,
    'malicious-cycle.svg': /<g id="cycle-a"><use href="#cycle-b"/i,
    'malicious-malformed.svg': /<rect[^>]*>\s*<\/g>/i,
  };

  for (const [filename, pattern] of Object.entries(maliciousChecks)) {
    const content = readFileSync(join(FIXTURES_DIR, filename), 'utf8');
    assert.match(
      content,
      pattern,
      `Malicious fixture ${filename} did not match expected pattern ${pattern}`,
    );
  }
});
