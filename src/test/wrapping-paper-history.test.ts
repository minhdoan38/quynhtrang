import test from 'node:test';
import assert from 'node:assert/strict';

import {
  beginTransaction,
  commitTransaction,
  areDesignStatesEqual,
} from '../lib/history-transaction.ts';
import {
  createHistoryState,
  undoHistory,
  redoHistory,
  type SelectionSnapshot,
} from '../lib/history.ts';
import {
  createInitialState,
  transitionState,
  type CanvasElement,
  type DesignState,
  type PatternConfig,
} from '../lib/product-state.ts';
import {
  saveState,
  loadState,
  saveRecentProject,
  getRecentProjects,
} from '../lib/storage.ts';

const defaultSelection: SelectionSnapshot = {
  selectedTarget: null,
  selectedElementId: null,
  selectedElementIds: [],
  selectionMode: 'default',
  activeGroupId: null,
};

function setupMockStorage() {
  const sessionStore = new Map<string, string>();
  const localStore = new Map<string, string>();

  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
    getItem: (key: string) => sessionStore.get(key) ?? null,
    setItem: (key: string, val: string) => {
      sessionStore.set(key, String(val));
    },
    removeItem: (key: string) => {
      sessionStore.delete(key);
    },
    clear: () => {
      sessionStore.clear();
    },
    key: (i: number) => Array.from(sessionStore.keys())[i] ?? null,
    length: sessionStore.size,
  };

  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => localStore.get(key) ?? null,
    setItem: (key: string, val: string) => {
      localStore.set(key, String(val));
    },
    removeItem: (key: string) => {
      localStore.delete(key);
    },
    clear: () => {
      localStore.clear();
    },
    key: (i: number) => Array.from(localStore.keys())[i] ?? null,
    length: localStore.size,
  };

  (globalThis as unknown as { window: unknown }).window = globalThis;
}

test('pattern action types in transaction sessions capture baseline cleanly', () => {
  const s0 = createInitialState('wrapping');
  const actions = [
    { type: 'change-pattern-repeat' as const, label: 'Đổi kiểu lặp' },
    { type: 'change-pattern-scale' as const, label: 'Đổi cỡ họa tiết' },
    { type: 'change-pattern-spacing' as const, label: 'Đổi khoảng cách họa tiết' },
    { type: 'change-pattern-background' as const, label: 'Đổi màu nền giấy' },
    { type: 'rotate-pattern' as const, label: 'Xoay họa tiết' },
  ];

  for (const item of actions) {
    const tx = beginTransaction(s0, defaultSelection, item.type, item.label);
    assert.equal(tx.type, item.type);
    assert.equal(tx.label, item.label);
    assert.deepEqual(tx.baselineState, s0);
  }
});

test('areDesignStatesEqual detects all patternConfig property changes', () => {
  const base = createInitialState('wrapping');
  const currentPattern = base.productOptions.patternConfig as PatternConfig;

  assert.equal(areDesignStatesEqual(base, { ...base }), true);

  const variations: Partial<PatternConfig>[] = [
    { enabled: !currentPattern.enabled },
    { repeatMode: 'half-brick' },
    { scale: 140 },
    { spacingX: 12 },
    { spacingY: 15 },
    { rotation: 45 },
    { backgroundColor: '#000000' },
  ];

  for (const patch of variations) {
    const modified: DesignState = {
      ...base,
      productOptions: {
        ...base.productOptions,
        patternConfig: {
          ...currentPattern,
          ...patch,
        },
      },
    };
    assert.equal(
      areDesignStatesEqual(base, modified),
      false,
      `Should detect diff for patch: ${JSON.stringify(patch)}`
    );
  }
});

test('batching multiple preview operations commits exactly 1 history entry', () => {
  const h0 = createHistoryState(50);
  const s0 = createInitialState('wrapping');
  const tx = beginTransaction(
    s0,
    defaultSelection,
    'change-pattern-scale',
    'Đổi cỡ họa tiết'
  );

  let inFlightState = s0;
  const scales = [110, 120, 130, 140, 150];
  for (const scale of scales) {
    inFlightState = transitionState(inFlightState, {
      type: 'SET_PRODUCT_OPTION',
      key: 'patternConfig',
      value: {
        scale,
      },
    });
    // In-flight commits remain 0
    assert.equal(h0.past.length, 0);
  }

  const result = commitTransaction(h0, tx, inFlightState, defaultSelection);
  assert.ok(result.committedEntry);
  assert.equal(result.nextHistory.past.length, 1);
  assert.equal(result.committedEntry.type, 'change-pattern-scale');
  assert.equal(result.committedEntry.label, 'Đổi cỡ họa tiết');

  const beforePattern = result.committedEntry.before.productOptions
    .patternConfig as PatternConfig;
  const afterPattern = result.committedEntry.after.productOptions
    .patternConfig as PatternConfig;

  assert.equal(beforePattern.scale, 100);
  assert.equal(afterPattern.scale, 150);
});

