# State 46: Accessibility — WCAG 2.2 AA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document is a plan, not authorization to implement.

**Goal:** Make customer and Admin surfaces meaningfully operable and understandable with keyboard, assistive technology, touch/pointer alternatives, zoom and accessible visual presentation, targeting WCAG 2.2 Level AA.

**Architecture:** Canvas, Layers, keyboard commands and property controls share `DesignState`, `CanvasElement`, selection IDs and `useDesignHistory`. Layers are the primary interactive semantic interface; Canvas gets one document entry point, not a second accessibility editor or pixel mirror. Existing geometry is inconsistent: text/image live rendering uses pixel transforms while `DocumentRenderSurface` consumes canonical element frames. Task 4 must reconcile those paths before numeric controls ship. Reuse installed Base UI primitives; no second widget framework.

**Tech Stack:** Next.js 16.3.6 App Router, React 19.3, TypeScript 7, @base-ui/react (Base UI), shadcn base-nova style, Tailwind CSS v4, GSAP 3.15/`@gsap/react`, Playwright 1.63, @axe-core/playwright 4.13, Node built-in test runner, pnpm 12.6.

**Spec:** User-provided State 46 requirements; 200-item specification in task request; repository references `docs/superpowers/plans/2026-10-06-state-45-release-hardening.md`.

## Global Constraints

- WCAG 2.2 Level AA target. Do NOT claim formal conformance merely because automated checks pass.
- Do NOT redesign Editor interactions, Checkout steps, payment rules, production lifecycle, Template lifecycle, or Product pricing model.
- Do NOT implement full PWA, offline Supabase mirror, AI alt-text, speech-to-design, Braille-specific authoring, alternate high-contrast theme, full performance rewrite, or formal third-party accessibility certification.
- Do NOT create hundreds of invisible DOM buttons mirroring Canvas pixels. Use Layers + property controls as the accessible document interface.
- Pointer workflows MUST remain unchanged. Accessibility adds equivalent paths, never removes direct manipulation.
- Guest editing remains local-first. Authenticated projects remain Supabase-canonical. All State 45 reliability/recovery contracts preserved.
- Base UI uses `render` prop for composition (not `asChild`). shadcn components use `@base-ui/react` primitives.
- Vietnamese UI copy throughout; `lang="vi"` on `<html>`. Do NOT ship English `aria-label`s in Vietnamese product.
- All State 01-45 tests MUST remain green. typecheck, lint, build MUST pass.
- Coordinate units follow document rendering: percentage units for card, sticker, notebook and wrapping motifs; wrapping full-sheet uses dimensions from `getWrappingPaperDimensions`. Never blindly apply percentage deltas to every product. Task 4 owns conversion; pointer, keyboard, property controls, preview and serialization use identical frames.
- Planning-time registry evidence: `eslint-plugin-jsx-a11y@6.10.2` declares ESLint peer `^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9`, while this project uses ESLint 10.12.0. Retain existing lint; do not force an unsupported peer or downgrade ESLint. Axe is runtime scanning, not lint. Add JSX accessibility rules only after a compatible plugin release is verified; no custom lint framework.

---

**Reading order:** interaction inventory below → repository evidence/risk/drag matrix → shared architecture → numbered tasks → execution contracts (§10), per-task verification (§11), manual signoff (§12), requirement traceability (§13). Inventory is complete planning input; no implementation performed.

## Accessibility Interaction Inventory — first deliverable

This supplements §4 with every requested interaction column. `N` = native Tab/Enter (Space for buttons), `D` = default DOM focus/no explicit restoration, `B` = Base UI focus lifecycle subject to caller validation, `none` = no local live announcement found, `src` = source observation, `live` = planning browser observation. Target dimensions are CSS class intent unless marked live; rounded/transformed effective hit regions and spacing must still be measured. An undersized raw box is a finding to assess, not automatic WCAG failure. Repeated same-native controls are grouped; distinct behaviors remain separate rows.

| ID / exact file (prefix resolved below) | Interaction / pointer | Keyboard | Focus | Accessible name / role / state-value | Announcement | Drag | Target size | Modal/popover |
|---|---|---|---|---|---|---|---|---|
| C01 `src/components/layout/customer-nav-header.tsx:43-98` links/logout | click/submit | N | D, active link lacks current | text links/button; nav label/current absent | none | no | text/padding-dependent | none |
| C02 `products/products-catalog-view.tsx:76-165` cards/back | navigate | N | focus rings present | named Link, headings | route announcement | no | card large/back compact | none |
| C03 `products/product-detail-catalog-view.tsx:156-215` variant/mood/search | ToggleGroup/filter/type | N, Base UI toggle | D | variant group; mood pressed; search | count silent | no | chips h-8; clear compact | none |
| C04 same `:325-380` template card/blank | open preview/start | Enter/Space custom card | D | role button with card heading flattened | loading silent | no | full card | B preview |
| C05 `products/responsive-template-preview.tsx:112-383` surfaces/apply/close | select view/clone | N; no tab arrow model | B, imperative trigger restoration unverified | Title/Description present; surface current state absent | loading silent | drawer swipe + close | tabs about 24px; close32; apply44+ | desktop Dialog/mobile Drawer |
| E01 `customizer/product-launcher.tsx` recent/product | click start/reopen | N | focus CSS | named product buttons/recent entry | none | no | large card | none |
| E02 `customizer/product-setup.tsx:175-265` variant/template/blank/mode | select/start | custom Enter/Space + radios | D | cards role button; variant radios; mode dialog role | none | no | large cards | custom wrapping mode dialog |
| E03 `customizer/template-browser.tsx` search/mood/card/back | filter/preview/apply | buttons/inputs | D | text controls; query/result context needs review | none | no authored drag | card/chips | preview Dialog |
| E04 `customizer/customizer-shell.tsx:2198-2284` back/history | click undo/redo | N + shortcut hook | ring present | Vietnamese names, disabled states | structural Undo toast only | no | w-9 h-9 | none |
| E05 `customizer/design-canvas.tsx:764-776` workspace | clear selection/pan | no named entry | not focusable | div, no context name | none | pan/pinch | spatial area | none |
| E06 same `:855-899,1049-1077,1258-1275` image/sticker/text | select/drag/double tap | tabindex0 but no activation | focusable dead controls (live text Enter no edit) | button names; selected/lock semantics incomplete | none | move/resize | variable artwork | none |
| E07 same `:1105-1140` group | select/double-click enter | no activation handler | tabindex0 | group button name, no child count | none | group actions | variable bounds | none |
| E08 `customizer/selection-overlay.tsx:81-160` handles | rotate/resize | tabindex0, no handler | focus style absent | named button roles, angle visual | none | yes | w11/h11; live boxes ~43–45px under transform | overlay on artwork |
| E09 same quality/safe-area badge | open explanation | incomplete custom button | D | quality name; safety role status | polite safety badge | no | compact text badge | quality Drawer |
| E10 `customizer/bottom-navigation.tsx:49-456` main/context tools | add/layers/preview/properties/more | native buttons, no toolbar roving | replacement may remove focused trigger [INFERENCE] | visible names, some icon aria-label | no mode status | no | min44×48 | opens sheets |
| E11 `customizer/layers-sheet-content.tsx:281-340` rows | select | none | unfocusable | plain div; name text, state visual | none | handle reorder | row >44px | unnamed parent Drawer live |
| E12 same `:304-331` drag/expand | reorder/expand | drag false-button; expander N | D | drag name, expander label but no expanded | none | yes | handle24; expander about18 | Drawer |
| E13 same header/multi/customerLock | toggle mode/lock | N | D | mode text, lock icon; state incomplete | none | no | mode about26; close32 | Drawer |
| E14 `customizer/editor-sheets.tsx:240-258` detents/close | swipe | Escape via Base UI/shell | B; return trigger not explicit | some branches lack DrawerTitle | none | snap detents | handle full width; close branch-specific | modal Drawer |
| E15 same `:480-544` opacity/font-size | range drag/track | native range arrows | D | numeric value in heading; label association verify | none | range | track variable | Drawer |
| E16 same More/alignment | duplicate/delete/lock/reorder/align | N | D | visible names; pressed alignment missing where custom | toast for some actions | no | row buttons | Drawer |
| E17 `customizer/text-edit-overlay.tsx:30-78` text/Done | type/commit/backdrop | native text + CtrlEnter; shell Escape | auto textarea; no Base UI trap | textarea named `Nội dung chữ` live | none | no | Done min44 | custom overlay |
| E18 `customizer/font-browser-sheet.tsx:184-232` query/category/font/face | type/select/load | buttons option role without full listbox keys | selected row scroll | listbox/option + selected; search label audit | load/apply silent | no | font row58+ | Drawer |
| E19 `customizer/add-content-sheet.tsx:198-410` image/text/shape/sticker/search | open subflow/insert | N | back-to-tile not restored | factual sticker labels mostly available; filter pressed gaps | insertion toast shell | no | tiles50+ | Drawer content swaps |
| E20 `customizer/image-source-chooser.tsx`, `upload-control.tsx` upload/replace | file chooser | native trigger/file chooser | returns to trigger | text button; hidden input | shell upload toast | no | button/tile | OS chooser, sheet |
| E21 `customizer/crop-focus-mode.tsx:61-128,154-237` pan/pinch/reset/cancel/done | gesture/apply | only buttons N | no modal lifecycle | header text; frame no role | visual hint | yes | frame large/buttons compact | fixed overlay |
| E22 `customizer/background-refine-overlay.tsx:77-124,238-257` brush/mode/size/compare | draw/hold | mode buttons N, compare pointer hold | no complete modal management | dialog label exists; brush value label gap | none | strokes, hold | compare36px | fixed dialog-role overlay |
| E23 `customizer/color-picker-sheet.tsx:140-395` type/stop/swatches/hex/native color | choose/type | buttons/inputs | D | title swatches, pressed gaps; hex unlabeled | errors unlinked | native picker only | swatches32 with gap8 | Drawer |
| E24 `customizer/mask-sheet-content.tsx:37-90` mask choices | choose | N | D | visible text, selected state absent | none | no | tiles88+ | Drawer |
| E25 `customizer/sticker-border-sheet.tsx:79-125` border switch/width/contour | toggle/range | N/range arrows | D | switch checked + label/range | contour role status | range | switch44×24 | Drawer |
| E26 `customizer/pattern-controls-sheet.tsx:84-220` repeat/scale/spacing/rotation/reset | choose/range | custom radios lack arrows, ranges work | D | radio checked, range labels | none | ranges | tiles44+, tracks | Drawer |
| E27 `customizer/card-surface-switcher.tsx:24-44`, `pattern-workspace-toggle.tsx:17-38` | switch panel | inactive tabs -1, no arrows | active only reachable | tablist/tab selected | none | no | min-height36 | none |
| E28 `customizer/image-quality-sheet.tsx:48-120` reduce/replace/close | action | N | nested Drawer risk | header/status/action names | no dedicated status | no | actions40+ | nested Drawer |
| E29 `customizer/product-controls.tsx:24-215` native options/sliders | edit | native | D | most labels present; Slider thumb label verify | character counter text | ranges | variable | panel |
| E30 `customizer/preview/preview-shell.tsx` and four product preview files | switch surface/view/close | N | full-screen entry/return incomplete | pressed view buttons, no complete dialog | none | gestures not only view path | actions40/44 | full-screen |
| E31 `customizer/editor-preflight-mode.tsx:85-205`, `preflight-panel.tsx:28-55` | acknowledge/fix/continue | mode buttons N; legacy panel div fix inaccessible | D | headings/articles; legacy clickable div | no concise completion status | no | h11 mode actions | full-screen/panel |
| E32 `customizer/template-author-controls.tsx`, `template-customer-preview.tsx` | lock/placeholder/preview | native controls | disappearing mode focus risk | lock/placeholder semantic data exists | mode silent | no | control-specific | preview mode |
| C06 `checkout/quantity-stepper.tsx:61-97` +/-/quantity | type/step | N | input border change only | label + invalid, error unlinked | none | no | buttons44; input44h | none |
| C07 `checkout/customer-information-form.tsx:105-300` name/phone/address/retry/submit | type/submit | native/IME aware | first invalid focused | labels/autocomplete/required/invalid/described errors present | multiple alerts | no |44h/textarea min44 | none |
| C08 `src/app/checkout/page.tsx` wizard/back/quote/submit | advance/back | N | no new-step focus | main/header/footer; duplicate submit | quote/step status gaps | no | actions44/back40 | preview child |
| C09 `checkout/order-summary-card.tsx:118-208` thumbnail/edit | preview/edit | custom Enter/Space | D | thumbnail title; edit text | none | no | thumb96; edit text | preview |
| C10 `checkout/payment-qr-panel.tsx:125-275` copy/manual/retry/report/later | click | N | D | QR alt, manual expanded; missing controls link | copy transient text only | no | actions44; copy22+ | disclosure |
| C11 `checkout/order-confirmation-panel.tsx:87-210` copy/account/new | click | N | D | public code copy named | copy silent | no | primary44/copy22 | account Dialog |
| C12 `src/app/login/page.tsx:101-185` email/OTP/change | type/paste/submit | native; plain 6 digits paste possible | autofocus | visible labels; OTP hints and linked errors absent | errors plain p | no | primary44/email input; change compact | none |
| C13 `checkout/account-save-dialog.tsx:170-360` email/OTP/migration/retry | authenticate/claim | native | B + autofocus steps | Title changes; busy phase naming check | progress/error largely silent | no | primary44 | Dialog |
| C14 `customer/my-designs-list.tsx:43-125`, `customer/customer-order-card.tsx:70-120` | open project/order | Link>Button nesting | D | generic action name; no list semantics | none | no | h9 action | none |
| C15 `customer/customer-order-detail-view.tsx:57-158`, `src/app/order/[id]/page.tsx` | back/read/new | N | D | headings present; visual design no summary | none | no | text link/44 buttons | none |
| A01 `src/app/admin/layout.tsx:55-100`, `content/layout.tsx:28-48` | navigate/logout | N | D | nav/current gaps | none | no |28–30px links | none |
| A02 `src/app/admin/login/page.tsx:75-120` | input/submit | native | input ring | labels/alert present | alert | no |44h | none |
| A03 `admin/orders-inbox.tsx:78-195` view/pagination | filter/page | N but false tab arrows absent | low-opacity ring | tab selected/panel link absent; buttons disabled | no results status | no |32h | none |
| A04 `admin/order-filters.tsx:83-250` query/clear/product/payment/date | type/menu | Base UI Menu arrows | B menu/D query | search placeholder-only, menu selected state absent | none | no |query36; clear18 | DropdownMenu |
| A05 `admin/order-row.tsx:55-207`, `order-more-menu.tsx:22-48` | open/more/hold | N/B | ring/menu restore | Link composite name, More named | none | no |row60+/more36 | Menu |
| A06 `src/app/admin/orders/[id]/order-detail-client.tsx:323-406`, `admin/order-payment-card.tsx` | confirm/hold/release | N/B | safe initial/trigger unverified | Dialog titles, hold textarea label | errors some native alert | no |36–44 | AlertDialog/Dialog |
| A07 `admin/order-fulfillment-dialogs.tsx:24-144`, `order-next-action-card.tsx`, `order-hold-banner.tsx` | start/complete/release/navigation | N/B | B | target/version text present | pending/error review | no |40–44 | Dialog |
| A08 `admin/order-summary-sections.tsx:87-106`, `order-activity-timeline.tsx:88-106` | copy/load-more | N | D | copy named, load button text | copy/error no live | no |32/36 | none |
| A09 `admin/order-design-card.tsx:107-135`, `design-review.tsx:70-108`, `approved-design-inspector.tsx` | disclosure/version/edit/download | N | select outline removed | version unlabeled; disclosure state incomplete; artifact purpose verify | none | no |24–36 | revision dialogs |
| A10 `admin/design-compare.tsx:133-305` before/after/warnings/approve | choose/acknowledge | N | B confirmation | view state/warning checked absent | none | no |28–44 | Dialog |
| A11 `admin/design-revision-dialogs.tsx:24-285` create/discard/takeover/conflict | form/recovery | N; conflict Escape ignored | B trap, backup/reload buttons reachable | titles present; conflict controlled without close callback | none | no |44 | Dialog (not proven hard trap) |
| A12 `admin/library-stickers.tsx:366-785` filters/card/bulk/upload/edit/archive/publish | filter/open/mutate | card no keyboard; fields N | B dialogs | filters lack labels, card div no role, status text | success status some paths | no |36 filters/large card | Dialogs |
| A13 `admin/library-fonts.tsx:158-370` filters/family/new | type/navigate/create | N | outline removed on selects | selects unlabeled, repeat detail link | none | no |36 filter; text links | Dialog |
| A14 `admin/library-font-detail.tsx:535-720` face upload/license/edit/publish/archive | file/checkbox/actions | native | B | wrapped checkbox label valid; family/face headings | validation receipt dialog | no |native checkbox + label; actions32+ | Dialog |
| A15 `admin/template-library.tsx:398-655` status/filter/card/new/source | click/query/create | card unfocusable | D/B create | status selected missing; filter labels missing | none | no |44 status/36 filters/card large | Dialog |
| A16 `admin/template-detail.tsx:410-475,775-930` edit/duplicate/archive/republish/delete | click | N | B | named actions/titles | receipts/errors review | no |44 actions | Dialogs |
| A17 `admin/template-author-client.tsx:347-460` conflict/publish/blocker | reload/publish/jump | N | mode/trigger restoration incomplete | conflict alert; blocker button | alert | no |32/44 | Publish Dialog |
| A18 `admin/product-catalog.tsx`, `product-detail.tsx`, `product-lifecycle-dialogs.tsx` | nav/edit/lifecycle | native | focus/current mostly present | fields labels,busy,status | status/error | no |min44 | Dialog |
| A19 `admin/commercial-config-editor.tsx:110-150`, `commercial-preview.tsx:15-30` | tier/rule/quote/save/publish | native fields/radios | D/B | fieldset/legend/numeric labels, dl | alert/live price | no manual drag order |min44 | Publish Dialog |

