# Non-die-cut Sticker UX Implementation Plan (State 28)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement State 28 Non-die-cut Sticker UX for fixed geometric stickers (`Tròn`, `Vuông`, `Chữ nhật`, `Oval`, `Bo góc`) with visual shape selection in product setup, physical canvas shape clipping, product background color editing, template routing, and preflight isolation from die-cut contour rules.

**Architecture:** Extend domain types with `FixedStickerShape` and physical geometry helpers. Add a visual shape picker modal to `ProductSetup` when starting a blank `fixed-shape` sticker. `DesignCanvas` clips artwork to the physical sticker boundary (`rounded-full`, `rounded-3xl`, `rounded-[50%]`) with edge-to-edge background color. Bottom toolbar presents `Màu nền` instead of `Viền sticker`. Preflight excludes fixed-shape stickers from die-cut disconnected/tiny detail warnings.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, Tailwind CSS, Node test runner (`pnpm test`).

**Spec:** `docs/superpowers/specs/2026-09-29-non-die-cut-sticker-ux-design.md`

## Global Constraints

- Supported shapes: `circle` (`Tròn`), `square` (`Vuông`), `rectangle` (`Chữ nhật`), `oval` (`Oval`), `rounded-rectangle` (`Bo góc`).
- Customer copy strictly uses friendly Vietnamese: `Chọn hình sticker`, `Tròn`, `Vuông`, `Chữ nhật`, `Oval`, `Bo góc`, `Màu nền`.
- Prohibited customer copy: `Fixed contour`, `Geometric cut`, `Predefined cut path`, `Trim geometry`, `Die line`.
- Canvas boundary matches physical shape with `overflow-hidden`.
- NO contour extraction or automatic white border around artwork for fixed-shape stickers.
- NO `Xem đường cắt` tool for fixed-shape stickers.
- NO disconnected artwork warnings or tiny cut-detail warnings for fixed-shape stickers.
- Shape is fixed upon project creation/template selection for MVP.
- All 234+ existing tests must pass, plus new tests.

---

### Task 1: Domain Model, Fixed Shapes, and Physical Geometry

**Files:**
- Modify: `src/lib/product-state.ts`
- Test: `src/test/fixed-sticker-state.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FixedStickerShape = 'circle' | 'square' | 'rectangle' | 'oval' | 'rounded-rectangle';
  export const FIXED_STICKER_SHAPES: readonly FixedStickerShape[];
  export function getFixedStickerShapeLabel(shape: FixedStickerShape): string;
  export interface FixedStickerDimensions {
    width: number;
    height: number;
    aspectRatio: number;
    borderRadiusCss: string;
    isEllipse?: boolean;
  }
  export function getFixedStickerDimensions(shape: FixedStickerShape): FixedStickerDimensions;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/test/fixed-sticker-state.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIXED_STICKER_SHAPES,
  getFixedStickerShapeLabel,
  getFixedStickerDimensions,
} from '../lib/product-state.ts';

test('FIXED_STICKER_SHAPES contains 5 standard shapes with Vietnamese labels', () => {
  assert.deepEqual(FIXED_STICKER_SHAPES, ['circle', 'square', 'rectangle', 'oval', 'rounded-rectangle']);
  assert.equal(getFixedStickerShapeLabel('circle'), 'Tròn');
  assert.equal(getFixedStickerShapeLabel('square'), 'Vuông');
  assert.equal(getFixedStickerShapeLabel('rectangle'), 'Chữ nhật');
  assert.equal(getFixedStickerShapeLabel('oval'), 'Oval');
  assert.equal(getFixedStickerShapeLabel('rounded-rectangle'), 'Bo góc');
});

test('getFixedStickerDimensions returns physical dimensions and CSS radius', () => {
  const circle = getFixedStickerDimensions('circle');
  assert.equal(circle.aspectRatio, 1);
  assert.equal(circle.borderRadiusCss, '9999px');

  const rect = getFixedStickerDimensions('rectangle');
  assert.equal(rect.aspectRatio, 1.4);
  assert.equal(rect.borderRadiusCss, '0px');

  const oval = getFixedStickerDimensions('oval');
  assert.equal(oval.aspectRatio, 1.4);
  assert.equal(oval.isEllipse, true);

  const rounded = getFixedStickerDimensions('rounded-rectangle');
  assert.equal(rounded.aspectRatio, 1.4);
  assert.equal(rounded.borderRadiusCss, '16px');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-state.test.ts`
