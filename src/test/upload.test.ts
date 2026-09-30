import test from 'node:test';
import assert from 'node:assert/strict';

import { validateImageFile, processImageUpload } from '../lib/upload.ts';

test('validateImageFile rejects unsupported mime types and empty files', () => {
  const badType = new File(['content'], 'test.pdf', { type: 'application/pdf' });
  const badTypeResult = validateImageFile(badType);
  assert.equal(badTypeResult.ok, false);
  assert.equal(badTypeResult.error, 'Ảnh không hỗ trợ. Hãy chọn PNG, JPG hoặc WebP.');

  const emptyFile = new File([], 'empty.png', { type: 'image/png' });
  const emptyResult = validateImageFile(emptyFile);
  assert.equal(emptyResult.ok, false);
  assert.equal(emptyResult.error, 'Không đọc được ảnh. Hãy chọn tệp khác.');

  const validFile = new File(['data'], 'valid.png', { type: 'image/png' });
  assert.equal(validateImageFile(validFile).ok, true);
});

test('processImageUpload attaches base64/dataURL payload and data to ImageState', async () => {
  const scope = globalThis as Record<string, unknown>;
  const originalFileReader = scope.FileReader;
  const originalImage = scope.Image;

  class MockFileReader {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    result: string | null = null;

    readAsDataURL(file: File) {
      queueMicrotask(() => {
        this.result = `data:${file.type};base64,dGVzdA==`;
        this.onload?.();
      });
    }
  }

  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 800;
    naturalHeight = 600;
    width = 800;
    height = 600;
    private _src = '';

    set src(value: string) {
      this._src = value;
      queueMicrotask(() => {
        this.onload?.();
      });
    }
    get src() {
      return this._src;
    }
  }

  scope.FileReader = MockFileReader;
  scope.Image = MockImage;

  try {
    const file = new File(['bytes'], 'sample.png', { type: 'image/png' });
    const imageState = await processImageUpload(file);

    assert.equal(imageState.name, 'sample.png');
    assert.equal(imageState.type, 'image/png');
    assert.equal(imageState.width, 800);
    assert.equal(imageState.height, 600);
    assert.equal(imageState.data, 'data:image/png;base64,dGVzdA==');
    assert.equal(imageState.payload, 'data:image/png;base64,dGVzdA==');
  } finally {
    scope.FileReader = originalFileReader;
    scope.Image = originalImage;
  }
});
