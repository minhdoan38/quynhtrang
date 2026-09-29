# Resolution Warning UX Implementation Plan (State 30)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement State 30 Resolution Warning UX with physical print-size PPI evaluation for each product, 3 plain-language states (`Tốt`, `Có thể hơi mờ`, `Ảnh quá nhỏ`), contextual badge, interactive explanation sheet with quick actions (`Thu nhỏ ảnh`, `Thay ảnh`), dynamic recalculation without history pollution, and Preflight integration with element reference.

**Architecture:** Pure engine in `src/lib/image-quality.ts` evaluates physical PPI using product dimensions and configurable thresholds. Contextual badge in `selection-overlay.tsx` triggers `ImageQualitySheet` in `src/components/customizer/image-quality-sheet.tsx` or editor sheets. `getPreflight` inspects all image elements with product-specific geometry.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, Tailwind CSS, Node test runner (`pnpm test`).

**Spec:** `docs/superpowers/specs/2026-09-29-resolution-warning-ux-design.md`

## Global Constraints

- Exactly three customer states: `Tốt` (`✓ Tốt`), `Có thể hơi mờ` (`⚠ Có thể hơi mờ`), `Ảnh quá nhỏ` (`⚠ Ảnh quá nhỏ`).
- Strictly NO raw DPI/PPI, false quality percentages, or print-production jargon in customer UI.
- Effective quality evaluates usable source pixels (accounting for crop) against physical printed dimensions (accounting for object scale and patternScale).
- Vector elements (Text, SVG shapes, QR) are excluded.
- Rotation and opacity do NOT alter resolution quality.
- Warning explanation sheet provides direct actions: `Thu nhỏ ảnh` and `Thay ảnh`.
- Non-blocking during normal editing; quality updates dynamically as derived state without creating history entries.
- Preflight reports exact `elementId` and `surfaceId`.
- No new external dependencies.

---

### Task 1: Domain Model, Physical Print PPI Engine & Product Thresholds

**Files:**
- Modify: `src/lib/image-quality.ts`
- Test: `src/test/image-quality-v2.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QualityLevel = 'good' | 'warning' | 'critical';
  export type QualityBadgeLabel = 'Tốt' | 'Có thể hơi mờ' | 'Ảnh quá nhỏ';

  export interface ImageQualityReport {
    level: QualityLevel;
    badgeLabel: QualityBadgeLabel;
    title: string;
    description: string;
    advice: string;
    effectivePpi: number; // Internal only
    canScaleDown?: boolean;
    recommendedScale?: number;
    elementId?: string;
    surfaceId?: string;
  }

  export interface EvaluateQualityParams {
    sourceWidth?: number;
    sourceHeight?: number;
    scale?: number;
    cropFraction?: number;
    productId?: string;
    variantId?: string;
    patternScale?: number;
    elementWidthPct?: number; // width relative to canvas (0-100)
    elementId?: string;
    surfaceId?: string;
  }

  export function evaluateImageQuality(params?: EvaluateQualityParams): ImageQualityReport;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/test/image-quality-v2.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateImageQuality } from '../lib/image-quality.ts';

test('evaluateImageQuality returns exact labels "Tốt", "Có thể hơi mờ", "Ảnh quá nhỏ"', () => {
  const good = evaluateImageQuality({ sourceWidth: 3000, sourceHeight: 2000, scale: 1 });
  assert.equal(good.level, 'good');
  assert.equal(good.badgeLabel, 'Tốt');

  const warn = evaluateImageQuality({ sourceWidth: 1000, sourceHeight: 1000, scale: 2.5 });
  assert.equal(warn.level, 'warning');
  assert.equal(warn.badgeLabel, 'Có thể hơi mờ');

  const crit = evaluateImageQuality({ sourceWidth: 400, sourceHeight: 300, scale: 3 });
  assert.equal(crit.level, 'critical');
  assert.equal(crit.badgeLabel, 'Ảnh quá nhỏ');
});

test('evaluateImageQuality accounts for physical product size (notebook A5 vs sticker)', () => {
  // A small 800px image on a small 50mm sticker has high PPI
  const stickerReport = evaluateImageQuality({
    sourceWidth: 800,
    sourceHeight: 800,
    productId: 'sticker',
    scale: 1,
  });
  assert.equal(stickerReport.level, 'good');

  // Same 800px image enlarged to fill an A5 notebook cover (210mm) degrades
  const notebookReport = evaluateImageQuality({
    sourceWidth: 800,
    sourceHeight: 800,
    productId: 'notebook',
    scale: 2.5,
  });
  assert.notEqual(notebookReport.level, 'good');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/image-quality-v2.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement physical print PPI calculation in image-quality.ts**

In `src/lib/image-quality.ts`:
- Define `PRODUCT_QUALITY_THRESHOLDS` and `PRODUCT_PHYSICAL_DIMS_INCH`.
- Calculate `usablePixels = minSourceDim * safeCrop`.
- Compute physical width in inches based on product and element scale.
- Compute `effectivePpi = usablePixels / physicalWidthInches`.
- Map against `goodMinPpi` and `warningMinPpi` to return `level: 'good' | 'warning' | 'critical'` and labels `'Tốt' | 'Có thể hơi mờ' | 'Ảnh quá nhỏ'`.
- Provide `recommendedScale` if `canScaleDown`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/image-quality-v2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-quality.ts src/test/image-quality-v2.test.ts
git commit -m "feat(quality): implement physical print PPI engine with product thresholds and 3 customer states"
```

