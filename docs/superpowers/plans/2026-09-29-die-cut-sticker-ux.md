# Die-cut Sticker UX Implementation Plan (State 27)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement State 27 Die-cut Sticker UX with automatic silhouette and white border generation, connectivity detection (warning if artwork is disconnected), unremoved background detection, live border slider with history transactions, and preview cutline toggle.

**Architecture:** A pure geometry module `src/lib/sticker-contour.ts` calculates element union, connected components, border offsets, and vector SVG paths. `StickerOptions` in `productOptions` stores `borderWidth`, `hasWhiteBorder`, and `showCutline`. A mobile `StickerBorderSheet` lets users adjust border thickness (0–6 mm) and view cutlines. Canvas renders the generated white border and subtle cutline without creating dummy layers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, Tailwind CSS, Node test runner (`pnpm test`).

**Spec:** `docs/superpowers/specs/2026-09-29-die-cut-sticker-ux-design.md`

## Global Constraints

- Final physical sticker shape follows the outer silhouette of visible artwork.
- One connected outer sticker shape: detect disconnected artwork and display `Một số chi tiết đang tách rời.`
- When border thickness increases and merges islands, disconnected warning disappears automatically.
- Detect unremoved opaque backgrounds on images and show `Muốn sticker cắt theo chủ thể? Hãy xóa nền ảnh trước.` with direct action `Xóa nền`.
- Customer copy strictly uses friendly Vietnamese: `Viền sticker`, `Viền trắng`, `Xem đường cắt`, `Mỏng / Dày`, `Hình cắt ổn`.
- Prohibited customer copy: `Contour`, `Offset Path`, `Vector Cutline`, `Spot Color`, `Alpha Threshold`, `Bleed`, `Imposition`.
- Cutline and white border are purely generated UI overlays; NEVER persist them into `elements` array, layers list, or order snapshots.
- Single slider gesture creates exactly one history commit (`Đổi độ dày viền sticker`).
- No new external dependencies.

---

### Task 1: Domain Model, Sticker Options, and Defaults

**Files:**
- Modify: `src/lib/product-state.ts`
- Modify: `src/lib/product-catalog.ts`
- Test: `src/test/sticker-state.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StickerOptions {
    borderWidth: number; // in mm, default: 2
    minBorderWidth?: number; // default: 0
    maxBorderWidth?: number; // default: 6
    hasWhiteBorder: boolean; // default: true
    showCutline?: boolean; // default: false
    cutLineMode?: 'die-cut' | 'fixed-shape' | 'phone';
    [key: string]: unknown;
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sticker-state.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, PRODUCTS } from '../lib/product-state.ts';

test('createInitialState for sticker initializes default StickerOptions', () => {
  const state = createInitialState('sticker');
  assert.equal(state.productId, 'sticker');
  const options = state.productOptions;
  assert.equal(options.borderWidth, 2);
  assert.equal(options.hasWhiteBorder, true);
  assert.equal(options.showCutline, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/sticker-state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update StickerOptions and default products config**

In `src/lib/product-state.ts`:
- Update `StickerOptions` interface with `borderWidth: number`, `minBorderWidth: number`, `maxBorderWidth: number`, `hasWhiteBorder: boolean`, `showCutline: boolean`.
- Update `PRODUCTS.sticker.defaultOptions` to `{ borderWidth: 2, minBorderWidth: 0, maxBorderWidth: 6, hasWhiteBorder: true, showCutline: false }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/sticker-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-state.ts src/lib/product-catalog.ts src/test/sticker-state.test.ts
git commit -m "feat(sticker): define StickerOptions and default physical parameters"
```

---

### Task 2: Pure Sticker Contour & Connectivity Engine

**Files:**
- Create: `src/lib/sticker-contour.ts`
- Test: `src/test/sticker-contour.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StickerContourStatus = 'empty' | 'valid' | 'disconnected' | 'tiny-details';

  export interface StickerContourResult {
    status: StickerContourStatus;
    islandCount: number;
    hasUnremovedBackground: boolean;
    borderSvgPath: string;
    cutlineSvgPath: string;
    warningMessage?: string;
    guidanceMessage?: string;
  }

  export function computeStickerContour(
    elements: readonly CanvasElement[] | undefined,
    options: StickerOptions
  ): StickerContourResult;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sticker-contour.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStickerContour } from '../lib/sticker-contour.ts';

