import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createInitialState,
  createTextElement,
  transitionState,
  getPreflight,
  type CanvasElement,
  type DesignState,
} from '../lib/product-state.ts';
import { replaceImageInState } from '../lib/image-replacement.ts';
import { RenderElementView } from '../components/customizer/document-render-surface.ts';
import { renderDocument } from '../lib/services/document-renderer.ts';

function makeCardDocument(): DesignState {
  const base = createInitialState('card');
  const textEl = createTextElement({
    id: 'name',
    preset: 'heading',
    text: 'Nhập tên',
    surface: 'front',
  });
  return {
    ...base,
    elements: [textEl],
  };
}

test('SET_PLACEHOLDER_CONFIG: enforces staff mutation mode restriction', () => {
  const doc = makeCardDocument();

  // Guest / Customer / Preview / Review cannot set placeholder config
  const guestAttempt = transitionState(
    doc,
    { type: 'SET_PLACEHOLDER_CONFIG', id: 'name', placeholderType: 'text', placeholderHint: 'Nhập tên' },
    'guest'
  );
  assert.equal(guestAttempt.elements![0].data?.placeholderType, undefined);

  const customerAttempt = transitionState(
    doc,
    { type: 'SET_PLACEHOLDER_CONFIG', id: 'name', placeholderType: 'text', placeholderHint: 'Nhập tên' },
    'customer'
  );
  assert.equal(customerAttempt.elements![0].data?.placeholderType, undefined);

  const previewAttempt = transitionState(
    doc,
    { type: 'SET_PLACEHOLDER_CONFIG', id: 'name', placeholderType: 'text', placeholderHint: 'Nhập tên' },
    'template-preview'
  );
  assert.equal(previewAttempt.elements![0].data?.placeholderType, undefined);

  // Staff-edit and Template-author succeed
  const staffSuccess = transitionState(
    doc,
    { type: 'SET_PLACEHOLDER_CONFIG', id: 'name', placeholderType: 'text', placeholderHint: 'Nhập tên của bạn' },
    'staff-edit'
  );
  assert.equal(staffSuccess.elements![0].data?.placeholder, true);
  assert.equal(staffSuccess.elements![0].data?.placeholderType, 'text');
  assert.equal(staffSuccess.elements![0].data?.placeholderHint, 'Nhập tên của bạn');

  const authorSuccess = transitionState(
    doc,
    { type: 'SET_PLACEHOLDER_CONFIG', id: 'name', placeholderType: 'text', placeholderHint: 'Nhập tên' },
    'template-author'
  );
  assert.equal(authorSuccess.elements![0].data?.placeholder, true);
  assert.equal(authorSuccess.elements![0].data?.placeholderType, 'text');
  assert.equal(authorSuccess.elements![0].data?.placeholderHint, 'Nhập tên');
});

test('SET_PLACEHOLDER_CONFIG: validates element type compatibility', () => {
  const doc: DesignState = {
    ...createInitialState('card'),
    elements: [
      {
        id: 'img-1',
        type: 'image',
        x: 50,
        y: 50,
        width: 60,
        height: 60,
        rotation: 0,
        data: { src: '', placeholder: true },
      },
      {
        id: 'txt-1',
        type: 'text',
        x: 50,
        y: 80,
        width: 70,
        height: 15,
        rotation: 0,
        data: { text: 'Title', placeholder: false },
      },
    ],
  };

  // Incompatible: setting text placeholder on image element
  const incompatibleImage = transitionState(
    doc,
    { type: 'SET_PLACEHOLDER_CONFIG', id: 'img-1', placeholderType: 'text', placeholderHint: 'Nhập text' },
    'template-author'
  );
  assert.notEqual(incompatibleImage.elements![0].data?.placeholderType, 'text');

  // Incompatible: setting image placeholder on text element
  const incompatibleText = transitionState(
    doc,
    { type: 'SET_PLACEHOLDER_CONFIG', id: 'txt-1', placeholderType: 'image', placeholderHint: 'Chọn ảnh' },
    'template-author'
  );
  assert.notEqual(incompatibleText.elements![1].data?.placeholderType, 'image');

  // Compatible: setting image placeholder on image element
  const compatibleImage = transitionState(
    doc,
    { type: 'SET_PLACEHOLDER_CONFIG', id: 'img-1', placeholderType: 'image', placeholderHint: 'Ảnh chính' },
    'template-author'
  );
  assert.equal(compatibleImage.elements![0].data?.placeholderType, 'image');
  assert.equal(compatibleImage.elements![0].data?.placeholderHint, 'Ảnh chính');
  assert.equal(compatibleImage.elements![0].data?.placeholder, true);

  // Clearing placeholder with 'none'
  const cleared = transitionState(
    compatibleImage,
    { type: 'SET_PLACEHOLDER_CONFIG', id: 'img-1', placeholderType: 'none' },
    'template-author'
  );
  assert.equal(cleared.elements![0].data?.placeholder, false);
  assert.equal(cleared.elements![0].data?.placeholderType, 'none');
  assert.equal(cleared.elements![0].data?.placeholderHint, undefined);
});

