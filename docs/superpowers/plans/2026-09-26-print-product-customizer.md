# Print Product Customizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free, mobile-first product customizer vertical slice that lets a first-time customer choose a print product, select a template or blank start, customize a product-aware preview, review preflight feedback, and submit a guest checkout demo.

**Architecture:** A static browser app keeps one `designState` object as the source of truth for product, variant, template, text, colors, image, product-specific controls, quantity, and checkout data. Pure state transitions live in `product-state.js`; `app.js` renders the editor, preview, preflight, and checkout views from that state. CSS provides the responsive layout and product mockups without canvas or third-party dependencies; server persistence is represented honestly as a local demo boundary, not a fake backend.

**Tech Stack:** Native HTML, CSS, and ES modules; browser APIs (`FileReader`, `URL.createObjectURL`, `sessionStorage`); Node's built-in test runner for pure state checks.

**Spec:** `master_prompt_print_product_customizer.md`

## Global Constraints

- Product behavior stays configuration-driven; product-specific controls come from `PRODUCTS` data.
- Customer-facing copy uses short Vietnamese labels and hides print jargon.
- Mobile editor is canonical: no desktop-only interaction is required for core actions.
- Use one document state source; derive preview, summary, and preflight from it.
- Keep QR state `unverified`; showing QR never claims successful payment.
- Use no external dependencies, no server claims, no AI, no printer workflow, and no full admin surface in this initial vertical slice.
- Preserve uploaded source via object URL and use local/session persistence only for lightweight demo state.
- Interactive controls have visible focus, semantic labels, and touch-sized targets.

---

## File map

- Create: `index.html` - semantic shell, route-like view regions, modal containers, checkout form.
- Create: `styles.css` - mobile-first visual system, responsive editor layout, preview mockups, focus/reduced-motion states.
- Create: `product-state.js` - product definitions, default state, pure state transitions, derived summary and preflight functions.
- Create: `app.js` - DOM rendering, event delegation, file upload, view transitions, session persistence, and browser-only interactions.
- Create: `product-state.test.mjs` - Node built-in tests for state defaults, product-specific transitions, derived summary, and preflight.
- Create: `README.md` - setup, route map, architecture summary, domain model, state machine, and current scope boundary.

### Task 1: Establish domain model and state engine

**Files:**
- Create: `product-state.js`
- Create: `product-state.test.mjs`

**Interfaces:**
- `PRODUCTS`: product configuration keyed by `wrapping`, `card`, `sticker`, and `notebook`.
- `createInitialState(productId = 'wrapping')` returns serializable state.
- `transitionState(state, action)` returns a new state for product, variant, template, text, color, image, and product-specific actions.
- `getDesignSummary(state)` returns customer-facing summary and price estimate.
- `getPreflight(state)` returns `{ level, checks }` with `pass`, `warning`, or `error` checks.

- [ ] Write failing Node tests for default wrapping state, product switching, pattern transition, derived summary, and an image-quality warning.
- [ ] Run `node --test product-state.test.mjs`; expect failure because the module does not exist.
- [ ] Implement the minimum typed-by-convention configuration and pure functions.
- [ ] Run `node --test product-state.test.mjs`; expect all tests to pass.

### Task 2: Build semantic application shell

**Files:**
- Create: `index.html`

**Interfaces:**
- Uses `data-action` attributes consumed by `app.js`.
- Provides `#app`, `#editor-view`, `#preview-view`, `#checkout-view`, `#sheet`, and `#toast` mount points.

- [ ] Add accessible header, product chooser, template/start chooser, editor canvas, contextual controls, bottom navigation, preview, preflight, quantity, customer form, and QR confirmation containers.
- [ ] Keep all control labels in Vietnamese and include hidden labels for icon-only actions.
- [ ] Run `node --check app.js` after Task 3 is present and verify no HTML IDs required by rendering are missing.

### Task 3: Implement state-driven browser behavior

**Files:**
- Create: `app.js`

**Interfaces:**
- Imports `PRODUCTS`, `createInitialState`, `transitionState`, `getDesignSummary`, and `getPreflight`.
- Renders `editor`, `preview`, `checkout`, and `confirmation` app views.
- Persists serializable state to `sessionStorage` under `print-customizer-state-v1`.

- [ ] Render initial product and template state from `product-state.js`.
- [ ] Wire delegated events for product/variant/template selection, text/color controls, product-specific controls, preview, preflight, quantity, reset, and checkout.
- [ ] Preserve uploaded image object URL during the current session and show a clear error toast for unsupported/failed uploads.
- [ ] Render a read-only preflight panel before checkout and keep checkout local/demo-only.
- [ ] Run `node --check app.js` and `node --check product-state.js`; expect no syntax errors.

### Task 4: Style responsive product-customizer surface

**Files:**
- Create: `styles.css`

**Interfaces:**
- Defines tokens and classes used by `index.html` and render templates.
- Mobile layout uses stacked editor/canvas/controls and bottom navigation; desktop adds persistent side panels without changing behavior.

- [ ] Implement calm editorial consumer palette, product mockups, selected states, empty state, warning/error/pass states, form styling, modal/sheet behavior, and focus-visible states.
- [ ] Implement product-specific visual variants for wrapping pattern, card fold, sticker border, and notebook safe area.
- [ ] Add `prefers-reduced-motion` rules and prevent horizontal overflow at narrow widths.
- [ ] Run a browser smoke check at 390px and 1440px widths; verify no clipping, overflow, or unreadable controls.

### Task 5: Add project documentation and run verification

**Files:**
- Create: `README.md`

- [ ] Document the current route map, domain model, editor state machine, persistence boundary, checkout limitation, and local run command.
- [ ] Run `node --test product-state.test.mjs`, `node --check app.js`, `node --check product-state.js`, and `node --check product-state.test.mjs`.
- [ ] Start a local static server with `python -m http.server 4173` and exercise product selection, template selection, text edit, image upload, product controls, preview, preflight, quantity, form validation, QR demo, and reset in a browser.
- [ ] Review final file contents and confirm no placeholders, fake payment claims, external dependencies, or modified verification assets.
