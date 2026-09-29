import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanvasElement, StickerOptions } from '../lib/product-state.ts';
import { computeStickerContour } from '../lib/sticker-contour.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const makeElement = (overrides: Partial<CanvasElement> = {}): CanvasElement => ({
  id: 'el-1',
  type: 'shape',
  x: 10,
  y: 10,
  width: 40,
  height: 30,
  rotation: 0,
  ...overrides,
});

test('generating contour paths does not mutate or add elements to state.elements', () => {
  const initialElements: CanvasElement[] = [
    makeElement({ id: 'img-1', type: 'image', x: 20, y: 25, width: 60, height: 60 }),
    makeElement({ id: 'txt-1', type: 'text', x: 25, y: 90, width: 50, height: 20 }),
  ];

  const elementsSnapshot = JSON.parse(JSON.stringify(initialElements));
  const options: StickerOptions = {
    borderWidth: 3,
    hasWhiteBorder: true,
    showCutline: true,
    cutLineMode: 'die-cut',
  };

  const result = computeStickerContour(initialElements, options);

  assert.equal(initialElements.length, elementsSnapshot.length);
  assert.deepEqual(initialElements, elementsSnapshot);
  assert.equal(result.islandCount, 1);
  assert.ok(result.borderSvgPath.length > 0);
  assert.ok(result.cutlineSvgPath.length > 0);
});

test('toggling showCutline or hasWhiteBorder generates expected SVG paths without altering document objects', () => {
  const elements: CanvasElement[] = [
    makeElement({ id: 'sticker-main', x: 15, y: 15, width: 80, height: 50 }),
  ];
  const originalDoc = JSON.parse(JSON.stringify(elements));

  const contourNormal = computeStickerContour(elements, {
    borderWidth: 2,
    hasWhiteBorder: true,
    showCutline: true,
    cutLineMode: 'die-cut',
  });

  const contourNoWhiteBorder = computeStickerContour(elements, {
    borderWidth: 2,
    hasWhiteBorder: false,
    showCutline: true,
    cutLineMode: 'die-cut',
  });

  const contourNoCutline = computeStickerContour(elements, {
    borderWidth: 2,
    hasWhiteBorder: true,
    showCutline: false,
    cutLineMode: 'die-cut',
  });

  // Verify paths are generated deterministically
  assert.ok(contourNormal.borderSvgPath.length > 0);
  assert.ok(contourNormal.cutlineSvgPath.length > 0);
  assert.ok(contourNoCutline.cutlineSvgPath.length > 0);
  assert.notEqual(contourNormal.borderSvgPath, contourNoWhiteBorder.borderSvgPath);

  // Document objects must remain unchanged
  assert.deepEqual(elements, originalDoc);
});

test('DesignCanvas source includes required white border and cutline SVG contracts', () => {
  const canvasPath = resolve(process.cwd(), 'src/components/customizer/design-canvas.tsx');
  const source = readFileSync(canvasPath, 'utf-8');

  assert.match(
    source,
    /stickerContour\?:\s*StickerContourResult/,
    'DesignCanvasProps must accept optional stickerContour'
  );

  assert.match(
    source,
    /productId === 'sticker' && Boolean\(stickerContour\?\.borderSvgPath\) && Boolean\(productOptions\.hasWhiteBorder\)/,
    'Canvas must conditionally render white border when productId is sticker and hasWhiteBorder is true'
  );

  assert.match(
    source,
    /productId === 'sticker' && Boolean\(stickerContour\?\.cutlineSvgPath\) && Boolean\(productOptions\.showCutline\)/,
    'Canvas must conditionally render cutline when productId is sticker and showCutline is true'
  );

  assert.match(
    source,
    /data-ui-guide="sticker-cutline"/,
    'Cutline SVG overlay must have data-ui-guide="sticker-cutline"'
  );

  assert.match(
    source,
    /pointer-events-none z-20 overflow-visible/,
    'Cutline SVG must be positioned in front with pointer-events-none'
  );

  assert.match(
    source,
    /strokeDasharray="4 3"/,
    'Cutline SVG stroke must be dashed'
  );

  assert.match(
    source,
    /pointer-events-none z-\[1\] overflow-visible/,
    'Border SVG must be positioned behind elements with z-[1]'
  );
});

test('CustomizerShell passes stickerContour to DesignCanvas', () => {
  const shellPath = resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx');
  const source = readFileSync(shellPath, 'utf-8');

  assert.match(
    source,
    /stickerContour=\{state\.productId === 'sticker' \? contourResult : undefined\}/,
    'CustomizerShell must pass stickerContour to DesignCanvas'
  );
});