test('COMMIT_TEXT_EDIT: clears guidance, type, and unresolved state on customer edit', () => {
  const doc = makeCardDocument();
  Object.assign(doc.elements![0].data!, {
    placeholder: true,
    placeholderType: 'text',
    placeholderHint: 'Nhập tên',
  });

  const changed = transitionState(doc, { type: 'COMMIT_TEXT_EDIT', id: 'name', text: 'Lan' }, 'guest');
  assert.equal(changed.elements![0].data!.text, 'Lan');
  assert.equal(changed.elements![0].data!.placeholder, false);
  assert.ok(!changed.elements![0].data!.placeholderType || changed.elements![0].data!.placeholderType === 'none');
  assert.equal(changed.elements![0].data!.placeholderHint, undefined);
});

test('replaceImageInState: preserves exact frame geometry, mask, opacity and clears placeholder metadata', () => {
  const base = createInitialState('card');
  const imageFrame: CanvasElement = {
    id: 'empty-frame',
    type: 'image',
    x: 45,
    y: 35,
    width: 140,
    height: 90,
    rotation: 12,
    zIndex: 4,
    data: {
      src: '',
      mask: 'arch',
      opacity: 85,
      placeholder: true,
      placeholderType: 'image',
      placeholderHint: 'Tải ảnh đại diện',
    },
  };
  const docWithFrame = { ...base, elements: [imageFrame] };

  const replaced = replaceImageInState(docWithFrame, 'empty-frame', {
    id: 'asset-pic',
    src: 'https://cdn.example.com/family.jpg',
    name: 'family.jpg',
    width: 1600,
    height: 900,
  });

  const el = replaced.elements?.find((e) => e.id === 'empty-frame')!;
  assert.ok(el);
  // Preserved frame geometry
  assert.equal(el.x, 45);
  assert.equal(el.y, 35);
  assert.equal(el.width, 140);
  assert.equal(el.height, 90);
  assert.equal(el.rotation, 12);
  assert.equal(el.zIndex, 4);
  assert.equal(el.data?.mask, 'arch');
  assert.equal(el.data?.opacity, 85);

  // Cleared placeholder state
  assert.equal(el.data?.src, 'https://cdn.example.com/family.jpg');
  assert.equal(el.data?.placeholder, false);
  assert.equal(el.data?.placeholderType, 'none');
  assert.equal(el.data?.placeholderHint, undefined);
  assert.ok(el.data?.crop, 'Crop calculated');

  // Failed replace (non-existent target) does not change state
  const failed = replaceImageInState(docWithFrame, 'non-existent', {
    src: 'https://cdn.example.com/test.jpg',
  });
  const untouched = failed.elements?.find((e) => e.id === 'empty-frame')!;
  assert.equal(untouched.data?.placeholder, true);
  assert.equal(untouched.data?.placeholderType, 'image');
});

