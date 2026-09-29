# Quantity + Order Summary UX Implementation Plan (State 34)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement State 34 Quantity + Order Summary UX for mobile print customization application: transition from `CREATE` to `ORDER` in Checkout Step 1, verify product and design, adjust quantity via mobile stepper, calculate subtotal reactively, and proceed to Step 2 Customer Information.

**Architecture:** Dedicated pricing engine (`src/lib/pricing.ts`); modular summary components (`src/components/checkout/order-summary-card.tsx` and `quantity-stepper.tsx`); integrated Step 1 view in `src/app/checkout/page.tsx` with sticky footer; and comprehensive tests for pricing, validation, quantity persistence, and E2E checkout transitions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS v4, Lucide icons, Node.js test runner via `pnpm test`.

**Spec:** `docs/superpowers/specs/2026-09-29-quantity-order-summary-ux-design.md`

## Global Constraints
- Core principle: "Confirm what I am buying before asking who and where to send it to."
- Flow: `Editor` → `Preflight` → **`Order Summary + Quantity` (Step 1)** → `Customer Information` (Step 2) → `QR Payment` (Step 3) → `Order Confirmation`.
- Customer terminology:
  - Header: `← Đơn hàng`
  - Step indicator: `Bước 1 / 3`
  - Product labels: `Giấy bọc quà`, `Thiệp chúc mừng`, `Sticker die-cut`, `Sticker tròn`, `Bìa sổ tay`
  - Subtotal label: `Tạm tính: xxx.xxxđ`
  - Shipping note: `Phí vận chuyển sẽ được tính theo địa chỉ giao hàng ở bước tiếp theo.`
  - Button: `Tiếp tục` (with `ArrowRight`)
- Stepper: min 1, max 999, large 44px touch targets, direct numeric input with `inputMode="numeric"`.
- Local persistence: selected quantity is preserved across step navigation and return to editor.
- No payment, no customer personal information, no login requirement, no server order creation at Step 1.
- All tasks must pass `pnpm test` and `pnpm typecheck`.

---

### Task 1: Centralized Pricing Module & Currency Formatters (`src/lib/pricing.ts`)

**Files:**
- Create: `src/lib/pricing.ts`
- Create: `src/test/pricing.test.ts`

**Interfaces:**
```ts
export interface PriceQuote {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  formattedUnitPrice: string;
  formattedSubtotal: string;
  discountAmount?: number;
  formattedDiscount?: string;
}

export function formatCurrencyVND(amount: number): string;
export function calculatePriceQuote(params: {
  productId: string;
  variantId?: string;
  quantity: number;
  productOptions?: Record<string, unknown>;
}): PriceQuote;
```

- [ ] **Step 1: Write test for pricing engine**
Create `src/test/pricing.test.ts` testing:
- Currency formatting: `120000 -> "120.000đ"`, `0 -> "0đ"`.
- Subtotal calculation across products (card, wrapping, sticker, notebook).
- Quantity scaling (quantity * unitPrice).
- Boundary validation: quantity < 1 clamps to 1, quantity > 999 clamps to 999.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL due to missing `src/lib/pricing.ts`.

- [ ] **Step 3: Implement `src/lib/pricing.ts`**
Implement `formatCurrencyVND` and `calculatePriceQuote` using catalog product prices.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/pricing.ts src/test/pricing.test.ts
git commit -m "feat(checkout): implement centralized pricing engine and VND currency formatter"
```

---

### Task 2: Product-Aware Thumbnail & Summary Card Component (`src/components/checkout/order-summary-card.tsx`)

**Files:**
- Create: `src/components/checkout/order-summary-card.tsx`
- Create: `src/test/order-summary-card.test.ts`

**Interfaces:**
```tsx
export interface OrderSummaryCardProps {
  design: DesignState;
  onEditDesign: () => void;
  onOpenPreview?: () => void;
}
export function OrderSummaryCard(props: OrderSummaryCardProps): React.JSX.Element;
```

- [ ] **Step 1: Write test for OrderSummaryCard**
Create `src/test/order-summary-card.test.ts` testing:
- Renders customer-friendly product title (`Thiệp chúc mừng`, `Giấy bọc quà`, etc.).
- Renders meaningful variant details.
- Renders preflight verification badge `✓ Thiết kế đã được kiểm tra`.
- Renders `Chỉnh sửa thiết kế` link and invokes `onEditDesign`.
- Renders product-shaped thumbnail container.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Implement `src/components/checkout/order-summary-card.tsx`**
Implement the component with Tailwind styling, clean design canvas thumbnail, and edit action.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/checkout/order-summary-card.tsx src/test/order-summary-card.test.ts
git commit -m "feat(checkout): implement product-aware OrderSummaryCard with design thumbnail"
```

