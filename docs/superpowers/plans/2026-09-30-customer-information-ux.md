# Customer Information UX Implementation Plan (State 35)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement State 35 Customer Information UX for mobile print customization application: collect exactly three required delivery fields (Họ và tên, Số điện thoại, Địa chỉ nhận hàng), support guest-first checkout without login or email, enforce client and server validation, promote local assets to server-backed records, create an immutable approved design version and pending order idempotently, and transition cleanly from Checkout Step 1 to Step 2 to Step 3.

**Architecture:**
- `src/lib/customer-info.ts`: Pure domain logic for customer information normalization, bounds, validation, and standard Vietnamese error messages.
- `src/lib/order-types.ts` & `src/lib/checkout-draft.ts`: Canonical domain models (`CustomerInfo`, `CheckoutDraft`, `PromotedAsset`, `ApprovedDesignVersion`, `PendingOrder`) with session-backed draft persistence and recovery.
- `src/lib/asset-store.ts` & `src/lib/design-version-store.ts` & `src/lib/server-order-store.ts`: Server-side asset promotion replacing browser `blob:` references, immutable design snapshotting with Preflight revision integrity, and idempotent order creation with server-recomputed pricing.
- `src/components/checkout/customer-information-form.tsx`: Accessible, mobile-first form with 44px minimum touch targets, floating labels, blur validation, IME-safe Vietnamese typing, and keyboard-safe layouts.
- `src/app/checkout/page.tsx` & `src/app/api/orders/route.ts`: End-to-end integration of Step 2 (`Thông tin nhận hàng`), header with Back navigation to Step 1, sticky footer CTA (`Tiếp tục`), loading state (`Đang chuẩn bị đơn hàng...`), recoverable failure state (`Thử lại`), and transition to State 36 QR payment.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS v4, GSAP (`@gsap/react`), Lucide icons, Node.js test runner (`node --test --experimental-strip-types`).

**Spec:** `docs/superpowers/specs/2026-09-30-customer-information-ux-design.md`

## Global Constraints

- **Exact 3 required fields in MVP:**
  1. `fullName`: Label `Họ và tên`, placeholder `Nguyễn Văn A`, autocomplete `name`. Single-line input. Trim edges only, preserve all Unicode accents, spaces, and casing.
  2. `phone`: Label `Số điện thoại`, placeholder `09xx xxx xxx`, help text `Dùng để liên hệ về đơn hàng khi cần.`, autocomplete `tel`, `inputMode="tel"`.
  3. `shippingAddress`: Label `Địa chỉ nhận hàng`, placeholder `Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành`, autocomplete `street-address`. Multiline textarea.
- **Zero non-goals allowed:** No email, no password, no account creation, no first/last name split, no province/district dropdowns, no shipping fee calculation, no order notes in State 35 form, no promo codes, no marketing opt-in, no direct editor undo/redo integration for customer info.
- **Approved customer copy:**
  - Header: `Thông tin nhận hàng`
  - Step indicator: `Bước 2 / 3`
  - Primary CTA: `Tiếp tục`
  - Loading status: `Đang chuẩn bị đơn hàng...`
  - Error alert title: `Chưa thể chuẩn bị đơn hàng.`
  - Error alert support: `Kiểm tra kết nối và thử lại.`
  - Retry button: `Thử lại`
  - Field errors:
    - Name error: `Nhập họ và tên.`
    - Phone error: `Kiểm tra lại số điện thoại.`
    - Address error: `Nhập địa chỉ nhận hàng đầy đủ hơn.`
- **Privacy & PII:** Never output customer `fullName`, `phone`, or `shippingAddress` into browser console logs, telemetry payloads, or error breadcrumbs.
- **Validation timing:** Validate touched fields on blur, validate all fields on submit, clear/update errors when typing, never show premature errors during Vietnamese IME composition.
- **Idempotency & Draft Persistence:** Stable idempotency key per draft session; repeated submissions return the same order without creating duplicates. Draft rehydrates on mount and survives browser Back.
- **Server authority:** Server recomputes subtotal and unit price via `calculatePriceQuote` and checks Preflight revision before order creation.

---

### Task 1: Centralized Customer Information Normalization & Validation (`src/lib/customer-info.ts`)

