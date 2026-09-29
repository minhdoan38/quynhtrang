import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  getPreflight,
  type CanvasElement,
  type DesignState,
  type PreflightCheck,
  type PreflightResult,
  type StickerOptions,
} from '../lib/product-state.ts';

test('getPreflight tallies passCount, warningCount, errorCount, hasErrors, and hasWarnings correctly', () => {
  const defaultWrapping = createInitialState('wrapping');
  const cleanResult: PreflightResult = getPreflight(defaultWrapping);

  assert.equal(typeof cleanResult.passCount, 'number');
  assert.equal(typeof cleanResult.warningCount, 'number');
  assert.equal(typeof cleanResult.errorCount, 'number');
  assert.equal(cleanResult.errorCount, 0);
  assert.equal(cleanResult.hasErrors, false);
  assert.equal(cleanResult.passCount, cleanResult.checks.filter((c) => c.level === 'pass').length);
  assert.equal(cleanResult.warningCount, cleanResult.checks.filter((c) => c.level === 'warning').length);
  assert.equal(cleanResult.hasWarnings, cleanResult.warningCount > 0);
  assert.equal(cleanResult.level, cleanResult.hasWarnings ? 'warning' : 'pass');

  const warningState: DesignState = {
    ...createInitialState('wrapping'),
    elements: [
      {
        id: 'txt-near-edge',
        type: 'text',
        x: 2,
        y: 20,
        width: 30,
        height: 10,
        rotation: 0,
        surface: 'front',
      },
    ],
  };
  const warningResult = getPreflight(warningState);
  assert.equal(warningResult.hasErrors, false);
  assert.equal(warningResult.hasWarnings, true);
  assert.ok(warningResult.warningCount >= 1);
  assert.equal(warningResult.level, 'warning');

  const errorState: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    elements: [],
    productOptions: {
      shape: 'circle',
      borderWidth: 2,
      hasWhiteBorder: true,
    } as StickerOptions,
  };
  const errorResult = getPreflight(errorState);
  assert.equal(errorResult.hasErrors, true);
  assert.ok(errorResult.errorCount >= 1);
  assert.equal(errorResult.level, 'error');
});

test('assigns expected preflight categories across product rules', () => {
  const stickerState: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'die-cut',
    elements: [
      {
        id: 'shape-a',
        type: 'shape',
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        rotation: 0,
      },
      {
        id: 'shape-b',
        type: 'shape',
        x: 120,
        y: 0,
        width: 20,
        height: 20,
        rotation: 0,
      },
    ],
    productOptions: {
      cutLineMode: 'die-cut',
      borderWidth: 2,
      hasWhiteBorder: true,
    } as StickerOptions,
  };
  const stickerResult = getPreflight(stickerState);
  const contourCheck = stickerResult.checks.find((c) => c.id === 'sticker-contour');
  assert.ok(contourCheck);
  assert.equal(contourCheck.category, 'sticker');

  const emptyStickerState: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    elements: [],
  };
  const emptyStickerResult = getPreflight(emptyStickerState);
  const stickerContentCheck = emptyStickerResult.checks.find((c) => c.id === 'sticker-content');
  assert.ok(stickerContentCheck);
  assert.equal(stickerContentCheck.category, 'sticker');

  const emptyNotebookState: DesignState = {
    ...createInitialState('notebook'),
    elements: [],
    backgroundColor: '#ffffff',
  };
  const emptyNotebookResult = getPreflight(emptyNotebookState);
  const notebookContentCheck = emptyNotebookResult.checks.find((c) => c.id === 'notebook-content');
  assert.ok(notebookContentCheck);
  assert.equal(notebookContentCheck.category, 'notebook');

  const notebookBindingState: DesignState = {
    ...createInitialState('notebook'),
    backgroundColor: '#ffffff',
    elements: [
      {
        id: 'txt-binding',
        type: 'text',
        x: 5,
        y: 20,
        width: 20,
        height: 10,
        rotation: 0,
        surface: 'front',
      },
    ],
  };
  const notebookBindingResult = getPreflight(notebookBindingState);
  const notebookBindingCheck = notebookBindingResult.checks.find((c) => c.id === 'notebook-binding-zone');
  assert.ok(notebookBindingCheck);
  assert.equal(notebookBindingCheck.category, 'notebook');

  const safeAreaState: DesignState = {
    ...createInitialState('wrapping'),
    elements: [
      {
        id: 'txt-edge',
        type: 'text',
        x: 2,
        y: 20,
        width: 30,
        height: 10,
        rotation: 0,
        surface: 'front',
      },
    ],
  };
  const safeAreaResult = getPreflight(safeAreaState);
  const safeAreaCheck = safeAreaResult.checks.find((c) => c.id === 'safe-area-txt-edge');
  assert.ok(safeAreaCheck);
  assert.equal(safeAreaCheck.category, 'safe-area');

  const imageQualityElement: CanvasElement = {
    id: 'img-pass',
    type: 'image',
    x: 10,
    y: 10,
    width: 30,
    height: 30,
    rotation: 0,
    surface: 'front',
    data: {
      src: 'blob:test.png',
      sourceWidth: 2400,
      sourceHeight: 2400,
      scale: 1,
    },
  };
  const imageQualityState: DesignState = {
    ...createInitialState('wrapping'),
    elements: [imageQualityElement],
  };
  const imageQualityResult = getPreflight(imageQualityState);
  const imageCheck = imageQualityResult.checks.find((c) => c.id === 'image-quality-img-pass');
  assert.ok(imageCheck);
  assert.equal(imageCheck.category, 'image');
});

test('preserves backward compatibility of checks, labels, IDs, and level', () => {
  const state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [
      {
        id: 'txt-high-risk',
        type: 'text',
        x: -10,
        y: 10,
        width: 20,
        height: 10,
        rotation: 0,
        surface: 'front',
      },
    ],
  };

  const preflight: PreflightResult = getPreflight(state);

  assert.equal(preflight.level, 'error');
  assert.ok(Array.isArray(preflight.checks));

  const targetCheck = preflight.checks.find((c: PreflightCheck) => c.id === 'safe-area-txt-high-risk');
  assert.ok(targetCheck);
  assert.equal(targetCheck.id, 'safe-area-txt-high-risk');
  assert.equal(targetCheck.level, 'error');
  assert.equal(targetCheck.type, 'error');
  assert.equal(targetCheck.elementId, 'txt-high-risk');
  assert.equal(targetCheck.surfaceId, 'front');
  assert.equal(targetCheck.category, 'safe-area');
  assert.ok(typeof targetCheck.label === 'string');
});
