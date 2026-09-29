import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  NOTEBOOK_COVER_DEFINITION,
  createInitialState,
  getPreflight,
  isElementInNotebookBindingZone,
  type CanvasElement,
  type DesignState,
} from '../lib/product-state.ts';

const globalsCss = readFileSync(
  resolve(process.cwd(), 'src/app/globals.css'),
  'utf8'
);
const productSetupSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/product-setup.tsx'),
  'utf8'
);
const bottomNavSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/bottom-navigation.tsx'),
  'utf8'
);
const customizerShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx'),
  'utf8'
);
const designCanvasSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/design-canvas.tsx'),
  'utf8'
);
const editorPreviewSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/editor-preview-mode.tsx'),
  'utf8'
);

const makeTextElement = (overrides: Partial<CanvasElement> = {}): CanvasElement => ({
  id: 'text-1',
  type: 'text',
  x: 20,
  y: 20,
  width: 30,
  height: 10,
  rotation: 0,
  data: {
    text: 'Sổ tay của tôi',
    color: '#111827',
    fontFamily: 'Be Vietnam Pro',
    fontSize: 16,
    fontWeight: 'medium',
    fontStyle: 'normal',
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  ...overrides,
});

test('1. Direct entry from product setup with zero unnecessary dialogs', () => {
  assert.match(
    productSetupSource,
    /const hasMultipleVariants = product\.variants\.length > 1;/,
    'ProductSetup hides variant selector when only one variant exists'
  );
  assert.match(
    productSetupSource,
    /if \(productId === 'wrapping'\) \{\s*setShowModePicker\(true\);\s*return;\s*\}\s*if \(productId === 'sticker' && variantId === 'fixed-shape'\) \{\s*setShowStickerShapePicker\(true\);\s*return;\s*\}\s*onStartBlank\(\);/,
    'ProductSetup must direct notebook immediately to onStartBlank without opening shape or wrapping dialogs'
  );
});

test('2. Fixed A5 portrait geometry (148 / 210)', () => {
  assert.equal(NOTEBOOK_COVER_DEFINITION.widthMm, 148);
  assert.equal(NOTEBOOK_COVER_DEFINITION.heightMm, 210);
  assert.equal(NOTEBOOK_COVER_DEFINITION.aspectRatio, 148 / 210);

  assert.match(
    designCanvasSource,
    /productId === 'notebook'\s*\?\s*\{\s*aspectRatio:\s*NOTEBOOK_COVER_DEFINITION\.aspectRatio,\s*\}/,
    'DesignCanvas assigns fixed A5 aspect ratio to notebook canvas styles'
  );

  assert.match(
    globalsCss,
    /\.mockup--notebook\s*\{[\s\S]*?aspect-ratio:\s*148\s*\/\s*210;/,
    'globals.css must set A5 aspect-ratio for .mockup--notebook'
  );
});

test('3. Single editable surface: front cover (Bìa trước), no surface switcher', () => {
  assert.match(
    customizerShellSource,
    /state\.productId === 'card' && \(\s*<div[^>]*>\s*<CardSurfaceSwitcher/,
    'Card surface switcher must only render for card product in CustomizerShell'
  );
  assert.doesNotMatch(
    bottomNavSource,
    /CardSurfaceSwitcher/,
    'BottomNavigation must not mount surface switcher'
  );
  assert.match(
    customizerShellSource,
    /case 'background-color':\s*setColorPickerTarget\(\{\s*kind:\s*'surface',\s*surfaceId:\s*'front',\s*property:\s*'background'\s*\}\);/,
    'CustomizerShell pins surfaceId to front cover for background color edits'
  );
});

test('4. Non-printable binding guide at left 12% (Vùng gần gáy)', () => {
  assert.equal(NOTEBOOK_COVER_DEFINITION.bindingMarginPct, 12);
  assert.equal(NOTEBOOK_COVER_DEFINITION.bindingMarginMm, 18);

  assert.match(
    designCanvasSource,
    /productId === 'notebook' && !isMockup && \([\s\S]*?data-ui-guide="notebook-binding"[\s\S]*?left-\[12%\][\s\S]*?Vùng gần gáy/,
    'DesignCanvas must render non-printable notebook-binding guide at left 12% with Vùng gần gáy label'
  );
});

test('5. Full-cover photos/backgrounds can extend edge to edge', () => {
  assert.match(
    designCanvasSource,
    /const backgroundCss =\s*isFixedShapeSticker[\s\S]*?: backgroundColor;/,
    'DesignCanvas applies backgroundCss across full canvas surface'
  );

  assert.match(
    designCanvasSource,
    /const styles:\s*React\.CSSProperties[\s\S]*?background:\s*backgroundCss,/,
    'Canvas root styles object binds background to backgroundCss'
  );
  assert.match(
    designCanvasSource,
    /<div[\s\S]*?id=\{isMockup \? 'mockup-canvas' : 'design-canvas'\}[\s\S]*?style=\{styles\}/,
    'Canvas root attaches calculated styles'
  );

  assert.match(
    designCanvasSource,
    /<img\s+src=\{image\.src\}[\s\S]*?className="design-image w-full h-full object-cover pointer-events-none select-none origin-center will-change-transform"/,
    'Image rendering uses full object-cover presentation allowing full-cover photos'
  );
});

test('6. Background color can be customized via standard Color system', () => {
  assert.match(
    bottomNavSource,
    /\{productId === 'notebook' && !selectedId && \(\s*<button[\s\S]*?onClick=\{\(\) => onAction\('background-color'\)\}[\s\S]*?<span className="text-\[11px\] font-medium mt-0\.5">Màu nền<\/span>/,
    'BottomNavigation renders Màu nền action targeting standard color action for notebook when unselected'
  );
  assert.match(
    customizerShellSource,
    /case 'background-color':\s*setColorPickerTarget\(\{\s*kind:\s*'surface',\s*surfaceId:\s*'front',\s*property:\s*'background'\s*\}\);\s*startTransaction\('change-color',\s*'Đổi màu',\s*\[\]\);\s*setActiveSheet\('color'\);/,
    'CustomizerShell routes background-color to standard color sheet targeting front surface'
  );
});

test('7. Preflight warns when cover is completely empty', () => {
  const emptyState: DesignState = {
    ...createInitialState('notebook'),
    elements: [],
    backgroundColor: '#ffffff',
  };

  const preflight = getPreflight(emptyState);
  const emptyCheck = preflight.checks.find((check) => check.id === 'notebook-content');

  assert.ok(emptyCheck, 'Must emit notebook-content warning for empty notebook');
  assert.equal(emptyCheck.level, 'warning');
  assert.equal(emptyCheck.type, 'warning');
  assert.equal(emptyCheck.label, 'Bìa vở chưa có nội dung');
  assert.equal(emptyCheck.description, 'Thêm hình ảnh, chữ hoặc sticker để bìa sổ sinh động hơn.');
});

test('8. Preflight warns when text is placed inside the left 12% binding caution zone', () => {
  assert.equal(isElementInNotebookBindingZone({ x: 0 }), true);
  assert.equal(isElementInNotebookBindingZone({ x: 11.9 }), true);
  assert.equal(isElementInNotebookBindingZone({ x: 12 }), false);
  assert.equal(isElementInNotebookBindingZone({ x: 15 }), false);

  const bindingState: DesignState = {
    ...createInitialState('notebook'),
    elements: [makeTextElement({ x: 6 })],
    backgroundColor: '#ffffff',
  };

  const preflight = getPreflight(bindingState);
  const bindingCheck = preflight.checks.find((check) => check.id === 'notebook-binding-zone');

  assert.ok(bindingCheck, 'Must emit notebook-binding-zone warning');
  assert.equal(bindingCheck.level, 'warning');
  assert.equal(bindingCheck.type, 'warning');
  assert.equal(bindingCheck.label, 'Văn bản nằm gần mép gáy sổ');
});

test('9. Solid background color alone is considered valid and clears empty warning', () => {
  const customBgState: DesignState = {
    ...createInitialState('notebook'),
    elements: [],
    backgroundColor: '#F7EBC5',
  };

  const preflight = getPreflight(customBgState);
  const emptyCheck = preflight.checks.find((check) => check.id === 'notebook-content');

  assert.equal(emptyCheck, undefined, 'Solid background color alone must clear empty warning');
  assert.equal(
    preflight.checks.some((check) => check.id === 'notebook-content'),
    false
  );
});

test('10. Mockup preview correctly maps current design elements onto notebook cover', () => {
  assert.match(
    editorPreviewSource,
    /<DesignCanvas\s+productId=\{state\.productId\}\s+text=\{state\.text\}\s+color=\{state\.color\}\s+backgroundColor=\{state\.backgroundColor\}\s+image=\{state\.image\}\s+productOptions=\{state\.productOptions\}\s+isMockup=\{true\}\s*\/>/,
    'EditorPreviewMode renders DesignCanvas in mockup mode with current design elements and state'
  );

  assert.match(
    designCanvasSource,
    /isMockup \? `mockup mockup--\$\{productId\}` : `design-canvas design-canvas--\$\{productId\}`/,
    'DesignCanvas applies mockup--notebook when isMockup is true'
  );

  assert.match(
    globalsCss,
    /\.mockup--notebook\s*\{[\s\S]*?border-radius:\s*2px\s*10px\s*10px\s*2px;[\s\S]*?box-shadow:\s*-10px 0 0 #332E29,\s*-14px 0 0 #1A1715,\s*0 20px 36px rgba\(0,0,0,0\.28\)/,
    'Mockup preview has realistic notebook binding shadow and 2px 10px 10px 2px radius'
  );
});