**Files:**
- Create: `src/lib/customer-info.ts`
- Create: `src/test/customer-info.test.ts`

**Interfaces:**
```ts
export interface CustomerInfo {
  fullName: string;
  phone: string;
  shippingAddress: string;
}

export interface CustomerInfoInput {
  fullName?: string;
  phone?: string;
  shippingAddress?: string;
}

export interface CustomerInfoValidationErrors {
  fullName?: string;
  phone?: string;
  shippingAddress?: string;
}

export interface CustomerInfoValidationResult {
  isValid: boolean;
  errors: CustomerInfoValidationErrors;
  normalized: CustomerInfo;
}

export function normalizeCustomerInfo(input: CustomerInfoInput): CustomerInfo;
export function normalizePhoneForValidation(phone: string): string;
export function validateCustomerInfo(input: CustomerInfoInput): CustomerInfoValidationResult;
```

- [ ] **Step 1: Write test for customer info normalization and validation**
Create `src/test/customer-info.test.ts` testing:
- Name normalization trims outer whitespace but preserves Vietnamese diacritics (`Nguyễn Văn A`, `Đỗ Thị B`), capitalization, and internal spaces without title-casing.
- Phone normalization strips spaces, parentheses, dots, and hyphens (`0912 345 678` -> `0912345678`).
- Address normalization trims leading/trailing whitespace only.
- Validation rejects empty or all-whitespace name, phone, or address with exact Vietnamese error messages:
  - `Nhập họ và tên.`
  - `Kiểm tra lại số điện thoại.`
  - `Nhập địa chỉ nhận hàng đầy đủ hơn.`
- Validation accepts valid Vietnamese numbers (e.g. `0912345678`, `+84912345678`, `(024) 3825 1234`) and rejects strings with fewer than 8 or more than 15 digits or alphabetic letters.
- Validation accepts detailed Vietnamese addresses (e.g. `Số 12 ngõ 34 Phố Huế, Hàng Bài, Hoàn Kiếm, Hà Nội`) and rejects trivial inputs under minimum length.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test --experimental-strip-types src/test/customer-info.test.ts`
Expected: FAIL ("Cannot find module '../lib/customer-info.ts'")

- [ ] **Step 3: Implement `src/lib/customer-info.ts`**
Write `src/lib/customer-info.ts` with bounded constants:
- `MIN_NAME_LENGTH = 2`, `MAX_NAME_LENGTH = 100`
- `MIN_PHONE_DIGITS = 8`, `MAX_PHONE_DIGITS = 15`
- `MIN_ADDRESS_LENGTH = 8`, `MAX_ADDRESS_LENGTH = 300`
- Export error messages verbatim as specified in Section 5.4.
- Implement `normalizeCustomerInfo`, `normalizePhoneForValidation`, and `validateCustomerInfo`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test --experimental-strip-types src/test/customer-info.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/customer-info.ts src/test/customer-info.test.ts
git commit -m "feat(checkout): implement customer information validation and normalization"
```

---

### Task 2: Core Domain Types & Checkout Draft Management (`src/lib/order-types.ts` & `src/lib/checkout-draft.ts`)

**Files:**
- Modify: `src/lib/order-types.ts`
- Create: `src/lib/checkout-draft.ts`
- Create: `src/test/checkout-draft.test.ts`

**Interfaces:**
```ts
// In src/lib/order-types.ts:
export interface CustomerInfo {
  fullName: string;
  phone: string;
  shippingAddress: string;
}

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

export interface ApprovedDesignVersion {
  id: string;
  revision: string;
  design: DesignState;
  assets: PromotedAsset[];
  preflightRevision: string;
  preflightAcknowledged: boolean;
  createdAt: string;
}

export interface PendingOrder {
  id: string;
  idempotencyKey: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
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

export interface CheckoutDraft {
  id: string;
  idempotencyKey: string;
  designRevision: string;
  design: DesignState;
  productId: ProductId;
  variantId: string;
  quantity: number;
  customer: CustomerInfo;
  preflightRevision: string;
  preflightAcknowledged: boolean;
  promotedAssets: PromotedAsset[];
  approvedDesignVersionId?: string;
  orderId?: string;
  status: 'editing' | 'promoting' | 'creating-order' | 'ready-for-payment' | 'failed';
  updatedAt: string;
}

// In src/lib/checkout-draft.ts:
export function createCheckoutDraft(design: DesignState, customer?: Partial<CustomerInfo>): CheckoutDraft;
export function saveCheckoutDraft(draft: CheckoutDraft): void;
export function loadCheckoutDraft(): CheckoutDraft | null;
export function clearCheckoutDraft(): void;
```

