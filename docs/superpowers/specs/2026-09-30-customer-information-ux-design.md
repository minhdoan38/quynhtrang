# State 35: Customer Information UX Design Specification

## 1. Purpose

State 35 is Checkout Step 2 for the mobile-first print customizer. It collects only the information required to prepare and fulfill an order after the customer has completed design, acknowledged Preflight, confirmed the product, selected quantity, and reviewed the subtotal in State 34.

**Guiding principle:** Three required fields, guest-first, preserve everything, create the real order only when the customer continues.

The customer should think:

> Nhập thông tin nhận hàng rồi tiếp tục thanh toán.

The customer must not feel that they are registering an account or completing a long ecommerce form.

## 2. Position in flow

```text
Editor
  → Preflight
  → State 34: Sản phẩm + Số lượng
  → State 35: Thông tin nhận hàng
  → State 36: QR thanh toán
  → Order confirmation
```

State 35 is `Bước 2 / 3`.

### Entry contract

State 35 receives or loads a checkout draft containing:

- the current design/project reference;
- product and variant;
- quantity;
- server-recomputable price context;
- the design revision that passed or was acknowledged by Preflight;
- any already-promoted asset references;
- previously entered customer information, if returning from State 34 or a refresh.

State 35 MUST NOT create an order on entry.

### Exit contract

A successful Continue action returns:

- stable server-created `orderId`;
- immutable approved design version reference;
- price amount copied into the pending order snapshot;
- payment data required by State 36;
- pending payment status.

State 36 MUST NOT render until this contract exists.

## 3. Goals

1. Let a first-time mobile guest enter delivery information quickly.
2. Require exactly three customer fields in MVP.
3. Support Vietnamese Unicode, mobile keyboards, autofill, paste, and IME composition.
4. Preserve valid input through validation errors, Back navigation, refresh where possible, and retry.
5. Keep customer/order data separate from `DesignState` and editor history.
6. Promote local-only project assets to server-backed references before creating an order.
7. Create one immutable approved design version and one pending order per checkout submission.
8. Prevent duplicate orders from double taps, retries, and refresh recovery.
9. Keep the current warm stationery visual system while making the operational form quieter and more focused.
10. Provide customer-readable loading and failure states without exposing implementation details or PII.

## 4. Non-goals

State 35 MUST NOT add:

- email collection or email requirement;
- login, password, account creation, username, or guest-vs-login choice;
- separate first/middle/last name fields;
- province, district, ward, street, house-number, postal-code, country, billing-address, or multi-page address fields;
- address map lookup or third-party address suggestions;
- shipping-method selection or invented shipping fees;
- order notes by default;
- promo codes, cart, cross-sell, or marketing opt-in;
- payment QR, bank details, payment status controls, or delivery tracking;
- prominent design editing controls inside the form;
- editor undo/redo entries for customer information changes;
- analytics payloads containing name, phone, address, or raw form values;
- an admin order dashboard or account migration flow.

Optional account/login may be introduced after order creation or confirmation in a later state. It must not block State 35.

## 5. User experience

### 5.1 Page structure

Mobile composition:

```text
← Thông tin nhận hàng                         Bước 2 / 3

Thông tin nhận hàng
Nhập thông tin để chúng mình liên hệ và giao đơn.

Họ và tên
[ Nguyễn Văn A ]

Số điện thoại
[ 09xx xxx xxx ]
Dùng để liên hệ về đơn hàng khi cần.

Địa chỉ nhận hàng
[ Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành ]

Thông tin này được dùng để xử lý và giao đơn hàng.

                                      [ Tiếp tục ]
```

The actual page MAY include a small collapsed/secondary order context showing product, quantity, and subtotal. It MUST NOT duplicate the full State 34 summary or add a second quantity control.

### 5.2 Header and navigation

- Header title: `Thông tin nhận hàng`.
- Back action: `← Thông tin nhận hàng` visually, logically State 35 → State 34.
- Progress indicator: `Bước 2 / 3` or equivalent compact progress treatment.
- Browser/system Back MUST follow the same State 35 → State 34 transition.
- Returning to State 35 MUST restore `fullName`, `phone`, and `shippingAddress`.
- Back MUST NOT return directly to the editor from State 35.

### 5.3 Required fields

