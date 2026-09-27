import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCTS,
  createInitialState,
  getDesignSummary,
  getPreflight,
  getCompatibleTemplates,
  transitionState,
  createTextElement,
  getTextElement,
  getTextData,
  getImageData,
  getTextLayerName,
  migrateLegacyText,
  type DesignState,
  type DesignAction,
  type CanvasElement,
  type TextElementData,
} from '../lib/product-state.ts';

test('creates the default wrapping-paper design', () => {
  const state: DesignState = createInitialState();

  assert.equal(state.productId, 'wrapping');
  assert.equal(state.variantId, 'a1');
  assert.equal(state.templateId, null);
  assert.deepEqual(state.productOptions, {
    mode: 'repeat',
    repeatStyle: 'regular',
    patternScale: 100,
    spacingX: 0,
    spacingY: 0,
    rotation: 0,
  });
  assert.equal(PRODUCTS.wrapping.name, 'Giấy gói quà');
  assert.doesNotThrow(() => JSON.stringify(state));
});

test('switches products without mutating the previous design', () => {
  const wrapping = transitionState(createInitialState(), {
    type: 'SET_TEXT',
    value: 'Chúc mừng sinh nhật',
  });
  const card = transitionState(wrapping, {
    type: 'SET_PRODUCT',
    value: 'card',
  });

  assert.notStrictEqual(card, wrapping);
  assert.equal(wrapping.productId, 'wrapping');
  assert.equal(card.productId, 'card');
  assert.equal(card.variantId, 'horizontal');
  assert.equal(card.text, 'Chúc mừng sinh nhật');
  assert.deepEqual(card.productOptions, { surface: 'front' });
});

test('applies template content and product-specific options', () => {
  const initial = createInitialState('wrapping');
  const celebrated = transitionState(initial, {
    type: 'SET_TEMPLATE',
    value: 'celebrate',
  });

  assert.equal(celebrated.templateId, 'celebrate');
  assert.equal(celebrated.text, 'Chúc mừng!');
  assert.equal(celebrated.color, '#7c2d12');
  assert.equal(celebrated.backgroundColor, '#fef3c7');
  assert.equal(celebrated.productOptions.repeatStyle, 'brick');
  assert.equal(celebrated.productOptions.patternScale, 125);

  const blank = transitionState(celebrated, {
    type: 'SET_TEMPLATE',
    value: 'blank',
  });
  assert.equal(blank.templateId, 'blank');
  assert.equal(blank.text, '');
  assert.equal(blank.backgroundColor, '#ffffff');
  assert.equal(blank.productOptions.repeatStyle, 'regular');
});

test('filters templates compatible with selected product and variant', () => {
  // Card horizontal should get horizontal templates and generic templates, but NOT vertical templates or wrapping templates
  const cardHorizontal = getCompatibleTemplates({
    productId: 'card',
    variantId: 'horizontal',
  });
  const ids = cardHorizontal.map((t) => t.id);
  assert.ok(ids.includes('card-h-birthday'));
  assert.ok(ids.includes('card-h-cute'));
  assert.ok(ids.includes('card-h-love'));
  assert.ok(ids.includes('blank'));
  assert.ok(ids.includes('minimal'));
  assert.ok(!ids.includes('card-v-floral'));
  assert.ok(!ids.includes('wrapping-a1-cute'));

  // Category filter
  const cuteOnly = getCompatibleTemplates({
    productId: 'card',
    variantId: 'horizontal',
    category: 'cute',
  });
  assert.ok(cuteOnly.every((t) => t.template.category === 'cute'));

  // Search query filter
  const searched = getCompatibleTemplates({
    productId: 'card',
    variantId: 'horizontal',
    searchQuery: 'gấu',
  });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].id, 'card-h-cute');
});

