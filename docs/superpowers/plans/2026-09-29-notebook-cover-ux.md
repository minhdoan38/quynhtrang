# Notebook Cover UX Implementation Plan (State 29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement State 29 Notebook Cover UX with one fixed front cover canvas (A5 standard 148×210 mm), direct zero-friction entry, physical book styling with subtle binding guide (`Vùng gần gáy`), background color editing, binding-aware preflight, and physical notebook mockup preview.

**Architecture:** Define `NOTEBOOK_COVER_DEFINITION` and binding check helpers in `src/lib/product-state.ts`. `DesignCanvas` formats the front cover with A5 aspect ratio, book-like outer rounding (`rounded-r-xl rounded-l-xs`), and subtle binding guide (`data-ui-guide="notebook-binding"`). Bottom toolbar provides quick `Màu nền` access. Preflight warns when important text sits in the left 12% binding margin or when the cover is completely blank.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, Tailwind CSS, Node test runner (`pnpm test`).

**Spec:** `docs/superpowers/specs/2026-09-29-notebook-cover-ux-design.md`

## Global Constraints

- Exactly one editable surface: `Bìa trước`. No surface switcher, no spine canvas, no inside-page editor.
- Fixed physical size: A5 standard (148mm × 210mm portrait, aspect ratio 148 / 210 ≈ 0.70476).
- Customer copy strictly uses friendly Vietnamese: `Bìa vở`, `Bìa trước`, `Vùng gần gáy`, `Vùng an toàn`, `Màu nền`.
- Prohibited customer copy: `Cover spread`, `Spine margin`, `Binding compensation`, `Trim box`, `Bleed`.
- Binding guide is an Editor UI overlay only (`data-ui-guide`, pointer-events-none); NEVER in print export or preview texture.
- Edge-to-edge artwork is fully allowed (photos and backgrounds can cross the binding margin).
- No new external dependencies.

---

### Task 1: Domain Model, Notebook Geometry, and Binding Detection

**Files:**
- Modify: `src/lib/product-state.ts`
- Test: `src/test/notebook-state.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface NotebookCoverDefinition {
    widthMm: number;
    heightMm: number;
    aspectRatio: number;
    bindingMarginMm: number;
    bindingMarginPct: number;
  }
  export const NOTEBOOK_COVER_DEFINITION: Readonly<NotebookCoverDefinition>;
  export function isElementInNotebookBindingZone(
    element: { x: number; width?: number },
    canvasWidth?: number
  ): boolean;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/test/notebook-state.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTEBOOK_COVER_DEFINITION,
  isElementInNotebookBindingZone,
  createInitialState,
} from '../lib/product-state.ts';

test('NOTEBOOK_COVER_DEFINITION defines standard A5 physical geometry', () => {
  assert.equal(NOTEBOOK_COVER_DEFINITION.widthMm, 148);
  assert.equal(NOTEBOOK_COVER_DEFINITION.heightMm, 210);
  assert.ok(Math.abs(NOTEBOOK_COVER_DEFINITION.aspectRatio - (148 / 210)) < 0.001);
  assert.equal(NOTEBOOK_COVER_DEFINITION.bindingMarginPct, 12);
});

test('isElementInNotebookBindingZone detects elements inside the left 12% margin', () => {
  // Within 12% -> true
  assert.equal(isElementInNotebookBindingZone({ x: 5 }, 100), true);
  // Outside 12% -> false
  assert.equal(isElementInNotebookBindingZone({ x: 25 }, 100), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/notebook-state.test.ts`
Expected: FAIL (`NOTEBOOK_COVER_DEFINITION is not defined`).

- [ ] **Step 3: Implement domain types and binding helper**

