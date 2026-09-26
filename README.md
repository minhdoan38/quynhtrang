# Print Product Customizer

Mobile-first, zero-dependency browser demo for personalizing four print products: wrapping paper, greeting cards, die-cut stickers, and notebook covers. UI copy is Vietnamese. All editing and checkout behavior runs locally in browser.

## Local setup

No install or build step is required. From project root, start a native static server:

```sh
python -m http.server 4173
```

Then open <http://localhost:4173/>. Serving over HTTP is required because `index.html` loads ES modules; opening file directly is not supported.

## Architecture

| Module | Responsibility |
| --- | --- |
| `index.html` | Accessible application shell for editor, preview/preflight, checkout, confirmation, bottom navigation, sheets, and toast feedback. |
| `styles.css` | Mobile-first layout plus product canvas/mockup treatments: wrapping-paper box, folded card, sticker cut line, and notebook safe area. |
| `product-state.js` | DOM-free domain layer: immutable product configuration, initial design state, reducer-style transitions, order summary, and preflight result. |
| `app.js` | Browser adapter: restores/persists the session, binds delegated events, manages undo/redo and active view, handles uploads, renders views, and creates local demo orders. |
| `product-state.test.mjs` | Node tests for defaults, immutable transitions, summaries, and image-quality preflight. |

Data flows in one direction:

1. A DOM event becomes an action in `app.js`.
2. `transitionState(currentState, action)` returns a new design state.
3. `app.js` records undo history, saves serializable state to `sessionStorage`, and renders the editor, preview, preflight, and checkout summary from that state.
4. `getDesignSummary` and `getPreflight` derive display data; derived values are not stored in the editable design.
5. Order submission takes a JSON snapshot of design and summary, adds customer data, and saves a pending local demo order.

State is deliberately separated:

- **Document state:** selected product/variant/template, text, colors, image metadata/source, quantity, and product-specific options.
- **Transient editor UI:** active view, undo/redo stacks, toast timer, current object URL, and upload sequence stay in `app.js` memory.
- **Checkout state:** customer data and the immutable design/summary snapshot live in `pendingOrder`, separate from the editable design.
- **Derived state:** pricing and preflight checks are recomputed by pure functions.

`PRODUCTS` is the single product configuration registry. Adding or changing a product starts there; editor choices, variants, base pricing, and default product options are rendered from this registry rather than duplicated in view code.

## Route and view map

This is a single-page application with view transitions, not URL routes.

| Conceptual route/view | DOM surface | Entry and exit |
| --- | --- | --- |
| Home / product choose | `#editor-view`, `#product-choices` | Initial surface. Choose one of four products and its variant. Product choice and editor share one page. |
| Editor | `#editor-view` | Choose template, enter text, upload image, set colors, and use contextual product controls. “Đặt lại” clears text/image; undo/redo remain session-memory actions. |
| Preview modal | `#preview-view`, `#preview-modal` | “Xem thử” opens a product mockup and derived order summary; close/edit returns to editor. |
| Preflight check | `#preflight` inside preview | Runs whenever preview renders and reports image-quality status without blocking progression. |
| Checkout modal/view | `#checkout-view`, `#customer-order-form` | Continue from preview. Adjust quantity and enter recipient details; browser constraints and app checks guard submission. |
| Confirmation screen | `#confirmation` inside checkout | Appears after a local demo order is created. Shows an explicitly unverified QR illustration and offers “Tạo thiết kế mới”. |

Normal flow is product choose/editor → preview + preflight → checkout → confirmation. Back controls return to editing without a network navigation.

## Domain model

### `PRODUCTS` schema

`PRODUCTS` is a frozen record keyed by product ID:

```js
{
  [productId]: {
    id: string,
    name: string,
    defaultVariant: string,
    variants: [{ id: string, name: string, price: number }],
    defaultOptions: object
  }
}
```

Current product-specific configuration:

