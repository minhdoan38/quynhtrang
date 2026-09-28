# Undo / Redo UX & History Semantics Implementation Plan (State 23)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a predictable, mobile-first Undo/Redo engine with semantic history entries, transaction-based preview batching (Font, Color, Sliders, Focus Modes), atomic selection restoration, fixed top-bar controls, and desktop keyboard shortcuts.

**Architecture:** Replace scattered `past`/`future` states with an immutable, bounded `HistoryController` (`src/lib/history.ts`). Model all multi-step, slider, or live-preview workflows as explicit transactions (`beginTransaction`, `commitTransaction`, `cancelTransaction`). Unify document mutation and selection snapshotting so Undo/Redo restores both document integrity and user context atomically.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide React, Node.js Test Runner.

**Spec:** `docs/superpowers/specs/2026-09-28-undo-redo-history-semantics-design.md`

## Global Constraints

- Never commit low-level pointer movements, slider ticks, viewport pan/zoom, or preview clicks into history.
- Live previews and focus modes must never pollute the Undo stack; closing/finishing commits at most one semantic action.
- Undo/Redo buttons in the Top Bar must remain fixed in position with permanent layout stability (disabled when empty, never hidden).
- Cancel actions (`Hủy`) in Crop, Text Edit, or Refine modes must restore baseline state and commit zero history entries.
- Image assets referenced in history snapshots must not be garbage-collected or cloned as raw binary data.
- Autosave continues debounced in the background but must not clear the in-memory session Undo/Redo stack.
- Zero `any` in TypeScript code (`ts-no-any`).

## Review Focus

1. **Slider scrubbing batching:** Continuous dragging on opacity or font-size sliders must produce exactly one committed history action upon pointer release, not dozens of micro-steps.
2. **Font/Color preview transaction:** Rapidly previewing multiple fonts or colors while a sheet remains open must commit exactly one semantic action on sheet close, or zero if unchanged.
3. **Focus mode cancellation:** Tapping `Hủy` in Crop or Refine mode must restore prior coordinates/mask and commit zero history entries.
4. **Active transaction conflict on Undo:** Tapping the top-bar Undo while a property sheet or focus mode is active must cancel the active transaction first without skipping prior global history.
5. **Atomic selection restoration:** Undoing a deleted item or an ungrouped structure must restore both the document elements and their corresponding visual selection state.

---

### Task 1: History Engine Core Domain & Bounded Stack

**Files:**
- Create: `src/lib/history.ts`
- Create: `src/test/history.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type HistoryActionType =
    | 'add'
    | 'move'
    | 'resize'
    | 'rotate'
    | 'edit-text'
    | 'change-font'
    | 'change-font-size'
    | 'change-text-align'
    | 'change-color'
    | 'change-gradient'
    | 'change-opacity'
    | 'crop'
    | 'remove-background'
    | 'refine-background'
    | 'replace-image'
    | 'change-mask'
    | 'group'
    | 'ungroup'
    | 'delete'
    | 'duplicate'
    | 'reorder-layer'
    | 'lock'
    | 'unlock'
    | 'apply-template'
    | 'change-product-option';

  export interface SelectionSnapshot {
    selectedTarget: 'image' | 'text' | 'shape' | 'sticker' | 'group' | null;
    selectedElementId: string | null;
    selectedElementIds: string[];
    selectionMode: 'default' | 'multi-select' | 'group-edit';
    activeGroupId: string | null;
  }

  export interface HistoryEntry {
    id: string;
    timestamp: number;
    type: HistoryActionType;
    label: string;
    before: DesignState;
    after: DesignState;
    selectionBefore: SelectionSnapshot;
    selectionAfter: SelectionSnapshot;
    affectedIds: string[];
  }

  export interface HistoryState {
    past: HistoryEntry[];
    future: HistoryEntry[];
    limit: number;
  }

  export function createHistoryState(limit?: number): HistoryState;
  export function commitHistoryEntry(
    history: HistoryState,
    entry: Omit<HistoryEntry, 'id' | 'timestamp'>
  ): HistoryState;
  export function undoHistory(
    history: HistoryState,
    currentState: DesignState,
    currentSelection: SelectionSnapshot
  ): { nextHistory: HistoryState; restoredState: DesignState; restoredSelection: SelectionSnapshot; undoneEntry: HistoryEntry } | null;
  export function redoHistory(
    history: HistoryState,
    currentState: DesignState,
    currentSelection: SelectionSnapshot
  ): { nextHistory: HistoryState; restoredState: DesignState; restoredSelection: SelectionSnapshot; redoneEntry: HistoryEntry } | null;
  export function canUndo(history: HistoryState): boolean;
  export function canRedo(history: HistoryState): boolean;
  ```

