# Product Preview Mode UX Implementation Plan (State 32)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement State 32 Product Preview Mode UX for mobile print customization editor: full-screen product-aware preview removing all editing chrome and presenting realistic product mockups for Wrapping Paper, Card, Sticker, and Notebook.

**Architecture:** Shared full-screen preview shell (`preview-shell.tsx`) with product-specific renderers (`wrapping-preview.tsx`, `card-preview.tsx`, `sticker-preview.tsx`, `notebook-preview.tsx`); contextual view switcher (`Tờ giấy`/`Hộp quà`, `Đóng`/`Mở`/`Mặt sau`); clean neutral background; read-only interaction; and seamless connection to Preflight via `Xong`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS v4, Lucide icons, Node.js test runner via `pnpm test`.

**Spec:** `docs/superpowers/specs/2026-09-29-product-preview-ux-design.md`

## Global Constraints
- Core principle: "Editor shows the design. Preview shows the product."
- Preview is 100% read-only: no selection handles, bounding boxes, safe area guides, dashed fold guides, quality badges, or toolbars.
- Customer terminology:
  - Universal entry action: `Xem thử`
  - Bottom actions: `Tiếp tục chỉnh` (returns to editor) and `Xong` (advances to Preflight)
  - Wrapping paper views: `Tờ giấy` and `Hộp quà`
  - Card views: `Đóng`, `Mở`, `Mặt sau`
- Context-sensitive defaults: editing Card Inside opens to `Mở`; editing Front opens to `Đóng`.
- Ephemeral UI state: opening, zooming, or changing preview view does NOT generate Undo history or mutate autosave.
- All tasks must pass `pnpm test` and `pnpm typecheck`.

---

### Task 1: Shared Preview Shell Component & Types (`src/components/customizer/preview/preview-shell.tsx`)

**Files:**
- Create: `src/components/customizer/preview/preview-types.ts`
- Create: `src/components/customizer/preview/preview-shell.tsx`
- Create: `src/test/preview-shell.test.ts`

**Interfaces:**
```ts
export type PreviewViewId = 'flat' | 'box' | 'card-closed' | 'card-open' | 'card-back' | 'sticker' | 'notebook';

export interface PreviewViewOption {
  id: PreviewViewId;
  label: string;
}

export interface PreviewShellProps {
  productTitle: string;
  variantTitle?: string;
  activeView: PreviewViewId;
  availableViews?: PreviewViewOption[];
  onViewChange?: (view: PreviewViewId) => void;
  onBackToEdit: () => void;
  onDoneToPreflight: () => void;
  children: React.ReactNode;
}
```

- [ ] **Step 1: Write test for PreviewShell**
Create `src/test/preview-shell.test.ts` testing:
- Renders minimal header with `← Xem thử` and product/variant title.
- Renders segmented view switcher when multiple views are provided.
- Renders bottom action buttons `Tiếp tục chỉnh` and `Xong`.
- Clicking `onBackToEdit` and `onDoneToPreflight` triggers corresponding callbacks.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL due to missing files.

- [ ] **Step 3: Implement `preview-types.ts` and `preview-shell.tsx`**
Create the components with Tailwind styling, clean neutral `#F8F3E8` background, and mobile-first responsive layout.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/preview/preview-types.ts src/components/customizer/preview/preview-shell.tsx src/test/preview-shell.test.ts
git commit -m "feat(preview): implement shared PreviewShell and view types"
```

---

### Task 2: Wrapping Paper Mockup Renderer (`src/components/customizer/preview/wrapping-preview.tsx`)

**Files:**
- Create: `src/components/customizer/preview/wrapping-preview.tsx`
- Create: `src/test/wrapping-preview.test.ts`

**Requirements:**
- Supports 2 view modes: `flat` (`Tờ giấy`) and `box` (`Hộp quà`).
- `flat` mode:
  - Pattern Mode: renders deterministic repeat matrix from `computePatternGrid` with actual repeat mode, scale, spacing, rotation, and background color.
  - Full Sheet Mode: renders full-sheet design.
- `box` mode:
  - Renders 3D wrapped gift box mockup using CSS 3D perspective (`rotateX(15deg) rotateY(-25deg)`).
  - Front, Top, and Right faces mapped with the actual pattern/design texture and realistic shading.
- Read-only: no selection handles or editor guides.

- [ ] **Step 1: Write test for WrappingPreview**
Create `src/test/wrapping-preview.test.ts` testing:
- Renders flat view with repeat grid in pattern mode.
- Renders 3D gift box container with box faces in box mode.
- Does not render editor selection or dashed guides.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Implement `wrapping-preview.tsx`**
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/preview/wrapping-preview.tsx src/test/wrapping-preview.test.ts
git commit -m "feat(preview): implement wrapping paper flat sheet and gift box mockup renderer"
```

---

### Task 3: Card Mockup Renderer (`src/components/customizer/preview/card-preview.tsx`)

**Files:**
- Create: `src/components/customizer/preview/card-preview.tsx`
- Create: `src/test/card-preview.test.ts`

**Requirements:**
- Supports 3 view modes: `card-closed` (`Đóng`), `card-open` (`Mở`), `card-back` (`Mặt sau`).
- `card-closed`:
  - Front cover panel in paper perspective with subtle right-edge page shadow.