test('clamps quantity within bounds 1-999 and ignores invalid input', () => {
  const state = createInitialState();
  const clampedHigh = transitionState(state, { type: 'SET_QUANTITY', value: 5000 });
  assert.equal(clampedHigh.quantity, 999);

  const clampedLow = transitionState(state, { type: 'SET_QUANTITY', value: -4 });
  assert.equal(clampedLow.quantity, 1);

  const clampedZero = transitionState(state, { type: 'SET_QUANTITY', value: 0 });
  assert.equal(clampedZero.quantity, 1);

  const clampedString = transitionState(state, { type: 'SET_QUANTITY', value: '42' });
  assert.equal(clampedString.quantity, 42);

  const unchangedInvalid = transitionState(clampedString, { type: 'SET_QUANTITY', value: 'invalid' });
  assert.equal(unchangedInvalid.quantity, 42);
});

test('updates wrapping pattern controls immutably', () => {
  const original = createInitialState();
  const updated = transitionState(original, {
    type: 'SET_PRODUCT_OPTION',
    key: 'repeatStyle',
    value: 'brick',
  });

  assert.notStrictEqual(updated, original);
  assert.notStrictEqual(updated.productOptions, original.productOptions);
  assert.equal(updated.productOptions.repeatStyle, 'brick');
  assert.equal(original.productOptions.repeatStyle, 'regular');
});

test('derives a Vietnamese order summary and price estimate', () => {
  const state = transitionState(createInitialState('notebook'), {
    type: 'SET_QUANTITY',
    value: 3,
  });

  assert.deepEqual(getDesignSummary(state), {
    product: 'Bìa sổ tay',
    variant: 'Tiêu chuẩn',
    quantity: 3,
    unitPrice: 49000,
    totalPrice: 147000,
    priceLabel: '147.000 ₫',
  });
});

test('warns when an uploaded image may print blurry', () => {
  const state = transitionState(createInitialState(), {
    type: 'SET_IMAGE',
    value: {
      name: 'anh-nho.jpg',
      type: 'image/jpeg',
      size: 1024,
      src: 'blob:anh-nho',
      width: 640,
      height: 480,
    },
  });
  const preflight = getPreflight(state);

  assert.equal(preflight.level, 'warning');
  assert.deepEqual(
    preflight.checks.find((check) => check.id === 'image-quality'),
    {
      id: 'image-quality',
      level: 'warning',
      label: 'Ảnh có thể hơi mờ khi in',
    },
  );
});

test('moves an unlocked element and ignores move on locked element', () => {
  const initial = createInitialState('wrapping');
  const withElements = transitionState(initial, {
    type: 'SET_ELEMENTS',
    value: [
      { id: 'img-1', type: 'image', x: 50, y: 50, width: 40, height: 40, rotation: 0, locked: false },
      { id: 'txt-1', type: 'text', x: 50, y: 80, width: 60, height: 20, rotation: 0, locked: true },
    ],
  });

  const moved = transitionState(withElements, {
    type: 'MOVE_ELEMENT',
    id: 'img-1',
    x: 65,
    y: 70,
  });
  assert.equal(moved.elements?.find((el) => el.id === 'img-1')?.x, 65);
  assert.equal(moved.elements?.find((el) => el.id === 'img-1')?.y, 70);

  // Locked element must not move
  const movedLocked = transitionState(moved, {
    type: 'MOVE_ELEMENT',
    id: 'txt-1',
    x: 99,
    y: 99,
  });
  assert.equal(movedLocked.elements?.find((el) => el.id === 'txt-1')?.x, 50);
});

test('resizes and rotates an element', () => {
  const initial = createInitialState('wrapping');
  const withElements = transitionState(initial, {
    type: 'SET_ELEMENTS',
    value: [
      { id: 'img-1', type: 'image', x: 50, y: 50, width: 40, height: 40, rotation: 0, locked: false },
    ],
  });

  const resized = transitionState(withElements, {
    type: 'RESIZE_ELEMENT',
    id: 'img-1',
    width: 60,
    height: 60,
    x: 55,
    y: 55,
  });
  assert.equal(resized.elements?.[0].width, 60);
  assert.equal(resized.elements?.[0].x, 55);

  const rotated = transitionState(resized, {
    type: 'ROTATE_ELEMENT',
    id: 'img-1',
    rotation: 45,
  });
  assert.equal(rotated.elements?.[0].rotation, 45);
});

