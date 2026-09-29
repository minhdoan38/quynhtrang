import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  getPreflight,
  transitionState,
  type DesignState,
  type CanvasElement,
} from '../lib/product-state.ts';
import { evaluateElementSafety } from '../lib/safe-area.ts';
import { createDesignHistoryManager } from '../lib/use-design-history.ts';
import type { SelectionSnapshot } from '../lib/history.ts';

// 1. Text placed safely inside safe area produces safe report with no warnings.
test('1. Text placed safely inside safe area produces safe report with no warnings', () => {
  const safeText: CanvasElement = {
    id: 'txt-safe',
    type: 'text',
    x: 30,
    y: 30,
    width: 40,
    height: 20,
    rotation: 0,
    surface: 'front',
  };

  const report = evaluateElementSafety({
    element: safeText,
    canvasWidth: 100,
    canvasHeight: 100,
    productId: 'wrapping',
  });

  assert.equal(report.risk, 'safe');
  assert.equal(report.badgeLabel, undefined);

  const state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [safeText],
  };

  const preflight = getPreflight(state);
  const safeAreaChecks = preflight.checks.filter((c) => c.id.startsWith('safe-area-'));
  assert.equal(safeAreaChecks.length, 0);
});

// 2. Moving text near edge produces near-edge report with label "Hơi sát mép".
test('2. Moving text near edge produces near-edge report with label "Hơi sát mép"', () => {
  const nearEdgeText: CanvasElement = {
    id: 'txt-near-edge',
    type: 'text',
    x: 2,
    y: 20,
    width: 30,
    height: 10,
    rotation: 0,
    surface: 'front',
  };

  const report = evaluateElementSafety({
    element: nearEdgeText,
    canvasWidth: 100,
    canvasHeight: 100,
    productId: 'wrapping',
  });

  assert.equal(report.risk, 'near-edge');
  assert.equal(report.badgeLabel, 'Hơi sát mép');
  assert.equal(report.description, 'Chi tiết này hơi sát mép.');

  const state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [nearEdgeText],
  };
  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'safe-area-txt-near-edge');
  assert.ok(check);
  assert.equal(check.level, 'warning');
  assert.equal(check.label, 'Hơi sát mép');
});

// 3. Moving text outward past product boundaries produces high-risk report with label "Một phần chi tiết nằm ngoài mép".
test('3. Moving text outward past product boundaries produces high-risk report with label "Một phần chi tiết nằm ngoài mép"', () => {
  const outsideText: CanvasElement = {
    id: 'txt-outside',
    type: 'text',
    x: -5,
    y: 20,
    width: 30,
    height: 10,
    rotation: 0,
    surface: 'front',
  };

  const report = evaluateElementSafety({
    element: outsideText,
    canvasWidth: 100,
    canvasHeight: 100,
    productId: 'wrapping',
  });

  assert.equal(report.risk, 'high-risk');
  assert.equal(report.badgeLabel, 'Một phần chi tiết nằm ngoài mép');
  assert.equal(report.description, 'Một phần chi tiết này nằm ngoài vùng thành phẩm.');

  const state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [outsideText],
  };
  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'safe-area-txt-outside');
  assert.ok(check);
  assert.equal(check.level, 'error');
  assert.equal(check.label, 'Một phần chi tiết nằm ngoài mép');
});