---

### Task 2: Update Existing Image Quality Callsites & Badge Presentation

**Files:**
- Modify: `src/components/customizer/selection-overlay.tsx`
- Modify: `src/components/customizer/design-canvas.tsx`
- Modify: `src/test/image-quality.test.ts`
- Modify: `src/test/wrapping-paper-controls.test.ts`

**Interfaces:**
- Produces:
  - `selection-overlay.tsx` renders badge with exact labels: `Tốt`, `Có thể hơi mờ`, `Ảnh quá nhỏ`.
  - Subtle styling for `Tốt` (`✓ Tốt`), prominent styling for warning and critical states.
  - Passes element scale and dimensions to `evaluateImageQuality`.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update callsites and SelectionOverlay**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/selection-overlay.tsx src/components/customizer/design-canvas.tsx src/test/image-quality.test.ts src/test/wrapping-paper-controls.test.ts
git commit -m "feat(quality): update selection badge styling and callsites with 3 customer states"
```

---

### Task 3: Interactive Explanation Sheet & Action Handlers

**Files:**
- Create: `src/components/customizer/image-quality-sheet.tsx`
- Modify: `src/components/customizer/editor-sheets.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Test: `src/test/image-quality-sheet.test.ts`

**Interfaces:**
- Produces:
  ```tsx
  export interface ImageQualitySheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    report: ImageQualityReport | null;
    onScaleDown?: (recommendedScale: number) => void;
    onReplaceImage?: () => void;
  }
  export function ImageQualitySheet(props: ImageQualitySheetProps): React.JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement ImageQualitySheet and wire to shell**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/image-quality-sheet.tsx src/components/customizer/editor-sheets.tsx src/components/customizer/customizer-shell.tsx src/test/image-quality-sheet.test.ts
git commit -m "feat(quality): add ImageQualitySheet with Thu nhỏ ảnh and Thay ảnh quick actions"
```

---

### Task 4: Dynamic Transforms, Crop, and Replace Invalidation

**Files:**
- Modify: `src/components/customizer/design-canvas.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Test: `src/test/image-quality-dynamic.test.ts`

**Interfaces:**
- Produces:
  - Quality recalculates after image resize gesture commits.
  - Quality recalculates after crop commits.
  - Quality recalculates after image replacement commits.
  - Rotation and opacity do not trigger quality degradation.
  - Quality state does NOT create undo/redo history entries.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Ensure dynamic recalculation on gesture end and actions**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/design-canvas.tsx src/components/customizer/customizer-shell.tsx src/test/image-quality-dynamic.test.ts
git commit -m "feat(quality): ensure dynamic recalculation on resize, crop, and replace without history entries"
```

---

### Task 5: Preflight Integration with Object & Surface References

**Files:**
- Modify: `src/lib/product-state.ts`
- Test: `src/test/image-quality-preflight.test.ts`

**Interfaces:**
- Produces:
  - In `getPreflight(state: DesignState)`:
    - Iterates over all image elements across surfaces (`front`, `inside`, `back`).
    - Evaluates each image with product physical dimensions and patternScale.
    - References `elementId` and `surfaceId` in preflight check item.
    - Warns `Ảnh có thể hơi mờ khi in` for warning level, or `Ảnh quá nhỏ để in rõ` for critical level.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement multi-surface image preflight checks**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

```bash
git add src/lib/product-state.ts src/test/image-quality-preflight.test.ts
git commit -m "feat(quality): integrate multi-surface image quality checks into preflight with element references"
```

---

### Task 6: Full Verification & E2E Validation

**Files:**
- Test: `src/test/image-quality-e2e.test.ts`

- [ ] **Step 1: Write comprehensive verification test covering all 8 success criteria**
- [ ] **Step 2: Run `pnpm test` (all tests pass)**
- [ ] **Step 3: Run `pnpm typecheck` (0 errors)**
- [ ] **Step 4: Run `pnpm build` (production build succeeds)**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(quality): complete State 30 Resolution Warning UX implementation and verification"
```