test('adds and removes canvas elements with proper z-index', () => {
  const initial = createInitialState('card');
  const addedText = transitionState(initial, {
    type: 'ADD_CANVAS_ELEMENT',
    element: {
      id: 'text-node-1',
      type: 'text',
      x: 50,
      y: 50,
      width: 60,
      height: 20,
      rotation: 0,
      data: { text: 'Tiêu đề mới', color: '#315F86' },
    },
  });

  assert.equal(addedText.elements?.length, 1);
  assert.equal(addedText.elements?.[0].id, 'text-node-1');
  assert.equal(addedText.elements?.[0].zIndex, 1);
  assert.equal(addedText.text, 'Tiêu đề mới');

  const addedShape = transitionState(addedText, {
    type: 'ADD_CANVAS_ELEMENT',
    element: {
      id: 'shape-circle-1',
      type: 'shape',
      x: 52,
      y: 52,
      width: 40,
      height: 40,
      rotation: 0,
      data: { shapeType: 'circle', fill: '#DCEBF4' },
    },
  });

  assert.equal(addedShape.elements?.length, 2);
  assert.equal(addedShape.elements?.[1].zIndex, 2);

  const removed = transitionState(addedShape, {
    type: 'REMOVE_CANVAS_ELEMENT',
    id: 'text-node-1',
  });

  assert.equal(removed.elements?.length, 1);
  assert.equal(removed.elements?.[0].id, 'shape-circle-1');
});

test('creates heading and body as the same text element with different defaults', () => {
  const initial = createInitialState('card');
  const heading = transitionState(initial, {
    type: 'ADD_TEXT_ELEMENT',
    preset: 'heading',
    id: 'text-heading-1',
  });
  const body = transitionState(initial, {
    type: 'ADD_TEXT_ELEMENT',
    preset: 'body',
    id: 'text-body-1',
  });

  const headingElement = heading.elements?.[0];
  const bodyElement = body.elements?.[0];
  assert.equal(headingElement?.type, 'text');
  assert.equal(bodyElement?.type, 'text');
  assert.equal(getTextData(headingElement!)?.text, 'Nhập tiêu đề');
  assert.equal(getTextData(bodyElement!)?.text, 'Nhập nội dung');
  assert.notEqual(getTextData(headingElement!)?.fontSize, getTextData(bodyElement!)?.fontSize);
});

test('commits text content while preserving element geometry and style', () => {
  const initial = stateWithTextElement();
  const next = transitionState(initial, {
    type: 'COMMIT_TEXT_EDIT',
    id: 'text-1',
    text: 'Chúc mừng sinh nhật mẹ',
  });
  const element = next.elements?.[0];
  assert.equal(getTextData(element!)?.text, 'Chúc mừng sinh nhật mẹ');
  assert.equal(element?.width, 70);
  assert.equal(element?.x, 50);
});

test('removes text element when edit commits empty content', () => {
  const initial = stateWithTextElement();
  const next = transitionState(initial, { type: 'COMMIT_TEXT_EDIT', id: 'text-1', text: '   ' });
  assert.equal(next.elements?.some((element) => element.id === 'text-1'), false);
});

test('migrates legacy top-level text into one text element', () => {
  const legacy = { ...createInitialState('card'), text: 'Tên của bạn', color: '#315F86' };
  const migrated = migrateLegacyText(legacy);
  const element = migrated.elements?.find((candidate) => candidate.type === 'text');
  assert.equal(getTextData(element!)?.text, 'Tên của bạn');
  assert.equal(getTextData(element!)?.color, '#315F86');
});

test('text style update changes only selected text style', () => {
  const initial = stateWithTwoTextElements();
  const next = transitionState(initial, {
    type: 'UPDATE_TEXT_STYLE',
    id: 'text-2',
    patch: { fontSize: 28, align: 'right' },
  });
  assert.equal(getTextData(next.elements?.[1]!)?.fontSize, 28);
  assert.equal(getTextData(next.elements?.[1]!)?.align, 'right');
  assert.equal(getTextData(next.elements?.[0]!)?.fontSize, 20);
});