- `wrapping`: A1/A2 variants; repeat/single mode, regular/scattered/brick layout, pattern scale, spacing, and rotation defaults.
- `card`: horizontal/vertical variants; front/inside surface default and fold control in editor.
- `sticker`: die-cut/sheet variants; white-border toggle and border width.
- `notebook`: standard variant; matte/glossy finish. Canvas and mockup show the inset safe area.

### Design state

`createInitialState(productId)` returns the serializable editable document:

```js
{
  productId: string,
  variantId: string,
  templateId: string | null,
  text: string,
  color: string,
  backgroundColor: string,
  image: null | {
    name: string,
    type: "image/png" | "image/jpeg" | "image/webp",
    size: number,
    src: string,
    width: number,
    height: number
  },
  quantity: number,
  productOptions: object
}
```

`transitionState` handles `SET_PRODUCT`, `SET_VARIANT`, `SET_TEMPLATE`, `SET_TEXT`, `SET_COLOR`, `SET_BACKGROUND_COLOR`, `SET_IMAGE`, `SET_QUANTITY`, and `SET_PRODUCT_OPTION`. Product switches reset variant, template, and product options to valid defaults while retaining shared design content.

### Derived summary

`getDesignSummary(state)` resolves configured product and variant, normalizes quantity to at least one, and returns product/variant labels, quantity, unit price, total price, and a Vietnamese đồng display label. Price is an estimate computed as `variant.price × quantity`.

### Preflight rules

`getPreflight(state)` is advisory and non-blocking:

- No uploaded image: pass, because no image needs checking.
- Uploaded image with either dimension below 1200 pixels: warning that print may look blurry.
- Uploaded image at least 1200 × 1200 pixels: pass.
- Overall level is `error` if any error exists, otherwise `warning` if any warning exists, otherwise `pass`. Current rules emit pass or warning only.

## Editor state machine

The application uses conceptual workflow states below. `app.js` currently represents `EDITING`, `PREVIEW`/`PREFLIGHT`, and `CHECKOUT`/`CONFIRMATION` with an active `view` plus `pendingOrder`; names are documentation labels, not exported constants.

| State | Meaning | Transition |
| --- | --- | --- |
| `IDLE` | No restored interaction yet; initial state is being created or restored. | App render enters `EDITING`. |
| `EDITING` | Product choice and design editor are active. | Open preview → `PREVIEW`; checkout action first routes through preview. |
| `PREVIEW` | Product mockup and summary are visible. | Preview render performs `PREFLIGHT`; close/edit → `EDITING`. |
| `PREFLIGHT` | Derived readiness checks are visible alongside preview. | Continue → `CHECKOUT`; edit → `EDITING`. Warnings do not block checkout. |
| `CHECKOUT` | Quantity and recipient form are active. | Valid local submission creates pending order → `CONFIRMATION`; back → `EDITING`. |
| `CONFIRMATION` | Local demo order and unverified QR illustration are visible. | Start over clears design/order and returns to `EDITING`. |

## Persistence and payment boundary

Two versioned `sessionStorage` entries are used:

- `print-customizer-state-v1`: current editable design.
- `print-customizer-order-v1`: pending local demo order with customer fields, design snapshot, derived summary, timestamp, `status: "pending"`, and `paymentStatus: "unverified"`.

Persistence is scoped to the current browser tab/session. There is no database, API, account, upload service, order fulfillment, or cross-device synchronization. Browser object URLs used for uploaded images are temporary; if an object URL cannot be restored after reload, users must upload the image again.

The confirmation QR is a visual placeholder for an **unverified payment demo**. It does not encode a real payment request, contact a payment provider, verify funds, or mark an order paid. No fake backend is present, and no submitted customer/order data leaves the browser.

## Verification

Run domain tests and syntax checks from project root:

```sh
node --test product-state.test.mjs
node --check app.js
node --check product-state.js
node --check product-state.test.mjs
```