- [ ] **Step 1: Write test for History Engine in `src/test/history.test.ts`**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistoryState,
  commitHistoryEntry,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
  type SelectionSnapshot,
} from '../lib/history.ts';
import { createInitialState } from '../lib/product-state.ts';

const defaultSelection: SelectionSnapshot = {
  selectedTarget: null,
  selectedElementId: null,
  selectedElementIds: [],
  selectionMode: 'default',
  activeGroupId: null,
};

test('createHistoryState initializes empty past and future with limit', () => {
  const h = createHistoryState(50);
  assert.equal(h.past.length, 0);
  assert.equal(h.future.length, 0);
  assert.equal(h.limit, 50);
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), false);
});

test('commitHistoryEntry appends entry, clears future, and enforces capacity', () => {
  let h = createHistoryState(2);
  const s0 = createInitialState('wrapping');
  const s1 = { ...s0, text: 'Hello' };
  const s2 = { ...s1, text: 'World' };
  const s3 = { ...s2, text: 'Third' };

  h = commitHistoryEntry(h, {
    type: 'edit-text',
    label: 'Sửa chữ',
    before: s0,
    after: s1,
    selectionBefore: defaultSelection,
    selectionAfter: { ...defaultSelection, selectedTarget: 'text' },
    affectedIds: ['text-1'],
  });

  assert.equal(h.past.length, 1);
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);

  h = commitHistoryEntry(h, {
    type: 'edit-text',
    label: 'Sửa chữ',
    before: s1,
    after: s2,
    selectionBefore: defaultSelection,
    selectionAfter: defaultSelection,
    affectedIds: ['text-1'],
  });
  assert.equal(h.past.length, 2);

  // Exceeds limit=2: oldest entry dropped
  h = commitHistoryEntry(h, {
    type: 'edit-text',
    label: 'Sửa chữ',
    before: s2,
    after: s3,
    selectionBefore: defaultSelection,
    selectionAfter: defaultSelection,
    affectedIds: ['text-1'],
  });
  assert.equal(h.past.length, 2);
  assert.equal(h.past[0].before.text, 'Hello');
  assert.equal(h.past[1].after.text, 'Third');
});

test('undo and redo cycle restores exact state, selection, and invalidates on new mutation', () => {
  let h = createHistoryState(50);
  const s0 = createInitialState('wrapping');
  const s1 = { ...s0, text: 'V1' };

  h = commitHistoryEntry(h, {
    type: 'edit-text',
    label: 'Sửa chữ',
    before: s0,
    after: s1,
    selectionBefore: { ...defaultSelection, selectedElementId: 'prev' },
    selectionAfter: { ...defaultSelection, selectedElementId: 'next' },
    affectedIds: ['text-1'],
  });

  // Undo
  const undoResult = undoHistory(h, s1, { ...defaultSelection, selectedElementId: 'next' });
  assert.ok(undoResult);
  assert.equal(undoResult.restoredState.text, '');
  assert.equal(undoResult.restoredSelection.selectedElementId, 'prev');
  assert.equal(undoResult.undoneEntry.label, 'Sửa chữ');
  h = undoResult.nextHistory;
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), true);

  // Redo
  const redoResult = redoHistory(h, undoResult.restoredState, undoResult.restoredSelection);
  assert.ok(redoResult);
  assert.equal(redoResult.restoredState.text, 'V1');
  assert.equal(redoResult.restoredSelection.selectedElementId, 'next');
  h = redoResult.nextHistory;
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/history.test.ts`  
Expected: FAIL (Cannot find module '../lib/history.ts').

- [ ] **Step 3: Implement `src/lib/history.ts`**

Implement `createHistoryState`, `commitHistoryEntry`, `undoHistory`, `redoHistory`, `canUndo`, `canRedo`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/history.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/lib/history.ts src/test/history.test.ts
git commit -m "feat(history): implement core bounded history engine with selection snapshots"
```