MVP contains exactly:

| Field | Visible label | Control | Autofill | Input behavior |
|---|---|---|---|---|
| Full name | `Họ và tên` | Single-line input | `name` | Vietnamese and international Unicode; trim edges only |
| Phone | `Số điện thoại` | Telephone input | `tel` | `inputMode="tel"`; paste and common formatting allowed |
| Address | `Địa chỉ nhận hàng` | Multiline textarea | `street-address` | Flexible full address; preserve entered content substantially |

Labels MUST remain visible above controls while typing. Placeholder text MUST NOT be the only label.

All three fields are required. Do not add visual `*` markers to every label if the section already communicates that all fields are required; semantic required state remains mandatory in the DOM.

### 5.4 Field copy

Approved customer-facing copy:

- Name placeholder: `Nguyễn Văn A`.
- Phone placeholder: `09xx xxx xxx`.
- Phone help: `Dùng để liên hệ về đơn hàng khi cần.`.
- Address placeholder: `Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành`.
- Primary CTA: `Tiếp tục`.
- Loading CTA/status: `Đang chuẩn bị đơn hàng...`.
- Failure title: `Chưa thể chuẩn bị đơn hàng.`.
- Failure support: `Kiểm tra kết nối và thử lại.`.
- Retry action: `Thử lại`.
- Name error: `Nhập họ và tên.`.
- Phone error: `Kiểm tra lại số điện thoại.`.
- Address error: `Nhập địa chỉ nhận hàng đầy đủ hơn.`.

Do not show raw server errors, route names, upload filenames, API methods, or internal version terminology to the customer.

### 5.5 Input behavior

- Do not autofocus on page load if it opens the keyboard and obscures context.
- Keyboard order is name → phone → address → done.
- Native autofill MUST remain enabled.
- Paste MUST remain enabled.
- Vietnamese IME composition MUST NOT trigger premature validation errors.
- Input values MUST NOT be reformatted destructively while the customer types.
- The form remains scrollable when the virtual keyboard is open.
- The sticky CTA MUST respect the device safe area and MUST NOT permanently cover the active field.
- Input and button touch targets MUST be at least 44 CSS pixels high.
- Desktop uses the same flow with a constrained readable form width; it is not a separate checkout product.

## 6. Validation

Validation is intentionally lightweight and must catch obvious mistakes without pretending to verify deliverability.

### 6.1 Normalization

```ts
function normalizeCustomerInfo(input: CustomerInfoInput): CustomerInfo {
  return {
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    shippingAddress: input.shippingAddress.trim(),
  };
}

function normalizePhoneForValidation(phone: string): string {
  return phone.replace(/[\s().-]/g, '');
}
```

Name normalization MUST preserve capitalization, accents, repeated internal spaces, and non-ASCII letters. Do not title-case or reject names such as `Nguyễn`, `Đỗ`, or `Trần`.

Address normalization MUST only remove accidental leading/trailing whitespace. Preserve the customer-entered address text.

Phone display text MUST remain customer-entered. A normalized phone representation MAY be stored separately for validation/order operations.

### 6.2 Rules

- Name: non-empty and within a reasonable bound; the implementation MUST accept common Vietnamese and international names and MUST reject only empty or clearly unreasonable input.
- Phone: non-empty, contains a plausible number after removing common separators, and is not clearly too short or malformed. Do not enforce one narrow provider-specific regex.
- Address: non-empty and meets a sensible minimum length for a usable full address. Do not claim an address does not exist without an address verification service.

The exact bounded constants MUST be centralized in `src/lib/customer-info.ts` and covered by tests rather than duplicated in JSX or route handlers.

### 6.3 Timing and feedback

- Do not show red errors before the customer has had a reasonable chance to type.
- Validate a field on blur after it has been touched.
- Validate all fields on Continue.
- While correcting an existing error, update or clear that field's error without clearing other values.
- If multiple fields fail, render all inline errors and focus/scroll to the first invalid field.
- Do not use an error modal or error-only toast.
- Error text MUST be programmatically associated with its control and readable by assistive technology.
- Invalid state MUST use semantics and text, not color alone.

## 7. Data model and persistence

### 7.1 Customer information

Replace the current demo shape with a State 35-specific order shape:

```ts
export interface CustomerInfo {
  fullName: string;
  phone: string;
  shippingAddress: string;
}
```

`email` and `note` are out of State 35 scope and MUST NOT remain as active form fields or be required by the order contract. Existing callers MUST migrate to the new names; do not retain compatibility aliases.

### 7.2 Checkout draft

```ts
export interface CheckoutDraft {
  id: string;
  designRevision: string;
  design: DesignState;
  productId: ProductId;
  variantId: string;
  quantity: number;
  priceQuote: PriceQuote;
  customer: CustomerInfo;
  preflightRevision: string;
  preflightAcknowledged: boolean;
  promotedAssets: PromotedAsset[];
  approvedDesignVersionId?: string;
  orderId?: string;
  status: 'editing' | 'promoting' | 'creating-order' | 'ready-for-payment' | 'failed';
  updatedAt: string;
}
```

The exact persistence adapter may store only the fields required to reconstruct the draft, but it MUST preserve customer input, product/quantity context, revision references, promotion results, and retry state.

Customer information is order data, not design data. It MUST NOT be added to `DesignState`, the editor history stack, or design undo/redo transactions.

### 7.3 Client persistence

- Store the checkout draft in `sessionStorage` for the current guest session.
- Rehydrate the draft on State 35 mount and after browser Back.
- Preserve fields through validation failure and retry.
- Preserve quantity and design state when returning to State 34.
- On successful order creation, store enough order reference to recover State 36 after a refresh.
- Do not treat a local project ID or `localStorage` recent-project ID as the final order identity.

## 8. Server boundary and order creation

### 8.1 Current implementation gap

The existing demo sends `DesignState` and customer data directly to `POST /api/orders`, stores an in-memory snapshot, and retains browser `blob:` image URLs. This is insufficient for a real guest-to-order boundary because a server cannot reliably reproduce a browser-only blob URL, a process restart loses orders, and repeated submissions can create duplicates.

State 35 replaces that demo boundary with a single recoverable preparation flow. The implementation MUST keep the adapter boundary small so a later object-storage/database provider can replace the local demo adapter without changing checkout UX.

### 8.2 Promotion and creation sequence

On a valid explicit Continue:

```text
1. Normalize and validate CustomerInfo on client.
2. Validate the same customer/order invariants on server.
3. Confirm the checkout draft and design revision are current.
4. Re-evaluate or verify the relevant Preflight revision.
5. Promote local-only project assets to server-backed asset records.
6. Reuse existing promoted assets on retry; do not create duplicates.
7. Create one immutable ApprovedDesignVersion containing the complete reproducible design.
8. Recompute the price quote on server from product, variant, options, and quantity.
9. Create one pending-payment Order referencing the approved design version.
10. Return order ID, amount, payment state, and State 36 payment data.
```

No QR may be displayed before steps 5–9 complete.

### 8.3 Asset contract

```ts
export interface PromotedAsset {
  id: string;
  sourceKey: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  originalUrl: string;
  derivedUrls?: Record<string, string>;
  checksum?: string;
}
```

Asset promotion MUST:

- reject unsupported or clearly unsafe file metadata;
- preserve original assets and derived background-removal/mask outputs when they are referenced by the design;
- replace browser-only `blob:` references in the approved snapshot with server-backed asset references;
- report a recoverable failure without discarding the checkout draft;
- reuse an already-promoted asset identified by stable source/checksum where possible.

For the current non-production runtime, a server filesystem adapter is acceptable only if it is explicit, bounded, and persistent across requests. The design MUST leave a provider boundary for object storage later. Do not claim serverless durability from an in-memory map.

### 8.4 Design revision and Preflight integrity

```ts
export interface ApprovedDesignVersion {
  id: string;
  revision: string;
  design: DesignState;
  assets: PromotedAsset[];
  preflightRevision: string;
  preflightSnapshot: PreflightResult;
  preflightAcknowledged: boolean;
  createdAt: string;
}
```

The approved version MUST capture all state required to reproduce the ordered design, including:

- all card surfaces and surface-local elements;
- wrapping-paper pattern configuration and source composition;
- sticker contour configuration where relevant;
- fixed-sticker shape and background;
- notebook background and binding-related product options;
- image crop, masks, opacity, and derived assets;
- text, colors, fonts, z-order, locks, groups, and transforms;
- product, variant, quantity, and server-calculated price context;
- the relevant Preflight snapshot and revision.