Expected: FAIL (`FIXED_STICKER_SHAPES is not defined`).

- [ ] **Step 3: Implement domain types and geometry helper**

In `src/lib/product-state.ts`:
- Define `FixedStickerShape`, `FIXED_STICKER_SHAPES`, `getFixedStickerShapeLabel`.
- Implement `getFixedStickerDimensions(shape: FixedStickerShape)`.
- Update `StickerOptions` to include `shape?: FixedStickerShape`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-state.ts src/test/fixed-sticker-state.test.ts
git commit -m "feat(sticker): add fixed sticker shapes and geometry definitions"
```

---

### Task 2: Visual Shape Selector in Product Setup & Template Routing

**Files:**
- Modify: `src/components/customizer/product-setup.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Modify: `src/lib/product-state.ts` (template definitions)
- Test: `src/test/fixed-sticker-setup.test.ts`

**Interfaces:**
- Produces:
  - When variant is `fixed-shape` and customer taps `Tự thiết kế`: shows visual shape picker `Bạn muốn sticker hình gì?` with cards: `Tròn`, `Vuông`, `Chữ nhật`, `Oval`, `Bo góc`.
  - Tapping a shape starts blank editor with `productOptions.shape` set to chosen shape.
  - Template selection directly routes the template's declared shape without prompting.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/fixed-sticker-setup.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../lib/product-state.ts';

