# Task 4 report

Implemented `prepareOrderFromGuestCheckout` as single promotion/order boundary with injected repository seams.

- Checkout API now calls preparation service; configured servers use privileged Supabase repositories, while local tests retain compatible in-memory adapters.
- Validates preflight acknowledgement/revisions and recomputes price via `calculatePriceQuote`.
- Promotes customer bytes into private `customer-assets`, inserts metadata, rewrites URLs, and serves cache misses from Supabase Storage.
- Creates immutable project/version/order/payment/guest-access/event records.
- Rolls back newly created order if payment, guest-access, or event creation fails; cascades remove dependent rows.
- Idempotency lookup returns null only for no rows and throws real database errors.
- Guest token is reproducible for retries, HMAC-protected when seed/server secret exists, and only its SHA-256 hash is persisted.
- Preserves legacy filesystem/in-memory callers; repository-backed promotion skips filesystem writes.
- Tests cover success, retry idempotency, pricing, preflight rejection, immutable snapshots, rollback, repository errors, and private Storage serving.

Verification:

- Focused Task 4/API/repository tests: 46 passed.
- `pnpm test`: 532 passed.
- `pnpm typecheck`: passed with 0 errors.
