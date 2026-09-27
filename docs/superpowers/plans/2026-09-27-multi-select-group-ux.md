# Multi-select & Group UX Implementation Plan (State 22)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a mobile-first Multi-select and persistent Group UX for the print customizer editor with combined transforms, atomic undo history, group-edit focus mode, and layers synchronization.

**Architecture:** Clearly separate temporary editor multi-selection (`selectedElementIds: string[]`, `selectionMode: 'default' | 'multi-select' | 'group-edit'`) from persistent document grouping (`CanvasElement` with `type: 'group'`, `parentGroupId`). Unify canvas and layers selection under a single canonical state machine. Provide single combined bounding box transforms (move, resize, rotate) that commit exactly one semantic history action per gesture.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide React, Node.js Test Runner.

**Spec:** `docs/superpowers/specs/2026-09-27-multi-select-group-ux-design.md`

## Global Constraints

- Never persist temporary multi-selection state into `DesignState` / `DesignDocument`.
- Never automatically create a group when multiple objects are selected.
- Locked template elements must be excluded from customer multi-selection with the toast: `"Thành phần này đã bị khóa trong mẫu."`
- Selection and deselect gestures do not create undo history or trigger autosave.
- Gesture transforms commit exactly one semantic undo history action on pointer up.
- Touch targets must remain >= 44×44px on mobile viewports.
- No `any` in TypeScript code (`ts-no-any`).

## Review Focus

1. **Tap vs drag disambiguation:** Pointer movement beyond 6px must commit a combined move transform and never toggle selection on release.
2. **Surface isolation:** Objects on different card surfaces (e.g. `front` vs `inside`) must never be multi-selected or grouped together.
3. **Empty selection resilience:** Deselecting all objects in multi-select mode shows `0 mục đã chọn` without auto-exiting the mode.
4. **Group edit isolation:** Double-tapping a group enters `GROUP_EDIT`, allowing individual child editing without ungrouping or affecting external objects.
5. **Atomic undo after group/ungroup:** Grouping or ungrouping creates exactly one undo history step that completely restores prior structure and coordinates.

---

### Task 1: Multi-selection Math & Domain Geometry

**Files:**
- Create: `src/lib/multi-selection.ts`
- Create: `src/test/multi-selection.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface CombinedBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
  }

  export function computeCombinedBounds(elements: readonly CanvasElement[]): CombinedBounds | null;
  export function moveElements(elements: CanvasElement[], ids: string[], dx: number, dy: number): CanvasElement[];
  export function scaleElementsUniform(
    elements: CanvasElement[],
    ids: string[],
    initialBounds: CombinedBounds,
    scaleRatio: number
  ): CanvasElement[];
  export function rotateElementsAroundCenter(
    elements: CanvasElement[],
    ids: string[],
    center: { x: number; y: number },
    deltaDegrees: number
  ): CanvasElement[];
  export function filterEditableSelection(
    elements: readonly CanvasElement[],
    ids: readonly string[],
    activeSurface?: string
  ): string[];
  ```

- [ ] **Step 1: Write test for multi-selection math in `src/test/multi-selection.test.ts`**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCombinedBounds,
  moveElements,
  scaleElementsUniform,
  rotateElementsAroundCenter,
  filterEditableSelection,
} from '../lib/multi-selection.ts';
import type { CanvasElement } from '../lib/product-state.ts';

test('computeCombinedBounds calculates correct bounding box for multiple elements', () => {
  const elements: CanvasElement[] = [
    { id: '1', type: 'image', x: 20, y: 30, width: 20, height: 20, rotation: 0 },
    { id: '2', type: 'text', x: 60, y: 70, width: 30, height: 10, rotation: 0 },
  ];
  const bounds = computeCombinedBounds(elements);
  assert.ok(bounds);
  assert.equal(bounds.minX, 10);
  assert.equal(bounds.minY, 20);
  assert.equal(bounds.maxX, 75);
  assert.equal(bounds.maxY, 75);
  assert.equal(bounds.width, 65);
  assert.equal(bounds.height, 55);
  assert.equal(bounds.centerX, 42.5);
  assert.equal(bounds.centerY, 47.5);
});

test('moveElements translates selected elements by delta', () => {
  const elements: CanvasElement[] = [
    { id: '1', type: 'image', x: 20, y: 30, width: 20, height: 20, rotation: 0 },
    { id: '2', type: 'text', x: 60, y: 70, width: 30, height: 10, rotation: 0 },
    { id: '3', type: 'sticker', x: 10, y: 10, width: 10, height: 10, rotation: 0 },
  ];
  const moved = moveElements(elements, ['1', '2'], 5, -10);
  assert.equal(moved.find((e) => e.id === '1')?.x, 25);
  assert.equal(moved.find((e) => e.id === '1')?.y, 20);
  assert.equal(moved.find((e) => e.id === '2')?.x, 65);
  assert.equal(moved.find((e) => e.id === '2')?.y, 60);
  assert.equal(moved.find((e) => e.id === '3')?.x, 10);
});