Prefix rule for rows without `src/`: `products/`, `customizer/`, `checkout/`, `customer/`, `admin/` resolve under `src/components/`. The `content/layout.tsx` row resolves `src/app/admin/content/layout.tsx`. This is current inventory, not a list of proposed new components. Sizes/announcements marked source need actual AT/geometry verification during execution.

## 1. Repository Architecture Summary

Verified during planning inspection:

### Route structure
- Customer routes: `src/app/page.tsx` (launcher/editor), `src/app/products/`, `src/app/checkout/page.tsx`, `src/app/login/page.tsx`, `src/app/my-designs/`, `src/app/my-orders/`, `src/app/order/[id]/`.
- Admin routes: `src/app/admin/layout.tsx`, `src/app/admin/orders/`, `src/app/admin/products/`, `src/app/admin/content/` (templates/stickers/fonts), `src/app/admin/login/`.
- Root layout: `src/app/layout.tsx` sets `<html lang="vi">`, loads Lora/Be Vietnam Pro fonts, no skip-link, no `<main id>`.
- Route error boundaries: `src/app/checkout/error.tsx`, `src/app/my-designs/error.tsx`, `src/app/my-orders/error.tsx`, `src/app/global-error.tsx`.

### UI primitives
- shadcn base-nova style over `@base-ui/react`: `dialog.tsx`, `drawer.tsx`, `alert-dialog.tsx`, `dropdown-menu.tsx`, `button.tsx`, `slider.tsx`, `toggle-group.tsx`, `radio-group.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `badge.tsx`, `card.tsx`, `separator.tsx`, `skeleton.tsx`, `collapsible.tsx`, `aspect-ratio.tsx`.
- Base UI installed but NOT yet used as shadcn components: `@base-ui/react/tabs`, `@base-ui/react/toolbar`, `@base-ui/react/field`.
- Button default height: `h-8` (32px). `icon` size: `size-8`. `icon-sm`: `size-7`. Design system `h-11` (44px) used for primary actions.
- Focus ring: `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` in `buttonVariants`. Global CSS `* { @apply border-border outline-ring/50; }`.

### Editor architecture
- Shell: `src/components/customizer/customizer-shell.tsx` (2963 lines). State via `useDesignHistory` + `useReducer(transitionState)`.
- Canvas: `src/components/customizer/design-canvas.tsx` (1295 lines). HTML/CSS elements with pointer gesture tracking. Elements have `role="button"`, `tabIndex={0}`, `aria-label`.
- Selection: `src/components/customizer/selection-overlay.tsx`. Handles have `role="button"`, `tabIndex={0}`, `aria-label` but NO `onKeyDown`.
- Layers: `src/components/customizer/layers-sheet-content.tsx`. Layer rows are plain `div` with `onClick`, no role/tabIndex. Drag handle is `role="button"` but drag-only reorder.
- Bottom toolbar: `src/components/customizer/bottom-navigation.tsx`. Main + contextual toolbars via `<button>` elements. Focus drops on mode switch.
- Sheets: `src/components/customizer/editor-sheets.tsx` wraps all tool sheets in single Base UI Drawer with snapPoints. Inner sheets: add-content, image-source, templates, layers, font, color, opacity, mask, font-size, align, more, pattern, sticker-border, image-quality.
- Full-screen crop/text overlays lack Base UI modal composition; background-refine already declares a dialog role but lacks full modal focus handling. Shell handles Escape through `handleUnifiedBack` (`customizer-shell.tsx:1230-1240`); missing component-local handlers does NOT prove an Escape trap. Background focus leakage and double Escape handling remain risks to fix/test.
- Card surfaces: `card-surface-switcher.tsx` uses `role="tablist"`/`role="tab"` with `aria-selected` and `tabIndex={-1}` on inactive tabs, but NO arrow key handler.
- Pattern toggle: `pattern-workspace-toggle.tsx` same broken tablist pattern.
- Keyboard: `useEditorShortcuts` in `src/lib/use-editor-shortcuts.ts` handles only Undo/Redo. Escape handled in shell for unified-back. No Arrow key nudge, Delete, or other shortcuts.
- Existing good: toast `role="status" aria-live="polite"`, safety badge `aria-live`, undo/redo `aria-label`+`aria-disabled`, decorative SVG `aria-hidden="true"`, GSAP `prefers-reduced-motion` checks in 10+ components.

### Accessibility gaps found (ranked)

**P0 — Core task impossible without pointer:**
1. Canvas transform handles (move/resize/rotate) — `tabIndex={0}` but no `onKeyDown` → keyboard user cannot manipulate objects.
2. Tablist keyboard deadlock (`card-surface-switcher.tsx`, `pattern-workspace-toggle.tsx`) — inactive tabs `tabIndex={-1}` without arrow navigation → keyboard user locked out of card surfaces.
3. Crop pan/zoom has no keyboard or single-pointer non-drag controls (`crop-focus-mode.tsx:61-128`). Core crop task is blocked.
4. Layer selection rows are not keyboard reachable (`layers-sheet-content.tsx:281-300`). Existing More-sheet forward/backward actions mean layer reorder is not universally drag-only; expose complete commands directly in Layers rather than claiming no alternative exists.
5. Admin library cards (`library-stickers.tsx`, `template-library.tsx`) — `div onClick` without tabIndex/role → keyboard lockout.

**P1 — Essential AT state absent:**
1. Crop depends on drag/pinch. Freehand brush needs criterion-specific assessment; path-dependent drawing is not automatically a 2.5.7 violation or blanket exception.
2. Layer rows have no semantic selection state; use `aria-pressed` on list buttons, not `aria-selected` on unsupported roles.
3. Color picker hex input — no label.
4. Admin filter selects — no labels. Preflight items — div onClick.
5. Focus rings suppressed (`focus:outline-none`) across login, checkout, admin filters.
6. Checkout step replacement has no explicit next-heading focus management [INFERENCE: focus-loss risk from source, not a full runtime Checkout journey].
7. OTP input — missing `autoComplete="one-time-code"`, `inputMode="numeric"`.
8. Link-wrapping-button nesting (`customer-order-card.tsx`, `my-designs-list.tsx`).
9. Admin ConflictDialog — missing `onOpenChange` (Escape broken).
10. Design compare checkboxes — buttons without checkbox semantics.

**P2 — Usability / target size / announcements:**
1. Copy feedback — no aria-live announcement.
2. Small targets — search clear ~18px, group expander ~18px, quality badge ~18px.
3. Missing skip-link, landmarks, heading hierarchy in several routes.
4. `select-none` on order detail preventing text copy.
5. Admin `window.alert()` calls instead of proper dialogs.

### Contrast verification
Computed against page background `#FFFDF8`:
- `#666A6D` (ink-soft): 5.37:1 ✓ AA normal text
- `#315F86` (primary): 6.64:1 ✓ AA normal text
- `#DDD6CC` (line) on `#FFFFFF`: 1.44:1 ✗ decorative border only
- `#A86E22` on `#F7E8C6`: 3.52:1. Fails normal-sized AA text. Darken functional warning foreground to at least 4.5:1; adding an icon does not repair text contrast. Large text threshold is 18pt regular or 14pt bold.
- `#B3535D` (danger) on `#FFFFFF`: 4.87:1 ✓ AA normal text

### Drag and gesture inventory (keyboard AND single-pointer alternatives)

| Interaction / source | Current pointer behavior | Keyboard alternative | Click/tap without dragging | Constraint |
|---|---|---|---|---|
| Object move — `design-canvas.tsx:314-317` | Pointer delta; mixed units | Workspace arrows, Shift larger nudge | X/Y fields and direction buttons | Shared geometry Task 4 |
| Resize — `selection-overlay.tsx:107-160` | Four handles | Width/Height fields | Same fields and +/- | Aspect ratio, locks, minimum extent |
| Rotation — `selection-overlay.tsx:81-96` | Angle handle | Angle input | Angle input and +/- | Degrees normalized; no conflicting R shortcut |
| Crop position — `crop-focus-mode.tsx:61-88` | Drag frame | Arrow keys in crop region | Direction buttons and offset fields | Existing clampCropOffsets |
| Crop zoom — `crop-focus-mode.tsx:97-128` | Pinch | Numeric scale | Zoom +/- and Reset/Fill | No new unsupported contain mode |
| Layer reorder — `layers-sheet-content.tsx:92-138` | Drag handle | Native action buttons/menu | Forward/backward/front/back | Preserve sibling/group/surface boundaries |
| Drawer detents — `editor-sheets.tsx:240-253` | Swipe snap points | Expand/collapse buttons | Same buttons | Retain intermediate state only when already present |
| Canvas pan/zoom — `canvas-viewport.ts:55-94` | Pan/pinch | Native zoom/pan buttons | +/-/Fit/100%, four pan buttons, Reveal selection | Never hijack browser zoom |
| Opacity/font size — `editor-sheets.tsx:480-544` | Native ranges | Native arrows + numeric input | Range-track click, numeric input, +/- | Commit history on change completion/blur, not pointer-up only |
| Pattern scale/spacing/rotation — `pattern-controls-sheet.tsx` | Ranges | Native keys | Track click and value fields | Same onLiveUpdate/onCommit pair |
| Border/contour width — `sticker-border-sheet.tsx` | Range/switch | Keys | Width input and switch | No raw SVG path editing |
| Color — `color-picker-sheet.tsx` | Swatches/native picker | Hex input/swatches | Hex entry or swatch | No required precision gradient click |
| Gradient — `color/color-types.ts:10-22` | Two fixed colors, four linear directions or radial center | Labeled stop-color inputs/direction buttons | Same controls | No draggable stop positions or arbitrary angle exist; do not add features |
| Multi-select/lasso | Existing multi-select object taps; no distinct lasso handler found in inspected shell | Layer checkboxes | Layer checkboxes / `Chọn nhiều` | No lasso-only task or invented lasso feature |
| Brush refine — `background-removal/mask-editor.ts:35-55,84-95` | Path drawing + single-point stamps | Position cursor with arrows, Enter stamps | Click to stamp; X/Y cursor fields + Apply | Same BrushStroke; no speculative edge-dilation feature |
| Original comparison — `background-refine-overlay.tsx:238-255` | Pointer hold | Toggle with Space | Persistent `Xem ảnh gốc` toggle | Hold not sole path |
| Catalog/preview horizontal strips | Native overflow and view buttons; no autoplay found in inspected components | Tab scrolls focused item into view | Existing view buttons / native scrolling | Native scroll is UA-controlled; no invented carousel engine |

24×24 CSS px is the AA minimum, with spacing, equivalent-control, inline, unmodified-UA and essential exceptions. 44×44 is an internal mobile target, not an AA requirement. Keyboard support alone does not satisfy 2.5.7.

### Motion audit
10+ components use GSAP with `prefers-reduced-motion` checks. Two use inline `window.matchMedia` without `gsap.matchMedia()`. Drawer/Dialog CSS transitions use Tailwind `duration-*` classes. Global CSS has `@media (prefers-reduced-motion: reduce)` block for launcher cards.

### Existing test infrastructure
- Unit command: `node --test --experimental-strip-types src/test/*.test.ts`. Archived State 45 run reported 1309 tests/104 suites; not rerun for this planning-only task and not evidence of accessibility coverage.
- E2E: Playwright with `chromium`, `mobile-chromium`, `mobile-webkit` projects.
- CI: `.github/workflows/state45-release-gate.yml` — lint, typecheck, test, build, production smoke, SQL, E2E.
- No axe-core or accessibility-specific tests currently exist.

---

## 2. Evidence limits and implementation prerequisites