test('text layer names use content and truncate long content', () => {
  const element = textElementWithContent('Một dòng chữ tiếng Việt rất dài để kiểm tra tên lớp');
  assert.equal(getTextLayerName(element), 'Một dòng chữ tiếng Việt rất dài…');
});

test('updates selected text alignment without changing content', () => {
  const state = stateWithTextElement();
  const next = transitionState(state, {
    type: 'UPDATE_TEXT_STYLE',
    id: 'text-1',
    patch: { align: 'center' },
  });
  assert.equal(getTextData(next.elements?.[0]!)?.align, 'center');
  assert.equal(getTextData(next.elements?.[0]!)?.text, 'Nhập nội dung');
});

test('duplicate preserves text style and offsets new element', () => {
  const next = transitionState(stateWithTextElement(), { type: 'DUPLICATE_ELEMENT', id: 'text-1' });
  assert.equal(next.elements?.length, 2);
  assert.deepEqual(getTextData(next.elements?.[1]!)?.fontFamily, getTextData(next.elements?.[0]!)?.fontFamily);
  assert.notEqual(next.elements?.[1].x, next.elements?.[0].x);
});

test('REPLACE_IMAGE_ASSET updates source while preserving element layout, crop, and transforms', () => {
  const base = createInitialState('wrapping');
  const stateWithImage = transitionState(base, {
    type: 'SET_IMAGE',
    value: { src: 'blob:old-img', name: 'old.jpg', width: 800, height: 600 },
  });
  // Move element
  const moved = transitionState(stateWithImage, {
    type: 'MOVE_ELEMENT',
    id: 'image-1',
    x: 65,
    y: 70,
  });

  const replaced = transitionState(moved, {
    type: 'REPLACE_IMAGE_ASSET',
    id: 'image-1',
    asset: {
      id: 'asset-new',
      src: 'blob:new-img',
      name: 'new.jpg',
      width: 1600,
      height: 1200,
    },
  });

  const imgEl = replaced.elements?.find((el) => el.id === 'image-1');
  assert.ok(imgEl);
  assert.equal(imgEl.x, 65);
  assert.equal(imgEl.y, 70);
  assert.equal(getImageData(imgEl)?.src, 'blob:new-img');
  assert.equal(getImageData(imgEl)?.originalSrc, 'blob:new-img');
  assert.equal(replaced.image?.src, 'blob:new-img');
  assert.equal(replaced.image?.name, 'new.jpg');
});

test('APPLY_REMOVE_BACKGROUND and RESTORE_ORIGINAL_IMAGE behave non-destructively', () => {
  const base = createInitialState('card');
  const withImg = transitionState(base, {
    type: 'SET_IMAGE',
    value: { src: 'blob:photo.jpg', name: 'photo.jpg' },
  });

  const removedBg = transitionState(withImg, {
    type: 'APPLY_REMOVE_BACKGROUND',
    id: 'image-1',
    derivedSrc: 'blob:photo-no-bg.png',
  });

  const imgEl = removedBg.elements?.find((el) => el.id === 'image-1');
  assert.ok(imgEl);
  assert.equal(getImageData(imgEl)?.src, 'blob:photo-no-bg.png');
  assert.equal(getImageData(imgEl)?.originalSrc, 'blob:photo.jpg');
  assert.equal(removedBg.image?.src, 'blob:photo-no-bg.png');

  // Restore original photo
  const restored = transitionState(removedBg, {
    type: 'RESTORE_ORIGINAL_IMAGE',
    id: 'image-1',
  });
  const restoredEl = restored.elements?.find((el) => el.id === 'image-1');
  assert.ok(restoredEl);
  assert.equal(getImageData(restoredEl)?.src, 'blob:photo.jpg');
  assert.equal(restored.image?.src, 'blob:photo.jpg');
});

test('SET_IMAGE_OPACITY updates element opacity and productOptions in sync', () => {
  const base = createInitialState('wrapping');
  const withImg = transitionState(base, {
    type: 'SET_IMAGE',
    value: { src: 'blob:test.jpg', name: 'test.jpg' },
  });

  const next = transitionState(withImg, {
    type: 'SET_IMAGE_OPACITY',
    id: 'image-1',
    opacity: 45,
  });

  assert.equal(next.productOptions.imageOpacity, 45);
  const imgEl = next.elements?.find((el) => el.id === 'image-1');
  assert.equal(getImageData(imgEl!)?.opacity, 45);
});

