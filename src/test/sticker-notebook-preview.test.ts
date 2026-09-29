import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  FIXED_STICKER_SHAPES,
  NOTEBOOK_COVER_DEFINITION,
  createInitialState,
  type DesignState,
  type StickerOptions,
} from '../lib/product-state.ts';
import type { StickerPreviewProps } from '../components/customizer/preview/sticker-preview.tsx';
import type { NotebookPreviewProps } from '../components/customizer/preview/notebook-preview.tsx';

const stickerPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/sticker-preview.tsx',
);
const notebookPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/notebook-preview.tsx',
);

const stickerSource = readFileSync(stickerPath, 'utf8');
const notebookSource = readFileSync(notebookPath, 'utf8');

function createStickerState(overrides: Partial<DesignState> = {}): DesignState {
  const base = createInitialState('sticker');
  return {
    ...base,
    ...overrides,
    productOptions: {
      ...base.productOptions,
      ...(overrides.productOptions ?? {}),
    },
  };
}

function createNotebookState(overrides: Partial<DesignState> = {}): DesignState {
  const base = createInitialState('notebook');
  return {
    ...base,
    ...overrides,
    productOptions: {
      ...base.productOptions,
      ...(overrides.productOptions ?? {}),
    },
  };
}

test('StickerPreview contracts match architecture and exports', () => {
  assert.match(stickerSource, /^'use client';/);
  assert.match(stickerSource, /export interface StickerPreviewProps/);
  assert.match(stickerSource, /export function StickerPreview/);
  assert.match(stickerSource, /FIXED_STICKER_SHAPES/);
  assert.match(stickerSource, /computeStickerContour/);
  assert.match(stickerSource, /data-sticker-border/);
  assert.match(stickerSource, /drop-shadow/);

  // Must not render technical editor guides
  assert.doesNotMatch(stickerSource, /data-ui-guide="sticker-cutline"/);
  assert.doesNotMatch(stickerSource, /strokeDasharray/);
  assert.doesNotMatch(stickerSource, /SelectionOverlay/);
});

test('StickerPreview type contract accepts design state', () => {
  const state = createStickerState();
  const props: StickerPreviewProps = { state };
  assert.equal(props.state.productId, 'sticker');
});

test('StickerPreview supports die-cut and all five fixed shapes', () => {
  assert.deepEqual(FIXED_STICKER_SHAPES, [
    'circle',
    'square',
    'rectangle',
    'oval',
    'rounded-rectangle',
  ]);

  for (const shape of FIXED_STICKER_SHAPES) {
    assert.match(stickerSource, new RegExp(shape));
  }

  const dieCutState = createStickerState({
    variantId: 'die-cut',
    productOptions: {
      borderWidth: 3,
      hasWhiteBorder: true,
      showCutline: true,
    } as StickerOptions,
  });

  assert.equal(dieCutState.productId, 'sticker');
  assert.equal((dieCutState.productOptions as StickerOptions).hasWhiteBorder, true);
});

test('NotebookPreview contracts match architecture and exports', () => {
  assert.match(notebookSource, /^'use client';/);
  assert.match(notebookSource, /export interface NotebookPreviewProps/);
  assert.match(notebookSource, /export function NotebookPreview/);
  assert.match(notebookSource, /NOTEBOOK_COVER_DEFINITION/);
  assert.match(notebookSource, /data-notebook-binding="spiral"/);
  assert.match(notebookSource, /data-notebook-paper-depth="base"/);
  assert.match(notebookSource, /data-notebook-paper-depth="top"/);

  // Must omit dashed editor binding guide line
  assert.doesNotMatch(notebookSource, /data-ui-guide="notebook-binding"/);
  assert.doesNotMatch(notebookSource, /border-dashed/);
  assert.doesNotMatch(notebookSource, /Vùng gần gáy/);
  assert.doesNotMatch(notebookSource, /SelectionOverlay/);
});

test('NotebookPreview type contract accepts design state and sets A5 proportions', () => {
  const state = createNotebookState();
  const props: NotebookPreviewProps = { state };
  assert.equal(props.state.productId, 'notebook');
  assert.equal(NOTEBOOK_COVER_DEFINITION.widthMm, 148);
  assert.equal(NOTEBOOK_COVER_DEFINITION.heightMm, 210);
  assert.equal(NOTEBOOK_COVER_DEFINITION.aspectRatio, 148 / 210);
});

test('NotebookPreview renders page depth beneath cover and physical binding', () => {
  assert.match(notebookSource, /bg-\[#f4efe4\]/);
  assert.match(notebookSource, /-right-3/);
  assert.match(notebookSource, /shadow-\[0_24px_36px_-16px_rgba\(25,28,32,0\.45\)\]/);
  assert.match(notebookSource, /bg-gradient-to-r from-black\/25 via-black\/10 to-transparent/);
});
