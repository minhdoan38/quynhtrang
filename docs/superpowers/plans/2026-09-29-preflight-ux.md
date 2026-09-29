# Preflight UX Implementation Plan (State 33)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement State 33 Preflight UX for mobile print customization editor: automated design quality checking before Checkout with 3 overall statuses (`Sẵn sàng`, `Cần kiểm tra`, `Cần sửa`), actionable issue cards, direct fix navigation to exact surface and element, and non-blocking warning progression.

**Architecture:** Extended Preflight data model (`product-state.ts`); full-screen redesigned review component (`editor-preflight-mode.tsx`); direct fix navigation handler in shell (`customizer-shell.tsx`); and automated tests verifying pass, warning, blocking, and fix-action routing.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS v4, Lucide icons, Node.js test runner via `pnpm test`.

**Spec:** `docs/superpowers/specs/2026-09-29-preflight-ux-design.md`

## Global Constraints
- Core principle: "Find problems automatically, explain them simply, and take the customer directly to the place that needs fixing."
- Customer language:
  - Header: `Kiểm tra thiết kế`
  - Pass: `Thiết kế đã sẵn sàng` - `Mọi thứ trông ổn để tiếp tục đặt hàng.`
  - Warning: `Có một vài chỗ cần kiểm tra` - `Bạn có thể sửa các chi tiết dưới đây hoặc vẫn tiếp tục nếu thấy ổn.`
  - Blocking: `Cần sửa trước khi tiếp tục` - `Vui lòng sửa các điểm dưới đây để đảm bảo chất lượng thành phẩm.`
  - Fix button: `Sửa`
  - Content reminder: `Kiểm tra lại chữ, tên, ngày tháng và thông tin quan trọng trước khi đặt in.`
  - Collapsed pass summary: `✓ N kiểm tra đã đạt tiêu chuẩn`
- Direct Fix navigation: tapping `[ Sửa ]` exits preflight, switches to the correct surface, selects the exact element, and displays contextual guides.
- Continuation logic:
  - `pass`: `Tiếp tục` enabled.
  - `warning`: `Tiếp tục đặt in` enabled (allows customer acknowledgement).
  - `error`/`blocking`: `Tiếp tục` disabled until blocking errors are resolved.
- All tasks must pass `pnpm test` and `pnpm typecheck`.

---

### Task 1: Enhance Preflight Data Model & Categories (`src/lib/product-state.ts`)

**Files:**
- Modify: `src/lib/product-state.ts`
- Create: `src/test/preflight-model.test.ts`

**Interfaces:**
```ts
export type PreflightSeverity = 'pass' | 'warning' | 'error';
export type PreflightCategory = 'image' | 'safe-area' | 'sticker' | 'notebook' | 'card' | 'general';

export interface PreflightCheck {
  id: string;
  level: PreflightSeverity;
  label: string;
  type?: PreflightSeverity;
  category?: PreflightCategory;
  description?: string;
  advice?: string;
  elementId?: string;
  surfaceId?: string;
  canContinue?: boolean;
}

export interface PreflightResult {
  level: PreflightSeverity;
  checks: PreflightCheck[];
  hasErrors: boolean;
  hasWarnings: boolean;
  passCount: number;
  warningCount: number;
  errorCount: number;
}
```

