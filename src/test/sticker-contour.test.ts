import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanvasElement, StickerOptions } from '../lib/product-state.ts';
import { computeStickerContour } from '../lib/sticker-contour.ts';

const baseOptions: StickerOptions = {
  borderWidth: 2,
  hasWhiteBorder: true,
  showCutline: true,
  cutLineMode: 'die-cut',
};

const makeElement = (overrides: Partial<CanvasElement> = {}): CanvasElement => ({
  id: 'el-1',
  type: 'shape',
  x: 0,
  y: 0,
  width: 20,
  height: 20,
  rotation: 0,
  ...overrides,
});

test('computeStickerContour returns status empty when elements are empty', () => {
  const resultUndefined = computeStickerContour(undefined, baseOptions);
  assert.equal(resultUndefined.status, 'empty');
  assert.equal(resultUndefined.islandCount, 0);
  assert.equal(resultUndefined.hasUnremovedBackground, false);
  assert.equal(resultUndefined.borderSvgPath, '');
  assert.equal(resultUndefined.cutlineSvgPath, '');

  const resultEmpty = computeStickerContour([], baseOptions);
  assert.equal(resultEmpty.status, 'empty');
  assert.equal(resultEmpty.islandCount, 0);
  assert.equal(resultEmpty.borderSvgPath, '');
  assert.equal(resultEmpty.cutlineSvgPath, '');
});

test('computeStickerContour detects disconnected elements far apart', () => {
  const elements: CanvasElement[] = [
    makeElement({ id: 'left', x: 0, y: 0, width: 20, height: 20 }),
    makeElement({ id: 'right', x: 100, y: 0, width: 20, height: 20 }),
  ];

  const result = computeStickerContour(elements, baseOptions);
  assert.equal(result.status, 'disconnected');
  assert.equal(result.islandCount, 2);
  assert.equal(result.warningMessage, 'Một số chi tiết đang tách rời.');
  assert.equal(
    result.guidanceMessage,
    'Di chuyển chúng gần nhau hơn hoặc tăng viền để tạo thành một sticker.'
  );
});

test('increasing borderWidth connects elements into single island with status valid', () => {
  const elements: CanvasElement[] = [
    makeElement({ id: 'left', x: 0, y: 0, width: 20, height: 20 }),
    makeElement({ id: 'right', x: 30, y: 0, width: 20, height: 20 }),
  ];

  const separated = computeStickerContour(elements, {
    ...baseOptions,
    borderWidth: 1,
    hasWhiteBorder: true,
  });
  assert.equal(separated.status, 'disconnected');
  assert.equal(separated.islandCount, 2);

  const connected = computeStickerContour(elements, {
    ...baseOptions,
    borderWidth: 3,
    hasWhiteBorder: true,
  });
  assert.equal(connected.status, 'valid');
  assert.equal(connected.islandCount, 1);
  assert.equal(connected.warningMessage, undefined);
});

test('computeStickerContour detects tiny details below 5px threshold', () => {
  const elements: CanvasElement[] = [
    makeElement({ id: 'normal', x: 0, y: 0, width: 20, height: 20 }),
    makeElement({ id: 'tiny', x: 10, y: 10, width: 4, height: 12 }),
  ];

  const result = computeStickerContour(elements, baseOptions);
  assert.equal(result.status, 'tiny-details');
  assert.equal(result.islandCount, 1);
  assert.equal(result.warningMessage, 'Một số chi tiết quá nhỏ để cắt đẹp.');
  assert.equal(result.guidanceMessage, 'Tăng viền hoặc đơn giản thiết kế.');
});

test('computeStickerContour detects unremoved opaque background on images', () => {
  const imageElement = makeElement({
    id: 'photo',
    type: 'image',
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    data: {
      src: '/photo.png',
    },
  });

  const unremovedResult = computeStickerContour([imageElement], baseOptions);
  assert.equal(unremovedResult.status, 'valid');
  assert.equal(unremovedResult.hasUnremovedBackground, true);
  assert.equal(
    unremovedResult.guidanceMessage,
    'Muốn sticker cắt theo chủ thể? Hãy xóa nền ảnh trước.'
  );

  const removedByDerivedSrc = computeStickerContour(
    [
      {
        ...imageElement,
        data: {
          src: '/photo.png',
          derivedSrc: '/photo-cutout.png',
        },
      },
    ],
    baseOptions
  );
  assert.equal(removedByDerivedSrc.hasUnremovedBackground, false);
  assert.equal(removedByDerivedSrc.guidanceMessage, undefined);

  const removedByFlag = computeStickerContour(
    [
      {
        ...imageElement,
        data: {
          src: '/photo.png',
          isBackgroundRemoved: true,
        },
      },
    ],
    baseOptions
  );
  assert.equal(removedByFlag.hasUnremovedBackground, false);
  assert.equal(removedByFlag.guidanceMessage, undefined);
});

test('computeStickerContour generates non-empty SVG paths for border and cutline', () => {
  const elements: CanvasElement[] = [
    makeElement({ id: 'shape', x: 12, y: 15, width: 40, height: 50 }),
  ];

  const result = computeStickerContour(elements, baseOptions);
  assert.ok(result.borderSvgPath.length > 0);
  assert.ok(result.cutlineSvgPath.length > 0);
  assert.match(result.borderSvgPath, /^M.+Z$/);
  assert.match(result.cutlineSvgPath, /^M.+Z$/);
  assert.ok(result.bounds);
  assert.equal(result.bounds.width > 0, true);
  assert.equal(result.bounds.height > 0, true);
});
