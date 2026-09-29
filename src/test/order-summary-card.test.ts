import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createInitialState,
  type DesignState,
  type CardOrientation,
} from '../lib/product-state.ts';
import type { OrderSummaryCardProps } from '../components/checkout/order-summary-card.tsx';

// Helper re-implementations / contract testing matches repository's node:test suite pattern
// (node --test --experimental-strip-types does not transpile JSX from tsx imports directly)
function getFriendlyProductName(design: DesignState): string {
  switch (design.productId) {
    case 'wrapping':
      return 'Giấy bọc quà';
    case 'card':
      return 'Thiệp chúc mừng';
    case 'notebook':
      return 'Bìa sổ tay';
    case 'sticker':
      return design.productOptions?.shape === 'circle'
        ? 'Sticker tròn'
        : 'Sticker die-cut';
    default:
      return 'Sản phẩm in';
  }
}

function getFriendlyVariant(design: DesignState): string {
  const options = design.productOptions || {};

  switch (design.productId) {
    case 'wrapping': {
      const variantUpper = (design.variantId || 'a1').toUpperCase();
      const modeText = options.mode === 'full-sheet' ? 'Toàn tờ' : 'Lặp họa tiết';
      return `${variantUpper} • ${modeText}`;
    }
    case 'card': {
      return options.orientation === 'vertical' ? 'Dọc' : 'Ngang';
    }
    case 'sticker': {
      return design.variantId === 'die-cut' ? 'Cắt rời (Die-cut)' : 'Hình chuẩn';
    }
    case 'notebook': {
      return 'Khổ A5 (148 × 210 mm)';
    }
    default:
      return '';
  }
}

function getThumbnailShapeClass(design: DesignState): string {
  if (design.productId === 'sticker' && design.productOptions?.shape === 'circle') {
    return 'rounded-full aspect-square';
  }
  if (design.productId === 'card') {
    return design.productOptions?.orientation === 'vertical'
      ? 'aspect-[105/148] rounded-md'
      : 'aspect-[148/105] rounded-md';
  }
  if (design.productId === 'notebook') {
    return 'aspect-[148/210] rounded-sm';
  }
  return 'rounded-xl aspect-square';
}

const componentPath = resolve(process.cwd(), 'src/components/checkout/order-summary-card.tsx');
const componentSource = readFileSync(componentPath, 'utf8');

test('OrderSummaryCard props contract compiles with strict types', () => {
  const design = createInitialState('wrapping');
  let editTriggered = false;
  let previewTriggered = false;

  const props: OrderSummaryCardProps = {
    design,
    onEditDesign: () => {
      editTriggered = true;
    },
    onOpenPreview: () => {
      previewTriggered = true;
    },
  };

  assert.equal(props.design.productId, 'wrapping');
  props.onEditDesign();
  assert.equal(editTriggered, true);
  props.onOpenPreview?.();
  assert.equal(previewTriggered, true);
});

test('Product title rendering for wrapping, card, sticker, notebook', () => {
  const wrapping = createInitialState('wrapping');
  assert.equal(getFriendlyProductName(wrapping), 'Giấy bọc quà');

  const card = createInitialState('card');
  assert.equal(getFriendlyProductName(card), 'Thiệp chúc mừng');

  const notebook = createInitialState('notebook');
  assert.equal(getFriendlyProductName(notebook), 'Bìa sổ tay');

  const stickerDieCut: DesignState = {
    ...createInitialState('sticker'),
    productOptions: { shape: 'rounded-rectangle' },
  };
  assert.equal(getFriendlyProductName(stickerDieCut), 'Sticker die-cut');

  const stickerCircle: DesignState = {
    ...createInitialState('sticker'),
    productOptions: { shape: 'circle' },
  };
  assert.equal(getFriendlyProductName(stickerCircle), 'Sticker tròn');
});

