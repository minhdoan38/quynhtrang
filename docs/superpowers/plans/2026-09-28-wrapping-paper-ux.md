# Wrapping Paper UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add A1/A2 wrapping-paper Pattern and Full Sheet modes, keeping source composition separate from generated repeat rendering.

**Architecture:** Extend the existing pure `DesignState` reducer instead of creating a second store. Store wrapping mode and `PatternConfig` in `productOptions`; source elements remain the only document objects. Add pure pattern geometry helpers and a CSS/canvas-independent render description consumed by the editor preview, export, and future mockup texture path. Add Pattern workspace UI around the existing `CustomizerShell`, `BottomNavigation`, `EditorSheets`, Add menu, Color sheet, history transactions, storage, and template filtering.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, existing Tailwind/shadcn primitives, Node test runner via `pnpm test`.

**Spec:** State 25 Wrapping Paper UX request supplied in chat on 2026-09-28.

## Global Constraints

- Wrapping Paper supports exactly `Lặp họa tiết` / Pattern Mode and `Toàn tờ` / Full Sheet Mode.
- Pattern Mode stores one source composition plus `PatternConfig`; generated copies MUST NOT enter layers, document JSON, autosave, history, or order snapshots.
- Customer copy MUST use `Lặp họa tiết`, `Toàn tờ`, `Chỉnh họa tiết`, `Xem toàn tờ`, `Kiểu lặp`, `Đều`, `So le dọc`, `So le ngang`, `Gương`, `Kích thước`, `Khoảng cách`, `Nền`.
- Customer UI MUST NOT expose tile, half-drop, half-brick, pattern-cell, repeat-matrix, DPI, PPI, or millimeter terminology.
- Templates define mode and compatible size; template selection MUST NOT ask for mode again.
- Pattern geometry uses product/design coordinates, deterministic bounds, edge overdraw, and final clipping.
- Full Sheet Mode MUST NOT show pattern controls and MUST use normal editor object editing.
- Pattern workspace toggling is UI state and MUST NOT create Undo history.
- Reuse existing Add menu, Color system, State 23 transaction model, quality language, autosave, and order flow.
- Explicit exclusions: random/procedural/AI repeats, custom matrices, arbitrary numeric spacing UI, copy-level editing, mode conversion, and heavy 3D.

## Already completed before execution

- Repository exploration identified `src/lib/product-state.ts`, `src/lib/history-transaction.ts`, `src/lib/storage.ts`, `src/lib/image-quality.ts`, `src/lib/order-types.ts`, `src/components/customizer/customizer-shell.tsx`, `product-setup.tsx`, `template-browser.tsx`, `bottom-navigation.tsx`, `editor-sheets.tsx`, and `design-canvas.tsx` as integration points.
- Next.js 16 client/App Router guidance read from `node_modules/next/dist/docs/`.
- Baseline `pnpm typecheck` passed with `tsc --noEmit`.
- No product code or tests have been changed yet.

## Execution order

### Task 1: Domain state and product/template contracts

**Files:** Modify `src/lib/product-state.ts`, `src/lib/storage.ts`, `src/lib/order-types.ts`; Test `src/test/wrapping-paper-state.test.ts`.

- Add `WrappingPaperMode`, `PatternWorkspaceView`, `PatternRepeatMode`, `PatternConfig`, and A1/A2 physical product metadata without changing customer-facing size labels.
- Normalize legacy wrapping options (`repeat`/`single`) into `pattern`/`full-sheet` at boundaries.
- Add discriminated template mode metadata and Pattern source/config payload support while preserving other products.
- Ensure `createInitialState('wrapping')` defaults to A1 and Pattern mode; `SET_TEMPLATE` applies the template’s declared mode/config.
- Test mode/config defaults, immutable updates, template mode routing, invalid repeat values, and no generated-copy fields.
- Run `pnpm test -- src/test/wrapping-paper-state.test.ts` (actual script runs all `src/test/*.test.ts`), then `pnpm typecheck`; expected exit 0.

### Task 2: Deterministic pattern geometry and render description

**Files:** Create `src/lib/pattern-renderer.ts`; Test `src/test/pattern-renderer.test.ts`.

- Implement pure helpers for Basic, Half-Drop, Half-Brick, and Mirror geometry in physical coordinates.
- Apply scale and unified spacing to `spacingX`/`spacingY`, normalize rotation, compute conservative overdraw bounds, and clip to A1/A2 surface bounds.
- Return generated cell transforms/render instructions only; never mutate or clone source `CanvasElement` objects into `DesignState`.
- Expose one render-description API for preview/export/mockup texture integration.
- Test repeat offsets, mirror transforms, rotation/zoom invariance, edge coverage, clipping, deterministic output, and source element count invariance.
- Run `pnpm test -- src/test/pattern-renderer.test.ts` and `pnpm typecheck`; expected exit 0.

### Task 3: Semantic pattern transactions, autosave, and serialization

**Files:** Modify `src/lib/history.ts`, `src/lib/history-transaction.ts`, `src/lib/use-design-history.ts`, `src/lib/storage.ts`, `src/lib/order-types.ts`; Test `src/test/wrapping-paper-history.test.ts`.