// 4. Moving text inward resolves the warning automatically to safe.
test('4. Moving text inward resolves the warning automatically to safe', () => {
  let state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [
      {
        id: 'txt-dynamic',
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

  // Initially near edge
  let preflight = getPreflight(state);
  assert.ok(preflight.checks.some((c) => c.id === 'safe-area-txt-dynamic' && c.level === 'warning'));

  // Move element inward via MOVE_ELEMENT
  state = transitionState(state, {
    type: 'MOVE_ELEMENT',
    id: 'txt-dynamic',
    x: 25,
    y: 20,
  });

  // Automatically resolves to safe
  preflight = getPreflight(state);
  assert.equal(
    preflight.checks.filter((c) => c.id === 'safe-area-txt-dynamic').length,
    0
  );

  const movedElement = state.elements?.find((el) => el.id === 'txt-dynamic');
  assert.ok(movedElement);
  const report = evaluateElementSafety({
    element: movedElement,
    canvasWidth: 100,
    canvasHeight: 100,
    productId: 'wrapping',
  });
  assert.equal(report.risk, 'safe');
});

// 5. Full-bleed background colors / images extend past edge without safe area warning.
test('5. Full-bleed background colors / images extend past edge without safe area warning', () => {
  const state: DesignState = {
    ...createInitialState('wrapping'),
    backgroundColor: '#ff0055',
    elements: [
      {
        id: 'bg-shape',
        type: 'shape',
        x: -10,
        y: -10,
        width: 120,
        height: 120,
        rotation: 0,
        surface: 'front',
      },
      {
        id: 'full-bleed-image',
        type: 'image',
        x: -5,
        y: -5,
        width: 110,
        height: 110,
        rotation: 0,
        surface: 'front',
        data: {
          src: 'https://example.com/art.jpg',
          sourceWidth: 2000,
          sourceHeight: 2000,
        },
      },
    ],
  };

  const preflight = getPreflight(state);
  const safeAreaChecks = preflight.checks.filter((c) => c.id.startsWith('safe-area-'));
  assert.equal(safeAreaChecks.length, 0);

  const imgReport = evaluateElementSafety({
    element: state.elements![1],
    canvasWidth: 100,
    canvasHeight: 100,
    productId: 'wrapping',
  });
  assert.equal(imgReport.risk, 'safe');
});

// 6. Card inside fold warning triggers for important content near center fold with label "Quá gần nếp gấp".
test('6. Card inside fold warning triggers for important content near center fold with label "Quá gần nếp gấp"', () => {
  const insideFoldText: CanvasElement = {
    id: 'txt-card-fold',
    type: 'text',
    x: 49,
    y: 30,
    width: 10,
    height: 10,
    rotation: 0,
    surface: 'inside',
  };

  const report = evaluateElementSafety({
    element: insideFoldText,
    canvasWidth: 100,
    canvasHeight: 100,
    productId: 'card',
    surface: 'inside',
    cardOrientation: 'horizontal',
  });

  assert.equal(report.risk, 'near-edge');
  assert.equal(report.regionType, 'card-fold');
  assert.equal(report.badgeLabel, 'Quá gần nếp gấp');
  assert.equal(report.description, 'Chi tiết quan trọng đang nằm quá gần nếp gấp.');

  const state: DesignState = {
    ...createInitialState('card'),
    productOptions: {
      surface: 'inside',
      orientation: 'horizontal',
    },
    elements: [insideFoldText],
  };

  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'safe-area-txt-card-fold');
  assert.ok(check);
  assert.equal(check.level, 'warning');
  assert.equal(check.label, 'Quá gần nếp gấp');
  assert.equal(check.surfaceId, 'inside');
});

// 7. Notebook binding warning triggers for text within left 12% margin with label "Khá gần gáy".
test('7. Notebook binding warning triggers for text within left 12% margin with label "Khá gần gáy"', () => {
  const bindingText: CanvasElement = {
    id: 'txt-notebook-binding',
    type: 'text',
    x: 8,
    y: 30,
    width: 20,
    height: 10,
    rotation: 0,
    surface: 'front',
  };

  const report = evaluateElementSafety({
    element: bindingText,
    canvasWidth: 100,
    canvasHeight: 100,
    productId: 'notebook',
    surface: 'front',
  });

  assert.equal(report.risk, 'near-edge');
  assert.equal(report.regionType, 'notebook-binding');
  assert.equal(report.badgeLabel, 'Khá gần gáy');
  assert.equal(report.description, 'Chi tiết này đang khá gần gáy.');

  const state: DesignState = {
    ...createInitialState('notebook'),
    elements: [bindingText],
  };

  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'safe-area-txt-notebook-binding');
  assert.ok(check);
  assert.equal(check.level, 'warning');
  assert.equal(check.label, 'Khá gần gáy');
  assert.equal(check.surfaceId, 'front');
});