In `src/lib/product-state.ts`:
- Define `NOTEBOOK_COVER_DEFINITION`.
- Implement `isElementInNotebookBindingZone`.
- Ensure `NotebookOptions` supports `finish?: 'matte' | 'glossy'` and `backgroundColor?: string`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/notebook-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-state.ts src/test/notebook-state.test.ts
git commit -m "feat(notebook): define notebook cover geometry and binding zone detection"
```

---

### Task 2: Canvas Presentation & Non-Printable Binding Guide

**Files:**
- Modify: `src/components/customizer/design-canvas.tsx`
- Modify: `src/app/globals.css`
- Test: `src/test/notebook-canvas.test.ts`

**Interfaces:**
- Produces:
  - When `productId === 'notebook'`:
    - Canvas container uses A5 aspect ratio (`148 / 210`).
    - Outer book styling: rounded right corners (`rounded-r-xl rounded-l-xs`), subtle rigid book shadow.
    - Subtle non-printable binding guide (`Vùng gần gáy`) at left 12% (`pointer-events-none`, `data-ui-guide="notebook-binding"`).
    - Edge-to-edge artwork renders naturally.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/notebook-canvas.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTEBOOK_COVER_DEFINITION } from '../lib/product-state.ts';

test('notebook cover has valid portrait aspect ratio', () => {
  assert.ok(NOTEBOOK_COVER_DEFINITION.aspectRatio < 1);
  assert.ok(NOTEBOOK_COVER_DEFINITION.aspectRatio > 0.65);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/notebook-canvas.test.ts`
Expected: PASS (or update with DOM checks).

- [ ] **Step 3: Implement canvas styling and binding guide**

In `design-canvas.tsx`:
- When `productId === 'notebook'`:
  - Set container style: `aspectRatio: NOTEBOOK_COVER_DEFINITION.aspectRatio`.
  - Add classes: `rounded-r-xl rounded-l-xs shadow-xl`.
  - If not mockup: render subtle binding guide at `left: 12%`:
    ```tsx
    {productId === 'notebook' && !isMockup && (
      <div
        data-ui-guide="notebook-binding"
        className="absolute inset-y-0 left-[12%] pointer-events-none z-10 flex flex-col justify-between border-l border-dashed border-[#743021]/30 select-none"
        aria-hidden="true"
      >
        <span className="text-[9px] text-[#743021]/60 px-1 py-0.5 bg-background/80 rounded mt-1.5 ml-1 whitespace-nowrap">
          Vùng gần gáy
        </span>
        <span className="text-[9px] text-[#743021]/60 px-1 py-0.5 bg-background/80 rounded mb-1.5 ml-1 whitespace-nowrap">
          Vùng gần gáy
        </span>
      </div>
    )}
    ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/notebook-canvas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/design-canvas.tsx src/app/globals.css src/test/notebook-canvas.test.ts
git commit -m "feat(notebook): add notebook canvas styling and non-printable binding guide"
```

---

### Task 3: Bottom Toolbar Background Color & Direct Entry Verification

**Files:**
- Modify: `src/components/customizer/bottom-navigation.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Test: `src/test/notebook-toolbar.test.ts`

**Interfaces:**
- Produces:
  - For `productId === 'notebook'` when `!selectedId`:
    - Shows `Màu nền` button (icon `Palette`) calling `onAction('background-color')`.
    - No surface switcher, no size button, no contour button.
  - Direct entry verified: clicking `Tự thiết kế` in `ProductSetup` goes directly to editor canvas without extra dialogs.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/notebook-toolbar.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../lib/product-state.ts';

test('createInitialState for notebook defaults to standard variant', () => {
  const state = createInitialState('notebook');
  assert.equal(state.productId, 'notebook');
  assert.equal(state.variantId, 'standard');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/notebook-toolbar.test.ts`
Expected: PASS/FAIL.

- [ ] **Step 3: Wire toolbar for notebook**

In `bottom-navigation.tsx`:
- When `productId === 'notebook' && !selectedId`:
  - Render `Màu nền` button calling `onAction('background-color')`.

