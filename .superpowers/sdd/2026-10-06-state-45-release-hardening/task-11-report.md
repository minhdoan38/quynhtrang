# Task 11 Report: Route/Component Error Isolation and Structured Observability

## Summary
Implemented route/component error isolation and structured error reporting per State 45 Release Hardening plan.

## Deliverables
1. `src/lib/observability/report.ts`:
   - `reportUnexpectedError(event)`: field allowlist (`operation`, `operationId`, `route`, `role`, `productType`, `status`, `durationMs`, `errorCode`, `release`, `documentStats`).
   - Strict PII redaction: regex sentinels strip customer names, phones, addresses, OTPs, auth tokens, signed URLs, image bytes, SQL, and storage bucket paths.
   - DesignDocument extraction reduces documents to structural stats: `{ elementCount, schemaVersion, approximateSize }`.
   - `recordReliabilityMetric(metricName, tags)`: low-cardinality metric recording with strict metric names and normalized tags (`role`, `status` 4xx/5xx, `errorCode`).
2. `src/instrumentation.ts` & `src/instrumentation-client.ts`:
   - Server request error handling via Next 16 `onRequestError` contract mapping `digest`, `path`, and router context.
   - Client global `error` and `unhandledrejection` instrumentation without duplicate registrations.
3. Route Error Boundaries:
   - Created `src/app/checkout/error.tsx`
   - Created `src/app/admin/products/[id]/error.tsx`
   - Created `src/app/admin/content/templates/error.tsx`
   - Created `src/app/my-orders/error.tsx`
   - Created `src/app/my-designs/error.tsx`
   - Created `src/app/global-error.tsx` (with root `<html>`/`<body>`)
   - Updated `src/app/admin/orders/[id]/error.tsx`
   - All boundaries implement `'use client'`, accept `{ error, reset }`, report error via `reportUnexpectedError`, provide actionable Vietnamese copy, a `Thử lại` button invoking `reset()`, and display short support reference codes derived from error digest / operationId.
4. API Route Logging:
   - Replaced all arbitrary `console.error` calls with `reportUnexpectedError` across:
     - `src/app/api/orders/route.ts`
     - `src/app/api/orders/[id]/route.ts`
     - `src/app/api/orders/[id]/payment/route.ts`
     - `src/app/api/orders/[id]/payment/report/route.ts`
     - `src/app/api/assets/[id]/route.ts`
     - `src/app/api/library/[kind]/[id]/route.ts`
     - `src/app/api/admin/content/_shared.ts`
     - `src/app/api/admin/content/templates/_shared.ts`
5. Unit tests:
   - `src/lib/observability/report.test.ts` testing allowlisting, PII redaction, DesignDocument stat extraction, operationId preservation, and metric bounding.

## Verification Evidence
- `node --test --experimental-strip-types src/lib/observability/report.test.ts`: 4/4 passing (0 failures).
- `pnpm typecheck`: exit 0 (0 errors).
- `pnpm test`: 1279/1279 passing (0 failures).