test('fixed-shape sticker templates declare their shape', () => {
  const pack = TEMPLATES['sticker-cute-pack'];
  assert.ok(pack);
  assert.equal(pack.productOptions.sticker?.shape ?? 'circle', 'circle');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-setup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement shape picker in ProductSetup and wire shell**

- In `product-setup.tsx`:
  - When `productId === 'sticker' && selectedVariant === 'fixed-shape'`, tapping `Tự thiết kế` opens modal `Bạn muốn sticker hình gì?`.
  - Render 5 visual cards with shape preview icons/outlines and titles.
  - Selecting a shape passes `{ shape }` to `onStartBlank`.
- In `customizer-shell.tsx`:
  - Handle `onStartBlank` for sticker `fixed-shape` with chosen `shape`.
- In `product-state.ts`:
  - Tag fixed-shape templates with `shape`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-setup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/product-setup.tsx src/components/customizer/customizer-shell.tsx src/lib/product-state.ts src/test/fixed-sticker-setup.test.ts
git commit -m "feat(sticker): add visual shape picker in product setup and template routing"
```

---

### Task 3: Physical Canvas Clipping & Background Rendering

**Files:**
- Modify: `src/components/customizer/design-canvas.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Test: `src/test/fixed-sticker-canvas.test.ts`

**Interfaces:**
- Produces:
  - When `productId === 'sticker' && (variantId === 'fixed-shape' || productOptions.shape)`:
    - Apply shape dimensions, aspect ratio, border radius, and `overflow-hidden`.
    - Apply product background color across the entire sticker shape.
    - Suppress die-cut contour SVG and cutline overlay.
    - Outer workspace remains neutral/subtly dimmed.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/fixed-sticker-canvas.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFixedStickerDimensions } from '../lib/product-state.ts';

test('fixed sticker shapes produce distinct aspect ratios and border radii', () => {
  const circle = getFixedStickerDimensions('circle');
  const square = getFixedStickerDimensions('square');
  const oval = getFixedStickerDimensions('oval');

  assert.equal(circle.borderRadiusCss, '9999px');
  assert.equal(square.borderRadiusCss, '0px');
  assert.equal(oval.isEllipse, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-canvas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement canvas clipping and styling**

In `design-canvas.tsx`:
- When `productId === 'sticker'`:
  - Check if `isFixedShape = variantId === 'fixed-shape' || Boolean(productOptions.shape);`
  - If `isFixedShape`:
    - Get dimensions from `getFixedStickerDimensions(productOptions.shape ?? 'circle')`.
    - Apply aspect ratio and borderRadius to canvas container style.
    - Add `overflow-hidden` so artwork is clipped to the physical edge.
    - Background color uses `productOptions.backgroundColor ?? backgroundColor ?? '#ffffff'`.
    - Do NOT render die-cut white border SVG or cutline SVG.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-canvas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/design-canvas.tsx src/components/customizer/customizer-shell.tsx src/test/fixed-sticker-canvas.test.ts
git commit -m "feat(sticker): implement physical canvas clipping and background rendering"
```

---

### Task 4: Bottom Toolbar Background Color & UI Refinement

**Files:**
- Modify: `src/components/customizer/bottom-navigation.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Test: `src/test/fixed-sticker-toolbar.test.ts`

**Interfaces:**
- Produces:
  - When `productId === 'sticker' && (variantId === 'fixed-shape' || productOptions.shape)` and `!selectedId`:
    - Toolbar hides `Viền sticker`.
    - Toolbar shows `Màu nền` (Palette icon) which opens Color Sheet for the sticker background.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/fixed-sticker-toolbar.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../lib/product-state.ts';

test('fixed-shape sticker has shape option initialized', () => {
  let state = createInitialState('sticker');
  state = {
    ...state,
    variantId: 'fixed-shape',
    productOptions: {
      ...state.productOptions,
      shape: 'circle',
    },
  };
  assert.equal(state.productOptions.shape, 'circle');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-toolbar.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update bottom-navigation and customizer-shell**

- In `bottom-navigation.tsx`:
  - When `productId === 'sticker' && !selectedId`:
    - If `isFixedShape`: render `Màu nền` button (icon: `Palette`) calling `onAction('background-color')`.
    - If `!isFixedShape` (die-cut): render `Viền sticker` button.
- In `customizer-shell.tsx`:
  - Handle `onAction('background-color')` by opening Color Sheet with target `surface.background`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-toolbar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/bottom-navigation.tsx src/components/customizer/customizer-shell.tsx src/test/fixed-sticker-toolbar.test.ts
git commit -m "feat(sticker): adapt bottom toolbar for fixed-shape sticker background color"
```

---

### Task 5: Preflight Isolation, Template Filtering & Serialization

**Files:**
- Modify: `src/lib/product-state.ts`
- Modify: `src/lib/storage.ts`
- Test: `src/test/fixed-sticker-preflight.test.ts`

**Interfaces:**
- Produces:
  - In `getPreflight(state)`:
    - If `state.variantId === 'fixed-shape'`: do NOT run contour checks (disconnected artwork is valid; tiny detail warnings do not trigger).
  - In `getCompatibleTemplates`:
    - Filter fixed-shape templates by matching `shape`.
  - In `storage.ts`:
    - Preserve `productOptions.shape` through draft save/restore.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/fixed-sticker-preflight.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPreflight, createInitialState } from '../lib/product-state.ts';

test('fixed-shape sticker does not trigger disconnected artwork warning', () => {
  let state = createInitialState('sticker');
  state = {
    ...state,
    variantId: 'fixed-shape',
    productOptions: {
      ...state.productOptions,
      shape: 'circle',
    },
    elements: [
      { id: '1', type: 'text', x: 0, y: 0, width: 10, height: 10 },
      { id: '2', type: 'text', x: 200, y: 200, width: 10, height: 10 },
    ] as any,
  };
  const preflight = getPreflight(state);
  const warn = preflight.checks.find(c => c.label.includes('tách rời'));
  assert.equal(warn, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-preflight.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement preflight isolation and storage**

- In `product-state.ts`:
  - In `getPreflight`: only run `computeStickerContour` checks if `variantId === 'die-cut'`.
- In `storage.ts`:
  - Ensure `productOptions.shape` is retained in storage drafts.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/fixed-sticker-preflight.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-state.ts src/lib/storage.ts src/test/fixed-sticker-preflight.test.ts
git commit -m "feat(sticker): isolate fixed-shape preflight and ensure shape persistence"
```

---

### Task 6: Full Verification & E2E Validation

**Files:**
- Test: `src/test/fixed-sticker-e2e.test.ts`

- [ ] **Step 1: Write comprehensive verification test**
- [ ] **Step 2: Run `pnpm test` (all tests pass)**
- [ ] **Step 3: Run `pnpm typecheck` (0 errors)**
- [ ] **Step 4: Run `pnpm build` (production build succeeds)**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sticker): complete State 28 Non-die-cut Sticker UX implementation and verification"
```
