import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  FIXED_STICKER_SHAPES,
  NOTEBOOK_COVER_DEFINITION,
  createInitialState,
  getFixedStickerDimensions,
  type CanvasElement,
  type CardOptions,
  type DesignState,
  type FixedStickerShape,
  type StickerOptions,
} from '../lib/product-state.ts';
import {
  computePatternGrid,
  getWrappingPaperDimensions,
} from '../lib/pattern-renderer.ts';
import { computeStickerContour } from '../lib/sticker-contour.ts';
import type { PreviewShellProps } from '../components/customizer/preview/preview-types.ts';

const customizerShellPath = resolve(
  process.cwd(),
  'src/components/customizer/customizer-shell.tsx',
);
const bottomNavPath = resolve(
  process.cwd(),
  'src/components/customizer/bottom-navigation.tsx',
);
const editorPreviewPath = resolve(
  process.cwd(),
  'src/components/customizer/editor-preview-mode.tsx',
);
const previewShellPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/preview-shell.tsx',
);
const wrappingPreviewPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/wrapping-preview.tsx',
);
const cardPreviewPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/card-preview.tsx',
);
const stickerPreviewPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/sticker-preview.tsx',
);
const notebookPreviewPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/notebook-preview.tsx',
);

const customizerShellSource = readFileSync(customizerShellPath, 'utf8');
const bottomNavSource = readFileSync(bottomNavPath, 'utf8');
const editorPreviewSource = readFileSync(editorPreviewPath, 'utf8');
const previewShellSource = readFileSync(previewShellPath, 'utf8');
const wrappingPreviewSource = readFileSync(wrappingPreviewPath, 'utf8');
const cardPreviewSource = readFileSync(cardPreviewPath, 'utf8');
const stickerPreviewSource = readFileSync(stickerPreviewPath, 'utf8');
const notebookPreviewSource = readFileSync(notebookPreviewPath, 'utf8');

function makeElement(overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: 'element-1',
    type: 'text',
    x: 20,
    y: 20,
    width: 30,
    height: 12,
    rotation: 0,
    data: { text: 'Hello' },
    ...overrides,
  };
}