In `customizer-shell.tsx`:
- Ensure `onAction('background-color')` opens color picker targeting `{ kind: 'surface', property: 'background' }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/notebook-toolbar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/bottom-navigation.tsx src/components/customizer/customizer-shell.tsx src/test/notebook-toolbar.test.ts
git commit -m "feat(notebook): adapt bottom toolbar with background color for notebook cover"
```

---

### Task 4: Binding-Zone & Empty Design Preflight Rules

**Files:**
- Modify: `src/lib/product-state.ts`
- Test: `src/test/notebook-preflight.test.ts`

**Interfaces:**
- Produces:
  - In `getPreflight(state)`:
    - If `state.productId === 'notebook'`:
      - Empty design check: if no elements and default background, warn: `Bìa vở chưa có nội dung`.
      - Binding zone check: if any text element is in the left 12% margin, warn: `Văn bản nằm gần mép gáy sổ`.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/notebook-preflight.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPreflight, createInitialState } from '../lib/product-state.ts';

test('preflight warns when notebook cover is completely blank', () => {
  const state = createInitialState('notebook');
  const preflight = getPreflight(state);
  const warn = preflight.checks.find(c => c.label.includes('chưa có nội dung'));
  assert.ok(warn);
});

test('preflight warns when text is in the notebook binding caution zone', () => {
  let state = createInitialState('notebook');
  state = {
    ...state,
    elements: [
      { id: 'txt1', type: 'text', x: 5, y: 50, width: 30, height: 10, text: 'Tên của tôi' } as any,
    ],
  };
  const preflight = getPreflight(state);
  const warn = preflight.checks.find(c => c.label.includes('gần mép gáy'));
  assert.ok(warn);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/notebook-preflight.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement notebook preflight checks**

In `src/lib/product-state.ts`:
- In `getPreflight(state)`:
  - Add notebook checks:
    ```ts
    if (state.productId === 'notebook') {
      const hasElements = state.elements && state.elements.length > 0;
      const hasCustomBg = state.backgroundColor && state.backgroundColor !== '#FFFFFF' && state.backgroundColor !== '#ffffff';
      if (!hasElements && !hasCustomBg) {
        checks.push({
          id: 'notebook-content',
          level: 'warning',
          type: 'warning',
          label: 'Bìa vở chưa có nội dung',
          description: 'Thêm hình ảnh, chữ hoặc sticker để bìa sổ sinh động hơn.',
        });
      }
      if (hasElements) {
        const textInBindingZone = state.elements?.some(
          e => e.type === 'text' && isElementInNotebookBindingZone(e, 100)
        );
        if (textInBindingZone) {
          checks.push({
            id: 'notebook-binding-zone',
            level: 'warning',
            type: 'warning',
            label: 'Văn bản nằm gần mép gáy sổ',
            description: 'Giữ chữ quan trọng cách mép này một chút để không bị che bởi gáy hoặc lỗ lò xo.',
          });
        }
      }
    }
    ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/notebook-preflight.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-state.ts src/test/notebook-preflight.test.ts
git commit -m "feat(notebook): add notebook preflight checks for empty cover and binding zone"
```

---

### Task 5: Physical Mockup Preview Enhancement & Full Verification

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/customizer/design-canvas.tsx`
- Test: `src/test/notebook-e2e.test.ts`

**Interfaces:**
- Produces:
  - Realistic notebook physical mockup preview with binding spine, spiral representation, and cover depth shadow.
  - Comprehensive E2E test verifying all 10 success criteria.
  - Full suite check: `pnpm test`, `pnpm typecheck`, `pnpm build`.

- [ ] **Step 1: Write comprehensive verification test**
- [ ] **Step 2: Run `pnpm test` (all tests pass)**
- [ ] **Step 3: Run `pnpm typecheck` (0 errors)**
- [ ] **Step 4: Run `pnpm build` (production build succeeds)**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(notebook): complete State 29 Notebook Cover UX implementation and verification"
```