If the design changed after the acknowledged Preflight revision, the server MUST reject order creation with a stable stale-revision error. The client MUST remain recoverable and route the customer back to Preflight instead of creating an order from an unvalidated design.

### 8.5 Order contract

```ts
export type OrderStatus = 'pending_payment' | 'processing' | 'completed' | 'cancelled';

export interface PendingOrder {
  id: string;
  idempotencyKey: string;
  status: OrderStatus;
  paymentStatus: 'pending' | 'confirmed';
  customer: CustomerInfo;
  product: {
    productId: ProductId;
    variantId: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  };
  approvedDesignVersionId: string;
  preflightRevision: string;
  createdAt: string;
}
```

The server MUST create a stable customer-facing order ID before QR payment. The order MUST remain `pending_payment` and MUST NOT be marked paid by State 35.

The order snapshot MUST copy product, variant, quantity, quote, and approved design version references rather than depending on mutable catalog values alone.

### 8.6 Idempotency and retry

- Continue MUST be disabled after a valid submit starts.
- Each checkout draft has a stable idempotency key.
- Repeating the same request with the same key MUST return the original order/preparation result, not create a second order.
- A network retry after asset promotion MUST reuse existing promotion records.
- A refresh after successful creation MUST recover the existing order and route to State 36 rather than submit a second order blindly.
- Partial backend state MUST remain internal and retryable; the customer sees either preparation success or a recoverable failure.

## 9. Error and loading states

### 9.1 Loading

During promotion/order creation:

- show `Đang chuẩn bị đơn hàng...`;
- disable Continue and prevent duplicate submission;
- keep form values visible and unchanged;
- announce status to assistive technology;
- do not expose upload filenames, internal operations, or API details.

### 9.2 Failure

When promotion or order creation fails:

- stay on State 35;
- preserve design, quantity, and all customer fields;
- show `Chưa thể chuẩn bị đơn hàng.`;
- show `Kiểm tra kết nối và thử lại.`;
- expose `Thử lại`;
- reuse existing promotion state where possible;
- do not send the customer to QR until the order contract is complete;
- do not log raw customer PII in the browser console, analytics, or unprotected breadcrumbs.

### 9.3 Stale design

When the server reports stale Preflight/design revision:

- do not create an order;
- preserve the checkout draft and customer information;
- return the customer to Preflight with a clear explanation that the design changed and needs checking again;
- require the new Preflight revision before Continue can create an order.

## 10. Accessibility and privacy

- Every field has a programmatic label.
- Required state is represented semantically.
- `aria-invalid` and `aria-describedby` connect controls to errors/help text.
- Focus moves to the first invalid field after submit validation.
- Loading status is announced without interrupting unrelated content.
- Color never carries error meaning alone.
- Form supports Vietnamese IME and screen readers.
- Analytics events contain only event names, non-PII outcome metadata, product context, and error categories.
- Never send full name, phone, address, or raw input values to analytics.
- Never print customer PII into frontend console logs or generic error tracking breadcrumbs.
- Collect no demographic or marketing information.

## 11. Visual and motion direction

State 35 remains in the existing `Quynh Trang Custom Studio` visual system:

- warm paper background `#FFFDF8`;
- quiet warm surface `#FFFFFF`;
- primary action blue `#315F86`;
- deep interaction state `#244A69`;
- warm ink `#2E3338`;
- secondary ink `#666A6D`;
- line `#DDD6CC`;
- danger `#B3535D` with text/icon support;
- Be Vietnam Pro for interface text and Lora only for restrained display emphasis.

The form is an operational surface. It should be calm, clear, and less decorative than template/editor surfaces. Avoid gradients, dense nested cards, icon tiles, excessive borders, or pastel semantic errors.

Motion:

- animate step content entrance with a short horizontal/opacity transition;
- use GSAP through `useGSAP` with a scoped ref and cleanup;
- use transform/opacity rather than layout properties;
- disable or reduce movement under `prefers-reduced-motion: reduce`;
- do not animate field validation in a way that shifts the active input unexpectedly;
- loading state may use a static spinner/status treatment if motion is reduced.

