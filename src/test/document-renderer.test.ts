import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createInitialState,
  createTextElement,
  type DesignState,
} from '../lib/product-state.ts';
import { renderDocument } from '../lib/services/document-renderer.ts';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;

function parsePngHeader(pngBytes: Uint8Array): { width: number; height: number } {
  const buffer = Buffer.from(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  assert.ok(buffer.length >= 24, 'PNG buffer must contain at least 24 bytes');
  assert.equal(
    buffer.subarray(0, 8).equals(PNG_SIGNATURE),
    true,
    'Buffer starts with PNG signature: 89 50 4E 47 0D 0A 1A 0A',
  );
  assert.equal(
    buffer.toString('ascii', 12, 16),
    'IHDR',
    'PNG chunk header identifies IHDR',
  );

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

test('renderDocument: renders card document to valid PNG matching geometry', async () => {
  const card: DesignState = {
    ...createInitialState('card'),
    variantId: 'horizontal',
    text: 'Thiệp Chúc Mừng',
    color: '#B86C84',
    backgroundColor: '#FFFDF8',
    elements: [
      createTextElement({
        id: 'card-title',
        preset: 'heading',
        text: 'Happy Birthday',
        color: '#B86C84',
        surface: 'front',
      }),
    ],
  };

  const result = await renderDocument(card);
  const dimensions = parsePngHeader(result.png);

  assert.ok(dimensions.width > 1, 'Card width is greater than 1x1');
  assert.ok(dimensions.height > 1, 'Card height is greater than 1x1');
  assert.equal(dimensions.width, 592, 'Default horizontal card width is 592px');
  assert.equal(dimensions.height, 420, 'Default horizontal card height is 420px');
  assert.match(result.sha256, SHA256_HEX_REGEX, 'SHA-256 is 64-char hex string');
  assert.ok(result.engineFingerprint.startsWith('chromium-'), 'Engine fingerprint starts with chromium-');
});

test('renderDocument: renders wrapping paper document with pattern repeat', async () => {
  const wrapping: DesignState = {
    ...createInitialState('wrapping'),
    variantId: 'a1',
    productOptions: {
      mode: 'pattern',
      patternConfig: {
        enabled: true,
        repeatMode: 'half-drop',
        scale: 100,
        spacingX: 10,
        spacingY: 10,
        rotation: 0,
        backgroundColor: '#F4EAE1',
      },
    },
    elements: [
      createTextElement({
        id: 'pattern-txt',
        preset: 'body',
        text: 'Pattern Joy',
        color: '#315F86',
      }),
    ],
  };

  const result = await renderDocument(wrapping);
  const dimensions = parsePngHeader(result.png);

  assert.ok(dimensions.width > 1, 'Wrapping width is greater than 1x1');
  assert.ok(dimensions.height > 1, 'Wrapping height is greater than 1x1');
  assert.equal(dimensions.width, 600, 'Default wrapping render box width is 600px');
  assert.equal(dimensions.height, 600, 'Default wrapping render box height is 600px');
  assert.match(result.sha256, SHA256_HEX_REGEX, 'SHA-256 is 64-char hex string');
  assert.ok(result.engineFingerprint.length > 0, 'Engine fingerprint is non-empty');
});

test('renderDocument: renders sticker document with fixed shape geometry', async () => {
  const sticker: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    productOptions: {
      shape: 'circle',
      borderWidth: 3,
      hasWhiteBorder: true,
    },
    elements: [
      createTextElement({
        id: 'sticker-txt',
        preset: 'body',
        text: 'Cute Cat',
        color: '#111827',
      }),
    ],
  };

  const result = await renderDocument(sticker);
  const dimensions = parsePngHeader(result.png);

  assert.ok(dimensions.width > 1, 'Sticker width is greater than 1x1');
  assert.ok(dimensions.height > 1, 'Sticker height is greater than 1x1');
  assert.equal(dimensions.width, 400, 'Default sticker render box width is 400px');
  assert.equal(dimensions.height, 400, 'Default sticker render box height is 400px');
  assert.match(result.sha256, SHA256_HEX_REGEX, 'SHA-256 is 64-char hex string');
  assert.ok(result.engineFingerprint.length > 0, 'Engine fingerprint is non-empty');
});

test('renderDocument: renders notebook document without binding guide', async () => {
  const notebook: DesignState = {
    ...createInitialState('notebook'),
    variantId: 'standard',
    backgroundColor: '#FAF7F0',
    elements: [
      createTextElement({
        id: 'nb-title',
        preset: 'heading',
        text: 'My Journal',
        color: '#2E3338',
      }),
    ],
  };

  const result = await renderDocument(notebook);
  const dimensions = parsePngHeader(result.png);

  assert.ok(dimensions.width > 1, 'Notebook width is greater than 1x1');
  assert.ok(dimensions.height > 1, 'Notebook height is greater than 1x1');
  assert.equal(dimensions.width, 592, 'Notebook render width is 592px');
  assert.equal(dimensions.height, 840, 'Notebook render height is 840px');
  assert.match(result.sha256, SHA256_HEX_REGEX, 'SHA-256 is 64-char hex string');
  assert.ok(result.engineFingerprint.length > 0, 'Engine fingerprint is non-empty');
});
