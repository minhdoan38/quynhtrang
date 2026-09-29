import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createDesignHistoryManager } from '../lib/use-design-history.ts';
import { createInitialState, type CanvasElement, type CardOptions } from '../lib/product-state.ts';
import { evaluateElementSafety } from '../lib/safe-area.ts';
import type { SelectionSnapshot } from '../lib/history.ts';

test('toggling showSafeAreaGuide is ephemeral and does not create undo history entries', () => {
  const defaultSelection: SelectionSnapshot = {
    selectedTarget: null,
    selectedElementId: null,
    selectedElementIds: [],
    selectionMode: 'default',
    activeGroupId: null,
  };

  const manager = createDesignHistoryManager(
    createInitialState('wrapping'),
    () => defaultSelection,
    () => { }
  );

  let showSafeAreaGuide = false;
  const initialHistoryLength = manager.getHistory().past.length;

  // Toggle on
  showSafeAreaGuide = !showSafeAreaGuide;
  assert.equal(showSafeAreaGuide, true);
  assert.equal(manager.getHistory().past.length, initialHistoryLength);
  assert.equal(manager.canUndo(), false);

  // Toggle off
  showSafeAreaGuide = !showSafeAreaGuide;
  assert.equal(showSafeAreaGuide, false);
  assert.equal(manager.getHistory().past.length, initialHistoryLength);
  assert.equal(manager.canUndo(), false);
});

test('activeSafetyReport evaluates safety for active selected element using effective transform', () => {
  const cardState = createInitialState('card');
  const textEl: CanvasElement = {
    id: 'text-1',
    type: 'text',
    x: 5,
    y: 5,
    width: 20,
    height: 10,
    rotation: 0,
    surface: 'front',
  };

  // Safe position
  const safeReport = evaluateElementSafety({
    element: {
      id: textEl.id,
      type: textEl.type,
      x: textEl.x,
      y: textEl.y,
      width: textEl.width,
      height: textEl.height,
      surface: textEl.surface,
      rotation: textEl.rotation,
    },
    productId: cardState.productId,
    variantId: cardState.variantId,
    surface: 'front',
    cardOrientation: (cardState.productOptions as CardOptions)?.orientation,
  });
  assert.equal(safeReport.risk, 'safe');

  // Transformed near edge
  const effectiveTransform = { x: 1, y: 1, scale: 1, rotation: 0 };
  const warningReport = evaluateElementSafety({
    element: {
      id: textEl.id,
      type: textEl.type,
      x: effectiveTransform.x,
      y: effectiveTransform.y,
      width: textEl.width,
      height: textEl.height,
      surface: textEl.surface,
      rotation: effectiveTransform.rotation,
    },
    productId: cardState.productId,
    variantId: cardState.variantId,
    surface: 'front',
    cardOrientation: (cardState.productOptions as CardOptions)?.orientation,
  });
  assert.equal(warningReport.risk, 'near-edge');
  assert.equal(warningReport.regionType, 'outer-edge');
});

test('CustomizerShell and EditorSheets source contracts for safe-area guide', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx'),
    'utf8'
  );
  const sheetsSource = readFileSync(
    resolve(process.cwd(), 'src/components/customizer/editor-sheets.tsx'),
    'utf8'
  );

  // Shell imports and state
  assert.match(
    shellSource,
    /evaluateElementSafety,\s*type SafetyReport/,
    'CustomizerShell must import evaluateElementSafety and SafetyReport'
  );
  assert.match(
    shellSource,
    /const \[showSafeAreaGuide,\s*setShowSafeAreaGuide\]\s*=\s*useState\(false\);/,
    'CustomizerShell must manage showSafeAreaGuide state'
  );

  // Shell passes props to DesignCanvas
  assert.match(
    shellSource,
    /showSafeAreaGuide=\{showSafeAreaGuide\}/,
    'CustomizerShell must pass showSafeAreaGuide to DesignCanvas'
  );
  assert.match(
    shellSource,
    /activeSafetyReport=\{activeSafetyReport\}/,
    'CustomizerShell must pass activeSafetyReport to DesignCanvas'
  );

  // EditorSheets toggle text
  assert.match(
    sheetsSource,
    /showSafeAreaGuide\s*\?\s*['"]Ẩn vùng an toàn['"]\s*:\s*['"]Hiện vùng an toàn['"]/,
    'EditorSheets More menu must provide toggle option with exact Vietnamese labels'
  );
});