- Extend equality/history snapshots to include PatternConfig while excluding transient workspace view.
- Add semantic transaction labels for repeat, scale, spacing, background, and rotation.
- Keep live sheet/card previews outside history until commit; one slider gesture/tap session creates one entry; cancel restores baseline.
- Persist source + PatternConfig and make recent-project/order serialization reject or omit generated repeat copies.
- Test one-entry commits, cancel/Undo/Redo, reload round-trip, snapshot invariants, and no generated layers.
- Run `pnpm test -- src/test/wrapping-paper-history.test.ts`, `pnpm test`, and `pnpm typecheck`; expected exit 0.

### Task 4: Blank/template creation and mode routing

**Files:** Modify `src/components/customizer/product-setup.tsx`, `src/components/customizer/template-browser.tsx`, `src/components/customizer/customizer-shell.tsx`; Test `src/test/wrapping-paper-routing.test.ts` plus browser smoke.

- For blank wrapping projects, show A1/A2 and visual mode cards with exact Vietnamese copy.
- Route mode selection into fixed project state; do not offer casual post-edit mode switching.
- Filter incompatible templates and open template-defined mode directly.
- Emit `wrapping_mode_selected` and `wrapping_full_sheet_started` without artwork content.
- Test both blank modes, template mode bypass, A1/A2 propagation, and mode immutability after editing.
- Run `pnpm test`, `pnpm typecheck`, start `pnpm dev`, and exercise mobile browser flow; expected correct editor entry and no second mode prompt.

### Task 5: Pattern workspace and Full Sheet rendering integration

**Files:** Create `src/components/customizer/pattern-workspace-toggle.tsx`, `src/components/customizer/pattern-controls.tsx`; Modify `customizer-shell.tsx`, `bottom-navigation.tsx`, `editor-sheets.tsx`, `design-canvas.tsx`, `globals.css`; Test `src/test/wrapping-paper-workspace.test.ts` plus browser smoke.

- Add prominent `Chỉnh họa tiết` / `Xem toàn tờ` state toggle.
- Reuse standard editor/Add menu/Color/Layers in source edit view; show source elements only.
- Render full sheet through `pattern-renderer`; make repeated copies read-only/non-selectable.
- Add Pattern empty state and preserve standard Full Sheet empty state.
- Hide pattern controls in Full Sheet mode and keep normal selection/transform behavior.
- Keep one adaptive bottom toolbar; expose contextual `Họa tiết` entry only when appropriate.
- Test source edits updating preview, non-selectable generated copies, UI-toggle no history, and mode-specific controls.
- Run `pnpm typecheck`, `pnpm test`, `pnpm dev`, and mobile browser smoke at 390px width; expected no runtime errors.

### Task 6: Pattern property sheets, color reuse, analytics, and quality

**Files:** Modify `pattern-controls.tsx`, `editor-sheets.tsx`, `customizer-shell.tsx`, `image-quality.ts`, `design-canvas.tsx`; Test `src/test/wrapping-paper-controls.test.ts` plus browser/accessibility smoke.

- Add visual repeat cards, live preview, scale slider, spacing slider, background Color Property Sheet reuse, and secondary rotation presets/reset.
- Use physical motif scale for quality evaluation and recalculate only on relevant geometry/source commits or throttled live updates.
- Emit repeat/scale/spacing/full-sheet-view analytics with no artwork data.
- Verify exact customer copy, slider accessible names, selected states, and semantic history count.
- Run `pnpm test`, `pnpm typecheck`, and mobile browser/accessibility smoke; expected live updates, one history entry per gesture, and no technical terminology.

### Task 7: Export/order/mockup integration and final verification

**Files:** Modify existing preview/export/order modules found during implementation plus `src/lib/order-types.ts`; Test `src/test/wrapping-paper-output.test.ts` and browser smoke.

- Make preview, export, order snapshot, and future mockup texture call the same PatternConfig/render-description path.
- Ensure full printable/extended surface coverage and no generated objects in output payload.
- Verify quality changes after scale, source replacement, crop, and physical geometry changes.
- Run exact commands: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm dev`; exercise all 11 success criteria on mobile.
- Expected: all commands exit 0, no browser console/runtime errors, same geometry across preview/export/order, and no excluded feature present.

## Risks and edge-case checks

- Screen zoom MUST NOT alter physical repeat geometry; test same config at multiple viewport zoom values.
- Rotation, mirror, half-offset, and max spacing MUST overdraw beyond edges before clipping; test all four edges for A1/A2.
- Rendering MUST not allocate one React/Konva object per repeat; assert document element count and inspect render path.
- Live property previews MUST not pollute history; assert exact past-entry count.
- Template mode MUST be discriminated and routed directly; assert no mode selector after template apply.
- Full Sheet mode MUST not expose PatternConfig controls.
- Quality MUST use final motif physical scale, not source-editor visual size.
- Do not alter tests or verification assets to hide failures; fix production behavior.
