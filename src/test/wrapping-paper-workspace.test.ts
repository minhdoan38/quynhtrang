import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  transitionState,
  type PatternConfig,
  type PatternWorkspaceView,
} from '../lib/product-state.ts';
import {
  createHistoryState,
  commitHistoryEntry,
  undoHistory,
  redoHistory,
  type SelectionSnapshot,
} from '../lib/history.ts';
import { computePatternGrid, getWrappingPaperDimensions } from '../lib/pattern-renderer.ts';

const defaultSelection: SelectionSnapshot = {
  selectedTarget: null,
  selectedElementId: null,
  selectedElementIds: [],
  selectionMode: 'default',
  activeGroupId: null,
};

test('pattern workspace view state is transient and independent of history stack', () => {
  const initialState = createInitialState('wrapping');
  assert.equal(initialState.productOptions.mode, 'pattern');

  let history = createHistoryState();
  let currentState = initialState;
  assert.equal(history.past.length, 0);

  // Transient workspace view simulation
  let currentView: PatternWorkspaceView = 'edit-pattern';

  // Toggle view to full-sheet-preview
  currentView = 'full-sheet-preview';

  // Switching view does not mutate DesignState or push into history
  assert.equal(history.past.length, 0);
  assert.equal(currentState.productOptions.mode, 'pattern');
  assert.equal(history.future.length, 0);

  // Adding actual element pushes to history
  const stateWithText = transitionState(currentState, {
    type: 'ADD_TEXT_ELEMENT',
    preset: 'heading',
    id: 'text-motif',
    text: 'Pattern Motif',
  });

  history = commitHistoryEntry(history, {
    type: 'add',
    label: 'Thêm chữ',
    before: currentState,
    after: stateWithText,
    selectionBefore: defaultSelection,
    selectionAfter: defaultSelection,
    affectedIds: ['text-motif'],
  });
  currentState = stateWithText;
  assert.equal(history.past.length, 1);

  // Switching view back to edit-pattern still leaves history intact
  currentView = 'edit-pattern';
  assert.equal(currentView, 'edit-pattern');
  assert.equal(history.past.length, 1);

  // Undo restores initial state while currentView remains unaffected
  const undoResult = undoHistory(history, currentState, defaultSelection);
  assert.notEqual(undoResult, null);
  if (undoResult) {
    history = undoResult.nextHistory;
    currentState = undoResult.restoredState;
    assert.equal(history.past.length, 0);
    assert.equal(currentState.elements?.length ?? 0, 0);
    assert.equal(history.future.length, 1);
  }

  // Redo reapplies stateWithText while currentView remains unaffected
  const redoResult = redoHistory(history, currentState, defaultSelection);
  assert.notEqual(redoResult, null);
  if (redoResult) {
    history = redoResult.nextHistory;
    currentState = redoResult.restoredState;
    assert.equal(history.past.length, 1);
    assert.equal(currentState.elements?.length, 1);
  }
});

test('pattern grid generation accurately covers A1 and A2 full-sheet dimensions', () => {
  const a1Dims = getWrappingPaperDimensions('a1');
  assert.equal(a1Dims.width, 594);
  assert.equal(a1Dims.height, 841);

  const patternConfig: PatternConfig = {
    enabled: true,
    repeatMode: 'basic',
    scale: 100,
    spacingX: 20,
    spacingY: 20,
    rotation: 0,
    backgroundColor: '#FAF5EE',
  };

  const a1Grid = computePatternGrid({
    sheetWidth: a1Dims.width,
    sheetHeight: a1Dims.height,
    config: patternConfig,
    baseMotifSize: { width: 100, height: 100 },
  });

  assert.ok(a1Grid.totalCount > 0);
  assert.equal(a1Grid.bounds.width, 594);
  assert.equal(a1Grid.bounds.height, 841);

  // Ensure overdraw bounds extend beyond printable sheet
  assert.ok(a1Grid.overdraw.minX <= 0);
  assert.ok(a1Grid.overdraw.minY <= 0);
  assert.ok(a1Grid.overdraw.maxX >= 594);
  assert.ok(a1Grid.overdraw.maxY >= 841);

  // Verify cells cover all quadrants
  const hasNegativeX = a1Grid.cells.some((cell) => cell.x < 0);
  const hasPastMaxX = a1Grid.cells.some((cell) => cell.x + cell.width > 594);
  assert.ok(hasNegativeX);
  assert.ok(hasPastMaxX);

  // Check A2 sheet
  const a2Dims = getWrappingPaperDimensions('a2');
  assert.equal(a2Dims.width, 420);
  assert.equal(a2Dims.height, 594);

  const a2Grid = computePatternGrid({
    sheetWidth: a2Dims.width,
    sheetHeight: a2Dims.height,
    config: patternConfig,
    baseMotifSize: { width: 100, height: 100 },
  });

  assert.ok(a2Grid.totalCount > 0);
  assert.equal(a2Grid.bounds.width, 420);
  assert.equal(a2Grid.bounds.height, 594);
});

test('full sheet mode is isolated from pattern toggle and repeat grid', () => {
  let state = createInitialState('wrapping');
  state = transitionState(state, {
    type: 'SET_PRODUCT_OPTION',
    key: 'mode',
    value: 'full-sheet',
  });
  assert.equal(state.productOptions.mode, 'full-sheet');

  // In full-sheet mode, patternConfig should reflect non-pattern or full-sheet options
  const fullSheetPattern = state.productOptions.patternConfig as PatternConfig;
  assert.ok(fullSheetPattern !== undefined);

  // When wrapping is full-sheet, source composition is the full sheet, no generated repeat cells
  assert.equal(state.elements?.length ?? 0, 0);
  // Add an element to full sheet
  state = transitionState(state, {
    type: 'ADD_TEXT_ELEMENT',
    preset: 'heading',
    id: 'hero-title',
    text: 'Toàn tờ A1',
  });

  assert.equal(state.elements?.length, 1);
  assert.equal(state.elements?.[0].id, 'hero-title');
});