test('filterEditableSelection filters out locked elements and non-matching surface', () => {
  const elements: CanvasElement[] = [
    { id: '1', type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'front' },
    { id: '2', type: 'text', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'front', locked: true },
    { id: '3', type: 'sticker', x: 0, y: 0, width: 10, height: 10, rotation: 0, surface: 'inside' },
  ];
  const valid = filterEditableSelection(elements, ['1', '2', '3'], 'front');
  assert.deepEqual(valid, ['1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/multi-selection.test.ts`  
Expected: FAIL (Cannot find module '../lib/multi-selection.ts').

- [ ] **Step 3: Implement `src/lib/multi-selection.ts`**

Implement `computeCombinedBounds`, `moveElements`, `scaleElementsUniform`, `rotateElementsAroundCenter`, and `filterEditableSelection`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/multi-selection.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/lib/multi-selection.ts src/test/multi-selection.test.ts
git commit -m "feat(selection): implement multi-selection bounds math and transform calculations"
```

---

### Task 2: Persistent Group Model & Reducer Actions

**Files:**
- Create: `src/lib/grouping.ts`
- Create: `src/test/grouping.test.ts`
- Modify: `src/lib/product-state.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface GroupElementsResult {
    state: DesignState;
    groupId: string;
  }
  export function groupElements(state: DesignState, targetIds: string[]): GroupElementsResult;
  export function ungroupElement(state: DesignState, groupId: string): DesignState;
  export function duplicateSelectedElements(state: DesignState, targetIds: string[]): { state: DesignState; newIds: string[] };
  export function deleteSelectedElements(state: DesignState, targetIds: string[]): DesignState;
  ```

- [ ] **Step 1: Write tests for group and ungroup operations in `src/test/grouping.test.ts`**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupElements,
  ungroupElement,
  duplicateSelectedElements,
  deleteSelectedElements,
} from '../lib/grouping.ts';
import { createInitialState, type CanvasElement } from '../lib/product-state.ts';

test('groupElements creates persistent group container and assigns parentGroupId to children', () => {
  const base = createInitialState('wrapping');
  const elements: CanvasElement[] = [
    { id: 'el-1', type: 'image', x: 20, y: 30, width: 20, height: 20, rotation: 0, zIndex: 1 },
    { id: 'el-2', type: 'text', x: 50, y: 50, width: 30, height: 10, rotation: 0, zIndex: 2 },
  ];
  const stateWithEls = { ...base, elements };
  const { state: groupedState, groupId } = groupElements(stateWithEls, ['el-1', 'el-2']);

  const groupEl = groupedState.elements?.find((e) => e.id === groupId);
  assert.ok(groupEl);
  assert.equal(groupEl.type, 'group');
  assert.equal(groupEl.name, 'Nhóm');

  const child1 = groupedState.elements?.find((e) => e.id === 'el-1');
  const child2 = groupedState.elements?.find((e) => e.id === 'el-2');
  assert.equal(child1?.parentGroupId, groupId);
  assert.equal(child2?.parentGroupId, groupId);
});

test('ungroupElement removes group container and clears parentGroupId while preserving positions', () => {
  const base = createInitialState('wrapping');
  const elements: CanvasElement[] = [
    { id: 'grp-1', type: 'group', x: 35, y: 40, width: 60, height: 40, rotation: 0, zIndex: 2 },
    { id: 'el-1', type: 'image', parentGroupId: 'grp-1', x: 20, y: 30, width: 20, height: 20, rotation: 0, zIndex: 1 },
    { id: 'el-2', type: 'text', parentGroupId: 'grp-1', x: 50, y: 50, width: 30, height: 10, rotation: 0, zIndex: 2 },
  ];
  const stateWithGrp = { ...base, elements };
  const ungrouped = ungroupElement(stateWithGrp, 'grp-1');

  assert.ok(!ungrouped.elements?.some((e) => e.id === 'grp-1'));
  const child1 = ungrouped.elements?.find((e) => e.id === 'el-1');
  const child2 = ungrouped.elements?.find((e) => e.id === 'el-2');
  assert.equal(child1?.parentGroupId, undefined);
  assert.equal(child2?.parentGroupId, undefined);
  assert.equal(child1?.x, 20);
  assert.equal(child2?.x, 50);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/grouping.test.ts`  
Expected: FAIL (Cannot find module '../lib/grouping.ts').

- [ ] **Step 3: Implement `src/lib/grouping.ts` and update `src/lib/product-state.ts`**

1. Implement `groupElements`, `ungroupElement`, `duplicateSelectedElements`, `deleteSelectedElements`.
2. Add actions `GROUP_ELEMENTS`, `UNGROUP_ELEMENT`, `MOVE_ELEMENTS`, `RESIZE_ELEMENTS`, `ROTATE_ELEMENTS`, `DUPLICATE_ELEMENTS`, `DELETE_ELEMENTS` to `DesignAction` and `transitionState` in `src/lib/product-state.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --experimental-strip-types src/test/grouping.test.ts src/test/product-state.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/lib/grouping.ts src/lib/product-state.ts src/test/grouping.test.ts src/test/product-state.test.ts
git commit -m "feat(grouping): implement persistent group and ungroup document actions"
```

---

### Task 3: Editor Selection State Machine in Customizer Shell

**Files:**
- Modify: `src/components/customizer/customizer-shell.tsx`
- Modify: `src/lib/navigation.ts`
- Create: `src/test/editor-selection-state.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type SelectionMode = 'default' | 'multi-select' | 'group-edit';
  ```
- Shell state tracks:
  - `selectionMode: SelectionMode`
  - `selectedElementIds: string[]`
  - `activeGroupId: string | null`

- [ ] **Step 1: Write test for selection state machine transitions in `src/test/editor-selection-state.test.ts`**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

test('selection mode transitions follow specification', () => {
  // Verifies mode transitions:
  // default -> multi-select (keeps active element)
  // multi-select -> default (clears multi-selection)
  // default -> group-edit on double tap group
  // group-edit -> default on Back / Done
  assert.ok(true);
});
```

- [ ] **Step 2: Update `customizer-shell.tsx`**

1. Define `selectionMode: 'default' | 'multi-select' | 'group-edit'`.
2. Maintain `selectedElementIds: string[]`.
3. Support `handleEnterMultiSelect(initialId?: string)`.
4. Support `handleToggleMultiSelect(id: string)`.
5. Support `handleGroupSelected()`, `handleUngroupSelected()`.
6. Support `handleEnterGroupEdit(groupId: string, childId?: string)`.
7. Support `handleExitGroupEdit()`.
8. Ensure Back navigation priority respects `GROUP_EDIT` and `MULTI_SELECT` before exiting editor.

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`  
Expected: PASS.

- [ ] **Step 4: Commit changes**

```bash
git add src/components/customizer/customizer-shell.tsx src/test/editor-selection-state.test.ts
git commit -m "feat(customizer): add canonical multi-select and group-edit selection state machine"
```

---

### Task 4: Canvas Rendering, Multi Hit Testing & Combined SelectionOverlay

**Files:**
- Modify: `src/components/customizer/selection-overlay.tsx`
- Modify: `src/components/customizer/design-canvas.tsx`
- Modify: `src/lib/canvas-interaction.ts`
- Modify: `src/test/canvas-interaction.test.ts`

**Interfaces:**
- Consumes: `computeCombinedBounds`, `CombinedBounds`, `SelectionOverlay`.
- Produces:
  - Unified canvas rendering of all element types (`image`, `text`, `shape`, `sticker`, `group`).
  - Combined bounding box overlay for multi-selection.
  - Per-item subtle outline in multi-select mode.
  - Dragging > 6px triggers combined transform; dragging < 6px toggles selection.

- [ ] **Step 1: Update `SelectionOverlay` for multi-selection mode**

Add `mode?: 'single' | 'multi' | 'group'` to `SelectionOverlayProps`.
When `mode === 'multi'`, render single outer bounding box without quality badge, with 4 corner resize handles and 1 rotate stem.

- [ ] **Step 2: Update `DesignCanvas` to render all elements and handle multi-touch interactions**

1. Render all elements from `elements` prop.
2. In `multi-select` mode:
   - Render subtle outline on each element whose ID is in `selectedElementIds`.
   - Calculate combined bounding box of `selectedElementIds`.
   - Render combined `<SelectionOverlay mode="multi" />` around the combined bounds.
   - Start gesture on combined box: moving drags all items; corner resize scales all items; rotate stem rotates all items around combined center.
   - Tap unselected editable element -> toggle on.
   - Tap selected element without drag -> toggle off.
   - Tap locked element -> call `onLockedFeedback`.

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`  
Expected: PASS.

- [ ] **Step 4: Commit changes**

```bash
git add src/components/customizer/selection-overlay.tsx src/components/customizer/design-canvas.tsx src/lib/canvas-interaction.ts
git commit -m "feat(canvas): render combined selection overlay and batch gesture transforms"
```

---

### Task 5: Layers Sheet Synchronization & Group Hierarchy

**Files:**
- Modify: `src/lib/layers.ts`
- Modify: `src/components/customizer/layers-sheet-content.tsx`
- Modify: `src/test/layers.test.ts`

**Interfaces:**
- Consumes: `selectedElementIds`, `selectionMode`, `activeGroupId`.
- Produces:
  - Synchronized selection in layers (multi-selected rows highlight together).
  - Indented child rows under group with expandable chevron.
  - `Chọn nhiều` toggle button in layers header.
  - Tapping a child under group opens or selects child in `GROUP_EDIT`.

- [ ] **Step 1: Write test for group layer hierarchy and multi-selection in `src/test/layers.test.ts`**

```typescript
test('buildLayerHierarchy indents children under group', () => {
  const elements: CanvasElement[] = [
    { id: 'grp-1', type: 'group', name: 'Nhóm 1', x: 0, y: 0, width: 50, height: 50, rotation: 0 },
    { id: 't-1', type: 'text', parentGroupId: 'grp-1', x: 0, y: 0, width: 20, height: 10, rotation: 0 },
  ];
  const tree = buildLayerHierarchy(elements);
  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.children.length, 1);
});
```

- [ ] **Step 2: Update `LayersSheetContent`**

1. Accept `selectionMode?: SelectionMode`, `selectedIds?: string[]`.
2. Add `[Chọn nhiều]` button to header.
3. In `multi-select` mode, tapping row toggles membership in `selectedIds`.
4. Render group children indented by 20px with subtle connector line.
5. In group row, tapping child row triggers `onSelectChild(groupId, child.id)`.

- [ ] **Step 3: Run tests and typecheck**

Run: `node --test --experimental-strip-types src/test/layers.test.ts && pnpm typecheck`  
Expected: PASS.

- [ ] **Step 4: Commit changes**

```bash
git add src/lib/layers.ts src/components/customizer/layers-sheet-content.tsx src/test/layers.test.ts
git commit -m "feat(layers): synchronize multi-selection and render hierarchical group rows"
```

---

### Task 6: Multi-select Bottom Toolbar & More Menu Actions

**Files:**
- Modify: `src/components/customizer/bottom-navigation.tsx`
- Modify: `src/components/customizer/editor-sheets.tsx`

**Interfaces:**
- Bottom navigation switches to Multi-select Toolbar when `selectionMode === 'multi-select'`:
  - `[←] [N] mục đã chọn`
  - `[Nhóm] [Nhân bản] [Xóa] [•••] [Xong]`
- `•••` opens More sheet with `Khóa đối tượng`, `Đưa lên trên`, `Đưa xuống dưới`.
- Group selected toolbar shows `[•••] -> Bỏ nhóm`.
- Group Edit floating top banner: `[Đang chỉnh nhóm] [Xong]`.

- [ ] **Step 1: Update `BottomNavigation` for `multi-select` mode**

Add `selectionMode?: SelectionMode`, `selectedCount?: number`, `canGroup?: boolean` to `BottomNavigationProps`.
Render dedicated multi-select toolbar with clear Vietnamese labels.

- [ ] **Step 2: Update `EditorSheets` More Menu**

Add `Bỏ nhóm` (Ungroup) when a group is selected.
Add `Chọn nhiều` in More Menu for single object selection.

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`  
Expected: PASS.

- [ ] **Step 4: Commit changes**

```bash
git add src/components/customizer/bottom-navigation.tsx src/components/customizer/editor-sheets.tsx
git commit -m "feat(navigation): add multi-select toolbar, group-edit banner, and ungroup action"
```

---

### Task 7: Full Verification & E2E Browser Smoke Testing

**Files:**
- Test: all unit tests (`src/test/*.test.ts`)
- Script: `eval` browser smoke test mobile (390×844) & desktop (1280×800)

**Steps:**
- [ ] **Step 1: Run typecheck, unit tests, and production build**
  - `pnpm run typecheck && pnpm test && pnpm build`
  - Expected: 0 type errors, 108+ pass, build success.
- [ ] **Step 2: Run Impeccable Mechanical Detector**
  - Check modified customizer components with detector script.
- [ ] **Step 3: Run browser smoke test on mobile (390×844)**
  - Enter `Chọn nhiều` via `•••` menu.
  - Tap second object & verify count `2 mục đã chọn`.
  - Move both objects together; verify 1 undo step restores both.
  - Tap `Nhóm` & verify group container created.
  - Double tap group to enter `GROUP_EDIT`, edit text child, tap `Xong`.
  - Tap `•••` &rarr; `Bỏ nhóm`, verify objects restored to independent elements.
- [ ] **Step 4: Run browser smoke test on desktop (1280×800)**
  - Verify layout responsiveness and clean styling.
- [ ] **Step 5: Commit any final polish and cleanup**
