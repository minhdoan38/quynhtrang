# Safe Area UX Implementation Plan (State 31)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement State 31 Safe Area UX for mobile print customization editor: guide customers to keep important content away from physical edges, folds, and binding margins without technical terminology.

**Architecture:** Pure geometric safety evaluator (`src/lib/safe-area.ts`) evaluating element bounds against product-specific safe margins, fold corridors, and binding zones; contextual canvas guide overlays (`design-canvas.tsx`); non-intrusive selection badges (`selection-overlay.tsx`); and Preflight integration with element and surface references (`product-state.ts`).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS v4, Node.js test runner via `pnpm test`.

**Spec:** `docs/superpowers/specs/2026-09-29-safe-area-ux-design.md`

## Global Constraints
- Core principle: "Show where important content is safest without forcing the customer to understand print-production terminology. The system guides, never controls."
- The Safe Area is guidance, not a hard constraint (NO blocking movement, NO snapping inward, NO automatic repositioning).
- Customer terminology:
  - Main guide: `Vùng an toàn`
  - Near edge: `⚠ Chi tiết này hơi sát mép.`
  - High risk / outside bounds: `⚠ Chi tiết này có thể bị cắt mất.`
  - Card fold (inside): `⚠ Chi tiết quan trọng đang nằm quá gần nếp gấp.`
  - Notebook binding: `⚠ Chi tiết này đang khá gần gáy.`
  - Outside product boundary: `⚠ Một phần chi tiết này nằm ngoài vùng thành phẩm.`
- Important vs Decorative:
  - Important: `text`, `qr`, `barcode`, `logo`.
  - Decorative: background colors, background images, shapes, pattern repeats. Backgrounds can extend past the edge/bleed freely without warnings.
- No history entries or storage pollution for derived safety state or guide visibility.
- All tasks must pass `pnpm test` and `pnpm typecheck`.

---

### Task 1: Domain Model & Geometric Safety Engine (`src/lib/safe-area.ts`)

**Files:**
- Create: `src/lib/safe-area.ts`
- Create: `src/test/safe-area.test.ts`

**Interfaces:**
```ts
export type SafetyRisk = 'safe' | 'near-edge' | 'high-risk';
export type SafetyRegionType = 'outer-edge' | 'card-fold' | 'notebook-binding' | 'sticker-boundary' | 'outside-bounds';

export interface SafetyReport {
  risk: SafetyRisk;
  regionType?: SafetyRegionType;
  badgeLabel?: string;
  description?: string;
  advice?: string;
  elementId?: string;
  surfaceId?: string;
}

export interface EvaluateSafetyParams {
  element: {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height?: number;
    surface?: string;
    rotation?: number;
  };
  canvasWidth?: number;
  canvasHeight?: number;
  productId: string;
  variantId?: string;
  surface?: string;
  cardOrientation?: 'horizontal' | 'vertical';
  stickerShape?: string;
}

export function isElementImportant(type: string): boolean;
export function evaluateElementSafety(params: EvaluateSafetyParams): SafetyReport;
```

- [ ] **Step 1: Write tests for geometric safety evaluator**
Create `src/test/safe-area.test.ts` testing:
- Important content detection (`text`, `qr`, `barcode`, `logo` are important; `shape`, `image` background are not).
- Outer edge 4% safe margin detection.
- Card fold ±3% detection on inside surface.
- Notebook binding left 12% margin detection.
- Exact customer Vietnamese warning labels.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL due to missing `src/lib/safe-area.ts`.

- [ ] **Step 3: Implement `src/lib/safe-area.ts`**
Implement geometry calculations and threshold checks.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS with 0 failures and 0 type errors.

- [ ] **Step 5: Commit**
```bash
git add src/lib/safe-area.ts src/test/safe-area.test.ts
git commit -m "feat(safe-area): implement geometric safety engine with product margins and risk evaluation"
```

---

### Task 2: Design Canvas Safe Area Guide Overlay (`src/components/customizer/design-canvas.tsx`)

**Files:**
- Modify: `src/components/customizer/design-canvas.tsx`
- Create: `src/test/safe-area-canvas.test.ts`

**Interfaces:**
- Consumes: `evaluateElementSafety` from `src/lib/safe-area.ts`.
- In `DesignCanvasProps`:
  - `showSafeAreaGuide?: boolean;`
  - `activeSafetyReport?: SafetyReport | null;`

- [ ] **Step 1: Write canvas guide tests**
Create `src/test/safe-area-canvas.test.ts` testing:
- Safe area guide overlay renders subtle dashed border with `data-ui-guide="safe-area"`.
- Guide has `pointer-events-none` and is not part of editable document layers.
- Contextual visibility: displays when `showSafeAreaGuide` is true or when selected element has `risk !== 'safe'`.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Update `src/components/customizer/design-canvas.tsx`**
Add safe area guide overlay:
```tsx
{/* Safe Area Guide Overlay (4% inset) */}
{(showSafeAreaGuide || (selectedSafetyReport && selectedSafetyReport.risk !== 'safe')) && (
  <div
    data-ui-guide="safe-area"
    className="absolute inset-[4%] pointer-events-none z-10 border border-dashed border-[#315F86]/35 rounded-xs transition-opacity duration-200"
    aria-hidden="true"
  >
    <span className="absolute top-1 left-1 text-[8px] text-[#315F86]/70 uppercase tracking-wider font-medium select-none bg-background/60 px-1 rounded-2xs">
      Vùng an toàn
    </span>
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/design-canvas.tsx src/test/safe-area-canvas.test.ts
git commit -m "feat(safe-area): add contextual safe area guide overlay to design canvas"
```