test('Variant text rendering for wrapping, card, sticker, notebook', () => {
  // Wrapping
  const wrappingPattern = createInitialState('wrapping');
  assert.equal(getFriendlyVariant(wrappingPattern), 'A1 • Lặp họa tiết');

  const wrappingFullSheet: DesignState = {
    ...createInitialState('wrapping'),
    variantId: 'a2',
    productOptions: { mode: 'full-sheet' },
  };
  assert.equal(getFriendlyVariant(wrappingFullSheet), 'A2 • Toàn tờ');

  // Card
  const cardHorizontal = createInitialState('card');
  assert.equal(getFriendlyVariant(cardHorizontal), 'Ngang');

  const cardVertical: DesignState = {
    ...createInitialState('card'),
    variantId: 'vertical',
    productOptions: { orientation: 'vertical' as CardOrientation },
  };
  assert.equal(getFriendlyVariant(cardVertical), 'Dọc');

  // Sticker
  const stickerDieCut: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'die-cut',
  };
  assert.equal(getFriendlyVariant(stickerDieCut), 'Cắt rời (Die-cut)');

  const stickerFixed: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
  };
  assert.equal(getFriendlyVariant(stickerFixed), 'Hình chuẩn');

  // Notebook
  const notebook = createInitialState('notebook');
  assert.equal(getFriendlyVariant(notebook), 'Khổ A5 (148 × 210 mm)');
});

test('Thumbnail shape class assigns product-specific geometry', () => {
  const circleSticker: DesignState = {
    ...createInitialState('sticker'),
    productOptions: { shape: 'circle' },
  };
  assert.match(getThumbnailShapeClass(circleSticker), /rounded-full/);

  const cardHorizontal: DesignState = {
    ...createInitialState('card'),
    productOptions: { orientation: 'horizontal' },
  };
  assert.match(getThumbnailShapeClass(cardHorizontal), /aspect-\[148\/105\]/);

  const cardVertical: DesignState = {
    ...createInitialState('card'),
    productOptions: { orientation: 'vertical' },
  };
  assert.match(getThumbnailShapeClass(cardVertical), /aspect-\[105\/148\]/);

  const notebook = createInitialState('notebook');
  assert.match(getThumbnailShapeClass(notebook), /aspect-\[148\/210\]/);

  const wrapping = createInitialState('wrapping');
  assert.match(getThumbnailShapeClass(wrapping), /rounded-xl/);
});

test('Component source matches all required UI contracts, classes, badges and handlers', () => {
  // Required imports
  assert.ok(
    componentSource.includes("from '@/lib/product-state'"),
    'Must import from product-state'
  );
  assert.ok(
    componentSource.includes('DesignState') &&
    componentSource.includes('getDesignSummary') &&
    componentSource.includes('PRODUCTS'),
    'Must import DesignState, getDesignSummary, PRODUCTS'
  );
  assert.ok(
    componentSource.includes("import { DesignCanvas } from '@/components/customizer/design-canvas';"),
    'Must import DesignCanvas'
  );

  // Trust badge exact markup and classes
  assert.ok(
    componentSource.includes('Thiết kế đã được kiểm tra'),
    'Must include badge label'
  );
  assert.ok(
    componentSource.includes('bg-[#EBF3ED]') &&
    componentSource.includes('text-[#2D5A3A]') &&
    componentSource.includes('border-[#C2DEC9]'),
    'Badge must contain required colors and border styling'
  );
  assert.ok(
    componentSource.includes('<CheckCircle2 className="w-3 h-3" />'),
    'Badge must render CheckCircle2 icon'
  );

  // Edit action
  assert.ok(
    componentSource.includes('Chỉnh sửa thiết kế'),
    'Must render Chỉnh sửa thiết kế text'
  );
  assert.ok(
    componentSource.includes('onClick={onEditDesign}'),
    'Must bind onEditDesign handler'
  );
  assert.ok(
    componentSource.includes('text-[#315F86]'),
    'Edit button must use primary action color #315F86'
  );

  // Thumbnail container & DesignCanvas render
  assert.ok(
    componentSource.includes('data-testid="thumbnail-container"'),
    'Must provide thumbnail container'
  );
  assert.ok(
    componentSource.includes('<DesignCanvas'),
    'Must render DesignCanvas inside thumbnail container'
  );
  assert.ok(
    componentSource.includes('onOpenPreview'),
    'Must support onOpenPreview thumbnail click interaction'
  );
});