- [ ] **Step 1: Write test for enhanced PreflightResult**
Create `src/test/preflight-model.test.ts` testing:
- `getPreflight` returns counts: `passCount`, `warningCount`, `errorCount`, `hasErrors`, `hasWarnings`.
- Checks include `category` and correct severity mappings.
- Backward compatibility with existing tests.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Update `src/lib/product-state.ts`**
Enrich `PreflightResult` calculation and assign categories to all checks.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/product-state.ts src/test/preflight-model.test.ts
git commit -m "feat(preflight): enhance PreflightCheck and PreflightResult data model with counts and categories"
```

---

### Task 2: Redesign Preflight Screen Component (`src/components/customizer/editor-preflight-mode.tsx`)

**Files:**
- Modify: `src/components/customizer/editor-preflight-mode.tsx`
- Create: `src/test/preflight-screen.test.ts`

**Interfaces:**
```tsx
export interface EditorPreflightModeProps {
  state: DesignState;
  summary: DesignSummary;
  preflight: PreflightResult;
  onBackToEdit: () => void;
  onFix?: (check: PreflightCheck) => void;
  onContinueToCheckout: () => void;
}
```

- [ ] **Step 1: Write test for EditorPreflightMode**
Create `src/test/preflight-screen.test.ts` testing:
- Renders `Thiết kế đã sẵn sàng` when `preflight.level === 'pass'`.
- Renders `Có một vài chỗ cần kiểm tra` when warnings exist.
- Renders `Cần sửa trước khi tiếp tục` and disables `Tiếp tục` when errors exist.
- Renders `Sửa` button for actionable checks and calls `onFix(check)`.
- Renders collapsed pass summary `✓ N kiểm tra đã đạt tiêu chuẩn`.
- Renders content reminder notice.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Implement redesigned `editor-preflight-mode.tsx`**
Implement the component following State 33 design spec.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/editor-preflight-mode.tsx src/test/preflight-screen.test.ts
git commit -m "feat(preflight): redesign EditorPreflightMode with 3 statuses, actionable issue cards, and pass summaries"
```

---

### Task 3: Direct Fix Navigation in Shell (`src/components/customizer/customizer-shell.tsx`)

**Files:**
- Modify: `src/components/customizer/customizer-shell.tsx`
- Create: `src/test/preflight-direct-fix.test.ts`

**Requirements:**
- Implement `handlePreflightFix(check: PreflightCheck)`:
  1. Set `overlayMode = null`.
  2. If `check.surfaceId && state.productId === 'card'`: set `activeCardSurface = check.surfaceId as CardSurface`.
  3. If `check.elementId`:
     - Set `selectedElementId = check.elementId`.
     - Find element in `state.elements`, set `selectedTarget = element.type`.
  4. If `check.category === 'safe-area'`: set `showSafeAreaGuide = true`.
  5. If `check.id === 'sticker-contour'`: open `sticker-border` sheet so user can adjust border width or artwork.
- Pass `onFix={handlePreflightFix}` to `<EditorPreflightMode ... />`.

- [ ] **Step 1: Write test for Direct Fix Navigation**
Create `src/test/preflight-direct-fix.test.ts` testing:
- Calling fix on a Card Inside check switches surface to `inside` and selects target element.
- Calling fix on a safe area check enables safe area guide.
- Calling fix on a sticker contour check triggers sticker border context.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Update `src/components/customizer/customizer-shell.tsx`**
Wire `handlePreflightFix` and pass to `EditorPreflightMode`.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/customizer/customizer-shell.tsx src/test/preflight-direct-fix.test.ts
git commit -m "feat(preflight): implement direct fix navigation to exact surface, element, and contextual guides"
```

---

### Task 4: Full Verification & E2E Validation (`src/test/preflight-e2e.test.ts`)

**Files:**
- Create: `src/test/preflight-e2e.test.ts`

**Requirements:**
- Test all 10 success criteria from State 33:
  1. Entry via `Xong` opens Preflight.
  2. Clear understanding of design readiness (Pass / Warning / Blocking).
  3. Product-specific checks (no card fold checks on notebook, no sticker contour checks on wrapping).
  4. Vietnamese non-technical messages.
  5. Tap `Sửa` on issue card.
  6. Return directly to the exact object and surface.
  7. Modifying element resolves issue.
  8. Re-entering Preflight reflects resolved status.
  9. Allow continuation with non-blocking warnings (`Tiếp tục đặt in`).
  10. Proceed to Checkout confidently.
- Run `pnpm test`, `pnpm typecheck`, `pnpm build`.

- [ ] **Step 1: Write `src/test/preflight-e2e.test.ts`**
- [ ] **Step 2: Run `pnpm test` (all tests pass)**
- [ ] **Step 3: Run `pnpm typecheck` (tsc --noEmit passes)**
- [ ] **Step 4: Run `pnpm build` (production build succeeds)**
- [ ] **Step 5: Commit**
```bash
git add src/test/preflight-e2e.test.ts
git commit -m "feat(preflight): complete State 33 Preflight UX implementation and verification"
```