## 12. Component and architecture boundaries

Expected responsibilities:

- `CustomerInformationForm`: render the three fields, touched/error state, focus behavior, and submit callback; it does not create orders.
- `customer-info.ts`: normalization, validation, field error types, and stable messages; usable by client and server tests.
- `checkout-draft.ts`: draft shape, session persistence, recovery status, and idempotency key handling.
- `asset-store.ts`: server-side promotion/reuse of assets; no UI concerns.
- `design-version-store.ts`: immutable approved design versions; no customer form concerns.
- `server-order-store.ts`: idempotent pending-order creation and retrieval.
- `POST /api/orders`: server validation and orchestration boundary; recompute quote and enforce revision/order invariants.
- `checkout/page.tsx`: step navigation, draft hydration, submit/loading/error transitions, and State 36 handoff.

Use installed shadcn primitives where available. If the current project lacks the form field primitive needed for semantic errors, add the official primitive rather than hand-rolling a second form system.

## 13. Success criteria

State 35 is accepted when a first-time mobile guest can:

1. arrive from Order Summary;
2. understand immediately that delivery information is required;
3. enter one full name;
4. enter one phone number;
5. enter one full delivery address;
6. use browser/device autofill where available;
7. correct errors without losing other fields;
8. continue without login or account creation;
9. see one clear `Đang chuẩn bị đơn hàng...` state;
10. have the design and referenced assets safely promoted to server-backed records;
11. receive one immutable approved design version;
12. receive one pending order;
13. arrive at QR Payment with a real server-created Order ID.

## 14. Verification requirements

The implementation MUST provide evidence for:

### Domain and validation

- Vietnamese Unicode name acceptance.
- Name trimming without title-casing.
- Phone acceptance with spaces, dashes, and parentheses.
- Obvious phone rejection without an over-strict provider regex.
- Address minimum/completeness messaging.
- No email/note requirement.
- IME-safe validation behavior at the component boundary.

### Draft/navigation

- Draft survives validation failure.
- Draft survives State 35 → State 34 → State 35.
- Browser Back follows the same step hierarchy.
- Customer data remains outside editor history.
- Refresh recovery does not clear a valid draft.

### Promotion/version/order

- Browser-only `blob:` references are not stored as final order asset references.
- Promoted asset retry reuses existing records.
- Approved version is immutable after source design mutation.
- Approved version contains all required product-specific state.
- Stale Preflight revision blocks creation.
- Server recomputes price rather than trusting client subtotal.
- Repeated idempotent submissions return one order.
- QR handoff does not occur without a real pending order.
- Failure preserves draft and exposes retry.

### UI and runtime

- Form renders at 390×844 without clipping or keyboard-obscured CTA.
- Form remains readable at desktop width.
- Labels, descriptions, and errors are accessible.
- Reduced-motion behavior is respected.
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- Browser smoke test exercises valid submit, each field error, Back/return, refresh recovery, loading, retry, stale revision, and successful State 36 handoff.

## 15. Traceability map

The 108 requirements in the State 35 brief are covered by these sections:

| Requirement range | Spec coverage |
|---|---|
| 1–10: position, fields, no email/account | Sections 1–4, 5.1–5.3 |
| 11–18: name/phone semantics and validation | Sections 5.3–5.5, 6 |
| 19–30: phone help, address, no extra shipping fields | Sections 4, 5.3–5.4, 6 |
| 31–40: labels, layout, keyboard, draft/history | Sections 5, 7 |
| 41–49: inline validation, CTA, keyboard-safe behavior | Sections 5.5, 6.3, 9 |
| 50–64: promotion, assets, revisions, approved version, order | Section 8 |
| 65–81: State 36 handoff, idempotency, recovery, privacy, normalization | Sections 6, 7, 8.6, 9, 10 |
| 82–90: summary context, back/progress, visual hierarchy, autofill QA | Sections 5, 10, 11, 14 |
| 91–100: IME, accessibility, loading, analytics, logging | Sections 6.3, 9, 10 |
| 101–108: data model, draft/order boundary, timing, copy, success | Sections 7–9, 13 |

All 13 supplied success criteria are repeated as acceptance criteria in Section 13 and mapped to verification evidence in Section 14.
