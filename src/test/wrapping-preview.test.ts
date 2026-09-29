import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { computePatternGrid, getWrappingPaperDimensions } from '../lib/pattern-renderer.ts';
import { createInitialState, normalizeWrappingOptions, type DesignState } from '../lib/product-state.ts';
import type { WrappingPreviewProps } from '../components/customizer/preview/wrapping-preview.tsx';

const componentPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/wrapping-preview.tsx',
);
const source = readFileSync(componentPath, 'utf8');

test('WrappingPreview source contracts match requirements', () => {
  assert.match(source, /^'use client';/);
  assert.match(source, /export interface WrappingPreviewProps/);
  assert.match(source, /export function WrappingPreview/);
  assert.match(source, /from '@\/lib\/product-state'/);
  assert.match(source, /from '@\/lib\/pattern-renderer'/);
  assert.match(source, /computePatternGrid/);
  assert.match(source, /getWrappingPaperDimensions/);
  assert.match(source, /\[perspective:1000px\]/);
  assert.match(source, /rotateY\(-25deg\)/);
  assert.match(source, /rotateX\(15deg\)/);
  assert.match(source, /data-box-face="front"/);
  assert.match(source, /data-box-face="top"/);
  assert.match(source, /data-box-face="side"/);
  assert.doesNotMatch(source, /SelectionOverlay/);
  assert.doesNotMatch(source, /resize/i);
  assert.doesNotMatch(source, /safe-area/i);
});

test('WrappingPreview type contract accepts state and view modes', () => {
  const state: DesignState = createInitialState('wrapping');
  const flatProps: WrappingPreviewProps = {
    state,
    view: 'flat',
  };
  const boxProps: WrappingPreviewProps = {
    state,
    view: 'box',
  };

  assert.equal(flatProps.view, 'flat');
  assert.equal(boxProps.view, 'box');
  assert.equal(flatProps.state.productId, 'wrapping');
});

test('WrappingPreview renders flat sheet with correct sheet dimensions and repeat matrix', () => {
  const a1 = getWrappingPaperDimensions('a1');
  const a2 = getWrappingPaperDimensions('a2');

  assert.equal(a1.width, 594);
  assert.equal(a1.height, 841);
  assert.equal(a1.aspectRatio, 594 / 841);

  assert.equal(a2.width, 420);
  assert.equal(a2.height, 594);
  assert.equal(a2.aspectRatio, 420 / 594);

  const state: DesignState = {
    ...createInitialState('wrapping'),
    variantId: 'a1',
    productOptions: {
      mode: 'pattern',
      patternConfig: {
        enabled: true,
        repeatMode: 'basic',
        scale: 100,
        spacingX: 0,
        spacingY: 0,
        rotation: 0,
        backgroundColor: '#fefefe',
      },
    },
  };

  const options = normalizeWrappingOptions(state.productOptions);
  const grid = computePatternGrid({
    sheetWidth: a1.width,
    sheetHeight: a1.height,
    config: options.patternConfig,
  });

  assert.ok(grid.totalCount > 0);
  assert.equal(grid.bounds.width, 594);
  assert.equal(grid.bounds.height, 841);

  assert.match(source, /data-preview="flat-sheet"/);
  assert.match(source, /data-preview-pattern-grid/);
  assert.match(source, /data-pattern-cell/);
  assert.match(source, /data-preview-full-sheet/);
});

test('WrappingPreview renders 3D box faces, shading, and ribbon packaging aesthetic', () => {
  assert.match(source, /data-preview="box"/);
  assert.match(source, /\[transform:rotateY\(-25deg\)_rotateX\(15deg\)\]/);
  assert.match(source, /data-box-shading="front"/);
  assert.match(source, /data-box-shading="top"/);
  assert.match(source, /data-box-shading="side"/);
  assert.match(source, /data-box-ribbon="vertical"/);
  assert.match(source, /data-box-ribbon="horizontal"/);
  assert.match(source, /data-box-bow/);
});

test('WrappingPreview keeps preview read-only without editing handles or overlays', () => {
  assert.doesNotMatch(source, /SelectionOverlay/);
  assert.doesNotMatch(source, /onSelect/);
  assert.doesNotMatch(source, /onDrag/);
  assert.doesNotMatch(source, /onResize/);
  assert.doesNotMatch(source, /safe-area-guide/);
  assert.doesNotMatch(source, /resize-handle/);
});
