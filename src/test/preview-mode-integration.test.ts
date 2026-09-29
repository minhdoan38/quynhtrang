import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createInitialState, type CardOptions, type DesignState } from '../lib/product-state.ts';
import type { PreviewViewId } from '../components/customizer/preview/preview-types.ts';

const componentPath = resolve(
  process.cwd(),
  'src/components/customizer/editor-preview-mode.tsx',
);
const source = readFileSync(componentPath, 'utf8');

function state(productId: DesignState['productId'], surface?: CardOptions['surface']): DesignState {
  const base = createInitialState(productId);
  return surface === undefined
    ? base
    : { ...base, productOptions: { ...base.productOptions, surface } };
}

test('EditorPreviewMode routes each product to its dedicated preview renderer', () => {
  assert.match(source, /import \{ PreviewShell \} from '\.\/preview\/preview-shell';/);
  assert.match(source, /import \{ WrappingPreview \} from '\.\/preview\/wrapping-preview';/);
  assert.match(source, /import \{ CardPreview \} from '\.\/preview\/card-preview';/);
  assert.match(source, /import \{ StickerPreview \} from '\.\/preview\/sticker-preview';/);
  assert.match(source, /import \{ NotebookPreview \} from '\.\/preview\/notebook-preview';/);

  for (const productId of ['wrapping', 'card', 'sticker', 'notebook'] as const) {
    assert.equal(state(productId).productId, productId);
    assert.match(source, new RegExp(`state\\.productId === '${productId}'`));
  }

  assert.match(source, /<WrappingPreview[^>]*state=\{state\}[^>]*view=\{activeView/);
  assert.match(source, /<CardPreview[^>]*state=\{state\}[^>]*view=\{activeView/);
  assert.match(source, /<StickerPreview[^>]*state=\{state\}/);
  assert.match(source, /<NotebookPreview[^>]*state=\{state\}/);
});

test('EditorPreviewMode chooses card-open only for inside surface', () => {
  const inside = state('card', 'inside');
  const front = state('card', 'front');

  assert.equal((inside.productOptions as CardOptions).surface, 'inside');
  assert.equal((front.productOptions as CardOptions).surface, 'front');
  assert.match(source, /surface === 'inside'\s*\?\s*'card-open'\s*:\s*'card-closed'/);
});

test('EditorPreviewMode exposes product view options and wires view changes', () => {
  const expectedViews: Record<DesignState['productId'], PreviewViewId[]> = {
    wrapping: ['box', 'flat'],
    card: ['card-closed', 'card-open', 'card-back'],
    sticker: ['sticker'],
    notebook: ['notebook'],
  };

  assert.deepEqual(expectedViews.wrapping, ['box', 'flat']);
  assert.deepEqual(expectedViews.card, ['card-closed', 'card-open', 'card-back']);
  assert.match(source, /const \[activeView, setActiveView\] = useState<PreviewViewId>\(getInitialView\(state\)\)/);
  assert.match(source, /availableViews/);
  assert.match(source, /onViewChange=\{setActiveView\}/);
  assert.match(source, /label:\s*'Hộp quà'/);
  assert.match(source, /label:\s*'Tờ giấy'/);
  assert.match(source, /label:\s*'Đóng'/);
  assert.match(source, /label:\s*'Mở'/);
  assert.match(source, /label:\s*'Mặt sau'/);
});

test('EditorPreviewMode forwards shell navigation callbacks', () => {
  assert.match(source, /onBackToEdit=\{onBackToEdit\}/);
  assert.match(source, /onDoneToPreflight=\{onDoneToPreflight\}/);
});