- [ ] **Step 1: Write test for checkout draft lifecycle**
Create `src/test/checkout-draft.test.ts` testing:
- Creation of default draft from `DesignState` with clean empty `CustomerInfo` (`fullName`, `phone`, `shippingAddress`).
- Generation of stable `idempotencyKey` that persists across updates to draft content.
- Saving to and rehydrating from `sessionStorage`.
- Isolation: customer information does not pollute `DesignState` elements or options.
- Updating customer info preserves existing design and product quantity.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test --experimental-strip-types src/test/checkout-draft.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/lib/order-types.ts` and implement `src/lib/checkout-draft.ts`**
- Update `src/lib/order-types.ts` with clean `CustomerInfo` (`fullName`, `phone`, `shippingAddress`), `PromotedAsset`, `ApprovedDesignVersion`, and modernized `PendingOrder`.
- Implement draft creation, serialization, session recovery, and idempotency generation in `src/lib/checkout-draft.ts`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test --experimental-strip-types src/test/checkout-draft.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/order-types.ts src/lib/checkout-draft.ts src/test/checkout-draft.test.ts
git commit -m "feat(checkout): add domain types and checkout draft session persistence"
```

---

### Task 3: Server Asset Store, Approved Design Versioning & Idempotent Order Store (`src/lib/asset-store.ts`, `src/lib/server-order-store.ts`)

**Files:**
- Create: `src/lib/asset-store.ts`
- Modify: `src/lib/server-order-store.ts`
- Create: `src/test/asset-store.test.ts`
- Modify: `src/test/order-flow.test.ts`
- Modify: `src/test/card-templates-order.test.ts`
- Modify: `src/test/wrapping-paper-output.test.ts`

**Interfaces:**
```ts
// src/lib/asset-store.ts
export interface AssetPromotionResult {
  promotedAssets: PromotedAsset[];
  rewrittenDesign: DesignState;
}

export function promoteDesignAssets(design: DesignState, existingAssets?: PromotedAsset[]): Promise<AssetPromotionResult>;

// src/lib/server-order-store.ts
export interface CreateOrderParams {
  idempotencyKey: string;
  design: DesignState;
  customer: CustomerInfo;
  preflightRevision?: string;
  preflightAcknowledged?: boolean;
}

export class ServerOrderStore {
  createOrder(params: CreateOrderParams): Promise<PendingOrder>;
  getOrder(id: string): PendingOrder | null;
  getOrderByKey(idempotencyKey: string): PendingOrder | null;
  getApprovedDesignVersion(id: string): ApprovedDesignVersion | null;
  clear(): void;
}
```

- [ ] **Step 1: Write test for asset promotion and idempotent order creation**
Create `src/test/asset-store.test.ts` and extend `src/test/order-flow.test.ts`:
- Asset store replaces browser `blob:` image URLs with server-backed URL identifiers (`/api/assets/asset-...`) and extracts mimeType, byteSize, width, height.
- Re-promoting an existing asset or repeating promotion with same source key reuses existing `PromotedAsset` record without duplicating.
- `serverOrderStore.createOrder` recomputes price quote accurately using `calculatePriceQuote`.
- Idempotency test: calling `serverOrderStore.createOrder` with the same `idempotencyKey` returns the exact same order without creating a duplicate.
- Immutability test: mutating the input `DesignState` after order creation does not modify the stored `ApprovedDesignVersion`.

