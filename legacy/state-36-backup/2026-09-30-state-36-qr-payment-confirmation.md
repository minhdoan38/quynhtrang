# State 36 QR Payment + Order Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo QR step and confirmation with an honest, mobile-first State 36 flow that reads a real existing Order, shows server-owned payment instructions, keeps payment unverified until an authoritative event, and lets guests recover the same Order after refresh, back navigation, or payment-instruction failure.

**Architecture:** Keep Order creation before State 36. Extend the existing in-memory server adapter with immutable order snapshots, server-owned payment data, idempotent lookup/report operations, and a `PaymentQrProvider` boundary. Render State 36 as two modes in the existing checkout flow (QR instructions and confirmation), while `/order/[id]` remains a server-backed confirmation route for refresh/revisit. UI uses current warm stationery tokens, existing shadcn primitives where practical, and scoped GSAP entrance motion with reduced-motion support.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, GSAP 3, Lucide React, Node built-in test runner (`npm test`).

**Spec:** User-provided State 36 requirements in conversation; predecessor contract: `docs/superpowers/specs/2026-09-30-customer-information-ux-design.md`.

## Global Constraints

- Order MUST exist before QR/payment instructions are shown.
- Initial customer-facing payment state is `Chờ xác nhận thanh toán`; QR visibility, scanning, and customer claims MUST NOT create `paid`.
- Payment amount and payment reference MUST come from server Order/payment data, not client recalculation or random client strings.
- QR/provider failure MUST preserve the Order and retry the payment-instruction layer only.
- Approved design snapshot/version MUST remain immutable and confirmation MUST render that snapshot, not mutable working state.
- Refresh and retry MUST recover/reuse the same Order; back MUST NOT delete it or create a duplicate.
- MVP MUST NOT add automatic paid simulation, countdown, card fields, OTP, bank login, receipt upload, transaction-code input, mandatory login, or production timeline.
- UI copy is Vietnamese; critical meaning must not rely on color alone; touch targets are at least 44 CSS px where practical.
- Motion uses transform/opacity and honors `prefers-reduced-motion`.

---

### Task 1: Server Order/payment contract and provider boundary

**Files:**
- Modify: `src/lib/order-types.ts`
- Modify: `src/lib/server-order-store.ts`
- Create: `src/lib/payment-qr-provider.ts`
- Modify: `src/app/api/orders/route.ts`
- Create: `src/app/api/orders/[id]/payment/route.ts`
- Create: `src/app/api/orders/[id]/payment/report/route.ts`
- Test: `src/test/order-flow.test.ts`
- Create: `src/test/payment-flow.test.ts`

**Interfaces:**
- `PaymentStatus = 'pending_payment' | 'payment_reported' | 'paid' | 'payment_failed' | 'cancelled'`.
- `OrderPayment` contains `orderId`, `provider`, `amount`, `currency`, `paymentReference`, `status`, optional QR/manual-bank data and audit timestamps.
- `PendingOrder` contains stable public `id`, immutable `snapshot`, server-owned price/payment snapshot, `payment`, and customer/product data.
- `serverOrderStore.createOrder(design, customer, idempotencyKey?)` returns the same order for a repeated key.
- `serverOrderStore.getOrCreatePaymentInstructions(orderId)` returns provider data without creating an Order.
- `serverOrderStore.reportPayment(orderId)` sets only `payment_reported`.

**Steps:**
- [ ] Add failing tests proving an Order starts with `pending_payment`, stores amount/reference server-side, repeated idempotency key returns one Order, report never sets `paid`, and payment retry keeps the same Order ID.
- [ ] Run `npm test -- src/test/order-flow.test.ts src/test/payment-flow.test.ts`; expected RED because contracts are absent.
- [ ] Implement the smallest compatible types/store/provider adapter. Use deterministic demo bank data and server-generated reference derived from the Order code; keep provider calls behind `PaymentQrProvider`.
- [ ] Add GET payment instructions and POST customer-report route with stable Vietnamese errors.
- [ ] Update POST `/api/orders` to accept idempotency key, create one pending Order, and return Order plus payment summary; do not expose secrets.
- [ ] Run focused tests; expected PASS. Run `npm run typecheck`.

### Task 2: Checkout State 36 lifecycle and recovery

**Files:**
- Modify: `src/app/checkout/page.tsx`
- Modify: `src/lib/navigation.ts` only if current pure resolver needs State 36 mapping
- Modify: `src/test/checkout-summary-e2e.test.ts`
- Modify: `src/test/checkout-summary-integration.test.ts`
- Create: `src/test/state-36-lifecycle.test.ts`

**Interfaces:**
- Checkout state remains `step: 1 | 2 | 3`; State 36 adds `checkoutView: 'payment' | 'confirmation'`.
- Persist `createdOrder.id` before moving from customer submission to payment.
- Payment view receives/fetches the same order by ID; customer report and pay-later both move to confirmation without marking paid.