- `card-open`:
  - Full two-page spread (Inside) with a soft vertical crease/gradient shadow along the center fold instead of a dashed editor guide.
- `card-back`:
  - Back cover panel preview.
- Read-only: no bounding boxes, selection handles, or editor guides.

- [ ] **Step 1: Write test for CardPreview**
Create `src/test/card-preview.test.ts` testing:
- Switching between `card-closed`, `card-open`, and `card-back` renders respective surfaces.
- In `card-open`, renders soft center crease gradient without dashed editor lines.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Implement `card-preview.tsx`**
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/preview/card-preview.tsx src/test/card-preview.test.ts
git commit -m "feat(preview): implement card closed, open spread, and back mockup renderer"
```

---

### Task 4: Sticker & Notebook Mockup Renderers (`src/components/customizer/preview/sticker-preview.tsx` & `src/components/customizer/preview/notebook-preview.tsx`)

**Files:**
- Create: `src/components/customizer/preview/sticker-preview.tsx`
- Create: `src/components/customizer/preview/notebook-preview.tsx`
- Create: `src/test/sticker-notebook-preview.test.ts`

**Requirements:**
1. `sticker-preview.tsx`:
   - Die-cut: renders generated contour silhouette with white sticker border and soft drop shadow; suppresses technical cutlines (`showCutline: false`).
   - Fixed-shape: clips precisely to physical shape (circle, square, rectangle, oval, rounded-rectangle).
2. `notebook-preview.tsx`:
   - Renders A5 front cover artwork mapped onto a physical notebook mockup with realistic binding on the left edge, subtle paper page depth, and soft shadow.
   - Suppresses the dashed editor binding line.

- [ ] **Step 1: Write test for Sticker and Notebook preview**
Create `src/test/sticker-notebook-preview.test.ts` testing:
- Sticker die-cut renders white border and shadow without cutline guide.
- Sticker fixed-shape renders exact shape clipping.
- Notebook cover renders physical binding and page depth without dashed binding line.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Implement `sticker-preview.tsx` and `notebook-preview.tsx`**
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/preview/sticker-preview.tsx src/components/customizer/preview/notebook-preview.tsx src/test/sticker-notebook-preview.test.ts
git commit -m "feat(preview): implement realistic sticker and notebook mockup renderers"
```

---

### Task 5: Integration into `editor-preview-mode.tsx` & `customizer-shell.tsx`

**Files:**
- Modify: `src/components/customizer/editor-preview-mode.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Create: `src/test/preview-mode-integration.test.ts`

**Requirements:**
- In `editor-preview-mode.tsx`:
  - Uses `PreviewShell` as the outer container.
  - Dynamically routes to `WrappingPreview`, `CardPreview`, `StickerPreview`, or `NotebookPreview` based on `state.productId`.
  - Determines context-sensitive initial view:
    - Card: if `state.productOptions.surface === 'inside'` -> starts at `card-open`; else `card-closed`.
    - Wrapping paper: starts at `box` (or `flat`).
  - Wire `onBackToEdit` and `onDoneToPreflight`.
- In `customizer-shell.tsx`:
  - Pass current surface / options cleanly to `EditorPreviewMode`.
  - Verify browser back / cancel returns cleanly to editor without altering design state or selection history.

- [ ] **Step 1: Write test for integration**
Create `src/test/preview-mode-integration.test.ts` testing:
- Product routing in `EditorPreviewMode`.
- Context-sensitive default view for card inside surface.
- Actions `onBackToEdit` and `onDoneToPreflight`.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Update `editor-preview-mode.tsx` and `customizer-shell.tsx`**
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/editor-preview-mode.tsx src/components/customizer/customizer-shell.tsx src/test/preview-mode-integration.test.ts
git commit -m "feat(preview): integrate product-specific preview renderers into full-screen preview mode"
```

---

### Task 6: Full Verification & E2E Validation

**Files:**
- Create: `src/test/product-preview-e2e.test.ts`

**Requirements:**
- Verify all 10 success criteria from State 32:
  1. Universal entry via `Xem thử`.
  2. Immediate full-screen presentation without editor chrome or guides.
  3. Physical product shape context across all products.
  4. Wrapping paper on gift box mockup.
  5. Card closed and open spread inspection with center fold crease.
  6. Die-cut sticker silhouette and white border without technical cutlines.
  7. Fixed-shape sticker exact shape clipping.
  8. Notebook cover with physical binding mockup.
  9. Single-tap return to editing with state preserved (`Tiếp tục chỉnh`).
  10. Single-tap continuation to Preflight (`Xong`).
- Run `pnpm test`, `pnpm typecheck`, `pnpm build`.

- [ ] **Step 1: Write `src/test/product-preview-e2e.test.ts`**
- [ ] **Step 2: Run `pnpm test` (all tests pass)**
- [ ] **Step 3: Run `pnpm typecheck` (tsc --noEmit passes)**
- [ ] **Step 4: Run `pnpm build` (production build succeeds)**
- [ ] **Step 5: Commit**
```bash
git add src/test/product-preview-e2e.test.ts
git commit -m "feat(preview): complete State 32 Product Preview Mode UX implementation and verification"
```
