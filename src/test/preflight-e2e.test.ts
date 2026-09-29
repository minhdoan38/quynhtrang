import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createInitialState,
  getPreflight,
  transitionState,
  type CanvasElement,
  type CardSurface,
  type DesignState,
  type PreflightCheck,
} from '../lib/product-state.ts';

const shellSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx'),
  'utf8',
);
const previewSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/editor-preview-mode.tsx'),
  'utf8',
);
const preflightSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/editor-preflight-mode.tsx'),
  'utf8',
);
const previewShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/preview/preview-shell.tsx'),
  'utf8',
);
const checkoutSource = readFileSync(
  resolve(process.cwd(), 'src/app/checkout/page.tsx'),
  'utf8',
);

function textElement(
  id: string,
  overrides: Partial<CanvasElement> = {},
): CanvasElement {
  return {
    id,
    type: 'text',
    x: 30,
    y: 30,
    width: 30,
    height: 12,
    rotation: 0,
    surface: 'front',
    ...overrides,
  };
}

function runDirectFix(
  state: DesignState,
  check: PreflightCheck,
): {
  overlayMode: 'preflight' | null;
  activeCardSurface: CardSurface;
  selectedElementId: string | null;
  selectedTarget: CanvasElement['type'] | null;
  selectedTextId: string | null;
  showSafeAreaGuide: boolean;
} {
  let overlayMode: 'preflight' | null = 'preflight';
  let activeCardSurface: CardSurface = 'front';
  let selectedElementId: string | null = null;
  let selectedTarget: CanvasElement['type'] | null = null;
  let selectedTextId: string | null = null;
  let showSafeAreaGuide = false;

  overlayMode = null;
  if (state.productId === 'card' && check.surfaceId) {
    activeCardSurface = check.surfaceId as CardSurface;
  }
  if (check.elementId) {
    const target = (state.elements ?? []).find((element) => element.id === check.elementId);
    if (target) {
      selectedElementId = target.id;
      selectedTarget = target.type;
      if (target.type === 'text') selectedTextId = target.id;
    }
  }
  if (check.category === 'safe-area') showSafeAreaGuide = true;

  return {
    overlayMode,
    activeCardSurface,
    selectedElementId,
    selectedTarget,
    selectedTextId,
    showSafeAreaGuide,
  };
}

test('1. Xong enters Preflight from Editor and Preview', () => {
  assert.match(shellSource, /case 'finish':\s*setOverlayMode\('preflight'\);/);
  assert.match(previewSource, /onDoneToPreflight=\{onDoneToPreflight\}/);
  assert.match(previewShellSource, /onClick=\{onDoneToPreflight\}[\s\S]*?>\s*Xong\s*<\/button>/);
});
test('2. Preflight communicates pass, warning, and blocking readiness', () => {
  assert.match(preflightSource, /title: 'Thiết kế đã sẵn sàng'/);
  assert.match(preflightSource, /title: 'Có một vài chỗ cần kiểm tra'/);
  assert.match(preflightSource, /title: 'Cần sửa trước khi tiếp tục'/);
  assert.match(preflightSource, /const hasErrors = preflight\.level === 'error' \|\| preflight\.hasErrors/);
  assert.match(preflightSource, /const hasWarnings = !hasErrors/);

  const pass = getPreflight(createInitialState('wrapping'));
  const warning = getPreflight({
    ...createInitialState('wrapping'),
    elements: [textElement('near-edge', { x: 2 })],
  });
  const blocking = getPreflight({
    ...createInitialState('wrapping'),
    elements: [textElement('outside', { x: -5 })],
  });
  assert.equal(pass.level, 'pass');
  assert.equal(warning.level, 'warning');
  assert.equal(blocking.level, 'error');
});