---

### Task 2: Transaction Controller & Batching Engine

**Files:**
- Create: `src/lib/history-transaction.ts`
- Create: `src/test/history-transaction.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface TransactionSession {
    id: string;
    type: HistoryActionType;
    label: string;
    baselineState: DesignState;
    baselineSelection: SelectionSnapshot;
    affectedIds: string[];
    startTime: number;
  }

  export function beginTransaction(
    currentState: DesignState,
    currentSelection: SelectionSnapshot,
    type: HistoryActionType,
    label: string,
    affectedIds?: string[]
  ): TransactionSession;

  export function commitTransaction(
    history: HistoryState,
    session: TransactionSession,
    currentState: DesignState,
    currentSelection: SelectionSnapshot
  ): { nextHistory: HistoryState; committedEntry: HistoryEntry | null };

  export function cancelTransaction(
    session: TransactionSession
  ): { restoredState: DesignState; restoredSelection: SelectionSnapshot };
  ```

- [ ] **Step 1: Write test for Transaction Controller in `src/test/history-transaction.test.ts`**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginTransaction,
  commitTransaction,
  cancelTransaction,
} from '../lib/history-transaction.ts';
import { createHistoryState } from '../lib/history.ts';
import { createInitialState } from '../lib/product-state.ts';

test('beginTransaction captures baseline without mutating history', () => {
  const s0 = createInitialState('wrapping');
  const sel0 = { selectedTarget: null, selectedElementId: null, selectedElementIds: [], selectionMode: 'default' as const, activeGroupId: null };
  const tx = beginTransaction(s0, sel0, 'change-font', 'Đổi font', ['text-1']);

  assert.equal(tx.type, 'change-font');
  assert.equal(tx.label, 'Đổi font');
  assert.deepEqual(tx.baselineState, s0);
});

test('commitTransaction commits single entry if state changed, or zero if unchanged', () => {
  const h0 = createHistoryState(50);
  const s0 = createInitialState('wrapping');
  const sel = { selectedTarget: null, selectedElementId: null, selectedElementIds: [], selectionMode: 'default' as const, activeGroupId: null };
  const tx = beginTransaction(s0, sel, 'change-color', 'Đổi màu');

  // Case 1: Unchanged
  const unchangeResult = commitTransaction(h0, tx, s0, sel);
  assert.equal(unchangeResult.committedEntry, null);
  assert.equal(unchangeResult.nextHistory.past.length, 0);

  // Case 2: Changed
  const s1 = { ...s0, color: '#E8BCC9' };
  const changeResult = commitTransaction(h0, tx, s1, sel);
  assert.ok(changeResult.committedEntry);
  assert.equal(changeResult.nextHistory.past.length, 1);
  assert.equal(changeResult.nextHistory.past[0].before.color, s0.color);
  assert.equal(changeResult.nextHistory.past[0].after.color, '#E8BCC9');
});