- [ ] **Step 2: Run tests to verify they fail**
Run: `node --test --experimental-strip-types src/test/asset-store.test.ts src/test/order-flow.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/lib/asset-store.ts` and modernize `src/lib/server-order-store.ts`**
- Implement `promoteDesignAssets` in `src/lib/asset-store.ts` scanning design elements (e.g. `image` elements, custom background images, pattern textures), replacing `blob:` URLs with persistent references.
- Modernize `src/lib/server-order-store.ts` to support idempotency mapping, `ApprovedDesignVersion`, price recalculation, and migration of existing callers (`card-templates-order.test.ts`, `wrapping-paper-output.test.ts`).
- Ensure backward compatibility helper or migration of callers in `card-templates-order.test.ts` and `wrapping-paper-output.test.ts` to `fullName`, `phone`, `shippingAddress`.

- [ ] **Step 4: Run existing and new order tests to verify they pass**
Run: `node --test --experimental-strip-types src/test/asset-store.test.ts src/test/order-flow.test.ts src/test/card-templates-order.test.ts src/test/wrapping-paper-output.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/asset-store.ts src/lib/server-order-store.ts src/test/asset-store.test.ts src/test/order-flow.test.ts src/test/card-templates-order.test.ts src/test/wrapping-paper-output.test.ts
git commit -m "feat(checkout): implement server asset store, design versioning, and idempotent order store"
```

---

### Task 4: Server Boundary & Order API Orchestration (`src/app/api/orders/route.ts`)

**Files:**
- Modify: `src/app/api/orders/route.ts`
- Modify: `src/app/api/orders/[id]/route.ts`
- Create: `src/test/orders-api.test.ts`

**Interfaces:**
```ts
// POST /api/orders request payload
export interface CreateOrderRequestBody {
  idempotencyKey: string;
  design: DesignState;
  customer: CustomerInfo;
  preflightRevision?: string;
  preflightAcknowledged?: boolean;
}

// POST /api/orders response payload
export interface CreateOrderResponseBody {
  order: PendingOrder;
  paymentData: {
    orderId: string;
    amount: number;
    description: string;
    accountName: string;
    bankName: string;
  };
}
```

- [ ] **Step 1: Write test for `/api/orders` endpoint orchestration**
Create `src/test/orders-api.test.ts` testing:
- Valid submission returns HTTP 201 with `order` and `paymentData`.
- Server-side validation rejects invalid `fullName`, `phone`, or `shippingAddress` with 400 and exact Vietnamese error messages.
- Stale design revision / unacknowledged preflight validation rejection where applicable.
- Duplicate submission with same `idempotencyKey` returns HTTP 200/201 with identical order ID.
- GET `/api/orders/[id]` returns the pending order with sanitized snapshot.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test --experimental-strip-types src/test/orders-api.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/app/api/orders/route.ts` and `src/app/api/orders/[id]/route.ts`**
- In `src/app/api/orders/route.ts`:
  - Validate `customer` using `validateCustomerInfo(body.customer)`. Return 400 on error.
  - Promote assets using `promoteDesignAssets(body.design)`.
  - Create idempotent order via `serverOrderStore.createOrder(...)`.
  - Return `{ order, paymentData }`.
- In `src/app/api/orders/[id]/route.ts`:
  - Return order with approved design version and customer info.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test --experimental-strip-types src/test/orders-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/api/orders/route.ts src/app/api/orders/[id]/route.ts src/test/orders-api.test.ts
git commit -m "feat(checkout): orchestrate asset promotion and idempotent order creation in API"
```

---

### Task 5: Mobile-First Customer Information Form Component (`src/components/checkout/customer-information-form.tsx`)

**Files:**
- Create: `src/components/checkout/customer-information-form.tsx`
- Create: `src/test/customer-information-form.test.ts`

**Interfaces:**
```ts
export interface CustomerInformationFormProps {
  initialValues: CustomerInfo;
  isSubmitting: boolean;
  submitError?: string | null;
  onRetry?: () => void;
  onChange: (values: CustomerInfo) => void;
  onSubmit: (values: CustomerInfo) => void;
}
```