test('getPreflight: reports non-blocking warning for unresolved placeholders and skips empty frame quality checks', () => {
  const doc: DesignState = {
    ...createInitialState('card'),
    elements: [
      {
        id: 'unresolved-text',
        type: 'text',
        x: 20,
        y: 20,
        width: 60,
        height: 15,
        rotation: 0,
        data: { text: 'Mẫu tên', placeholder: true, placeholderType: 'text', placeholderHint: 'Nhập tên' },
      },
      {
        id: 'unresolved-image',
        type: 'image',
        x: 20,
        y: 45,
        width: 40,
        height: 40,
        rotation: 0,
        data: { src: '', placeholder: true, placeholderType: 'image', placeholderHint: 'Khung ảnh' },
      },
      {
        id: 'decorative-fallback',
        type: 'image',
        x: 20,
        y: 70,
        width: 20,
        height: 20,
        rotation: 0,
        data: {
          src: 'https://example.com/fallback.png',
          placeholder: false,
          placeholderType: 'image',
          sourceWidth: 1000,
          sourceHeight: 1000,
        },
      },
    ],
  };

  const preflight = getPreflight(doc);
  assert.equal(preflight.hasErrors, false, 'Unresolved placeholders must NOT block as errors');
  assert.equal(preflight.hasWarnings, true);

  const textWarning = preflight.checks.find((c) => c.id === 'placeholder-unresolved-text');
  assert.ok(textWarning);
  assert.equal(textWarning.level, 'warning');
  assert.equal(textWarning.canContinue, true);

  const imageWarning = preflight.checks.find((c) => c.id === 'placeholder-unresolved-image');
  assert.ok(imageWarning);
  assert.equal(imageWarning.level, 'warning');
  assert.equal(imageWarning.canContinue, true);

  // Decorative fallback with placeholder === false does NOT emit a placeholder warning
  const fallbackWarning = preflight.checks.find((c) => c.id === 'placeholder-decorative-fallback');
  assert.equal(fallbackWarning, undefined);

  // Empty placeholder image frame does not emit a bogus image quality warning
  const qualityWarningForEmpty = preflight.checks.find((c) => c.id === 'image-quality-unresolved-image');
  assert.equal(qualityWarningForEmpty, undefined);
});

test('getPreflight: sample image placeholders with low-res src do NOT emit image quality warnings or errors', () => {
  const doc: DesignState = {
    ...createInitialState('card'),
    elements: [
      {
        id: 'sample-guide-image',
        type: 'image',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
        rotation: 0,
        data: {
          src: 'https://example.com/sample-low-res-guide.png',
          placeholder: true,
          placeholderType: 'image',
          placeholderHint: 'Ảnh mẫu chân dung',
          sourceWidth: 50,
          sourceHeight: 50,
        },
      },
    ],
  };

  const preflight = getPreflight(doc);
  assert.equal(preflight.hasErrors, false, 'Sample image placeholder must not cause preflight errors');
  assert.equal(preflight.hasWarnings, true, 'Sample image placeholder must emit non-blocking warning');

  // Must emit non-blocking placeholder warning
  const placeholderWarning = preflight.checks.find((c) => c.id === 'placeholder-sample-guide-image');
  assert.ok(placeholderWarning, 'Should find placeholder warning');
  assert.equal(placeholderWarning.level, 'warning');
  assert.equal(placeholderWarning.canContinue, true);

  // Must NOT emit image quality warning or error
  const qualityCheck = preflight.checks.find((c) => c.id === 'image-quality-sample-guide-image');
  assert.equal(qualityCheck, undefined, 'Image quality checks must be skipped for sample placeholders');
});