- Planning smoke: isolated `pnpm dev --port 3100`; Chromium 1280×800 launcher → card setup → blank Editor → add text → Escape → Layers; mobile-emulated 390×844 Login. Live accessibility tree showed text object `button` semantics; Enter on focused object did not open a textarea. Layers Drawer had an empty accessible name and only the drag handle, not the layer row, in interactive output. Login had a labeled email field and no horizontal overflow at that viewport; viewport metadata allowed zoom.
- These are development-mode planning observations, NOT production release proof, physical touch evidence, or screen-reader speech tests. No authenticated Admin mutation, real payment, OTP send, production build, axe scan, NVDA, VoiceOver or TalkBack run occurred during planning.
- Source anchors: Canvas `design-canvas.tsx:764-776,855-899,1258-1275`; Layers `layers-sheet-content.tsx:281-331`; shell shortcuts `customizer-shell.tsx:1230-1286`; OTP `login/page.tsx:145-168`; drawer `editor-sheets.tsx:240-258`; Admin cards `library-stickers.tsx:435-465`, `template-library.tsx:540-585`.
- Reuse State 45 isolation, but fix test setup prerequisites before new production-mode tests: `setupGoldenTestContext` calls `applyTestAuth` without real credentials; synthetic cookies are intentionally insufficient in production. `e2e/fixtures/auth.ts:110-167` already accepts real Supabase password/session. New tests must supply it. Never re-enable production staff bypass.
- `.github/workflows/state45-release-gate.yml:62-64` currently skips SQL when `SUPABASE_DB_URL` is absent; placeholder API keys exist at lines 24-26. New accessibility Admin/customer scans must fail setup on missing isolated backend/auth, never scan a login page and call it Admin coverage.
- `e2e/golden/guest-checkout.spec.ts:85-105` currently accepts a missing backend row via UI fallback. Do not copy this pattern. New transaction assertions require the row and exact expected result.
- Retain guest/local work, monotonic cloud revisions, conflict recovery, idempotency and immutable production snapshots. Relative nudge commands are NOT idempotent: dispatch once per user action, never retry them as network operations. No design contents or generated accessible names in diagnostic logs.
- Installed Next guidance: `node_modules/next/dist/docs/03-architecture/accessibility.md` documents route announcements using title then h1. Add descriptive route titles, not duplicate global route announcers.
- External normative references: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [2.5.7 dragging](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [2.5.8 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). APG patterns guide widget implementation; they are not independent conformance certification.

---

## 3. Shared Accessibility Architecture Contracts

### 3.1 Focus system

Use CSS tokens in `src/app/globals.css`; no competing TS focus-style constant or handwritten focus trap. Base UI Popup `initialFocus`/`finalFocus` already pass through local wrappers (verified installed types). Caller holds trigger ref; if removed, focus the surviving parent toolbar or page heading. A non-modal panel must not trap focus.

### 3.2 Announcement system

Create `src/lib/accessibility/announcements.tsx` exporting `AccessibilityAnnouncerProvider({children})` and `useAnnouncer(): {announce(message: string, priority?: 'polite'|'assertive'): void}`. Mount exactly once inside root body around children. Two empty mounted live regions (polite and assertive) receive text after mount; coalesce repeated status transitions, do not duplicate Next route announcements. Modal status is rendered within active modal, since inert background announcers may be hidden from AT; pass the same announcer callback interface through a modal-scoped provider rather than leaving all announcements outside the modal.
- Do not announce unchanged autosave ticks, drag frames, all layer content, or each keystroke. Selection via Layers already has a name/pressed state: announce only additional information not otherwise spoken, such as multi-selection count or completed transform.
- Keep critical errors persistent at their field/operation; toast cannot be their only location. Report priority assertive only for failed critical action requiring attention, not ordinary validation on every input.

### 3.3 Keyboard contract

Extend `src/lib/use-editor-shortcuts.ts`:
- Preserve Undo Ctrl/Cmd+Z; Redo Ctrl/Cmd+Shift+Z and existing Ctrl+Y. Allow only within active Editor when no modal owns the event; ignore `defaultPrevented`, composition, Alt, native inputs/selects/textarea/contenteditable and nested descendants.
- Workspace-focused Arrow keys nudge selected object by one displayed document unit; Shift means ten units. Numeric controls remain the essential path for AT users whose browse mode consumes arrows.
- Delete applies only when workspace owns focus; Backspace is not a global delete. Duplicate is a visible button, not Ctrl/Cmd+D (browser bookmark shortcut).
- Tab/Shift+Tab always leave workspace normally. No object Tab trap/cycling. `Lớp` opens semantic layer list; `Thuộc tính` opens selected-object fields.
- Escape closes the innermost modal/submode once, respecting `defaultPrevented`; text edit uses existing `exitTextEdit` commit-nonempty/cancel-empty semantics and IME protection. Crop/refine Cancel discards only their uncommitted transaction. Do not clear selection or navigate away on the same event.

### 3.4 Editor region contract

The Editor shell exposes these landmark regions:
- `<header>` with app back button + undo/redo (already exists).
- `<main id="main-content">` wrapping canvas workspace.
- Canvas workspace `<section role="region" tabIndex={0}>` with `aria-labelledby`/`aria-describedby`: `Vùng thiết kế [product] [surface], [N] đối tượng`; description names Layers and shortcut-help entry. Do NOT use `role="application"`: Layers/property controls remain principal AT interface and browser/screen-reader navigation keys must keep working.
- Layers sheet: semantic list of document objects.
- Bottom toolbar: `role="toolbar"` with `aria-label`.
- Contextual property panel: labeled region.

### 3.5 Tabs contract

Use installed Base UI Tabs for real panel switching (card surfaces, wrapping edit/full-sheet, Solid/Gradient, Before/After). Use plain pressed filter buttons or navigation links for result filters/saved views; no faux tabpanel per status filter. Default manual activation (arrows/Home/End move focus, Enter/Space activates) where switching loads remote content. Local card surface tabs may activate on focus only after verifying no data loss.

### 3.6 Toolbar contract

Use installed `@base-ui/react/toolbar` directly in `bottom-navigation.tsx`; no new dependency or assumed registry Toolbar exists. Base UI provides roving keyboard behavior. Label main and contextual toolbars. Keep top Back and two history controls a normal button group (three Tab stops are acceptable); do not force every group into a toolbar.

---

## 4. Accessibility Interaction Inventory

This is implementation input, not a conformance claim. `Current` is source/runtime evidence captured during planning; `Target` is required State 46 behavior.

### 4.1 Customer surfaces

| Surface / control class | Current interaction, semantics, focus, announcement | Target behavior | Risk |
|---|---|---|---|
| Product Listing | Product cards are links/buttons and have focus-visible rings; headings/variants are in accessible names | Keep semantic links, one `h1`, logical `h2`s, product/variant names; skip-link to main | P2 |
| Product Variant | ToggleGroup provides native button semantics | Arrow-key option navigation, selected state, 44px primary targets | P2 |
| Template Browser | Search + mood filters + clickable cards; result count silent; loading grid lacks busy state | Labeled search, pressed filter state, `aria-busy`, polite result-count status | P1 |
| Template Preview | Base UI Dialog/Drawer; surface buttons not tabs | Base UI Tabs, close/Escape/focus restoration, textual template/product context | P1 |
| Editor shell | Header + canvas + bottom actions; no landmarks/skip target | Header/main/toolbar/region landmarks; skip to content + canvas; deterministic major-region order | P1 |
| Canvas | Visual HTML objects expose inert button semantics (live Enter no text edit) | One named workspace entry; Layers is object navigation; preserve visual pointer selection | P0 |
| Toolbar | Native buttons; contextual replacement can remove focused trigger [INFERENCE] | Base UI roving toolbar, stable surviving-control focus | P1 |
| Layers | Plain clickable rows; drag handle only; Drawer runtime observed unnamed dialog | Simple nested list, row buttons with name/type/state, keyboard selection; titled Drawer | P0 |
| Text Editor | Keyboard entry overlay focuses textarea; shell handles Escape but modal lifecycle incomplete | Base UI Dialog; named textarea; existing commit-nonempty/cancel-empty Escape semantics; restore trigger | P1 |
| Image tools | Replace via hidden file input; Canvas selection pointer-first | Visible `Thay ảnh` properties button, labeled file trigger, status/busy | P1 |
| Sticker/Font Browser | Native buttons mixed with incomplete listbox roles | Semantic lists/buttons, search label, pressed current font, factual sticker names | P1 |
| Color/Gradient | Swatches clickable; hex unlabeled; two fixed stops | Labeled hex, pressed swatches, type panels and existing direction choices | P1 |
| Crop | Drag/pinch; fixed overlay | Direction/zoom/Fill/Reset controls; keyboard and modal focus contract | P0 |
| Multi-select/Group | Existing mode and object taps; selected count visual | Layer checkboxes, concise count, group expand/state; no new lasso | P1 |
| Undo/Redo | Named buttons; announcements only for structural actions | Keyboard shortcuts; concise polite announcement for every successful keyboard undo/redo | P2 |
| Product Preview | Full-screen shell; plain view pills | Labeled Dialog, Base UI Tabs, keyboard close/focus restore, textual product/surface context | P1 |
| Preflight | Full-screen findings and fix buttons; legacy panel uses `div onClick` | Errors/warnings grouping, summary status, semantic `Đi đến đối tượng` buttons | P1 |
| Quantity | 44px +/- buttons + labeled numeric text input; errors not described | Keep buttons; associate errors; polite update; no fake spinbutton unless full ARIA behavior implemented | P2 |
| Checkout forms | Labels/errors/IME present; no explicit step focus handoff | Focus step heading once; summary for multiple errors; preserve existing inputs | P1 |
| QR Payment | QR alt + surrounding text; copy visual state silent; some ~22px buttons | Structured amount/reference/account text; labeled copy buttons; 24px floor/44px primary; polite copy status | P2 |
| OTP/Login | Single input; no one-time-code/autofill; errors silent | `autocomplete=one-time-code`, `inputmode=numeric`, full-code paste, linked alert errors | P1 |
| My Designs / My Orders | Repeated nested Link>Button patterns, ambiguous link names | Semantic list/cards; one interactive element; contextual link names | P1 |

### 4.2 Admin surfaces

| Surface / control class | Current interaction, semantics, focus, announcement | Target behavior | Risk |
|---|---|---|---|
| Admin shell/nav | Semantic links; missing `aria-current`, focus treatment inconsistent | Labeled nav, current page, skip link/main landmark | P2 |
| Orders Inbox | Incomplete tab roles on query filters; search unlabeled | Native current-page links/pressed filters; labeled search; stateful Menu choices; result status | P1 |
| Order Detail | Semantic sections, high-impact Base UI dialogs; copy status silent; some `window.alert` | Heading hierarchy by Payment/Design/Production; Dialog consequence text; inline alert/status | P1 |
| Payment/Hold/Production | Buttons + Base UI Dialogs, Admin enforcement in services/RPCs | Intentional initial focus, focus restoration, `aria-busy`; NO business rule changes | P1 |
| Design Review/Edit | Version select unlabeled; warning checked state absent; conflict Dialog cannot dismiss | Label/select, native checkbox state, safe close preserving recovery | P1 |
| Asset Library Stickers | `Card onClick` plain div; keyboard users cannot open | Semantic button opens edit Dialog; factual sticker names; bulk count status | P0 |
| Asset Library Fonts | Native filters unlabeled; repeated `Chi tiết & tệp` links | Labels + contextual link names; native checkbox wrapped label retained | P1 |
| Template Management | Card click-only; status filter state visual | Semantic links; pressed status filters; Customer Preview mode focus/announcement | P0 |
| Product Catalog | Existing nav/current state and labeled fields mostly sound | Preserve; verify focus, 200% reflow, target sizes | P2 |
| Commercial Pricing | Fieldset/legend + labeled numeric fields mostly sound | Semantic table/fieldset associations; no drag reorder; derive tiers by min qty | P2 |

### 4.3 Overlay and primitive inventory

- **Dialog / AlertDialog:** Base UI primitives correctly provide modal behavior when composed with Title/Description. Audit every instance for Title, description, `initialFocus`, `finalFocus`, Escape and controlled `onOpenChange`.
- **Drawer:** `EditorSheets` uses snap points and hidden swipe handle. Runtime Layers dialog had no accessible name. Every sheet needs `DrawerTitle`; add explicit `Thu gọn`/`Mở rộng` controls for snap points.
- **DropdownMenu:** Base UI Menu provides arrow navigation/Escape/focus restore. Filter selections must expose checked/current state.
- **Popover/Tooltip/Select/Combobox:** No dedicated shadcn components installed. Use native input/select where sufficient; do not invent ARIA combobox/menu patterns.
- **Slider:** Base UI Slider/native range supports keyboard; every thumb/input needs label/value text and numeric alternative where precision matters.
- **Toast:** Existing custom toast is polite and does not steal focus; centralize duplicate live regions and suppress repeated autosave ticks.

---

## 5. Implementation Tasks

### Task 1: Freeze the accessibility inventory, severity model, and test fixtures

**Problem / WCAG:** Accessibility defects need repository-specific release-blocker policy. Covers WCAG 2.1.1, 2.4.3/7/11, 2.5.7/8, 4.1.2/3.

**Current behavior:** Findings are in this plan only. E2E has State 45 golden/failure fixtures but no representative design document fixtures for accessibility states.

**Files:**
- Create: `docs/accessibility/state46-interaction-inventory.md`
- Create: `e2e/fixtures/accessibility-designs.ts`
- Test: `src/test/state46-accessibility-fixtures.test.ts`
- Modify: `README.md`, `src/lib/design-document.ts` (admit existing `group` type and preserve group relationships during fixture round-trip; currently VALID_ELEMENT_TYPES omits it).

**Interfaces:**
- Produce `A11Y_DESIGN_FIXTURES`: `text`, `image`, `sticker`, `group`, `card`, `wrapping`, `dieCut`, `notebook` valid `DesignState` fixtures.
- Produce severity contract: P0 = critical task impossible/trap; P1 = essential semantics/state unavailable; P2 = alternate path exists but usability/AA defect.

**Steps:**
- [ ] Write failing fixture tests that pass each representative fixture through `readDesignDocument`, assert required text/image/sticker/group/surface geometry, and reject duplicate IDs or invalid surfaces.
- [ ] Run `node --test --experimental-strip-types src/test/state46-accessibility-fixtures.test.ts`; expect FAIL because fixtures do not exist.
- [ ] Write inventory doc from §4 with exact repository paths and source/runtime evidence labels; documentation gets manual review, not a tautological source-text test.
- [ ] Add valid DesignState fixtures using `createTextElement`, `createStickerElement`, and product definitions; never add DB schema fields or persisted ARIA strings.
- [ ] Run fixture test; expect PASS.
- [ ] Manual verify docs list technical target vs automated/manual evidence vs formal-conformance disclaimer.
- [ ] Commit: `docs(a11y): inventory State46 interactions and risks`.

**Regression risk:** Fixture drift with DesignState schema. Verify via `readDesignDocument` tests.

**Dependencies:** None.

### Task 2: Establish focus, announcement, skip-link, landmarks, tokens, and reduced motion

**Problem / WCAG:** Inconsistent/missing focus, landmarks, focus obscured by sticky UI, announcement duplication (1.3.1, 2.4.1, 2.4.3, 2.4.7, 2.4.11, 4.1.3, 2.3.3).

**Current behavior:** Root `lang=vi` is correct. Global focus token is faint. Sticky bottom toolbar may cover focus. Toast already polite. Reduced motion handled piecemeal.

**Files:**
- Create: `src/lib/accessibility/announcements.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/components/layout/customer-nav-header.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/content/layout.tsx`
- Test: `e2e/accessibility/foundation.spec.ts` (browser behavior, not CSS/source-string tests)

**Interfaces:**
```ts
export type AnnouncementPriority = 'polite' | 'assertive';
export interface AnnouncerApi { announce(message: string, priority?: AnnouncementPriority): void }
export function AccessibilityAnnouncerProvider(props: { children: React.ReactNode }): React.JSX.Element;
export function useAnnouncer(): AnnouncerApi;
```

**Steps:**
- [ ] Add failing browser cases: activating skip link moves focus to main, focus is visibly outlined, real copy/save event updates appropriate live region exactly once, and nav current-page state follows navigation. Do not test copied token strings.
- [ ] Implement announcer with incrementing message ID; ignore identical message within 1000ms; polite default, assertive only errors.
- [ ] Add `--focus-ring`, `--focus-offset`, `--hit-target-primary: 44px`, `--hit-target-min: 24px`, accessible functional foreground tokens to `globals.css`.
- [ ] Add global focus-visible outline; remove only component-level outline suppression when replacement exists.
- [ ] Add skip link `Đi đến nội dung chính`; Editor later adds `Đi đến vùng thiết kế`.
- [ ] Set scroll padding/margin from `--sticky-header-height` and `--sticky-footer-height` measured by ResizeObserver on authored sticky regions; reserve 8px extra clearance. Scope to each scroll container, not fixed guessed device heights.
- [ ] Add reduced-motion rules for Drawer/Dialog transitions and verify GSAP matchMedia paths preserve state changes.
- [ ] Run `pnpm exec playwright test e2e/accessibility/foundation.spec.ts --config=e2e/playwright.config.ts --project=chromium`; browser smoke desktop/mobile Tab order and screenshot ring visibility.
- [ ] Commit: `feat(a11y): add focus and announcement foundation`.

**Manual verification:** Focus ring visible on white, paper, blue/pink pastel, and dark Canvas controls; focused target not fully obscured by bottom toolbar.

**Dependencies:** Task 1.

### Task 3: Reuse Base UI Tabs/Toolbar and normalize shared primitive contracts

**Problem / WCAG:** Hand-rolled tabs/toolbar miss required keyboard behavior; Dialog/Drawer composition varies (2.1.1, 2.1.2, 4.1.2).

**Files:**
- Modify: `src/components/customizer/card-surface-switcher.tsx`, `src/components/customizer/pattern-workspace-toggle.tsx`, `src/components/customizer/bottom-navigation.tsx` (compose installed Base UI Tabs/Toolbar directly)
- Modify: `src/components/ui/dialog.tsx`, `src/components/ui/drawer.tsx`, `src/components/ui/button.tsx`
- Test: `e2e/accessibility/primitives.spec.ts`

**Steps:**
- [ ] Read installed Base UI Tabs/Toolbar types and official API docs; no registry install or new dependency needed. Keep local visual classes on their Root/List/Tab/Panel and Toolbar Root/Button composition.
- [ ] Write failing Playwright real-surface tests: card tabs arrows/Home/End then Enter activate, toolbar Tab-entry/arrows, Dialog initial/final focus, Drawer title and restoration.
- [ ] Replace the two broken tablists and main bottom toolbar with those installed primitives; do not add test-only production routes.
- [ ] Localize default close sr-only labels from `Close` to `Đóng` in Dialog/Drawer.
- [ ] Use existing `initialFocus`/`finalFocus` passthrough; require Title at call sites. Do not duplicate wrapper APIs already present.
- [ ] Do NOT globally change `Button` to 44px. Add `touch` and `icon-touch` size variants for primary mobile controls; keep 24px WCAG floor/spacing exceptions.
- [ ] Verify with `pnpm run typecheck`, focused tests.
- [ ] Commit: `feat(a11y): standardize tabs toolbar and overlays`.

**Dependencies:** Task 2.

### Task 4: Define element semantics and unify transform commands

**Problem / WCAG:** Canvas, Layers, keyboard and property controls currently encode element names/transforms separately. Legacy image uses px transform while CanvasElement uses percentages.

**Files:**
- Create: `src/lib/accessibility/editor-semantics.ts`
- Create: `src/lib/accessibility/editor-transform.ts`
- Modify: `src/lib/canvas-interaction.ts`, `src/lib/product-state.ts`, `src/lib/multi-selection.ts`, `src/lib/design-document.ts`, `src/components/customizer/design-canvas.tsx`, `src/components/customizer/customizer-shell.tsx`, `src/components/customizer/document-render-surface.ts` (only shared frame resolution, not a renderer rewrite)
- Test: `src/test/editor-accessibility-domain.test.ts`

**Interfaces:**
```ts
export function getAccessibleElementName(el: CanvasElement, all: readonly CanvasElement[]): string;
export function getAccessibleElementState(el: CanvasElement, mode: EditorMutationMode): string;
export interface DocumentSpace { width: number; height: number; unit: '%' | 'mm' }
export function getDocumentSpace(state: DesignState): DocumentSpace;
export function nudgeElement(elements: CanvasElement[], id: string, dx: number, dy: number, mode?: EditorMutationMode): CanvasElement[];
export function resizeElement(elements: CanvasElement[], id: string, width: number, height: number, lockAspect: boolean, mode?: EditorMutationMode): CanvasElement[];
export function rotateElement(elements: CanvasElement[], id: string, degrees: number, mode?: EditorMutationMode): CanvasElement[];
export function reorderElement(elements: CanvasElement[], id: string, command: 'forward'|'backward'|'front'|'back', mode?: EditorMutationMode): CanvasElement[];
```

**Steps:**
- [ ] Write failing tests: text excerpt max 40 chars; image uses semantic asset name or `Ảnh`; sticker title; group child count; no UUID; locked/customerLocked/read-only states.
- [ ] Test finite signed positions (off-surface positions remain permitted for bleed), strictly positive dimensions, finite normalized degrees, locked/customerLocked/read-only and protected-descendant rejection. Do not invent 0–100 position clamps. Include wrapping full-sheet units and card inside spread.
- [ ] Follow geometry contract in §10: resolve canonical CanvasElement frame for every type, convert pointer deltas using actual untransformed surface dimensions, and commit the same absolute frame as numeric fields. Forward explicit mutation mode to existing helpers. A group operation expands descendants once and rejects the whole operation when any required descendant is protected; prevent double-transform of selected ancestor+child.
- [ ] Fix shell text selection bridge (`handleSelectLayer` currently omits `selectedTextId` and clears target for sticker/group); both pointer and Layers call one selection handler. Keep semantic-name derivation pure; no generated label persistence.
- [ ] Run `node --test --experimental-strip-types src/test/editor-accessibility-domain.test.ts src/test/multi-selection.test.ts src/test/product-state.test.ts`.
- [ ] Commit: `feat(a11y): define editor semantic transform contracts`.

**Dependencies:** Task 1.

### Task 5: Make Editor shell, Canvas entry, toolbar, shortcuts, and selection coherent

**Problem / WCAG:** Canvas lacks named entry point. Object buttons ignore Enter/Space. Toolbar has excessive Tab stops. Global shortcuts only Undo/Redo (2.1.1, 2.1.2, 2.4.3, 4.1.2).

**Files:**
- Modify: `src/components/customizer/customizer-shell.tsx`, `src/components/customizer/design-canvas.tsx`, `src/components/customizer/bottom-navigation.tsx`, `src/lib/use-editor-shortcuts.ts`
- Create: `src/components/customizer/keyboard-shortcuts-dialog.tsx`
- Test: `src/test/editor-shortcuts.test.ts`, `e2e/accessibility/editor-keyboard.spec.ts`

**Keyboard contract:**
- Tab enters/leaves major regions; Toolbar arrow keys navigate controls.
- Canvas workspace is one focus stop. Tab/Shift+Tab exit normally; no cycling through visual objects. `Lớp` is the object navigation interface, `Thuộc tính` is the explicit property entry.
- Layers native selection buttons activate on Enter/Space; separate visible `Sửa chữ`, `Thay ảnh`, `Mở nhóm` actions make shortcuts optional.
- Workspace Arrow nudge one document unit, Shift ten; Delete only workspace-focused; Undo/Redo existing platform conventions; duplication stays a visible action, not browser Ctrl/Cmd+D.
- Guard inputs, selects, textareas, contenteditable descendants, IME, defaultPrevented and modal ownership. Escape follows §3.3.

**Steps:**
- [ ] Write failing resolver tests for nudge/delete and input/composition/modal guards, including numeric spinner arrows never moving Canvas objects.
- [ ] Wrap workspace in named `role=region`, add concise static description and skip link.
- [ ] Use `getAccessibleElementName/State` in Layers and workspace summary. Remove fake button roles/tab stops from pointer-only visual object containers after Layers lands; do not hide focusable descendants under aria-hidden. Expose one factual visual summary, not duplicate text/object announcements.
- [ ] Keep pointer handlers unchanged in effect. Quality/replace buttons that remain in artwork must be native buttons or moved to named properties; no inert focusable controls.
- [ ] Replace bottom nav groups with Toolbar; labels: `Thanh công cụ chính`, `Công cụ văn bản`, `Công cụ ảnh`, `Công cụ nhóm`.
- [ ] Implement shortcut help Dialog with platform labels (`⌘` on macOS, `Ctrl` elsewhere), only working shortcuts.
- [ ] Announce selection changes once; no pointer-move spam.
- [ ] Browser smoke: no keyboard trap; selection and visual state share exact IDs.
- [ ] Commit: `feat(a11y): make editor keyboard navigable`.

**Dependencies:** Tasks 2, 3, 4, 6.

### Task 6: Make Layers the semantic document bridge

**Problem / WCAG:** Layer rows are unfocusable divs; reorder drag-only; group state not exposed (1.3.1, 2.1.1, 2.5.7, 4.1.2).

**Files:**
- Modify: `src/components/customizer/layers-sheet-content.tsx`, `src/components/customizer/editor-sheets.tsx`, `src/lib/layers.ts`, `src/components/customizer/customizer-shell.tsx`
- Test: `src/test/layers.test.ts`, `src/test/card-layers.test.ts`, `e2e/accessibility/editor-layers.spec.ts`

**Chosen model:** Nested semantic list, NOT ARIA tree. Hierarchy is shallow and simpler list/listitem + buttons avoids implementing full APG tree selection/expansion.

**Steps:**
- [ ] Write failing tests for generated names/states, select/toggle multi-select, group expand/collapse, reorder commands.
- [ ] Render `<ul>`/`<li>` hierarchy; each row has semantic selection `<button aria-pressed>`, name + type + lock/read-only text.
- [ ] Expose group child list with native disclosure button `aria-expanded`/`aria-controls`.
- [ ] Add visible More menu commands: `Đưa lên trên`, `Đưa xuống dưới`, `Đưa lên đầu`, `Đưa xuống cuối`; use existing `onReorder(orderedIds)` and announce result.
- [ ] Keep drag handle for pointer users. Drag handle becomes pointer-only `aria-hidden`; no fake focusable role.
- [ ] Multi-select uses explicit checkboxes/buttons in rows; selection count polite announcement.
- [ ] Add `DrawerTitle` and description to Layers. Use explicit expand/collapse snap controls in Task 10.
- [ ] E2E selects same object via Layers and Canvas, then confirms property heading identity.
- [ ] Commit: `feat(a11y): expose semantic editor layers`.

**Dependencies:** Tasks 2, 4. Execute this task before Task 5 final Canvas semantic cutover so removing fake object buttons never removes the only object entry path.

### Task 7: Add Transform/property controls and non-drag object manipulation

**Problem / WCAG:** Move/resize/rotate require drag; keyboard alone is insufficient for WCAG 2.5.7 single-pointer alternative.

**Files:**
- Create: `src/components/customizer/transform-controls.tsx`
- Modify: `src/components/customizer/editor-sheets.tsx`, `src/components/customizer/selection-overlay.tsx`, `src/components/customizer/customizer-shell.tsx`, `src/components/customizer/bottom-navigation.tsx`
- Test: `src/test/editor-transform-controls.test.ts`, `e2e/accessibility/editor-drag-alternatives.spec.ts`

**UI contract:** Heading `Thuộc tính — {accessibleName}`; fields X, Y, Width, Height, Rotation; aspect-ratio lock where applicable; directional step buttons on mobile; reorder commands live in Layers.

**Steps:**
- [ ] Write failing tests for numeric parsing/clamping, same final state from pointer transform vs input transform, one history entry per committed field edit.
- [ ] Add Transform controls for text/image/sticker/group using `getDocumentSpace(state).unit` and canonical frames from Task 4. Display Vietnamese labels `Vị trí X`, `Vị trí Y`, `Chiều rộng`, `Chiều cao`, `Góc xoay`; no dual pixel/property state. Text height that is layout-derived stays read-only; resizing text uses supported width and scale/font-size path, not false editable height.
- [ ] Provide +/- buttons and field inputs usable by single click/tap + software keyboard.
- [ ] Arrow nudge commits through Task 4 command and announces final coordinate only after keyup/debounce.
- [ ] SelectionOverlay handles remain pointer-draggable and 44px; remove their Tab stops because Transform controls are equivalent and handle keyboard behavior would add noise.
- [ ] Locked/read-only elements render values read-only and announce reason; editing controls are not focusable.
- [ ] E2E without drag: move, resize, rotate and verify DesignState + undo.
- [ ] Commit: `feat(a11y): add non-drag transform controls`.

**Dependencies:** Tasks 4-6.

### Task 8: Make crop, zoom, pan, image replacement, and background removal accessible

**Problem / WCAG:** Crop pan/pinch and freehand refine are pointer gestures. Overlay focus handling missing (2.1.1/2, 2.5.1/7, 4.1.2).

**Files:**
- Modify: `src/components/customizer/crop-focus-mode.tsx`, `src/components/customizer/background-refine-overlay.tsx`, `src/components/customizer/image-source-chooser.tsx`, `src/components/customizer/image-quality-sheet.tsx`, `src/components/customizer/editor-sheets.tsx`, `src/components/customizer/customizer-shell.tsx`, `src/lib/canvas-viewport.ts`, `src/lib/image-crop.ts`, `src/lib/background-removal/mask-editor.ts`
- Test: `src/test/image-crop.test.ts`, `src/test/background-removal.test.ts`, `e2e/accessibility/editor-crop.spec.ts`

**Desired behavior:** Crop offsets step 10 frame-space px (fine input can enter 1px); zoom step 0.1 within existing 1–5 cover-scale bounds; `Lấp đầy khung`/Reset restore default cover. Do not add contain/Fit that existing crop model cannot represent. Background refine gains cursor X/Y, mode, brush size and `Áp dụng nét` single-point stamp plus sticky comparison toggle; reuse `createNewStroke`/`addBrushStroke`, not invented edge-removal presets.

**Steps:**
- [ ] Write failing crop command tests and overlay focus tests.
- [ ] Migrate Crop overlay to Base UI Dialog full-screen composition; initial focus heading/container; Escape cancels only crop draft; final focus originating crop button or selected image's Layers row, not an unfocusable visual image.
- [ ] Add visible single-pointer controls calling existing `applyCropPan`/`applyCropPinch`; no duplicate crop state.
- [ ] Add viewport controls to `customizer-shell.tsx`: +/- change zoom by 0.1 bounded by MIN_ZOOM/MAX_ZOOM, `100%` sets zoom=1/pan=0/isFit=false, `Vừa khung` uses resetToFit, direction buttons pan by 20 CSS px, `Hiện đối tượng đã chọn` brings selection into workspace bounds. Browser Ctrl/Cmd +/- remains untouched.
- [ ] Add labeled `Thay ảnh` button and file input trigger in property controls.
- [ ] Add bg-refine Base UI Dialog, labeled brush slider, native mode buttons, cursor X/Y and click/Enter stamp using existing single-point BrushStroke support. Arrow keys move cursor only when refine workspace owns focus. Preserve freehand pointer strokes; compare toggle supports Space/Enter. Subjective mask quality remains visual, not falsely equivalent to artwork description.
- [ ] Remove nested Drawer from `ImageQualitySheet`; it renders pure content inside `EditorSheets`.
- [ ] E2E: complete crop outcome without drag; Escape returns focus; image replace works by keyboard.
- [ ] Commit: `feat(a11y): add crop and image gesture alternatives`.

**Dependencies:** Tasks 2, 3, 7, 10.

### Task 9: Normalize text, font, sticker, color, gradient, mask, contour, pattern, and surface controls

**Problem / WCAG:** Custom widgets expose incomplete names/states; tabs lack arrows; precise color/gradient changes need form alternatives (1.3.1, 2.1.1, 2.5.7, 4.1.2).

**Files:**
- Modify: `src/components/customizer/text-edit-overlay.tsx`, `src/components/customizer/font-browser-sheet.tsx`, `src/components/customizer/add-content-sheet.tsx`, `src/components/customizer/color-picker-sheet.tsx`, `src/components/customizer/mask-sheet-content.tsx`, `src/components/customizer/sticker-border-sheet.tsx`, `src/components/customizer/pattern-controls-sheet.tsx`, `src/components/customizer/card-surface-switcher.tsx`, `src/components/customizer/pattern-workspace-toggle.tsx`, `src/components/customizer/product-controls.tsx`, `src/components/customizer/template-author-controls.tsx`, `src/components/customizer/template-customer-preview.tsx`
- Test: existing `font-browser.test.ts`, `color-system.test.ts`, `sticker-border-sheet.test.ts`, `wrapping-paper-controls.test.ts`, `card-surface-switcher.test.ts` plus `e2e/accessibility/editor-properties.spec.ts`

**Steps:**
- [ ] Migrate TextEditOverlay to Base UI Dialog; preserve IME and Ctrl+Enter; Escape calls existing `exitTextEdit` (commit nonempty, cancel empty), never silently discards typed content. Restore originating Layers selection or surviving toolbar control.
- [ ] Font browser: choose semantic `<ul>` of native font-choice buttons with `aria-pressed`, not a partial listbox. Search and family/face filters have visible labels, Tab/Enter work; result status is polite after debounce. No custom combobox needed.
- [ ] Sticker cards use managed displayName as button name; filters labeled; no generic `image` names.
- [ ] Color picker: Base UI Tabs for Solid/Gradient; swatches `aria-pressed`; visible `Mã màu HEX` label and linked validation error.
- [ ] Gradient: expose the two existing endpoint colors via labeled hex fields and existing four linear directions/radial type with pressed state. Positions remain fixed 0%/100%; no arbitrary stop position or angle feature/schema addition.
- [ ] Mask/sticker contour/pattern choices use ToggleGroup/radio/slider with label, state and value; adjacent numeric field or +/- buttons for precision.
- [ ] Card surfaces and pattern workspace use Base UI Tabs; switching announces only `Mặt trước`/`Mặt trong`/`Mặt sau` or view name.
- [ ] Template customer preview entry/exit keyboard operable; mode announcement; focus moves to preview heading then returns to trigger.
- [ ] Verify no global shortcuts fire while typing in any input.
- [ ] Commit: `feat(a11y): normalize editor property controls`.

**Dependencies:** Tasks 2-4, 8.

### Task 10: Repair Drawers, Dialogs, Sheets, popovers, and focus restoration

**Problem / WCAG:** Editor Sheets use swipe snap points without explicit controls. Custom overlays and controlled dialogs miss focus lifecycle (2.1.2, 2.4.3, 2.4.11, 2.5.7).

**Files:**
- Modify: `src/components/ui/drawer.tsx`, `src/components/customizer/editor-sheets.tsx`, `src/components/customizer/add-content-sheet.tsx`, `src/components/products/responsive-template-preview.tsx`, `src/components/checkout/account-save-dialog.tsx`, `src/components/admin/design-revision-dialogs.tsx`, `src/app/admin/orders/[id]/design/design-review-client.tsx`, `src/components/customizer/product-setup.tsx`, `src/components/customizer/customizer-shell.tsx` (unsaved-work AlertDialog). Other domain Dialog callers are owned by Tasks 11–17, not this task.
- E2E: `e2e/accessibility/focus-overlays.spec.ts`

**Steps:**
- [ ] Write failing overlay tests: initial focus, Escape close where safe, focus restoration, title/description, no background focus, active target visible.
- [ ] Control Drawer `snapPoint`/`onSnapPointChange`; expose buttons `Thu gọn`/`Mở rộng`; announce change; swipe remains.
- [ ] On Drawer expansion call `scrollIntoView({ block: 'nearest' })` for focused child to prevent obscuring.
- [ ] Add `DrawerTitle` (sr-only accepted) to every sheet branch.
- [ ] Ensure non-modal panels are not focus trapped; modal Dialog/Drawer remain trapped.
- [ ] ConflictDialog safe close: add `onDismiss` that preserves pending local state and leaves inline conflict banner visible; NEVER map Escape to `onReload`.
- [ ] Destructive Dialog initial focus on Cancel/safe button; data entry initial focus first field; finalFocus trigger.
- [ ] Add mobile visualViewport handling for form fields above keyboard without changing business state.
- [ ] Commit: `fix(a11y): restore overlay and sheet focus`.

**Dependencies:** Tasks 2, 3.

### Task 11: Make Preview and Preflight structured, navigable, and announced

**Problem / WCAG:** Full-screen preview has weak modal context; legacy findings are clickable divs; completion status visual-only (1.3.1, 2.1.1, 2.4.6, 4.1.2/3).

**Files:**
- Modify: `src/components/customizer/editor-preview-mode.tsx`, `src/components/customizer/preview/preview-shell.tsx`, `src/components/customizer/preview/wrapping-preview.tsx`, `src/components/customizer/preview/sticker-preview.tsx`, `src/components/customizer/preview/notebook-preview.tsx`, `src/components/customizer/preview/card-preview.tsx`, `src/components/customizer/editor-preflight-mode.tsx`, `src/components/customizer/preflight-panel.tsx`, `src/components/customizer/preview-dialog.tsx`, `src/components/customizer/customizer-shell.tsx`
- Test: existing preflight/preview tests + `e2e/accessibility/preview-preflight.spec.ts`

**Steps:**
- [ ] Convert Preview shell to labeled Dialog/full-screen region; Base UI Tabs for product surfaces/views; add text product/surface/object-count summary.
- [ ] Group Preflight findings under `Lỗi`, `Cảnh báo`, `Đạt` headings/lists; severity text + icon + programmatic label, never color alone.
- [ ] Convert `div onClick` findings to `<button>` `Đi đến đối tượng: {name}`. Action selects same object, closes Preflight, focuses Layers row or Canvas region predictably.
- [ ] Announce summary only (`Kiểm tra hoàn tất. 2 cảnh báo, không có lỗi bắt buộc.`), never entire list.
- [ ] Focus Preflight heading on open; restore `Xong` trigger on close.
- [ ] Commit: `feat(a11y): structure preview and preflight`.

**Dependencies:** Tasks 5, 6, 9, 10.

### Task 12: Repair customer catalog, navigation, lists, headings, images, and targets

**Problem / WCAG:** Repeated chrome lacks skip/current context; nested interactives and ambiguous link names; template dynamic status silent (1.1.1, 1.3.1, 2.4.1/4/6, 2.5.8, 4.1.2/3).

**Files:**
- Modify: `src/components/layout/customer-nav-header.tsx`, `src/components/products/products-catalog-view.tsx`, `src/components/products/product-detail-catalog-view.tsx`, `src/components/products/responsive-template-preview.tsx`, `src/components/customer/my-designs-list.tsx`, `src/components/customer/customer-order-card.tsx`, `src/components/customer/customer-order-detail-view.tsx`, `src/app/products/page.tsx`, `src/app/products/[slug]/page.tsx`, `src/app/my-designs/page.tsx`, `src/app/my-orders/page.tsx`, `src/app/my-orders/[id]/page.tsx`, `src/app/order/[id]/page.tsx`, `src/components/customizer/product-launcher.tsx`, `src/components/customizer/product-setup.tsx`, `src/components/customizer/template-browser.tsx`, `src/components/customizer/template-chooser.tsx`
- E2E: `e2e/accessibility/customer-pages.spec.ts`

**Steps:**
- [ ] Inventory every icon-only action and thumbnail; mark decorative icons/images hidden/empty alt, meaningful thumbnails contextual alt/name.
- [ ] Use semantic links for navigation and buttons for actions; remove Link>Button nesting using Base UI `render` or `buttonVariants` on Link.
- [ ] Add unique link names containing product/project/order identity.
- [ ] Add nav `aria-current`; mobile navigation remains keyboard operable with 44px primary targets.
- [ ] Catalog template search/filter exposes `aria-busy` and polite result count.
- [ ] Remove `select-none` from order detail data; add textual design summary beside visual preview.
- [ ] Verify one `h1`, logical `h2`s, main landmark and no duplicated landmark labels per page.
- [ ] Commit: `fix(a11y): repair customer page semantics`.

**Dependencies:** Tasks 2, 3.

### Task 13: Make Checkout forms, quantity, validation, payment and QR accessible

**Problem / WCAG:** Wizard step focus drops, duplicate submit controls, some errors/copy/status silent (1.3.1, 2.4.3, 3.3.1/2/3, 4.1.3, 2.5.8).

**Files:**
- Modify: `src/app/checkout/page.tsx`, `src/components/checkout/customer-information-form.tsx`, `src/components/checkout/quantity-stepper.tsx`, `src/components/checkout/order-summary-card.tsx`, `src/components/checkout/payment-qr-panel.tsx`, `src/components/checkout/order-confirmation-panel.tsx`, `src/components/customizer/checkout-sheet.tsx`
- Test: existing checkout tests; create `e2e/accessibility/checkout-keyboard.spec.ts`

**Steps:**
- [ ] On step change focus new `h1/h2` (`tabIndex=-1`) and announce step label.
- [ ] Keep one submit control per step; sticky button references form ID rather than duplicate action.
- [ ] On validation failure: existing first-invalid focus retained; add concise error summary only when multiple fields fail, with links/focus handlers.
- [ ] Quantity remains labeled text input + 44px +/- buttons; associate errors/help; announce committed value/price once.
- [ ] QR keeps image alt concise; expose amount, bank/account, reference as `<dl>`; copy controls name exact field and announce success without moving focus.
- [ ] Busy buttons keep stable accessible name and expose `aria-busy`; errors stay inline/alert, not toast-only.
- [ ] Remove source-text tests affected by semantic markup and replace with Playwright behavior assertions.
- [ ] Commit: `fix(a11y): harden checkout and payment semantics`.

**Dependencies:** Tasks 2, 3, 12.

### Task 14: Make passwordless Auth and OTP cognitively accessible

**Problem / WCAG:** OTP lacks paste/autofill hints and error association (1.3.5, 3.3.1/2/7/8, 4.1.3).

**Files:**
- Create: `src/lib/accessibility/otp.ts`
- Modify: `src/app/login/page.tsx`, `src/components/checkout/account-save-dialog.tsx`
- Test: `src/test/otp-accessibility.test.ts`, `e2e/accessibility/auth-otp.spec.ts`

**Interface:**
```ts
export function normalizeOtpInput(raw: string, length?: number): string;
```

**Steps:**
- [ ] Write tests: direct typing, six-digit paste, paste with spaces/hyphens/prefix, over-length clipped after digit extraction.
- [ ] Keep single underlying input (not six focus cells). Add `autoComplete="one-time-code"`, `inputMode="numeric"`, `pattern="[0-9]*"`, `aria-describedby`.
- [ ] Normalize complete paste before applying six-digit limit. Do not disable paste.
- [ ] Announce wrong/expired codes as linked alert; do not clear input unless server contract requires and explanation is announced.
- [ ] Focus heading on step transition, then input only on explicit user flow; avoid surprise mobile keyboard on route load.
- [ ] Commit: `fix(a11y): support OTP paste and autofill`.

**Dependencies:** Tasks 2, 3.


### Task 15: Make Admin Orders operational flow keyboard and AT accessible

**Problem / WCAG:** Tabs incomplete, filters unlabeled, high-impact mutation focus/errors inconsistent (1.3.1, 2.1.1, 2.4.3/6, 3.3.1, 4.1.2/3).

**Files:**
- Modify: `src/app/admin/layout.tsx`, `src/app/admin/orders/orders-inbox-client.tsx`, `src/components/admin/orders-inbox.tsx`, `src/components/admin/order-filters.tsx`, `src/components/admin/order-row.tsx`, `src/components/admin/order-more-menu.tsx`, `src/components/admin/order-detail.tsx`, `src/components/admin/order-summary-sections.tsx`, `src/components/admin/order-design-card.tsx`, `src/components/admin/design-review.tsx`, `src/components/admin/design-compare.tsx`, `src/components/admin/design-revision-dialogs.tsx`, `src/components/admin/order-payment-card.tsx`, `src/components/admin/order-fulfillment-dialogs.tsx`, `src/components/admin/approved-design-inspector.tsx`, `src/components/admin/order-activity-timeline.tsx`, `src/app/admin/orders/[id]/order-detail-client.tsx`, `src/app/admin/orders/[id]/design/design-review-client.tsx`
- E2E: `e2e/accessibility/admin-orders-keyboard.spec.ts`

**Steps:**
- [ ] Orders Inbox saved views are URL/list filters: use native links with `aria-current` or pressed buttons matching existing query updates, remove incomplete tab roles rather than invent panels. Search has visible label; selected dropdown values use installed Menu RadioItem/RadioGroup or native selects. Keep More menu action semantics.
- [ ] Results use semantic list/card (existing OrderRow Link retained); announce count after filter/search debounce.
- [ ] Order Detail heading hierarchy: `h1 #QT...`; `h2 Thanh toán`, `Thiết kế`, `Sản xuất`, `Hoạt động`.
- [ ] Replace mutation `window.alert()` paths with inline `role=alert` tied to operation region; do not change mutation services/RPCs.
- [ ] High-impact Dialog titles/descriptions identify operation, order code, consequence. Cancel/safe initial focus; trigger final focus.
- [ ] Warning acknowledgements use native checkboxes (or ToggleGroup only if mutually exclusive), expose checked state.
- [ ] Conflict Dialog Escape safely dismisses dialog to persistent conflict banner; pending/recovery JSON retained; reload only explicit button.
- [ ] Copy phone/order reference announces success; downloads name purpose/file.
- [ ] Run existing admin-order/fulfillment/design tests + E2E keyboard journey.
- [ ] Commit: `fix(a11y): make admin order flow keyboard operable`.

**Regression risk:** Never bypass Admin-only production/payment authorization or optimistic-success rules.

**Dependencies:** Tasks 2, 3, 10.

### Task 16: Make Admin Asset Library and Template Management keyboard operable

**Problem / WCAG:** Sticker/template cards are pointer-only. Filters/links/modes expose weak names/state (2.1.1, 2.4.4/7, 4.1.2/3).

**Files:**
- Modify: `src/app/admin/content/layout.tsx`, `src/components/admin/library-stickers.tsx`, `src/components/admin/library-fonts.tsx`, `src/components/admin/library-font-detail.tsx`, `src/components/admin/template-library.tsx`, `src/components/admin/template-detail.tsx`, `src/components/admin/template-author-client.tsx`, `src/components/customizer/template-author-controls.tsx`, `src/components/customizer/template-customer-preview.tsx`
- E2E: `e2e/accessibility/admin-content-keyboard.spec.ts`

**Steps:**
- [ ] Convert sticker `Card onClick` to semantic `<button>` opening detail Dialog; name with managed sticker metadata/status.
- [ ] Convert template `Card onClick` to Next `<Link>`; name includes template title/product/variant.
- [ ] Label status/category/product/font filters; focus-visible ring; current filter state.
- [ ] Bulk selection uses native checkbox and polite `N mục đã chọn`; upload progress has Progress semantics (`aria-valuenow` only when real percentage exists).
- [ ] Font detail links include family name; family/face relation conveyed with headings/lists.
- [ ] Template status filters use pressed buttons; create-source choices use native radio/fieldset. Tabs reserved for true panels. Do not nest bulk checkbox/menu buttons inside the main card link/button; separate sibling controls.
- [ ] Customer Preview entry focuses mode heading; exit restores trigger; hidden controls become unfocusable; announce mode.
- [ ] Publish dialogs identify target/version/consequence and preserve State 45 idempotent publish behavior.
- [ ] Commit: `fix(a11y): make admin content keyboard operable`.

**Dependencies:** Tasks 2, 3, 9, 10.

### Task 17: Audit Product Catalog and Commercial Pricing Admin semantics

**Problem / WCAG:** Pricing/tier data need logical associations and zoom-safe editing; no drag reorder (1.3.1, 2.1.1, 3.3.2, 4.1.2).

**Files:**
- Modify: `src/components/admin/product-catalog.tsx`, `src/components/admin/product-detail.tsx`, `src/components/admin/product-lifecycle-dialogs.tsx`, `src/components/admin/commercial-config-editor.tsx`, `src/components/admin/commercial-preview.tsx`, `src/app/admin/products/page.tsx`, `src/app/admin/products/[id]/page.tsx`. `src/app/admin/products/actions.ts` remains unchanged (business operations preserved).
- E2E: `e2e/accessibility/admin-catalog-keyboard.spec.ts`

**Steps:**
- [ ] Verify visible labels, units (`₫`, số lượng), required/error associations, fieldset/legend for rules.
- [ ] Tier editor uses semantic table where truly tabular; row inputs get row/column context in name.
- [ ] Existing tier order follows `tier.minimumQuantity` and server validation. Preserve it; do not auto-sort while user types or add drag order. Numeric fields keep row/variant context.
- [ ] Lifecycle/Publish dialogs use Base UI focus contract and identify effect; status not color-only.
- [ ] Verify at 200% zoom and 390px viewport without two-dimensional page scrolling.
- [ ] Commit: `fix(a11y): clarify catalog pricing controls`.

**Dependencies:** Tasks 2, 3, 10.

### Task 18: Remediate contrast, non-text contrast, target sizes, reflow, zoom and orientation

**Problem / WCAG:** Soft pastel palette is valid decoratively but functional borders/states/focus/tiny targets need measurable contrast/size (1.4.3, 1.4.11, 1.4.10, 1.4.4, 2.5.8).

**Files:**
- Modify: `src/app/globals.css`, `DESIGN.md`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/slider.tsx`, `src/components/customizer/selection-overlay.tsx`, `src/components/customizer/layers-sheet-content.tsx`, `src/components/customizer/bottom-navigation.tsx`, `src/components/checkout/payment-qr-panel.tsx`, `src/components/checkout/order-confirmation-panel.tsx`, `src/components/checkout/order-summary-card.tsx`, `src/components/admin/order-filters.tsx`, `src/components/admin/template-library.tsx`. Domain owners in Tasks 5–17 replace their own hardcoded functional colors with shared tokens.
- Create: `e2e/helpers/accessibility-audit.ts`, `e2e/accessibility/visual-contracts.spec.ts`

**Interfaces:**
```ts
export interface TargetSizeFinding { selector: string; width: number; height: number; reason: 'undersized' | 'overlap'; exception?: 'spacing' | 'equivalent' | 'inline' | 'user-agent' | 'essential' }
export async function findUndersizedTargets(page: Page): Promise<TargetSizeFinding[]>;
export async function assertNoCriticalHorizontalOverflow(page: Page, exemptSelectors?: string[]): Promise<void>;
```

**Steps:**
- [ ] Add helper measuring interactive target boxes; flag <24x24 only when spacing/equivalent/UA exceptions do not apply. Internal primary mobile target goal 44x44.
- [ ] Audit CSS color pairs used by functional states. Keep decorative `#DDD6CC` line where decorative; strengthen borders/focus/selected handles that convey state to >=3:1.
- [ ] Add text/state/icon labels so warning/success/payment/production never rely on hue.
- [ ] Enlarge effective hit areas of canvas handles without increasing visible artwork; prevent overlap ambiguity.
- [ ] Test listed pages at 200% browser zoom for text resize (1.4.4), AND 320 CSS px width / equivalent 400% zoom on 1280px viewport for reflow (1.4.10). Also apply text-spacing overrides (1.4.12): line-height 1.5, paragraph 2em, letter .12em, word .16em; no clipped text/action. Viewport resize alone is not proof of actual browser zoom.
- [ ] Editor Canvas may remain spatial exception; surrounding UI reflows and virtual keyboard does not fully obscure fields.
- [ ] Verify viewport metadata allows pinch zoom (`width=device-width, initial-scale=1`, already generated by Next) and no orientation lock.
- [ ] Update DESIGN.md with accessible functional tokens; preserve pastel brand/decorative palette.
- [ ] Commit: `fix(a11y): meet contrast target and reflow floors`.

**Dependencies:** Tasks 2, 5-17.

### Task 19: Complete reduced-motion and async status behavior

**Problem / WCAG:** Motion handling is component-specific; saves/uploads/operations risk noisy or silent status (2.2.2 where applicable, 2.3.3, 4.1.3).

**Files:**
- Modify: `src/components/customizer/customizer-shell.tsx`, `src/components/customizer/add-content-sheet.tsx`, `src/components/customizer/editor-preflight-mode.tsx`, `src/components/customizer/product-launcher.tsx`, `src/components/customizer/product-setup.tsx`, `src/components/customizer/template-browser.tsx`, `src/components/products/products-catalog-view.tsx`, `src/components/products/product-detail-catalog-view.tsx`, `src/components/admin/design-compare.tsx`, `src/components/admin/library-stickers.tsx`, `src/components/admin/library-font-detail.tsx`, `src/components/checkout/payment-qr-panel.tsx`, `src/components/checkout/order-confirmation-panel.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/drawer.tsx`, `src/app/globals.css`.
- Test: `e2e/accessibility/reduced-motion-status.spec.ts`

**Steps:**
- [ ] Centralize `prefers-reduced-motion` media handling for GSAP components using `gsap.matchMedia()`; no global 0.01ms kill.
- [ ] Reduce nonessential entrance/sheet/toast motion while preserving state indication.
- [ ] Autosave announces meaningful `saving→saved`, `saving→error/conflict` transitions only; no debounce spam.
- [ ] Upload exposes busy/progress/complete/failed; no fake percentage when unknown.
- [ ] Async panels use local `aria-busy`, not whole app.
- [ ] No autoplay catalog/carousel introduced.
- [ ] Commit: `fix(a11y): respect reduced motion and status changes`.

**Dependencies:** Tasks 2, 10, 16.

### Task 20: Integrate axe-core scans for representative static and dynamic states

**Problem / WCAG:** No automated a11y checks currently run. Automated scans cannot prove conformance but catch deterministic failures.

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `e2e/playwright.config.ts`
- Create: `e2e/helpers/axe.ts`, `e2e/accessibility/axe-customer.spec.ts`, `axe-editor.spec.ts`, `axe-admin.spec.ts`, `docs/accessibility/axe-exceptions.md`

**Interface:**
```ts
export async function expectNoAxeViolations(page: Page, stateId: string): Promise<void>;
```

**Steps:**
- [ ] Add exact dev dependency `@axe-core/playwright@4.13.0` (peer supports Playwright 1.63).
- [ ] Scan Product Listing, Template Browser, blank Editor, Editor selection, Preflight, Checkout, Login/OTP, My Orders, Admin Inbox, Order Detail, Asset Library, Template Manager, Product Catalog.
- [ ] Scan Dialog open, Menu open, Drawer open, validation errors, selected element, warning state.
- [ ] No global `disableRules`. Any suppression has selector+rule+reason+manual verification+owner in `axe-exceptions.md`.
- [ ] Use semantic Playwright locators; test IDs only when semantic locator impossible.
- [ ] Run `pnpm exec playwright test e2e/accessibility/axe-*.spec.ts --config=e2e/playwright.config.ts --project=chromium`.
- [ ] Commit: `test(a11y): add axe representative-state scans`.

**Dependencies:** Tasks 5-19.

### Task 21: Add keyboard, focus, drag-alternative and mobile accessibility E2E

**Problem / WCAG:** Axe cannot validate keyboard contracts, focus restoration, focus not obscured, drag alternatives or OTP paste.

**Files:**
- Create/complete: `e2e/accessibility/editor-keyboard.spec.ts`, `editor-layers.spec.ts`, `editor-drag-alternatives.spec.ts`, `focus-overlays.spec.ts`, `checkout-keyboard.spec.ts`, `auth-otp.spec.ts`, `admin-orders-keyboard.spec.ts`, `admin-content-keyboard.spec.ts`, `mobile-focus-targets.spec.ts`
- Modify: `e2e/helpers/golden-journey-helpers.ts`, `e2e/fixtures/accessibility-designs.ts`

**Steps:**
- [ ] Editor journey: enter/leave toolbar, select Layer, edit Text, change Font/Color, Transform X/Y/W/H/rotation, Preflight, Checkout.
- [ ] Focus: open/close Dialog, Drawer, Menu, Preflight, payment, Publish; assert initial/final activeElement.
- [ ] No-drag journey: move, resize, rotate, crop, reorder layer, expand/collapse Sheet using clicks/keys only.
- [ ] Focus-not-obscured: compare focused element bounding box against sticky toolbar/Drawer bounds; use mobile Chromium/WebKit.
- [ ] OTP paste complete code, browser-autofill attributes, error announcement.
- [ ] Admin journeys: Inbox→filter→Order→confirm Payment→review→approve→Start/Complete Production; Content→upload/select→metadata→Publish→Template edit→Publish.
- [ ] Add target-size helper results with WCAG exceptions; screenshots only evidence, never sole assertion.
- [ ] Run production-mode Playwright against `pnpm build && pnpm start`, not dev.
- [ ] Commit: `test(a11y): cover keyboard focus and drag alternatives`.

**Dependencies:** Tasks 5-20.

### Task 22: Manual screen-reader, keyboard, zoom, touch and reduced-motion QA

**Problem / WCAG:** Automated tests do not verify actual assistive-technology speech and cognitive usability.

**Files:**
- Create: `docs/accessibility/state46-manual-qa.md`, `docs/accessibility/state46-known-limitations.md`

**Required matrix:**
- Desktop: Windows Chromium + NVDA; macOS Safari + VoiceOver where device available.
- Mobile: iOS Safari + VoiceOver; Android Chrome + TalkBack where device available.
- Separate keyboard-only flows without screen reader.
- 200% zoom; reduced motion; mobile virtual keyboard; touch-target inspection.

**Steps:**
- [ ] Document prerequisites, exact route/fixture, steps, expected focus/speech/state, result, browser/AT version, device, evidence link for every journey.
- [ ] Customer keyboard journey exactly as Definition of Done #36.
- [ ] Customer screen-reader journey exactly as Definition of Done #38.
- [ ] Admin operations and content journeys; no mouse.
- [ ] Drag-alternative journey; no drag.
- [ ] Verify announcements: selection, save failure, Preflight complete, upload complete, OTP/form error.
- [ ] Record unavailable device combinations as `NOT RUN`, never PASS. Obtain actual-device evidence before release signoff.
- [ ] Document subjective visual composition limits and any genuinely applicable path-dependent drawing exception; test brush stamps and all core authoring controls. No coarse-control substitution or formal conformance claim.
- [ ] Commit: `docs(a11y): add manual assistive technology QA`.

**Dependencies:** Tasks 5-21.

### Task 23: Document accessibility architecture and future component contracts

**Problem / WCAG:** Future work must preserve semantic model through State 47 performance/virtualization.

**Files:**
- Create: `docs/accessibility/architecture.md`, `docs/accessibility/component-checklist.md`
- Modify: `README.md`, `DESIGN.md`

**Required content:** Editor state sharing, Layers model, keyboard map, Transform controls, drag alternatives, focus/overlay rules, live-region strategy, IconButton/Dialog/Drawer/Tabs/Toolbar/Field contracts, target/contrast tokens, testing matrix, State 47 virtualization requirements.

**Steps:**
- [ ] Add concise pre-ship checklist: keyboard, focus, name, role/state, drag alternative, target, contrast, status, custom-widget screen-reader test.
- [ ] State virtualization must preserve stable layer IDs, DOM focus, setsize/posinset where used, selected object, announcements; never unmount focused row without deterministic transfer.
- [ ] State generated names come from existing semantic data; no persisted ARIA strings or schema migration.
- [ ] Add formal-conformance disclaimer and known-limitations link.
- [ ] Commit: `docs(a11y): define accessible component contracts`.

**Dependencies:** Tasks 1-22.

### Task 24: Add State 46 accessibility release gate without weakening State 45

**Problem / WCAG:** Accessibility regressions must block releases while reliability tests remain intact.

**Files:**
- Modify: `package.json`, `.github/workflows/state45-release-gate.yml`, `README.md`
- Create: `scripts/state46-release-readiness.ts` (validates structured manual QA evidence and unresolved findings; no doc-heading tests)

**Scripts:**
```json
{
  "test:a11y": "playwright test e2e/accessibility --config=e2e/playwright.config.ts --project=chromium",
  "test:a11y:mobile": "playwright test e2e/accessibility/mobile-focus-targets.spec.ts --config=e2e/playwright.config.ts --project=mobile-chromium --project=mobile-webkit",
  "gate": "pnpm run lint && pnpm run typecheck && pnpm test && pnpm run build",
  "gate:release": "pnpm run gate && pnpm run test:e2e && pnpm run test:smoke && pnpm run test:a11y && pnpm run test:a11y:mobile && node --experimental-strip-types scripts/state46-release-readiness.ts"
}
```

**Steps:**
- [ ] Wire existing completed accessibility specs directly into CI and release script; do not duplicate their behavior in a wiring-only smoke file. Readiness command checks evidence object described in §12 and fails missing/not-run rows or unresolved release blockers.
- [ ] Add CI accessibility stage after production build and existing State 45 Golden/failure E2E; install Chromium/WebKit already present.
- [ ] Run axe/keyboard E2E Chromium and mobile focus/target smoke; preserve test artifacts.
- [ ] Release gate requires manual QA ledger with no P0/P1 open and required physical-device rows not `NOT RUN`.
- [ ] Run fresh full gate: `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `pnpm run test:e2e`, `pnpm run test:smoke`, `pnpm run test:a11y`, `pnpm run test:a11y:mobile`.
- [ ] Commit: `ci(a11y): enforce State46 accessibility gate`.

**Dependencies:** Tasks 20-23.

---

## 6. Verification Commands

```bash
# Unit + contract
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build

# Existing State 45 reliability E2E (must remain)
pnpm run test:e2e
pnpm run test:smoke

# New State 46
pnpm run test:a11y
pnpm run test:a11y:mobile
```

SQL migrations are not expected. If any task proposes a DB column only to store ARIA labels, reject it. No Supabase migration should be added for State 46.

## 7. Manual QA Release Checklist

1. Customer keyboard journey: Product→Variant→Template→Editor→Layers→Text/Image→Transform→Font/Color→Preflight→Quantity→Checkout→Payment.
2. Customer screen reader: identify product/template; understand editor summary; navigate layers; edit text; identify/replace image; inspect Preflight; checkout.
3. Admin keyboard journey: Inbox→search/filter→Order→confirm payment→review→approve→Start/Complete Production.
4. Admin content: Asset Library→upload/select→metadata→Publish→Template Management→edit controls→Publish.
5. No dragging: move/resize/rotate/crop/reorder/sheet detent all achievable.
6. 200% zoom: Checkout, Login, My Orders, Admin Inbox, Order Detail, Content, Product Catalog.
7. Reduced motion enabled: no nonessential entrance movement; state remains understandable.
8. Mobile target review: Editor toolbar, Transform, Layers, Close, Quantity, OTP, Checkout.
9. Screen reader announcements: selection, save failure, Preflight, upload, OTP/form errors.
10. Browser/AT: NVDA+Chromium, VoiceOver+Safari macOS, VoiceOver+iOS Safari, TalkBack+Android Chrome.

## 8. Definition of Done Mapping

| DoD requirements | Tasks |
|---|---|
| Inventory, P0/P1 resolution, semantics/names | 1, 4-17 |
| Focus visible/not obscured/restore/no traps | 2, 3, 5, 10, 21 |
| Toolbar, Canvas, Layers semantic authoring | 4-7 |
| Transform and all drag alternatives | 7-10, 21 |
| Target size, contrast, color, zoom/reflow | 18 |
| Status/live announcements/no spam | 2, 5-9, 11, 13-16, 19 |
| Checkout, OTP, QR | 13-14 |
| Customer/Admin keyboard flows | 12, 15-17, 21-22 |
| Automated axe/keyboard/drag E2E | 20-21 |
| Manual screen-reader/mobile QA | 22 |
| Architecture/future contracts | 23 |
| Regression/typecheck/build/release gate | 24 |

## 9. Explicit Deferrals / Known Limitations

- No full DOM Canvas mirror; Layers/property controls are primary semantic model.
- No AI image descriptions; factual asset/display names only.
- No subjective description of exact visual composition.
- Precise subjective visual assessment remains a limitation. Brush stamps have keyboard/numeric/single-click access; freehand path drawing remains available. Record which criterion exceptions apply only after manual assessment; do not use a coarse Reset button as claimed equivalent to arbitrary brush work.
- No full performance rewrite or virtualization. State 47 must preserve focus/semantic contracts.
- No alternate high-contrast theme; actual functional tokens are corrected to meet AA.
- No formal certification/conformance claim; automated + manual evidence only.
- No database migration for generated labels.


## 10. Execution details shared by all task briefs

### 10.1 Order and ownership

Execute in this dependency order: **1, 2, 3, 4, 6, 5, 7, 10, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24**. Task numbers identify stable scopes, not an instruction to ignore dependencies. One owner integrates `customizer-shell.tsx`; never run overlapping shell/EditorSheets edits concurrently. Tasks 12–14 and 15–17 may run on separate branches after shared primitives settle, but shared Dialog changes must be integrated first. Each commit includes its behavior regression and a browser smoke; final aggregate gate runs once after integration.

Task 1 also owns the minimum production-test precondition work: modify `e2e/helpers/golden-journey-helpers.ts`, reuse `e2e/fixtures/auth.ts` and `supabase.ts`, create `e2e/fixtures/accessibility-session.ts`. Require `TEST_SUPABASE_URL`, isolated publishable/service key and test actor password; create/verify real test Auth users and `staff_roles` in isolated Supabase using server-side test fixture code, pass `supabaseAuth` to `applyTestAuth`. No customer/staff header or synthetic cookie grants production access. Register and remove fixtures in `try/finally` via `TestCleanupRegistry`, scoped by run/worker; never global deletes. Keep actual OTP challenge test separate from password-based setup for other scenarios.

**Every task** inherits these completion checks: run its exact focused command below; exercise its real route/state in browser; inspect focus/accessibility tree and desktop/mobile surface; preserve pointer behavior; report observed evidence only. Do not add tests that read source code, copy strings, count headings, or check that docs exist. Delete affected incidental source-text tests rather than re-pin markup regexes; retain and update real domain/contract tests. New pure-domain tests use existing node:test runner; browser behavior uses existing Playwright, no new test framework.

### 10.2 Canonical geometry cutover (Task 4, required before Task 7)

Repository evidence: `design-canvas.tsx:261-268` chooses `textTransforms[id] ?? textTransform`, but shell does not supply per-text transforms. Shell `onCommitTransform` writes text `CanvasElement.x/y/rotation`, while visual text reads different values. Images write `productOptions.imageTransform`; `DocumentRenderSurface` ignores that field and reads element frames. New numeric controls must not perpetuate this split.

1. `getDocumentSpace(state)` returns `{width:100,height:100,unit:'%'}` except wrapping full-sheet, which returns physical mm dimensions from `src/lib/pattern-renderer.ts:getWrappingPaperDimensions`. Wrapping motif still uses 100×100 coordinate space. Card inside spread is one shared surface; no duplicate inside panels or labels.
2. Use canonical element **center** x/y, width/height and degrees for all types in `DesignCanvas` and `DocumentRenderSurface`. Pointer delta converts as `dxUnits = dxCssPx / untransformedSurfaceWidth * space.width`; analogously y. Account for current viewport zoom before conversion. Do not divide by the hardcoded 5 currently used in multi-drag.
3. One pure frame command returns an absolute `DesignAction` plus history metadata. `executeAction` applies one final action; live pointer preview and numeric input drafts are transient. Arrow key-repeat uses existing history transaction API: begin on first keydown, commit on keyup or workspace blur; no network call per key frame.
4. Existing `CanvasElement` frames are authoritative where present. For truly legacy documents lacking elements, reuse existing `getDefaultElements`/legacy hydration and fold old pixel offsets/scale into that generated frame once when editable draft opens. Use the actual initial unzoomed Canvas layout dimensions, not arbitrary constants. Preserve raw recovery copy until normalized draft is durably saved. Do not mutate immutable historical DesignVersions or silently resave on inspection. Preview of historical documents keeps existing renderer semantics; no database backfill.
5. Stop writing/reading obsolete live `imageTransform`/`textTransform` fields after editable-draft conversion. Remove their mutable call sites, including quality scale-down and safety calculations; use selected frame. Existing serialized legacy data can be read at load boundary only; no permanent second state or dual writes.
6. Groups: existing document parser must accept group and parent links (Task 1). Group transform expands descendants, deduplicates IDs, applies once in common document units, recomputes group bounds; renderer keeps children rather than painting group itself. Reject mutation if current mode forbids any required member. Reorder within existing sibling group/surface only and preserve z-order of unrelated objects.
7. Text width editing may change wrapping; measured text height remains derived. Uniform text resize scales font size/box consistently using existing typography semantics. Do not expose an editable height field whose value is immediately overwritten by ResizeObserver. Image/sticker dimensions support aspect-locked resize; group width/height scale uniformly.
8. Required runtime proof: pointer drag text/image/sticker, then read Transform values; numeric change, then inspect visual bounds; Undo restores both; reload saved draft and Preview preserve same geometry. Repeat for full-sheet wrapping, motif and inside-card. Stop cutover on any renderer mismatch; do not claim pass from input values alone.

### 10.3 Core component implementation examples

These are exact interaction patterns, not permission to add a parallel form/widget abstraction:

```tsx
// Layers: no tree role; expansion, selection and actions are siblings.
<li>
  <button type="button" aria-pressed={selectedId === element.id}
    onClick={() => onSelect(element.id)}>
    {getAccessibleElementName(element, elements)}
  </button>
  {element.type === 'group' && (
    <button type="button" aria-expanded={expanded}
      aria-controls={`children-${element.id}`} onClick={toggleExpanded}>
      {expanded ? 'Thu gọn nhóm' : 'Mở rộng nhóm'}
    </button>
  )}
</li>
```

```tsx
// Numeric draft is local input state, not a second document store.
<label htmlFor="transform-x">Vị trí X ({space.unit})</label>
<input id="transform-x" type="number" step="1" value={draftX}
  aria-invalid={Boolean(xError)} aria-describedby={xError ? 'transform-x-error' : undefined}
  onChange={(event) => setDraftX(event.target.value)}
  onBlur={commitX}
  onKeyDown={(event) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) commitX();
    if (event.key === 'Escape') { event.stopPropagation(); setDraftX(String(frame.x)); }
  }} />
{xError && <p id="transform-x-error">{xError}</p>}
```

`commitX` parses finite Number, rejects empty/NaN without changing document, dispatches absolute selected-element x exactly once, no duplicate Enter+blur history when unchanged. It does not clamp off-surface x. Native spinner keys edit the input, never invoke workspace nudge.

```tsx
// Base UI uses render, not Radix asChild. Dialog popup already accepts refs.
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger ref={triggerRef} render={<Button variant="outline" />}>Xem trước</DialogTrigger>
  <DialogContent initialFocus={headingRef} finalFocus={triggerRef}>
    <DialogTitle ref={headingRef} tabIndex={-1}>Xem trước thiết kế</DialogTitle>
    <DialogDescription>Kiểm tra mặt đang chọn trước khi tiếp tục.</DialogDescription>
    <DialogClose render={<Button variant="outline" />}>Đóng</DialogClose>
  </DialogContent>