test('computeStickerContour returns empty when no elements exist', () => {
  const result = computeStickerContour([], { borderWidth: 2, hasWhiteBorder: true });
  assert.equal(result.status, 'empty');
  assert.equal(result.islandCount, 0);
});

test('computeStickerContour detects disconnected islands when elements are far apart', () => {
  const elements = [
    { id: '1', type: 'text', x: 10, y: 10, width: 20, height: 20, rotation: 0 },
    { id: '2', type: 'text', x: 200, y: 200, width: 20, height: 20, rotation: 0 },
  ] as any[];
  const result = computeStickerContour(elements, { borderWidth: 2, hasWhiteBorder: true });
  assert.equal(result.status, 'disconnected');
  assert.equal(result.islandCount, 2);
  assert.equal(result.warningMessage, 'Một số chi tiết đang tách rời.');
});

test('computeStickerContour connects islands when border thickness is sufficiently large', () => {
  const elements = [
    { id: '1', type: 'text', x: 10, y: 10, width: 20, height: 20, rotation: 0 },
    { id: '2', type: 'text', x: 35, y: 10, width: 20, height: 20, rotation: 0 },
  ] as any[];
  // Small border -> disconnected
  const rSmall = computeStickerContour(elements, { borderWidth: 1, hasWhiteBorder: true });
  assert.equal(rSmall.status, 'disconnected');

  // Large border -> merged
  const rLarge = computeStickerContour(elements, { borderWidth: 5, hasWhiteBorder: true });
  assert.equal(rLarge.status, 'valid');
  assert.equal(rLarge.islandCount, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/sticker-contour.test.ts`
Expected: FAIL (`computeStickerContour is not defined`).

- [ ] **Step 3: Implement computeStickerContour**

In `src/lib/sticker-contour.ts`:
- Calculate expanded bounding geometry for each element based on `options.borderWidth` (converted to proportional coordinate units).
- Perform graph connected component analysis: determine if all expanded hulls intersect into 1 component.
- Check for unremoved background on image elements (e.g. image without `derivedSrc` from background removal taking substantial bounding area).
- Construct rounded SVG path strings for outer border and cutline.
- Return structured `StickerContourResult`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/sticker-contour.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sticker-contour.ts src/test/sticker-contour.test.ts
git commit -m "feat(sticker): implement pure sticker contour and connectivity engine"
```

---

### Task 3: Sticker Border Sheet & Bottom Toolbar Integration

**Files:**
- Create: `src/components/customizer/sticker-border-sheet.tsx`
- Modify: `src/components/customizer/bottom-navigation.tsx`
- Modify: `src/components/customizer/editor-sheets.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Test: `src/test/sticker-border-sheet.test.ts`

**Interfaces:**
- Produces:
  ```tsx
  export interface StickerBorderSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    options: StickerOptions;
    contourResult: StickerContourResult;
    onChangeOptions: (patch: Partial<StickerOptions>) => void;
    onCommitOptions: (patch: Partial<StickerOptions>) => void;
    onTriggerBackgroundRemoval?: () => void;
  }
  export function StickerBorderSheet(props: StickerBorderSheetProps): React.JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sticker-border-sheet.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StickerBorderSheet } from '../components/customizer/sticker-border-sheet.tsx';

test('StickerBorderSheet exports as a valid component', () => {
  assert.equal(typeof StickerBorderSheet, 'function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/sticker-border-sheet.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement StickerBorderSheet and wire to toolbar**

- Create `src/components/customizer/sticker-border-sheet.tsx`:
  - Toggle `Viền trắng` (On/Off).
  - Slider `Độ dày viền`: `Mỏng` ------- `Dày` (hiển thị `X mm`).
  - Toggle `Xem đường cắt` (Bật/Tắt).
  - Status display card with friendly badges (`✓ Hình cắt ổn`, `⚠ Một số chi tiết đang tách rời`, etc.) and Remove Background trigger button if unremoved background detected.
- In `bottom-navigation.tsx`:
  - When `productId === 'sticker' && !selectedId`, show button `Viền sticker` (or `Hình cắt`).
- In `customizer-shell.tsx`:
  - Wire opening `StickerBorderSheet`, pass `contourResult`, update options.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/sticker-border-sheet.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/sticker-border-sheet.tsx src/components/customizer/bottom-navigation.tsx src/components/customizer/editor-sheets.tsx src/components/customizer/customizer-shell.tsx src/test/sticker-border-sheet.test.ts
git commit -m "feat(sticker): add StickerBorderSheet and bottom toolbar action"
```

---

### Task 4: Canvas Silhouette & Cutline Overlay Rendering

**Files:**
- Modify: `src/components/customizer/design-canvas.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Test: `src/test/sticker-canvas-rendering.test.ts`

**Interfaces:**
- Consumes: `StickerContourResult` from `src/lib/sticker-contour.ts`.
- Produces:
  - White border background SVG layer rendered directly behind active sticker elements.
  - Subtle cutline preview overlay when `showCutline === true` (`pointer-events-none`, `data-ui-guide="sticker-cutline"`).
  - Clean canvas without fake layers or selection interference.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sticker-canvas-rendering.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStickerContour } from '../lib/sticker-contour.ts';

test('contour result provides valid SVG paths for border and cutline', () => {
  const elements = [
    { id: '1', type: 'text', x: 20, y: 20, width: 40, height: 20, rotation: 0 },
  ] as any[];
  const result = computeStickerContour(elements, { borderWidth: 2, hasWhiteBorder: true, showCutline: true });
  assert.ok(result.borderSvgPath.length > 0);
  assert.ok(result.cutlineSvgPath.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/sticker-canvas-rendering.test.ts`
Expected: FAIL.

- [ ] **Step 3: Render border and cutline on Canvas**

- In `design-canvas.tsx`:
  - When `productId === 'sticker'`:
    - Compute or receive `contourResult`.
    - If `hasWhiteBorder && contourResult.borderSvgPath`: render underlying white SVG silhouette behind element canvas content.
    - If `showCutline && contourResult.cutlineSvgPath`: render subtle dashed cutline overlay in front of canvas content with `pointer-events-none`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/sticker-canvas-rendering.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/design-canvas.tsx src/components/customizer/customizer-shell.tsx src/test/sticker-canvas-rendering.test.ts
git commit -m "feat(sticker): render white border silhouette and cutline overlay on canvas"
```

---

### Task 5: Semantic History, Serialization & Preflight

**Files:**
- Modify: `src/lib/history.ts`
- Modify: `src/lib/history-transaction.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/lib/product-state.ts` (preflight checks)
- Test: `src/test/sticker-history-order.test.ts`

**Interfaces:**
- Produces:
  - History entries: `'change-sticker-border'`, `'toggle-sticker-border'`.
  - Storage sanitization preserving `StickerOptions` while filtering out transient cutlines.
  - Preflight validation: warning if artwork is disconnected or if blank.

- [ ] **Step 1: Write the failing test**

```ts
// src/test/sticker-history-order.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPreflight, createInitialState } from '../lib/product-state.ts';
import { sanitizeDesignForStorage } from '../lib/storage.ts';

test('preflight warns when sticker artwork is disconnected', () => {
  let state = createInitialState('sticker');
  state = {
    ...state,
    elements: [
      { id: '1', type: 'text', x: 0, y: 0, width: 10, height: 10 },
      { id: '2', type: 'text', x: 200, y: 200, width: 10, height: 10 },
    ] as any,
  };
  const preflight = getPreflight(state);
  const warn = preflight.checks.find(c => c.label.includes('tách rời'));
  assert.ok(warn);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/sticker-history-order.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement history actions and preflight warning**

- In `history.ts`: add `'change-sticker-border'`, `'toggle-sticker-border'`.
- In `product-state.ts`:
  - In `getPreflight(state)`: if `state.productId === 'sticker'`, evaluate contour; if status is `disconnected`, add check warning `Một số chi tiết đang tách rời`.
- In `storage.ts`: preserve `StickerOptions` cleanly without generated layers.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/sticker-history-order.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/history.ts src/lib/history-transaction.ts src/lib/storage.ts src/lib/product-state.ts src/test/sticker-history-order.test.ts
git commit -m "feat(sticker): add sticker history actions, storage sanitization, and preflight checks"
```

---

### Task 6: Full Verification & E2E Validation

**Files:**
- Modify: `src/components/customizer/customizer-shell.tsx`
- Test: `src/test/sticker-e2e-verification.test.ts`

- [ ] **Step 1: Write comprehensive verification test**
- [ ] **Step 2: Run `pnpm test` (all tests pass)**
- [ ] **Step 3: Run `pnpm typecheck` (0 errors)**
- [ ] **Step 4: Run `pnpm build` (production build succeeds)**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sticker): complete State 27 Die-cut Sticker UX implementation and verification"
```