test('RenderElementView: omits elements with placeholder === true and renders committed/decorative elements', () => {
  const unresolvedTextDoc: DesignState = {
    ...createInitialState('card'),
    elements: [
      {
        id: 'txt-1',
        type: 'text',
        x: 50,
        y: 50,
        width: 60,
        height: 20,
        rotation: 0,
        data: { text: 'Nhập tên', placeholder: true, placeholderType: 'text', placeholderHint: 'Tên bạn' },
      },
    ],
  };

  // 1. Unresolved text placeholder returns null
  const unresolvedTextNode = RenderElementView({
    element: unresolvedTextDoc.elements![0],
    design: unresolvedTextDoc,
  });
  assert.equal(unresolvedTextNode, null, 'Unresolved text placeholder must return null');

  // 2. Unresolved image placeholder frame returns null
  const unresolvedImageDoc: DesignState = {
    ...createInitialState('card'),
    elements: [
      {
        id: 'img-1',
        type: 'image',
        x: 50,
        y: 50,
        width: 60,
        height: 60,
        rotation: 0,
        data: { src: '', placeholder: true, placeholderType: 'image' },
      },
    ],
  };
  const unresolvedImageNode = RenderElementView({
    element: unresolvedImageDoc.elements![0],
    design: unresolvedImageDoc,
  });
  assert.equal(unresolvedImageNode, null, 'Unresolved empty image frame must return null');

  // 3. Committed text element (placeholder: false) renders normally
  const committedDoc = transitionState(
    unresolvedTextDoc,
    { type: 'COMMIT_TEXT_EDIT', id: 'txt-1', text: 'Quỳnh Trang' },
    'guest'
  );
  const committedTextNode = RenderElementView({
    element: committedDoc.elements![0],
    design: committedDoc,
  });
  assert.ok(committedTextNode, 'Committed text element must return a rendered React element');

  // 4. Decorative fallback image (placeholder: false with valid src) renders normally
  const fallbackImageDoc: DesignState = {
    ...createInitialState('card'),
    elements: [
      {
        id: 'fallback-img',
        type: 'image',
        x: 50,
        y: 50,
        width: 60,
        height: 60,
        rotation: 0,
        data: { src: 'https://example.com/border.png', placeholder: false, placeholderType: 'image' },
      },
    ],
  };
  const fallbackImageNode = RenderElementView({
    element: fallbackImageDoc.elements![0],
    design: fallbackImageDoc,
  });
  assert.ok(fallbackImageNode, 'Decorative fallback with placeholder === false must render');
});

test('Preview components source contracts: omit elements with placeholder === true', () => {
  const previewFiles = [
    'src/components/customizer/preview/card-preview.tsx',
    'src/components/customizer/preview/wrapping-preview.tsx',
    'src/components/customizer/preview/sticker-preview.tsx',
    'src/components/customizer/preview/notebook-preview.tsx',
  ];

  for (const relativePath of previewFiles) {
    const fullPath = resolve(process.cwd(), relativePath);
    const content = readFileSync(fullPath, 'utf8');
    assert.match(
      content,
      /placeholder/,
      `${relativePath} must check placeholder flag`
    );
    assert.match(
      content,
      /return null|return \{\}/,
      `${relativePath} must omit unresolved placeholder elements`
    );
  }
});

test('renderDocument: pixel/hash smoke test proves guidance text is omitted from actual physical PNG', async () => {
  // 1. Blank card with no elements
  const blankCard: DesignState = {
    ...createInitialState('card'),
    variantId: 'horizontal',
    color: '#B86C84',
    backgroundColor: '#FFFDF8',
    elements: [],
  };

  // 2. Card with unresolved placeholder text
  const cardWithPlaceholderGuidance: DesignState = {
    ...createInitialState('card'),
    variantId: 'horizontal',
    color: '#B86C84',
    backgroundColor: '#FFFDF8',
    elements: [
      {
        id: 'txt-name',
        type: 'text',
        x: 50,
        y: 50,
        width: 60,
        height: 20,
        rotation: 0,
        surface: 'front',
        data: {
          text: 'Nhập tên của bạn vào đây',
          placeholder: true,
          placeholderType: 'text',
          placeholderHint: 'Nhập tên',
          color: '#B86C84',
          fontSize: 24,
          fontFamily: 'Be Vietnam Pro',
        },
      },
    ],
  };

  // 3. Card with committed text
  const cardWithRealText = transitionState(
    cardWithPlaceholderGuidance,
    { type: 'COMMIT_TEXT_EDIT', id: 'txt-name', text: 'Quỳnh Trang' },
    'guest'
  );

  const [blankResult, placeholderResult, realTextResult] = await Promise.all([
    renderDocument(blankCard),
    renderDocument(cardWithPlaceholderGuidance),
    renderDocument(cardWithRealText),
  ]);

  // Unresolved placeholder is omitted from output: rendered PNG SHA-256 is IDENTICAL to the blank card!
  assert.equal(
    placeholderResult.sha256,
    blankResult.sha256,
    'Unresolved placeholder guidance text must NEVER be drawn onto the rendered PNG pixels'
  );

  // Committed real text draws visible pixels: SHA-256 must differ from the blank card
  assert.notEqual(
    realTextResult.sha256,
    blankResult.sha256,
    'Committed text must be drawn onto the rendered PNG pixels'
  );
});