test('COMMIT_IMAGE_CROP and RESET_IMAGE_CROP update crop state non-destructively', () => {
  const baseState = createInitialState('wrapping');
  const imgEl: CanvasElement = {
    id: 'image-1',
    type: 'image',
    x: 50,
    y: 50,
    width: 200,
    height: 200,
    rotation: 0,
    data: {
      src: 'blob:test.jpg',
      originalSrc: 'blob:test.jpg',
      crop: { scale: 1, offsetX: 0, offsetY: 0 },
    },
  };
  const stateWithImg: DesignState = { ...baseState, elements: [imgEl] };

  // Commit Crop
  const cropped = transitionState(stateWithImg, {
    type: 'COMMIT_IMAGE_CROP',
    id: 'image-1',
    crop: { scale: 1.8, offsetX: 25, offsetY: -15 },
  });
  const croppedData = getImageData(cropped.elements![0]);
  assert.equal(croppedData?.crop?.scale, 1.8);
  assert.equal(croppedData?.crop?.offsetX, 25);
  assert.equal(croppedData?.crop?.offsetY, -15);
  // Outer geometry is strictly preserved
  assert.equal(cropped.elements![0].x, 50);
  assert.equal(cropped.elements![0].width, 200);

  // Reset Crop
  const reset = transitionState(cropped, {
    type: 'RESET_IMAGE_CROP',
    id: 'image-1',
  });
  const resetData = getImageData(reset.elements![0]);
  assert.equal(resetData?.crop?.scale, 1);
  assert.equal(resetData?.crop?.offsetX, 0);
  assert.equal(resetData?.crop?.offsetY, 0);
});

test('SET_IMAGE_MASK applies mask and preserves mask through REPLACE_IMAGE_ASSET', () => {
  const baseState = createInitialState('wrapping');
  const imgEl: CanvasElement = {
    id: 'image-1',
    type: 'image',
    x: 40,
    y: 40,
    width: 150,
    height: 150,
    rotation: 0,
    data: {
      src: 'blob:photoA.jpg',
      originalSrc: 'blob:photoA.jpg',
      mask: null,
    },
  };
  const stateWithImg: DesignState = { ...baseState, elements: [imgEl] };

  // Set Mask to heart
  const masked = transitionState(stateWithImg, {
    type: 'SET_IMAGE_MASK',
    id: 'image-1',
    mask: 'heart',
  });
  const maskedData = getImageData(masked.elements![0]);
  assert.equal(maskedData?.mask, 'heart');

  // Replace image with photoB
  const replaced = transitionState(masked, {
    type: 'REPLACE_IMAGE_ASSET',
    id: 'image-1',
    asset: {
      src: 'blob:photoB.jpg',
      width: 600,
      height: 600,
    },
  });
  const replacedData = getImageData(replaced.elements![0]);
  // Mask must be preserved through image replace!
  assert.equal(replacedData?.mask, 'heart');
  assert.equal(replacedData?.src, 'blob:photoB.jpg');
  // Crop is reset to sensible cover + center
  assert.equal(replacedData?.crop?.scale, 1);
  assert.equal(replacedData?.crop?.offsetX, 0);
});

function textElementWithContent(text: string): CanvasElement {
  return createTextElement({ id: 'text-1', preset: 'body', text });
}

function stateWithTextElement(): DesignState {
  const state = createInitialState('card');
  const element = textElementWithContent('Nhập nội dung');
  return { ...state, text: 'Nhập nội dung', elements: [element] };
}

function stateWithTwoTextElements(): DesignState {
  const first = createTextElement({ id: 'text-1', preset: 'body', text: 'Một' });
  const second = createTextElement({ id: 'text-2', preset: 'body', text: 'Hai' });
  return { ...createInitialState('card'), text: 'Một', elements: [first, second] };
}
