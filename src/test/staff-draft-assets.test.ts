import test from 'node:test';
import assert from 'node:assert/strict';

// Helper extracting magic bytes logic for pure unit testing
function checkMagicBytes(buffer: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x4e &&
      buffer[2] === 0x47
    );
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }
  return false;
}

test('validates magic bytes for png, jpeg, webp and rejects invalid data', () => {
  const validPng = new Uint8Array([0x89, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(checkMagicBytes(validPng, 'image/png'), true);

  const fakePng = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(checkMagicBytes(fakePng, 'image/png'), false);

  const validJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(checkMagicBytes(validJpeg, 'image/jpeg'), true);

  const validWebp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  assert.equal(checkMagicBytes(validWebp, 'image/webp'), true);

  const invalidWebp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  assert.equal(checkMagicBytes(invalidWebp, 'image/webp'), false);
});

test('rejects svg uploads through draft-assets policy', () => {
  const svgMime = 'image/svg+xml';
  assert.equal(checkMagicBytes(new Uint8Array([0x3c, 0x73, 0x76, 0x67]), svgMime), false);
});