</Dialog>
```

Attach `triggerRef` to actual trigger; where trigger disappears use finalFocus function resolving surviving control. Do not implement a second document-wide keydown focus trap. For alert dialogs, initialFocus resolves Cancel.

### 10.4 Test helper contracts and realistic setup

Task 1 creates `e2e/fixtures/accessibility-session.ts`:

```ts
export async function openA11yEditor(page: Page, fixture: keyof typeof A11Y_DESIGN_FIXTURES): Promise<void>;
export async function readSavedA11yDesign(page: Page): Promise<DesignState>;
export async function authenticateA11yActor(context: BrowserContext, actor: TestActorKey): Promise<void>;
```

`openA11yEditor` uses isolated browser context and validated fixture JSON in existing `print-customizer-state-v1` session key before navigating `/?view=editor`; no production debug global/route. Upload fixture assets through actual file input or seed existing IndexedDB schema with real Blob records; do not use revoked object URLs. `readSavedA11yDesign` waits for actual durable save and reads current guest project, never fake React state. `authenticateA11yActor` wraps existing real Supabase cookie helper with fail-closed credentials.

Representative tests (Tasks 5/7/21; use built-in `playwright/test` import):

```ts
test('text position survives numeric edit, undo and reload', async ({ page }) => {
  await openA11yEditor(page, 'text');
  await page.getByRole('button', { name: 'Lớp', exact: true }).click();
  await page.getByRole('button', { name: 'Văn bản: Chúc mừng sinh nhật', exact: true }).click();
  await page.getByRole('button', { name: 'Thuộc tính', exact: true }).click();
  const x = page.getByLabel('Vị trí X (%)', { exact: true });
  await x.fill('61');
  await x.press('Enter');
  expect((await readSavedA11yDesign(page)).elements?.find(e => e.type === 'text')?.x).toBe(61);
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  expect((await readSavedA11yDesign(page)).elements?.find(e => e.type === 'text')?.x).toBe(50);
  await page.reload();
  await page.getByRole('button', { name: 'Lớp', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Văn bản: Chúc mừng sinh nhật', exact: true })).toBeVisible();
});
```

Add visual-bound comparison and real keyboard-only navigation case; above tests numeric semantics, not full keyboard reachability. Keyboard journey starts at document and uses `page.keyboard.press('Tab')` and Enter/Space, asserting current focus at milestones; do not use `.focus()`/`.click()` to bypass unreachable controls and call that a keyboard test. Pointer-alternative journey may click and fill but never drag.

```ts
test('Escape closes preview once and restores trigger', async ({ page }) => {
  await openA11yEditor(page, 'card');
  const trigger = page.getByRole('button', { name: 'Xem thử', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Xem trước thiết kế', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('region', { name: /Vùng thiết kế/ })).toBeVisible();
});
```

Task 20 helper uses all A/AA tags, including WCAG 2.2 additions:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from 'playwright/test';

export async function expectNoAxeViolations(page: Page, stateId: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations, `${stateId}: ${JSON.stringify(results.violations)}`).toEqual([]);
}
```

If a false positive is proven, add a typed exception registry in `e2e/helpers/axe.ts`, keyed by route/state/rule/selector, with reason/manual evidence/expiry. Filter only matching violation nodes, keep all other nodes/rules, fail expired/unmatched exceptions, attach raw and filtered results. Never exclude whole canvas/app or downgrade all serious findings. DOM content in artifacts uses synthetic fixture customers/artwork only; retain in private CI artifacts, no signed URL/token logging.

### 10.5 Correct test environment and release behavior

- `PLAYWRIGHT_DEV` is for local investigation only. Release: prebuild then `webServer` starts `pnpm start`. Remove test staff bypass env from production accessibility setup; preserve explicit production-bypass rejection checks.
- Align app `NEXT_PUBLIC_SUPABASE_URL` with `TEST_SUPABASE_URL`; assert both isolated before fixture writes. CI must provision local Supabase or explicitly named dedicated test Supabase, apply migrations/seeds, verify API/storage/auth health, then seed actors. No example keys/no skipped Admin scans.
- Extend `setupGoldenTestContext` options with `supabaseAuth?: TestSupabaseAuth` and `baseUrl?: string`; pass through to existing `applyTestAuth` (no new auth framework). Resolve real credentials in accessibility fixture; use isolated Order/Template/product IDs. Do not mutate production.
- Every private-page scan asserts expected page heading and actor role first; redirect/login/error state fails fixture setup. After actual confirmation/publish, query expected row/version/event, require not-null, no UI-only fallback.
- `e2e/playwright.config.ts` currently uses CI retries=2. New accessibility suite retries=0, no auto-skipping missing screens; only documented infrastructure flake may use one retry with evidence, not blanket extra retries.
- OTP test uses real isolated email OTP/inbox delivery when available; controlled invalid-code response may test error presentation, but cannot substitute for real authentication journey. Clipboard test verifies six-digit paste through real paste event; also manually test iOS autofill.
- Browser emulation is not physical-device VoiceOver/TalkBack evidence. No speech-output automation framework is required.

## 11. Per-task verification, focus/speech acceptance and regression risks

This table is part of each numbered task's acceptance criteria. `PW file` means exact command `pnpm exec playwright test e2e/accessibility/<file> --config=e2e/playwright.config.ts --project=chromium`; `NODE file` means `node --test --experimental-strip-types src/test/<file>`. Run `pnpm run typecheck` after each TypeScript task; full lint/test/build at integration. Browser-focused tasks use actual surfaces, not source snapshots.

| Task | Current → desired / component-domain boundary | Keyboard / focus / screen-reader acceptance | Automated command and manual verification | Regression risk |
|---|---|---|---|---|
| 1 | No a11y fixtures → valid persistent document fixtures and real auth setup | Fixture objects have factual names; no keyboard change yet | NODE `state46-accessibility-fixtures.test.ts`; load each fixture in guest editor and reload; prove group retained | Parser group rejection, unsafe test backend, fixture asset loss |
| 2 | Mixed outlines/status → tokens and scoped live provider | Skip link reaches main; visible ring; polite status without focus theft | PW `foundation.spec.ts`; inspect ring desktop/mobile and NVDA live message | Duplicate main IDs/live regions; inert modal swallowing status |
| 3 | Inactive tabs unreachable → Base UI panel widgets | Arrows/Home/End focus, Enter activate, Tab exits; current tab announced | PW `primitives.spec.ts`; keyboard switch all three card surfaces and wrapping view | Changing panel unmount semantics, pointer activation timing |
| 4 | Mixed px/frame state → one canonical geometry contract | Command leaves DOM focus unchanged; field units truthful | NODE `editor-accessibility-domain.test.ts`; pointer/numeric/Preview/reload parity on all products | Historical appearance, group descendants, text measurement |
| 5 | Fake object buttons → one workspace focus point and reachable actions | Tab exits workspace, input guards, no browser shortcut capture; concise summary | PW `editor-keyboard.spec.ts`; full keyboard region traversal with screen reader off/on | IME, Escape double-fire, browser Undo interception |
| 6 | Click-only rows → nested semantic list | Enter selects same ID, Space checks multi-select; expand announces; no forced property focus | PW `editor-layers.spec.ts`; NVDA text/image/sticker/group names, locks, reorder | Wrong text ID, cross-surface selection, nested controls |
| 7 | Drag transforms → precise form controls | Inputs and +/- work via Tab/click; invalid value stays associated; focus not yanked | PW `editor-drag-alternatives.spec.ts`; move/resize/rotate without drag; Undo/reload bounds parity | Enter+blur duplicate history, text derived height, units |
| 8 | Gesture-only crop/refine → buttons/fields/stamps | Dialog focus contained; Cancel restores trigger; committed status only | PW `editor-crop.spec.ts`; crop pan/zoom and brush stamp keyboard/tap, real image replacement | Crop clamp/dimensions, output mask, transaction cancel |
| 9 | Partial listbox/toggle/tabs → native choice patterns | Font search, text IME, swatch names/states; surface change concise | PW `editor-properties.spec.ts`; font/color/text/mask/contour with keyboard and SR | Font loading, gradient data loss, text Escape semantics |
| 10 | Gesture detents/weak return focus → controlled Drawer/modal lifecycle | Expand/collapse buttons, safe Escape, correct return/fallback focus | PW `focus-overlays.spec.ts`; virtual keyboard and nested modal close; pending conflict remains | Discard on Escape, stale trigger refs, duplicate traps |
| 11 | Visual review/finding divs → structured results and object navigation | Focus heading, errors/warnings names, summary once; fix selects object | PW `preview-preflight.spec.ts`; activate finding on inside card, return focus | Selection wrong surface, accidental edit in preview |
| 12 | Nested actions/quiet filters → native links/lists/nav | Keyboard catalog and template preview; current nav; count after settled results | PW `customer-pages.spec.ts`; browser title/h1 announcements and mobile nav | Link behavior, remote template loading, restored project |
| 13 | Step focus/error duplication → deterministic form flow | Focus heading per step; failed submit summary/first field; QR text/copy available | PW `checkout-keyboard.spec.ts`; customer full keyboard payment screen and retry | Double Order, stale quote, PII storage, IME |
| 14 | OTP hints/errors absent → paste/autofill/linked error | Pasted code retained on failure; user-requested transition focuses code field; no memory task | NODE `otp-accessibility.test.ts`, PW `auth-otp.spec.ts`; real mobile autofill and SR expired-code message | Prefix truncation, auth rate limits, unexpected input clear |
| 15 | Clickable Admin actions/quiet errors → complete operational semantics | Search/filter/list open; safe confirmation focus; read-only role reason | PW `admin-orders-keyboard.spec.ts`; full payment/design/production flow with actual isolated admin | Permission drift, immutable snapshot, unknown-outcome replay |
| 16 | Unfocusable content cards → sibling button/link/checkbox actions | Upload/metadata/publish keyboard; selected count; Customer Preview focus returns | PW `admin-content-keyboard.spec.ts`; keyboard sticker/font/template lifecycle | Nested card controls, partial upload, publish duplicate |
| 17 | Pricing relationship ambiguity → row/field context | Tier input names include range and currency; error linked; no drag needed | PW `admin-catalog-keyboard.spec.ts`; keyboard edit/publish and 200% zoom | Historical economics, changed tier ordering/rules |
| 18 | Faint functional contrast/tiny targets → measured floors | Focus visible/not obscured; state independent of color | PW `visual-contracts.spec.ts`; physical touch targets, 200%/400%, text spacing, portrait/landscape | Canvas usable area, overlapping pseudo hit regions |
| 19 | Piecemeal motion/status → restrained feedback | No repeated saved tick, errors persist; motion reduce retains final visible state | PW `reduced-motion-status.spec.ts`; physical reduced-motion preference, save failure and upload completion speech | Invisible GSAP elements, live spam, false save success |
| 20 | No axe → route/state scans | Private route verified before scan; dialogs/menus/errors included | PW `axe-customer.spec.ts`, `axe-editor.spec.ts`, `axe-admin.spec.ts`; inspect raw violations and any exception | Scanning wrong route, full-page exclusions, invalid fixture auth |
| 21 | No keyboard regression → complete journeys | Keyboard tests navigate from document without click/focus bypass; click-only alternatives separate | `pnpm run test:a11y` and `pnpm run test:a11y:mobile`; exercise actual mobile focus/keyboard | Tests proving only locators/defaults, CI retries hiding defects |
| 22 | No speech evidence → recorded AT matrix | Actual names/order/messages understood; no critical task depends on chord | Run manual rows below; attach browser/AT/device versions and observations | Emulation falsely claimed as physical SR proof |
| 23 | No future contract → reusable concise guidance | Document actual keyboard map and focus fallback; no fake shortcuts | Read docs against working app + run `pnpm run test:a11y`; no doc-content tests | Docs diverge from implemented keys/widget model |
| 24 | Separate tests/no signoff → integrated fail-closed release | All automated flows plus required manual rows pass | `pnpm run gate:release`; existing SQL gates also pass in isolated CI | Skipped DB, fake keys, absent manual evidence, lost State45 jobs |

### Shared policy decisions for forms and overlays

- Required markers: visible `Bắt buộc` or explanatory text for `*`, plus native required/aria-required. Error IDs stable and linked by aria-describedby; never placeholder-only labels.
- Checkout summary only for 2+ errors: focus summary heading (`tabIndex=-1`), list field links; one-field failure focuses field. Remove multiple simultaneous assertive field alerts when summary is spoken. Do not announce both focused heading and identical live step text.
- Read-only/disabled: selection for inspection remains possible; mutation controls native disabled or omitted, visible reason where useful. Do not disable a Layers row merely because the object is locked. No hover-only permission reason.
- Tooltips: optional detail also appears on keyboard focus, dismissible by Escape, hoverable/persistent per 1.4.13. Essential name on button, not only title. Do not create Tooltip dependency where visible description suffices.
- Context menus: no separate right-click-only essential action found in inspected Canvas. Existing More commands are the keyboard alternative. If retaining/adding Shift+F10 alias, point to same action menu, not new operations. No shortcut is sole path.
- Download/copy names identify purpose (`Tải file in mặt trước`, `Sao chép nội dung chuyển khoản`); success status never includes copied PII. Skeletons aria-hidden, busy scoped to affected panel.
- Navigation: descriptive document.title/h1 per route; customer/admin shells have exactly one main landmark. Global error fallback is a full HTML document with lang=vi, safe heading and keyboard reload; local error boundaries preserve shell focus.

## 12. Manual evidence and release signoff

Task 22 creates `docs/accessibility/state46-manual-qa.json` alongside readable QA markdown. Task 24 validates this data via `scripts/state46-release-readiness.ts`. This file is evidence, not a fabricated default-pass checklist.

```ts
interface ManualEvidence {
  releaseCommit: string;
  reviewedAt: string;
  rows: Array<{
    id: string;
    status: 'pass' | 'fail' | 'not-run';
    tester: string;
    browser: string;
    assistiveTechnology: string;
    device: string;
    evidence: string;
    observations: string;
  }>;
  findings: Array<{
    id: string;
    severity: 'P0' | 'P1' | 'P2';
    criterion: string;
    status: 'open' | 'resolved' | 'not-applicable';
    rationale: string;
  }>;
}
```

Required IDs: `customer-keyboard`, `admin-orders-keyboard`, `admin-content-keyboard`, `drag-alternatives`, `nvda-chromium`, `voiceover-macos-safari`, `voiceover-ios-safari`, `talkback-android-chrome`, `zoom-200`, `reflow-320`, `text-spacing`, `reduced-motion`, `mobile-targets`, `mobile-ime`, `orientation`, `status-announcements`. All required rows pass on tested release candidate; commit matches candidate or contains explicit unchanged-surface revalidation, no blank tester/version/evidence. Fail on missing evidence, any not-run/fail required row, P0/P1 open, or unresolved actual A/AA violation of any severity. P2 usability enhancements beyond AA may be accepted with rationale; not a loophole for conformance defects.

Each journey row contains **precondition → user input → expected focus → expected speech/content → authoritative final state → failure/recovery case**:

1. Customer keyboard: seeded published product/template; Tab/Enter choose product/variant/template, open Editor; Layers select text; `Sửa chữ`, type Vietnamese with IME, finish; select image placeholder, `Thay ảnh`, file chooser; Transform; Font/Color; Preflight; quantity; Checkout; QR. Assert same design in order version and correct due-now/reference. No mouse in this row.
2. Customer SR: announce product/surface/object count; select text/image/group by factual name; locked object readable but cannot mutate; edit text/replace image; Preflight severity and object jump; complete Checkout. Record actual speech not only ariaSnapshot.
3. Admin operations: real admin isolated fixture, search/filter Order, payment confirmation safe initial focus, design review/approval, Start then Complete Production. Assert one event per action and immutable production snapshot. Editor-role variant cannot perform privileged action and reason readable.
4. Content: native file chooser/upload progress, sticker/font metadata, selected count, Publish dialog, Template author customerLock/placeholder and Customer Preview; return focus remains logical after controls disappear.
5. Drag alternatives: same element starting frame used for pointer baseline and click-only numeric/buttons; compare persisted frames for move/resize/rotation/crop/reorder; expand/collapse sheet by button. Brush single-point stamp at given X/Y equals pointer click stamp.
6. Zoom/reflow: 200% browser zoom and 320 CSS px equivalent 400%; text-spacing overrides; dialogs/scrollers keep close/submit reachable. Canvas spatial exception only inside workspace; surrounding document does not need horizontal+vertical page scrolling.
7. Mobile: real iOS VoiceOver and Android TalkBack; software keyboard open in text/hex/transform/Checkout/OTP fields; focused element remains visible above keyboard and authored footer/sheet. Portrait and landscape. Pinch browser zoom not disabled.
8. Motion/status: OS reduced-motion; route/sheet/preview/toast visible without animation dependence; save failure persistent, upload complete/preflight summary/OTP failure announced once; no focus shift for normal statuses.

No actual device? Mark not-run, assign tester/device prerequisite, block release—not plan authoring. Safari WebKit emulation does not replace Apple hardware VoiceOver.

## 13. Requirement traceability (user sections 1–200)

| User section IDs | Concrete plan ownership |
|---|---|
| 1–4 | Architecture header, §3, Tasks 4–7: one Editor state, no pixel mirror |
| 5–8 | §1/4/14 inventories and P0/P1/P2, Task 1 |
| 9–14 | Tasks 2/3/12/15–17, native semantics/landmarks/titles/skip |
| 15–22 | Tasks 2/3/10/18/21, focus visible/not obscured/restore/no traps |
| 23–35 | §3.3/10, Tasks 5/6, keyboard/Layer selection/multi-select |
| 36–48 | §1 drag matrix, Tasks 4/7/8/9/10, numeric transform/crop/reorder/detents/color/zoom |
| 49–55 | Task 5 toolbar/shortcut discovery/platform/Escape |
| 56–64 | Tasks 8/9/11, text/font/sticker/image/removal/surfaces/preview |
| 65–67 | Task 11, structured Preflight and navigation/announcements |
| 68–80 | Tasks 13/14, form labels/errors/OTP/QR/quantity/pricing |
| 81–90 | Tasks 15–17, Admin lists/filters/status/confirmations/content/template/pricing |
| 91–96 | Tasks 2/19 and §3.2, live regions/save/Undo/upload |
| 97–106 | Task 18, text/non-text/focus contrast and correct 24/44px interpretation |
| 107–116 | Tasks 18/19 and §11, text resize/reflow/orientation/motion/hover |
| 117–127 | Tasks 3/5/6/9/12/15/16, names/states/native controls/menus/images/icons |
| 128–137 | Tasks 4–7/22/23, semantic authoring, property association, SR/switch/voice, no special mode |
| 138–149 | Tasks 20–22, axe dynamic states, scoped exceptions, keyboard/no-drag/focus/targets/manual status |
| 150–155 | Tasks 2/3/23, architecture/component contracts, ESLint compatibility decision |
| 156–166 | Tasks 4–10/15/18, pointer regression, focus vs selection, input guards, keyboard viewport, read-only/permissions |
| 167–176 | Tasks 2/12–19, busy/skeleton/async/table/download/copy/destructive/localization/decor |
| 177–186 | §12 manual matrix; Tasks 18/19/22; supported browser/AT and documented limits |
| 187–196 | Tasks 1/20–24, release/regression/State47/schema/fixtures/development checklist |
| 197–199 | §10 DAG, Tasks 1–24 format, §9 deferrals |
| 200 DoD 1–13 | Tasks 1–6/10/12/15–17/21 |
| 200 DoD 14–21 | Tasks 4/6–10/21 |
| 200 DoD 22–28 | Tasks 2/18/19/21/22 |
| 200 DoD 29–35 | Tasks 11–19/21/22 |
| 200 DoD 36–43 | Tasks 20–23 and physical-device evidence |
| 200 DoD 44–47 | Task 24 plus existing State45 SQL/security/reliability gates |


### Final execution clarifications

- Short E2E filenames in task file lists resolve under `e2e/accessibility/`; existing short unit filenames resolve under `src/test/`. No production file path may be guessed. Every new `e2e/accessibility` spec is created by its owning behavior task; Task 21 integrates/extends them rather than postponing all tests.
- Task 20 adds `test:a11y` and `test:a11y:mobile` scripts as listed in Task 24 so Task 21 commands exist. Task 24 adds only aggregate CI/release wiring and readiness validation, not duplicate tests.
- Additional exact Task 2/12 shell files: `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/checkout/error.tsx`, `src/app/my-designs/error.tsx`, `src/app/my-orders/error.tsx`, `src/app/global-error.tsx`. Add unique titles through valid App Router metadata/layout boundaries; do not export metadata from an existing client page. Read installed Next docs before choosing page/layout composition.
- Task 15 also verifies `src/app/admin/login/page.tsx` keyboard labels/errors and retained safe redirect. Existing cancellation code, if found, is not permission to add cancellation to production workflow. Production complete means manufacturing finished, not delivered/shipped; confirmation copy must retain that meaning.
- Task 1 group parser fix validates parent existence, group parent type, same-surface grouping and cycles. Test group serialization/reload/immutable inspection; do not weaken existing invalid-document rejection.
- Task 24 release readiness supports candidate evidence passed by an explicit file argument/env in CI; missing artifact fails release, not converted into a passing placeholder. Ordinary developer `gate` remains static checks/build; release deployment uses `gate:release` plus existing SQL/security jobs. Required status checks must include accessibility stage.
- Pointer cancellation (2.5.2): structural actions activate on click/up, not pointer-down alone; cancelled/lost-capture transforms discard transient preview without committing. Test pointercancel on drag/crop/resize and retention of selected object. No single-character global shortcuts (2.1.4).
- Contrast compliance: 4.5:1 normal text; 3:1 large text and meaningful UI graphics; inactive controls use applicable exceptions but remain understandable. Focus-visible 2.4.7 and not-obscured minimum 2.4.11 are AA; 2.4.13 focus appearance and 2.3.3 interaction animation are AAA/internal stronger goals, not mislabeled AA requirements.
- Approaches considered: ARIA pixel mirror rejected for duplicate state/focus noise; separate accessibility mode rejected for divergent authoring paths; semantic Layers plus shared properties selected for native interoperability and State 47 maintainability.

**Planning verification only:** Source inventory and Base UI/Next API inspection completed; isolated dev browser smoke and token contrast calculations recorded in §2. File/task-reference validation performed on this plan. Application implementation, axe suite, production build, physical-device AT QA and release signoff remain future execution work; none is marked passing by this document.