---

### Task 3: Mobile Quantity Stepper Component (`src/components/checkout/quantity-stepper.tsx`)

**Files:**
- Create: `src/components/checkout/quantity-stepper.tsx`
- Create: `src/test/quantity-stepper.test.ts`

**Interfaces:**
```tsx
export interface QuantityStepperProps {
  quantity: number;
  min?: number;
  max?: number;
  onChange: (quantity: number) => void;
}
export function QuantityStepper(props: QuantityStepperProps): React.JSX.Element;
```

- [ ] **Step 1: Write test for QuantityStepper**
Create `src/test/quantity-stepper.test.ts` testing:
- Minus and plus buttons increment and decrement quantity.
- Minus button is disabled when quantity is at minimum.
- Plus button is disabled when quantity is at maximum.
- Direct input updates quantity and clamps invalid input.
- Displays inline error message for invalid input.
- Has accessible labels: `aria-label="Giảm số lượng"` and `aria-label="Tăng số lượng"`.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Implement `src/components/checkout/quantity-stepper.tsx`**
Implement the stepper with 44px touch targets and `inputMode="numeric"`.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/checkout/quantity-stepper.tsx src/test/quantity-stepper.test.ts
git commit -m "feat(checkout): implement mobile-first QuantityStepper with touch targets and validation"
```

---

### Task 4: Step 1 Checkout Screen Integration & Sticky Action Footer (`src/app/checkout/page.tsx`)

**Files:**
- Modify: `src/app/checkout/page.tsx`
- Create: `src/test/checkout-summary-integration.test.ts`

**Requirements:**
- In `src/app/checkout/page.tsx`:
  - Header displays `← Đơn hàng` (returns to editor) and `Bước 1 / 3` indicator.
  - Integrate `OrderSummaryCard` and `QuantityStepper` in Step 1.
  - Use `calculatePriceQuote` to calculate subtotal and unit price immediately.
  - Sticky bottom action bar in Step 1 displaying `Tạm tính: xxx.xxxđ` on the left and `Tiếp tục` button on the right.
  - Advancing from Step 1 transitions cleanly to Step 2 (Customer Information).
  - Selected quantity is saved to storage and state, preserved across navigation.
- In `src/test/checkout-summary-integration.test.ts`:
  - Test Step 1 renders summary card, quantity stepper, and price breakdown.
  - Test updating quantity immediately recalculates subtotal.
  - Test `Tiếp tục` transitions to Step 2.
  - Test `← Đơn hàng` returns to editor.

- [ ] **Step 1: Write test for Step 1 integration**
Create `src/test/checkout-summary-integration.test.ts`.

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

- [ ] **Step 3: Update `src/app/checkout/page.tsx`**
Refactor Step 1 with `OrderSummaryCard`, `QuantityStepper`, and sticky footer.

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/app/checkout/page.tsx src/test/checkout-summary-integration.test.ts
git commit -m "feat(checkout): integrate OrderSummaryCard, QuantityStepper, and sticky subtotal footer in Step 1"
```

---

### Task 5: Full Verification & E2E Validation (`src/test/checkout-summary-e2e.test.ts`)

**Files:**
- Create: `src/test/checkout-summary-e2e.test.ts`

**Requirements:**
- Test all 10 success criteria of State 34:
  1. Transition from Preflight to Checkout Step 1.
  2. Immediate product recognition and design thumbnail.
  3. Meaningful variant information (A1, Ngang, Tròn, etc.).
  4. Quick quantity adjustment via stepper.
  5. Real-time pricing update (`Tạm tính: xxx.xxxđ`).
  6. Direct numeric entry validation and clamping.
  7. Return to edit with state preserved (`Chỉnh sửa thiết kế`).
  8. Preserves selected quantity when navigating between steps and returning to editor.
  9. Advance to Step 2 (Customer Information) without premature payment fields.
  10. Zero history pollution or server order generation in Step 1.
- Run `pnpm test`.
- Run `pnpm typecheck`.
- Run `pnpm build`.
- Ensure all 3 commands succeed with exit code 0.

- [ ] **Step 1: Write `src/test/checkout-summary-e2e.test.ts`**
- [ ] **Step 2: Run `pnpm test` (all tests pass)**
- [ ] **Step 3: Run `pnpm typecheck` (tsc --noEmit passes)**
- [ ] **Step 4: Run `pnpm build` (production build succeeds)**
- [ ] **Step 5: Commit**
```bash
git add src/test/checkout-summary-e2e.test.ts
git commit -m "feat(checkout): complete State 34 Quantity + Order Summary UX implementation and verification"
```