test('cancelTransaction restores exact baseline state and selection', () => {
  const s0 = createInitialState('wrapping');
  const sel0 = { selectedTarget: 'text' as const, selectedElementId: 't-1', selectedElementIds: ['t-1'], selectionMode: 'default' as const, activeGroupId: null };
  const tx = beginTransaction(s0, sel0, 'crop', 'Cắt ảnh', ['img-1']);

  const canceled = cancelTransaction(tx);
  assert.deepEqual(canceled.restoredState, s0);
  assert.deepEqual(canceled.restoredSelection, sel0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/history-transaction.test.ts`  
Expected: FAIL (Cannot find module '../lib/history-transaction.ts').

- [ ] **Step 3: Implement `src/lib/history-transaction.ts`**

Implement `beginTransaction`, `commitTransaction`, and `cancelTransaction`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/history-transaction.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/lib/history-transaction.ts src/test/history-transaction.test.ts
git commit -m "feat(history): implement transaction controller for preview and focus batching"
```

---

### Task 3: Editor History Hook & Selection Sync

**Files:**
- Create: `src/lib/use-design-history.ts`
- Create: `src/test/use-design-history.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface UseDesignHistoryReturn {
    state: DesignState;
    setState: React.Dispatch<React.SetStateAction<DesignState>>;
    history: HistoryState;
    canUndo: boolean;
    canRedo: boolean;
    activeTransaction: TransactionSession | null;
    executeAction: (
      action: DesignAction,
      metadata: { type: HistoryActionType; label: string; affectedIds?: string[] }
    ) => void;
    startTransaction: (type: HistoryActionType, label: string, affectedIds?: string[]) => void;
    commitActiveTransaction: () => HistoryEntry | null;
    cancelActiveTransaction: () => void;
    undo: () => HistoryEntry | null;
    redo: () => HistoryEntry | null;
    resetHistory: (initialState: DesignState) => void;
  }
  ```

- [ ] **Step 1: Write unit tests for `useDesignHistory` helper logic in `src/test/use-design-history.test.ts`**

Verify that actions executed via `executeAction` push to history; transaction start/commit/cancel behave properly; undo/redo restore both state and selection.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/use-design-history.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/use-design-history.ts`**

Implement the state and transaction management hook with selection synchronizers.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/use-design-history.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/lib/use-design-history.ts src/test/use-design-history.test.ts
git commit -m "feat(history): create design history hook uniting document mutations and selection state"
```

---

### Task 4: Customizer Shell Integration & Mutation Cutover

**Files:**
- Modify: `src/components/customizer/customizer-shell.tsx`
- Modify: `src/components/customizer/editor-sheets.tsx`

- [ ] **Step 1: Wire `useDesignHistory` into `customizer-shell.tsx`**

Replace fragmented `past`, `future`, `fontSessionBaseStateRef`, and `opacitySessionBaseStateRef` with `useDesignHistory`.

- [ ] **Step 2: Eliminate double-dispatch & double-push bugs**

1. Fix `onToggleLock` in line 1761: Remove redundant `SET_PRODUCT_OPTION` dispatch.
2. Fix `onCommitTransform` in line 1624: Discard duplicate `handleCommitTransform`.
3. Fix `handleUploadImage` in line 811: Remove manual `setPast` call.
4. Route multi-selection actions (group, ungroup, duplicate, delete) through `executeAction`.

- [ ] **Step 3: Wire Transaction Lifecycle for Sheets and Focus Modes**

1. **Font Browser:** On open sheet &rarr; `startTransaction('change-font', 'Đổi font')`. On close &rarr; `commitActiveTransaction()`.
2. **Color Sheet:** On open &rarr; `startTransaction('change-color', 'Đổi màu')`. On close &rarr; `commitActiveTransaction()`.
3. **Opacity Slider:** `onPointerDown` &rarr; `startTransaction('change-opacity', 'Đổi độ mờ')`. `onPointerUp` &rarr; `commitActiveTransaction()`.
4. **Font Size Slider:** `onPointerDown` &rarr; `startTransaction('change-font-size', 'Đổi cỡ chữ')`. `onPointerUp` &rarr; `commitActiveTransaction()`.
5. **Crop Focus Mode:** On open &rarr; `startTransaction('crop', 'Cắt ảnh')`. On Done &rarr; commit with new crop. On Cancel &rarr; `cancelActiveTransaction()`.
6. **Refine Focus Mode:** On open &rarr; `startTransaction('refine-background', 'Chỉnh vùng cắt')`. On Done &rarr; commit with refined mask. On Cancel &rarr; `cancelActiveTransaction()`.
7. **Text Edit Overlay:** On open &rarr; `startTransaction('edit-text', 'Sửa chữ')`. On Done &rarr; commit text. On Cancel &rarr; `cancelActiveTransaction()`.

- [ ] **Step 4: Run unit tests to verify existing suite passes**

Run: `node --test --experimental-strip-types src/test/*.test.ts`  
Expected: All tests pass.

- [ ] **Step 5: Commit changes**

```bash
git add src/components/customizer/customizer-shell.tsx src/components/customizer/editor-sheets.tsx
git commit -m "feat(customizer): integrate semantic transaction lifecycle and eliminate noisy mutations"
```

---

### Task 5: Top Bar UX, Keyboard Shortcuts & Polish

**Files:**
- Create: `src/lib/use-editor-shortcuts.ts`
- Create: `src/test/editor-shortcuts.test.ts`
- Modify: `src/components/customizer/customizer-shell.tsx`

- [ ] **Step 1: Implement keyboard shortcut hook in `src/lib/use-editor-shortcuts.ts`**

Support `Cmd+Z` / `Ctrl+Z` (Undo) and `Cmd+Shift+Z` / `Cmd+Y` / `Ctrl+Shift+Z` / `Ctrl+Y` (Redo). Exclude when target is native input/textarea or during active composition.

- [ ] **Step 2: Write tests in `src/test/editor-shortcuts.test.ts`**

- [ ] **Step 3: Update Top Bar buttons in `customizer-shell.tsx`**

- Keep fixed position.
- Do NOT use `disabled:pointer-events-none`.
- Set `disabled={!canUndo}` and `aria-disabled={!canUndo}`.
- Touch target `w-9 h-9` with `flex items-center justify-center`.
- Implement Transaction Conflict Resolution: if Undo is tapped while a transaction is active, cancel the transaction first.

- [ ] **Step 4: Add lightweight Vietnamese feedback toasts**

On Undo/Redo for structural/off-canvas actions, show:
- `Đã hoàn tác: [label]`
- `Đã làm lại: [label]`

- [ ] **Step 5: Commit changes**

```bash
git add src/lib/use-editor-shortcuts.ts src/test/editor-shortcuts.test.ts src/components/customizer/customizer-shell.tsx
git commit -m "feat(shortcuts): add desktop keyboard shortcuts, top bar disabled styles, and transaction undo guards"
```

---

### Task 6: Full Verification, Detector, Build & Browser Smoke Tests

**Files:**
- Tests: `src/test/*.test.ts`
- Target: Entire customizer suite

- [ ] **Step 1: Run TypeScript typecheck**

Run: `pnpm run typecheck`  
Expected: 0 errors.

- [ ] **Step 2: Run complete unit test suite**

Run: `pnpm test`  
Expected: 130+ passing tests.

- [ ] **Step 3: Run production Next.js build**

Run: `pnpm build`  
Expected: Compiled successfully.

- [ ] **Step 4: Run Impeccable UI detector**

Run: `node /Users/minhmice/.agents/skills/impeccable/scripts/detect.mjs --json src/components/customizer/customizer-shell.tsx src/components/customizer/editor-sheets.tsx`  
Expected: 0 findings.

- [ ] **Step 5: Run Browser Smoke Test (Mobile 390x844 & Desktop 1280x800)**

1. Verify Top Bar Undo/Redo buttons render in disabled state when stack empty.
2. Add text &rarr; move &rarr; Undo restores initial position in 1 tap.
3. Open Font Browser &rarr; preview multiple fonts &rarr; close sheet &rarr; Undo restores initial font in exactly 1 step.
4. Open Crop &rarr; pan &rarr; tap Hủy &rarr; Undo stack does NOT increase.
5. Open Crop &rarr; pan &rarr; tap Xong &rarr; exactly 1 Undo step created.
6. Verify keyboard `Cmd+Z` / `Ctrl+Z` works on desktop.
7. Verify 0 console errors across session.

- [ ] **Step 6: Commit and push**