**Steps:**
- [ ] Add failing source/behavior tests for Order ID persistence before navigation, refresh recovery, report/pay-later confirmation, and no duplicate Order after back/retry.
- [ ] Run focused lifecycle tests; expected RED.
- [ ] Implement order reference persistence, payment-instruction loading, report action, pay-later action, same-order confirmation transition, and retry handling in `checkout/page.tsx`.
- [ ] Keep Step 1/2 behavior intact; do not create Order before customer submit; preserve existing form values on failures.
- [ ] Run focused tests and `npm run typecheck`; expected PASS.

### Task 3: QR payment UI

**Files:**
- Create: `src/components/checkout/payment-qr-panel.tsx`
- Create: `src/components/checkout/manual-payment-details.tsx`
- Modify: `src/app/checkout/page.tsx`
- Create: `src/test/payment-qr-panel.test.ts`

**Interfaces:**
- `PaymentQrPanel` consumes a server `PendingOrder`/`OrderPayment` view model and callbacks `onReported`, `onPayLater`, `onRetry`, `onBack`.
- `ManualPaymentDetails` consumes bank/account/name/amount/reference and exposes expandable accessible content.

**Steps:**
- [ ] Add failing tests for large high-contrast QR, visible amount/reference outside QR, accessible copy labels and feedback, manual details, loading/failure/expiry copy, and no `paid` success language.
- [ ] Run focused UI-source tests; expected RED.
- [ ] Implement QR panel with stable loading layout, quiet zone, exact server amount/reference, copy actions, same-device manual fallback, `Tôi đã chuyển khoản`, `Tôi muốn thanh toán sau`, and expectation-setting copy.
- [ ] Use shadcn `Button`, `Card`, `Badge`, `Separator` where compatible with current project primitives; avoid nested decorative cards and fake QR decoration when real provider data exists.
- [ ] Run focused tests and `npm run typecheck`; expected PASS.

### Task 4: Server-backed confirmation UI and payment recovery

**Files:**
- Modify: `src/app/order/[id]/page.tsx`
- Create or modify: `src/components/checkout/order-confirmation-panel.tsx`
- Modify: `src/test/order-flow.test.ts`
- Create: `src/test/order-confirmation.test.ts`

**Interfaces:**
- Confirmation consumes only `PendingOrder` fetched from `/api/orders/:id`.
- Actions: `Xem lại mã thanh toán`, `Thanh toán ngay`, `Thiết kế sản phẩm khác`, and the actual product-list destination already used by the app.

**Steps:**
- [ ] Add failing tests for recorded-order headline, prominent order code, neutral `Chờ xác nhận`, product/quantity/amount/customer/approved snapshot, same-order payment recovery, and no `Thanh toán thành công` before verification.
- [ ] Run focused tests; expected RED.
- [ ] Implement confirmation layout, loading/error recovery, stable refresh behavior, and pending/pay-later actions. Remove inaccurate `Về trang chủ` wording if product-list route is the real destination.
- [ ] Keep design thumbnail bound to `snapshot`, not current local project.
- [ ] Run focused tests and `npm run typecheck`; expected PASS.

### Task 5: Motion, accessibility, and visual polish

**Files:**
- Modify: `src/components/checkout/payment-qr-panel.tsx`
- Modify: `src/components/checkout/order-confirmation-panel.tsx`
- Modify: `src/app/checkout/page.tsx`
- Modify: `src/app/order/[id]/page.tsx`
- Test/verify: browser smoke screenshots and accessibility checks; do not modify verification assets to hide findings.

**Steps:**
- [ ] Add failing assertions/source checks for `gsap.matchMedia`, reduced-motion behavior, scoped cleanup, focus-visible controls, semantic status text, QR alt/supporting text, and 44px controls.
- [ ] Run focused checks; expected RED if missing.
- [ ] Implement one restrained entrance transition per screen using GSAP transform/autoAlpha; static equivalent under reduced motion; no confetti/countdown/paid animation.
- [ ] Use warm paper tokens, primary blue, neutral pending status, explicit labels, and no color-only status.
- [ ] Run `C:\Users\minhmice\Documents\projects\quynhtrang\.agents\skills\impeccable\scripts\impeccable.cmd detect --json <changed targets>` once after UI edits. Fix real findings only; do not rewrite tests/assets to pass.

### Task 6: Full verification and real browser smoke

**Files:**
- No verification-asset modifications.
- Possible source fixes only in files above if checks expose real defects.

**Steps:**
- [ ] Run focused tests for order/payment/State 36.
- [ ] Run `npm test` and expect exit code 0.
- [ ] Run `npm run typecheck` and expect exit code 0.
- [ ] Run `npm run build` and expect exit code 0.
- [ ] Start `npm run dev`, open the actual checkout/order routes, and exercise mobile-sized QR ready/loading/failure, copy, manual details, customer report, pay-later, confirmation, refresh, and back. Expected: one stable Order ID, exact server amount/reference, pending payment wording, no duplicate order, no hydration/console errors, no broken QR image, no horizontal overflow.
- [ ] Exercise `prefers-reduced-motion: reduce`; expected static state transitions with same information and focus order.
- [ ] Stop dev server after smoke; report only observed evidence.