// 8. Sticker shape safe inset triggers for content near edge.
test('8. Sticker shape safe inset triggers for content near edge', () => {
  const stickerEdgeText: CanvasElement = {
    id: 'txt-sticker-edge',
    type: 'text',
    x: 2,
    y: 20,
    width: 30,
    height: 10,
    rotation: 0,
    surface: 'front',
  };

  const report = evaluateElementSafety({
    element: stickerEdgeText,
    canvasWidth: 100,
    canvasHeight: 100,
    productId: 'sticker',
    stickerShape: 'circle',
  });

  assert.equal(report.risk, 'near-edge');
  assert.equal(report.badgeLabel, 'Hơi sát mép');

  const state: DesignState = {
    ...createInitialState('sticker'),
    variantId: 'fixed-shape',
    productOptions: {
      shape: 'circle',
    },
    elements: [stickerEdgeText],
  };

  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'safe-area-txt-sticker-edge');
  assert.ok(check);
  assert.equal(check.level, 'warning');
  assert.equal(check.label, 'Hơi sát mép');
});

// 9. Preflight reports pinpoint exact elementId and surfaceId.
test('9. Preflight reports pinpoint exact elementId and surfaceId', () => {
  const state: DesignState = {
    ...createInitialState('card'),
    elements: [
      {
        id: 'txt-front-risk',
        type: 'text',
        x: 1,
        y: 10,
        width: 25,
        height: 10,
        rotation: 0,
        surface: 'front',
      },
      {
        id: 'txt-inside-risk',
        type: 'text',
        x: -10,
        y: 20,
        width: 30,
        height: 10,
        rotation: 0,
        surface: 'inside',
      },
      {
        id: 'txt-back-risk',
        type: 'text',
        x: 88,
        y: 20,
        width: 10,
        height: 10,
        rotation: 0,
        surface: 'back',
      },
    ],
  };

  const preflight = getPreflight(state);
  const checkFront = preflight.checks.find((c) => c.id === 'safe-area-txt-front-risk');
  const checkInside = preflight.checks.find((c) => c.id === 'safe-area-txt-inside-risk');
  const checkBack = preflight.checks.find((c) => c.id === 'safe-area-txt-back-risk');

  assert.ok(checkFront);
  assert.equal(checkFront.elementId, 'txt-front-risk');
  assert.equal(checkFront.surfaceId, 'front');
  assert.equal(checkFront.level, 'warning');

  assert.ok(checkInside);
  assert.equal(checkInside.elementId, 'txt-inside-risk');
  assert.equal(checkInside.surfaceId, 'inside');
  assert.equal(checkInside.level, 'error');

  assert.ok(checkBack);
  assert.equal(checkBack.elementId, 'txt-back-risk');
  assert.equal(checkBack.surfaceId, 'back');
  assert.equal(checkBack.level, 'warning');
});

// 10. Zero history pollution: guide visibility and safety warnings do not emit undo actions.
test('10. Zero history pollution: guide visibility and safety warnings do not emit undo actions', () => {
  const defaultSelection: SelectionSnapshot = {
    selectedTarget: null,
    selectedElementId: null,
    selectedElementIds: [],
    selectionMode: 'default',
    activeGroupId: null,
  };

  const initialState = createInitialState('wrapping');
  const manager = createDesignHistoryManager(
    initialState,
    () => defaultSelection,
    () => { }
  );

  const initialHistoryLength = manager.getHistory().past.length;

  // 1) Toggling guide visibility does not record undo step
  let showSafeAreaGuide = false;
  showSafeAreaGuide = !showSafeAreaGuide;
  assert.equal(manager.getHistory().past.length, initialHistoryLength);
  assert.equal(manager.canUndo(), false);

  showSafeAreaGuide = !showSafeAreaGuide;
  assert.equal(manager.getHistory().past.length, initialHistoryLength);
  assert.equal(manager.canUndo(), false);

  // 2) Evaluating safety or running preflight checks does not record undo step
  const textElement: CanvasElement = {
    id: 'txt-eval',
    type: 'text',
    x: 2,
    y: 2,
    width: 20,
    height: 10,
    rotation: 0,
    surface: 'front',
  };

  const report = evaluateElementSafety({
    element: textElement,
    canvasWidth: 100,
    canvasHeight: 100,
    productId: 'wrapping',
  });
  assert.equal(report.risk, 'near-edge');

  const preflight = getPreflight({
    ...initialState,
    elements: [textElement],
  });
  assert.ok(preflight.checks.some((c) => c.id === 'safe-area-txt-eval'));

  assert.equal(manager.getHistory().past.length, initialHistoryLength);
  assert.equal(manager.canUndo(), false);
});