---

### Task 3: Contextual Warning Badge on Selection Overlay (`src/components/customizer/selection-overlay.tsx`)

**Files:**
- Modify: `src/components/customizer/selection-overlay.tsx`
- Create: `src/test/safe-area-selection.test.ts`

**Interfaces:**
- In `SelectionOverlayProps`:
  - `safetyReport?: SafetyReport | null;`

- [ ] **Step 1: Write selection overlay safety badge tests**
Create `src/test/safe-area-selection.test.ts` testing:
- Displays warning badge when `safetyReport.risk === 'near-edge'` or `'high-risk'`.
- Correct Vietnamese text (`Chi tiết này hơi sát mép`, `Chi tiết này có thể bị cắt mất`, etc.).
- Does not block touch/pointer events from canvas handles.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Update `src/components/customizer/selection-overlay.tsx`**
Render safety badge at the top of the selection box:
```tsx
{safetyReport && safetyReport.risk !== 'safe' && (
  <div
    role="status"
    aria-live="polite"
    className={`absolute -top-7 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shadow-xs whitespace-nowrap z-30 ${
      safetyReport.risk === 'high-risk'
        ? 'bg-[#FDF0ED] text-[#A63626] border border-[#F5C7C0]'
        : 'bg-[#FEF6E7] text-[#9A6214] border border-[#F4DCB0]'
    }`}
  >
    <AlertTriangle className="w-3 h-3 shrink-0" />
    <span>{safetyReport.badgeLabel}</span>
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/selection-overlay.tsx src/test/safe-area-selection.test.ts
git commit -m "feat(safe-area): render contextual warning badge on selection overlay"
```

---

### Task 4: Shell Integration & Ephemeral Guide Toggle (`src/components/customizer/customizer-shell.tsx`)

**Files:**
- Modify: `src/components/customizer/customizer-shell.tsx`
- Create: `src/test/safe-area-shell.test.ts`

**Interfaces:**
- Ephemeral state: `showSafeAreaGuide: boolean` (default: false, toggled in More options).
- Derived `activeSafetyReport`: calculated using `evaluateElementSafety` for the currently selected element.
- Recalculated live during/after transform.

- [ ] **Step 1: Write shell safety integration tests**
Create `src/test/safe-area-shell.test.ts` testing:
- Toggle `showSafeAreaGuide` does not create history undo entries.
- Active safety report calculates for selected element.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Update `src/components/customizer/customizer-shell.tsx`**
Integrate `showSafeAreaGuide` toggle and `activeSafetyReport` calculation passed to `DesignCanvas`.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/customizer-shell.tsx src/test/safe-area-shell.test.ts
git commit -m "feat(safe-area): integrate safe area guide toggle and dynamic safety evaluation in shell"
```

---

### Task 5: Preflight Integration with Object & Surface References (`src/lib/product-state.ts`)

**Files:**
- Modify: `src/lib/product-state.ts`
- Create: `src/test/safe-area-preflight.test.ts`

**Interfaces:**
- In `getPreflight(state: DesignState)`:
  - Iterates through all elements.
  - For each important element (`isElementImportant(element.type)`), evaluate with `evaluateElementSafety`.
  - Maps `near-edge` to `warning` PreflightCheck with `elementId`, `surfaceId`, and plain language label.
  - Maps `high-risk` to `error` PreflightCheck with `elementId`, `surfaceId`, and plain language label.

- [ ] **Step 1: Write preflight safe area tests**
Create `src/test/safe-area-preflight.test.ts` testing:
- Important element in risky zone produces preflight check with `elementId` and `surfaceId`.
- Decorative background element does not produce safe area warning.
- Card fold and notebook binding warnings include respective surface IDs.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Update `src/lib/product-state.ts`**
Add safe area checks into `getPreflight`.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/product-state.ts src/test/safe-area-preflight.test.ts
git commit -m "feat(safe-area): integrate element-level safe area checks into preflight"
```

---

### Task 6: Full Verification & E2E Validation

**Files:**
- Create: `src/test/safe-area-e2e.test.ts`

**Requirements:**
- Test all 10 success criteria:
  1. Text placed safely inside safe area (no warnings).
  2. Moving text near edge triggers `near-edge` warning (`Chi tiết này hơi sát mép`).
  3. Moving text outward triggers `high-risk` warning (`Chi tiết này có thể bị cắt mất`).
  4. Moving text inward resolves the warning automatically.
  5. Full-bleed background colors / images extend past edge without safe area warning.
  6. Card inside fold warning triggers for important content near center fold.
  7. Notebook binding warning triggers for text within left 12% margin.
  8. Sticker shape safe inset triggers for content near edge.
  9. Preflight reports pinpoint exact `elementId` and `surfaceId`.
  10. Zero history pollution for guide visibility or derived safety state.
- Run `pnpm test`, `pnpm typecheck`, `pnpm build`.

- [ ] **Step 1: Write `src/test/safe-area-e2e.test.ts`**
- [ ] **Step 2: Run `pnpm test` (all tests pass)**
- [ ] **Step 3: Run `pnpm typecheck` (tsc --noEmit passes)**
- [ ] **Step 4: Run `pnpm build` (production build succeeds)**
- [ ] **Step 5: Commit**
```bash
git add src/test/safe-area-e2e.test.ts
git commit -m "feat(safe-area): complete State 31 Safe Area UX implementation and verification"
```