- [ ] **Step 1: Write test for customer information form component**
Create `src/test/customer-information-form.test.ts` testing:
- HTML structure contains three fields: `fullName` (input), `phone` (input type="tel"), `shippingAddress` (textarea).
- Visible labels above controls: `Họ và tên`, `Số điện thoại`, `Địa chỉ nhận hàng`.
- Subtitle helper for phone: `Dùng để liên hệ về đơn hàng khi cần.`.
- Input attributes: `autoComplete="name"`, `autoComplete="tel"`, `autoComplete="street-address"`, `inputMode="tel"`.
- Minimum 44px touch targets on inputs and buttons (`min-h-[44px]` or `h-11`).
- Accessibility attributes: `aria-invalid`, `aria-describedby` pointing to error IDs.
- Error banner renders `Chưa thể chuẩn bị đơn hàng.` and `Kiểm tra kết nối và thử lại.` with `Thử lại` button when `submitError` is provided.
- Console protection: Component does not log customer values to console.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test --experimental-strip-types src/test/customer-information-form.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/components/checkout/customer-information-form.tsx`**
- Create component using clean Tailwind styling matching the warm stationery palette (`#FFFDF8`, `#FFFFFF`, `#DDD6CC`, `#315F86`, `#B3535D`, `#2E3338`, `#666A6D`).
- Support touch state, blur-validation, inline field errors, programmatic focus on first invalid field upon submission.
- Ensure Vietnamese IME composition (`onCompositionStart`, `onCompositionEnd`) prevents premature error display.
- Include secondary summary snippet (`Sản phẩm: ... - Số lượng: ... - Tạm tính: ...`) without duplicating the full stepper or editor controls.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test --experimental-strip-types src/test/customer-information-form.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/components/checkout/customer-information-form.tsx src/test/customer-information-form.test.ts
git commit -m "feat(checkout): implement accessible mobile-first customer information form"
```

---

### Task 6: Step 2 Checkout Integration, GSAP Transitions & Draft Rehydration (`src/app/checkout/page.tsx`, `src/app/order/[id]/page.tsx`)

**Files:**
- Modify: `src/app/checkout/page.tsx`
- Modify: `src/app/order/[id]/page.tsx`
- Create: `src/test/checkout-step2-e2e.test.ts`

- [ ] **Step 1: Write integration tests for Checkout Step 2**
Create `src/test/checkout-step2-e2e.test.ts` testing:
- Step 2 header renders `Thông tin nhận hàng` with progress indicator `Bước 2 / 3`.
- Back navigation from Step 2 transitions to Step 1 without returning to the Editor.
- Back navigation from Step 1 transitions to Editor.
- Sticky footer renders `Tiếp tục` (with `Đang chuẩn bị đơn hàng...` during submission).
- Customer values entered in Step 2 survive navigating back to Step 1 and forward again to Step 2.
- Successful submission transitions to Step 3 (or order confirmation) with valid server order ID.
- Stale design revision detection routes to Preflight or shows clear warning.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test --experimental-strip-types src/test/checkout-step2-e2e.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/app/checkout/page.tsx` and `src/app/order/[id]/page.tsx`**
- Replace demo form in `src/app/checkout/page.tsx` with `CustomerInformationForm`.
- Integrate `loadCheckoutDraft` / `saveCheckoutDraft` for session rehydration.
- Implement `handleSubmitCustomerInfo` communicating with `/api/orders`, handling idempotency key, displaying loading state `Đang chuẩn bị đơn hàng...`, and error state `Chưa thể chuẩn bị đơn hàng.` with retry.
- Update `src/app/order/[id]/page.tsx` to handle `customer.fullName`, `customer.phone`, and `customer.shippingAddress` seamlessly.
- Preserve GSAP animations under `useGSAP` with `prefers-reduced-motion` check.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test --experimental-strip-types src/test/checkout-step2-e2e.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/checkout/page.tsx src/app/order/[id]/page.tsx src/test/checkout-step2-e2e.test.ts
git commit -m "feat(checkout): integrate State 35 Customer Information UX in checkout flow"
```

---

### Task 7: Full Verification & E2E Validation

**Files:**
- Test: all existing and new test suites

- [ ] **Step 1: Run full unit & integration test suite**
Run: `pnpm test`
Expected: All tests pass (previous 428 + new tests).

- [ ] **Step 2: Run TypeScript compiler check**
Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run production build check**
Run: `pnpm build`
Expected: Successful Next.js build.

- [ ] **Step 4: Commit**
```bash
git commit --allow-empty -m "chore(checkout): verify State 35 customer information UX test suite and build"
```