test('3. Product-specific checks stay scoped to matching products', () => {
  const notebook = getPreflight({
    ...createInitialState('notebook'),
    elements: [textElement('notebook-text', { x: 40 })],
  });
  assert.equal(notebook.checks.some((check) => check.id.includes('fold')), false);
  assert.equal(notebook.checks.some((check) => check.id.includes('sticker-contour')), false);

  const wrapping = getPreflight({
    ...createInitialState('wrapping'),
    elements: [textElement('wrapping-text', { x: 40 })],
  });
  assert.equal(wrapping.checks.some((check) => check.id.includes('fold')), false);
  assert.equal(wrapping.checks.some((check) => check.id.includes('sticker-contour')), false);
  const card = getPreflight({
    ...createInitialState('card'),
    productOptions: { ...createInitialState('card').productOptions, orientation: 'horizontal' },
    elements: [textElement('card-fold', { x: 49, width: 10, surface: 'inside' })],
  });
  const foldCheck = card.checks.find((check) => check.id === 'safe-area-card-fold');
  assert.ok(foldCheck);
  assert.equal(foldCheck.surfaceId, 'inside');
  assert.equal(foldCheck.label, 'Quá gần nếp gấp');
});

test('4. Customer-facing Vietnamese readiness and fix copy is present', () => {
  for (const phrase of [
    'Thiết kế đã sẵn sàng',
    'Có một vài chỗ cần kiểm tra',
    'Cần sửa trước khi tiếp tục',
    'Sửa',
    'Tiếp tục đặt in',
  ]) {
    assert.match(preflightSource, new RegExp(phrase));
  }
});

test('5. Sửa invokes direct fix callback with exact issue check', () => {
  const check: PreflightCheck = {
    id: 'safe-area-text',
    level: 'warning',
    category: 'safe-area',
    label: 'Hơi sát mép',
    elementId: 'text-1',
  };
  let received: PreflightCheck | undefined;
  const onFix = (issue: PreflightCheck) => {
    received = issue;
  };
  onFix(check);
  assert.equal(received, check);
  assert.match(preflightSource, /onFix\(check\)/);
});

test('6. Direct fix returns exact card surface, element, and safe-area guide target', () => {
  const state: DesignState = {
    ...createInitialState('card'),
    elements: [textElement('inside-text', { surface: 'inside', x: 49, width: 10 })],
  };
  const check = getPreflight(state).checks.find((entry) => entry.elementId === 'inside-text');
  assert.ok(check);
  const result = runDirectFix(state, check);
  assert.equal(result.overlayMode, null);
  assert.equal(result.activeCardSurface, 'inside');
  assert.equal(result.selectedElementId, 'inside-text');
  assert.equal(result.selectedTarget, 'text');
  assert.equal(result.selectedTextId, 'inside-text');
  assert.equal(result.showSafeAreaGuide, true);
});

test('7. Moving issue element away from edge resolves issue', () => {
  let state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [textElement('moving-text', { x: 2 })],
  };
  assert.equal(getPreflight(state).checks.some((check) => check.id === 'safe-area-moving-text'), true);
  state = transitionState(state, {
    type: 'MOVE_ELEMENT',
    id: 'moving-text',
    x: 30,
    y: 30,
  });
  assert.equal(getPreflight(state).checks.some((check) => check.id === 'safe-area-moving-text'), false);
});

test('8. Re-running Preflight reflects resolved status', () => {
  const initial: DesignState = {
    ...createInitialState('wrapping'),
    elements: [textElement('rerun-text', { x: 2 })],
  };
  const resolved = transitionState(initial, {
    type: 'MOVE_ELEMENT',
    id: 'rerun-text',
    x: 30,
    y: 30,
  });
  assert.equal(getPreflight(initial).level, 'warning');
  assert.equal(getPreflight(resolved).level, 'pass');
  assert.equal(getPreflight(resolved).checks.some((check) => check.id === 'safe-area-rerun-text'), false);
});

test('9. Warnings allow continuation while blocking errors disable continuation', () => {
  assert.match(preflightSource, /disabled=\{hasErrors\}/);
  const warning = getPreflight({
    ...createInitialState('wrapping'),
    elements: [textElement('warning-text', { x: 2 })],
  });
  const error = getPreflight({
    ...createInitialState('wrapping'),
    elements: [textElement('error-text', { x: -5 })],
  });
  assert.equal(warning.hasErrors, false);
  assert.equal(error.hasErrors, true);
});

test('10. Continuing from Preflight navigates to Checkout', () => {
  assert.match(shellSource, /onContinueToCheckout=\{\(\) => \{\s*router\.push\('\/checkout'\);/);
  assert.match(preflightSource, /onClick=\{onContinueToCheckout\}/);
  assert.match(preflightSource, /<span>Tiếp tục đặt in<\/span>/);
  assert.match(checkoutSource, /export default function CheckoutPage/);
});