// Criterion 1: Universal entry via Xem thử in toolbar
test('1. Universal entry via Xem thử in toolbar transitions shell into dedicated preview mode', () => {
  assert.match(
    bottomNavSource,
    /onClick=\{\(\) => onAction\('preview'\)\}[\s\S]*?<Eye[\s\S]*?<span[^>]*>Xem thử<\/span>/,
  );
  assert.match(
    customizerShellSource,
    /case 'preview':\s*setOverlayMode\('preview'\);\s*break;/,
  );
  assert.match(
    customizerShellSource,
    /\{overlayMode === 'preview' && \(\s*<EditorPreviewMode/,
  );
});

// Criterion 2: Full-screen presentation without editor chrome or guides
test('2. Full-screen presentation without editor chrome or guides (no handles, safe area, or quality badge)', () => {
  assert.match(
    previewShellSource,
    /className="fixed inset-0 z-50 flex flex-col bg-\[#F8F3E8\] text-\[#2E3338\]"/,
  );
  assert.match(previewShellSource, /<h1[^>]*>Xem thử<\/h1>/);

  const previewRenderers = [
    wrappingPreviewSource,
    cardPreviewSource,
    stickerPreviewSource,
    notebookPreviewSource,
  ];

  for (const source of previewRenderers) {
    assert.doesNotMatch(source, /SelectionOverlay/);
    assert.doesNotMatch(source, /safe-area/i);
    assert.doesNotMatch(source, /Vùng in an toàn/);
    assert.doesNotMatch(source, /DPI/);
    assert.doesNotMatch(source, /resize/i);
    assert.doesNotMatch(source, /QualityBadge/);
  }
});

// Criterion 3: Physical product shape context across all 4 product families
test('3. Physical product shape context across all 4 product families (wrapping, card, sticker, notebook)', () => {
  const products: DesignState['productId'][] = ['wrapping', 'card', 'sticker', 'notebook'];

  for (const productId of products) {
    const initialState = createInitialState(productId);
    assert.equal(initialState.productId, productId);
  }

  assert.match(
    editorPreviewSource,
    /if \(state\.productId === 'wrapping'\) \{\s*return <WrappingPreview state=\{state\} view=\{activeView === 'flat' \? 'flat' : 'box'\} \/>;\s*\}/,
  );
  assert.match(
    editorPreviewSource,
    /if \(state\.productId === 'card'\) \{\s*return <CardPreview state=\{state\} view=\{activeView as 'card-closed' \| 'card-open' \| 'card-back'\} \/>;\s*\}/,
  );
  assert.match(
    editorPreviewSource,
    /if \(state\.productId === 'sticker'\) \{\s*return <StickerPreview state=\{state\} \/>;\s*\}/,
  );
  assert.match(
    editorPreviewSource,
    /if \(state\.productId === 'notebook'\) \{\s*return <NotebookPreview state=\{state\} \/>;\s*\}/,
  );

  assert.match(wrappingPreviewSource, /data-preview="flat-sheet"/);
  assert.match(wrappingPreviewSource, /data-preview="box"/);
  assert.match(cardPreviewSource, /data-preview="card"/);
  assert.match(stickerPreviewSource, /data-preview="sticker"/);
  assert.match(notebookPreviewSource, /data-preview="notebook"/);
});

// Criterion 4: Wrapping paper flat sheet and gift box mockup (Tờ giấy / Hộp quà)
test('4. Wrapping paper flat sheet and gift box mockup (Tờ giấy / Hộp quà)', () => {
  assert.match(
    editorPreviewSource,
    /case 'wrapping':\s*return \[\s*\{\s*id: 'box',\s*label: 'Hộp quà'\s*\},\s*\{\s*id: 'flat',\s*label: 'Tờ giấy'\s*\},?\s*\];/,
  );

  const wrappingState = createInitialState('wrapping');
  const a1Dims = getWrappingPaperDimensions(wrappingState.variantId);
  assert.equal(a1Dims.width, 594);
  assert.equal(a1Dims.height, 841);

  const grid = computePatternGrid({
    sheetWidth: a1Dims.width,
    sheetHeight: a1Dims.height,
    config: {
      enabled: true,
      repeatMode: 'basic',
      scale: 100,
      spacingX: 0,
      spacingY: 0,
      rotation: 0,
      backgroundColor: '#ffffff',
    },
  });
  assert.ok(grid.totalCount > 0);
  assert.ok(grid.cells.length > 0);

  assert.match(wrappingPreviewSource, /export function WrappingPreview/);
  assert.match(wrappingPreviewSource, /data-box-face="front"/);
  assert.match(wrappingPreviewSource, /data-box-face="top"/);
  assert.match(wrappingPreviewSource, /data-box-face="side"/);
  assert.match(wrappingPreviewSource, /data-box-ribbon="vertical"/);
  assert.match(wrappingPreviewSource, /data-box-ribbon="horizontal"/);
  assert.match(wrappingPreviewSource, /data-box-bow/);
});

// Criterion 5: Card closed, open spread with center crease gradient, and back cover (Đóng / Mở / Mặt sau)
test('5. Card closed, open spread with center crease gradient, and back cover (Đóng / Mở / Mặt sau)', () => {
  assert.match(
    editorPreviewSource,
    /case 'card':\s*return \[\s*\{\s*id: 'card-closed',\s*label: 'Đóng'\s*\},\s*\{\s*id: 'card-open',\s*label: 'Mở'\s*\},\s*\{\s*id: 'card-back',\s*label: 'Mặt sau'\s*\},?\s*\];/,
  );

  const insideCard = createInitialState('card');
  (insideCard.productOptions as CardOptions).surface = 'inside';
  assert.equal((insideCard.productOptions as CardOptions).surface, 'inside');

  assert.match(
    editorPreviewSource,
    /const cardOpts = state\.productOptions as CardOptions;\s*return cardOpts\?\.surface === 'inside' \? 'card-open' : 'card-closed';/,
  );

  assert.match(cardPreviewSource, /data-card-view=\{view\}/);
  assert.match(
    cardPreviewSource,
    /\{isOpen && \(\s*<div className="absolute inset-y-0 left-1\/2 -translate-x-1\/2 w-4 pointer-events-none bg-gradient-to-r from-black\/5 via-black\/15 to-transparent select-none z-10" aria-hidden="true" \/>\s*\)/,
  );
  assert.doesNotMatch(cardPreviewSource, /border-dashed/);
  assert.doesNotMatch(cardPreviewSource, /Nếp gấp/);
});

// Criterion 6: Die-cut sticker silhouette and white border without technical cutlines
test('6. Die-cut sticker silhouette and white border without technical cutlines', () => {
  const stickerState = createInitialState('sticker');
  const contour = computeStickerContour(
    [
      makeElement({
        type: 'shape',
        x: 10,
        y: 10,
        width: 30,
        height: 30,
      }),
    ],
    stickerState.productOptions as StickerOptions,
  );

  assert.ok(contour.cutlineSvgPath.length > 0);
  assert.ok(contour.borderSvgPath.length > 0);

  assert.match(stickerPreviewSource, /data-sticker-mode="die-cut"/);
  assert.match(stickerPreviewSource, /data-sticker-border/);
  assert.match(stickerPreviewSource, /clipPath id=\{clipPathId\}/);
  assert.match(
    stickerPreviewSource,
    /<path d=\{contour\.borderSvgPath \|\| 'M2 2 H98 V98 H2 Z'\} fill="#fff"/,
  );
  assert.doesNotMatch(stickerPreviewSource, /strokeDasharray/i);
  assert.doesNotMatch(stickerPreviewSource, /Đường bế thành phẩm/);
  assert.doesNotMatch(stickerPreviewSource, /data-cutline-guide/);
});

// Criterion 7: Fixed-shape sticker exact shape clipping (circle, square, rectangle, oval, rounded-rectangle)
test('7. Fixed-shape sticker exact shape clipping across all 5 shapes', () => {
  const shapes: FixedStickerShape[] = [
    'circle',
    'square',
    'rectangle',
    'oval',
    'rounded-rectangle',
  ];

  assert.deepEqual([...FIXED_STICKER_SHAPES], shapes);

  for (const shape of shapes) {
    const dimensions = getFixedStickerDimensions(shape);
    assert.ok(dimensions.width > 0);
    assert.ok(dimensions.height > 0);
    assert.ok(dimensions.borderRadiusCss.length > 0);
  }

  assert.match(stickerPreviewSource, /data-sticker-mode="fixed-shape"/);
  assert.match(stickerPreviewSource, /data-sticker-shape=\{shape\}/);
  assert.match(
    stickerPreviewSource,
    /borderRadius = shape === 'circle' \|\| shape === 'oval' \? '9999px' : shape === 'rounded-rectangle' \? '16px' : '0px'/,
  );
  assert.match(
    stickerPreviewSource,
    /dimensions = shape === 'circle' \|\| shape === 'square' \? 'aspect-square' : 'aspect-\[1\.4\]'/,
  );
});

// Criterion 8: Notebook cover with physical binding mockup
test('8. Notebook cover with physical binding mockup', () => {
  assert.equal(NOTEBOOK_COVER_DEFINITION.widthMm, 148);
  assert.equal(NOTEBOOK_COVER_DEFINITION.heightMm, 210);

  assert.match(notebookPreviewSource, /data-preview="notebook"/);
  assert.match(notebookPreviewSource, /data-notebook-cover/);
  assert.match(notebookPreviewSource, /data-notebook-paper-depth="base"/);
  assert.match(notebookPreviewSource, /data-notebook-paper-depth="top"/);
  assert.match(notebookPreviewSource, /data-notebook-binding="spiral"/);
  assert.match(
    notebookPreviewSource,
    /bg-gradient-to-r from-zinc-300 via-zinc-100 to-zinc-400/,
  );
  assert.doesNotMatch(notebookPreviewSource, /Vùng gần gáy/);
  assert.doesNotMatch(notebookPreviewSource, /border-dashed/);
});

// Criterion 9: Single-tap return to editing with state preserved (Tiếp tục chỉnh)
test('9. Single-tap return to editing with state preserved (Tiếp tục chỉnh)', () => {
  assert.match(
    previewShellSource,
    /<button[^>]*onClick=\{onBackToEdit\}[^>]*aria-label="Tiếp tục chỉnh"[\s\S]*?<span>Tiếp tục chỉnh<\/span>/,
  );
  assert.match(
    previewShellSource,
    /<button[^>]*onClick=\{onBackToEdit\}[^>]*>\s*Tiếp tục chỉnh\s*<\/button>/,
  );
  assert.match(
    customizerShellSource,
    /case 'CLOSE_PREVIEW':\s*case 'CLOSE_PREFLIGHT':\s*setOverlayMode\(null\);\s*break;/,
  );
  assert.match(
    customizerShellSource,
    /<EditorPreviewMode[\s\S]*?onBackToEdit=\{\(\) => setOverlayMode\(null\)\}/,
  );

  let backCalls = 0;
  const props: PreviewShellProps = {
    productTitle: 'Sổ tay A5',
    activeView: 'notebook',
    onBackToEdit: () => {
      backCalls += 1;
    },
    onDoneToPreflight: () => { },
    children: null,
  };

  props.onBackToEdit();
  assert.equal(backCalls, 1);
});

// Criterion 10: Single-tap continuation to Preflight (Xong)
test('10. Single-tap continuation to Preflight (Xong)', () => {
  assert.match(
    previewShellSource,
    /<button[^>]*onClick=\{onDoneToPreflight\}[^>]*>\s*Xong\s*<\/button>/,
  );
  assert.match(
    customizerShellSource,
    /<EditorPreviewMode[\s\S]*?onDoneToPreflight=\{\(\) => setOverlayMode\('preflight'\)\}/,
  );
  assert.match(
    customizerShellSource,
    /\{overlayMode === 'preflight' && \(\s*<EditorPreflightMode/,
  );

  let doneCalls = 0;
  const props: PreviewShellProps = {
    productTitle: 'Giấy gói quà',
    activeView: 'box',
    onBackToEdit: () => { },
    onDoneToPreflight: () => {
      doneCalls += 1;
    },
    children: null,
  };

  props.onDoneToPreflight();
  assert.equal(doneCalls, 1);
});