test('undo and redo restore and re-apply patternConfig faithfully', () => {
  let history = createHistoryState(50);
  const s0 = createInitialState('wrapping');

  const tx1 = beginTransaction(
    s0,
    defaultSelection,
    'change-pattern-repeat',
    'Đổi kiểu lặp'
  );
  const s1 = transitionState(s0, {
    type: 'SET_PRODUCT_OPTION',
    key: 'patternConfig',
    value: {
      repeatMode: 'mirror',
    },
  });
  const res1 = commitTransaction(history, tx1, s1, defaultSelection);
  history = res1.nextHistory;

  const tx2 = beginTransaction(
    s1,
    defaultSelection,
    'rotate-pattern',
    'Xoay họa tiết'
  );
  const s2 = transitionState(s1, {
    type: 'SET_PRODUCT_OPTION',
    key: 'patternConfig',
    value: {
      rotation: 90,
    },
  });
  const res2 = commitTransaction(history, tx2, s2, defaultSelection);
  history = res2.nextHistory;

  assert.equal(history.past.length, 2);

  // Undo rotate-pattern
  const undoRotate = undoHistory(history, s2, defaultSelection);
  assert.ok(undoRotate);
  history = undoRotate.nextHistory;
  const restored1Pattern = undoRotate.restoredState.productOptions
    .patternConfig as PatternConfig;
  assert.equal(restored1Pattern.rotation, 0);
  assert.equal(restored1Pattern.repeatMode, 'mirror');

  // Undo change-pattern-repeat
  const undoRepeat = undoHistory(history, undoRotate.restoredState, defaultSelection);
  assert.ok(undoRepeat);
  history = undoRepeat.nextHistory;
  const restored0Pattern = undoRepeat.restoredState.productOptions
    .patternConfig as PatternConfig;
  assert.equal(restored0Pattern.rotation, 0);
  assert.equal(restored0Pattern.repeatMode, 'basic');

  // Redo change-pattern-repeat
  const redoRepeat = redoHistory(history, undoRepeat.restoredState, defaultSelection);
  assert.ok(redoRepeat);
  history = redoRepeat.nextHistory;
  const redone1Pattern = redoRepeat.restoredState.productOptions
    .patternConfig as PatternConfig;
  assert.equal(redone1Pattern.repeatMode, 'mirror');

  // Redo rotate-pattern
  const redoRotate = redoHistory(history, redoRepeat.restoredState, defaultSelection);
  assert.ok(redoRotate);
  history = redoRotate.nextHistory;
  const redone2Pattern = redoRotate.restoredState.productOptions
    .patternConfig as PatternConfig;
  assert.equal(redone2Pattern.rotation, 90);
  assert.equal(redone2Pattern.repeatMode, 'mirror');
});

test('storage saveState and loadState preserve patternConfig and exclude generated elements', () => {
  setupMockStorage();

  const originalElement: CanvasElement = {
    id: 'user-motif-1',
    type: 'image',
    x: 10,
    y: 10,
    width: 50,
    height: 50,
    rotation: 0,
  };
  const generatedElement: CanvasElement = {
    id: 'generated-copy-1',
    type: 'image',
    x: 60,
    y: 60,
    width: 50,
    height: 50,
    rotation: 0,
    data: {
      generated: true,
      patternGenerated: true,
    },
  };

  const state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [originalElement, generatedElement],
    productOptions: {
      mode: 'pattern',
      patternConfig: {
        enabled: true,
        repeatMode: 'half-drop',
        scale: 125,
        spacingX: 8,
        spacingY: 10,
        rotation: 30,
        backgroundColor: '#fef3c7',
      },
    },
  };

  const saveOk = saveState(state);
  assert.equal(saveOk, true);

  const loaded = loadState();
  assert.ok(loaded);
  assert.equal(loaded.productId, 'wrapping');

  const loadedPattern = (loaded.productOptions?.patternConfig ?? null) as PatternConfig | null;
  assert.ok(loadedPattern);
  assert.equal(loadedPattern.repeatMode, 'half-drop');
  assert.equal(loadedPattern.scale, 125);
  assert.equal(loadedPattern.spacingX, 8);
  assert.equal(loadedPattern.spacingY, 10);
  assert.equal(loadedPattern.rotation, 30);
  assert.equal(loadedPattern.backgroundColor, '#fef3c7');

  // Verify generated element was stripped and original user element preserved
  assert.equal(loaded.elements?.length, 1);
  assert.equal(loaded.elements?.[0]?.id, 'user-motif-1');

  // Verify recent project round-trip
  const recentOk = saveRecentProject(state);
  assert.equal(recentOk, true);
  const projects = getRecentProjects();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].elements?.length, 1);
  assert.equal(projects[0].elements?.[0]?.id, 'user-motif-1');
  const recentPattern = projects[0].productOptions.patternConfig as PatternConfig;
  assert.equal(recentPattern.repeatMode, 'half-drop');
  assert.equal(recentPattern.scale, 125);
});
