# State 45 Recovery Runbook & Operations Manual

This runbook defines the authoritative operational recovery semantics, troubleshooting procedures, and manual QA validation ledger for State 45 Release Hardening.

---

## Guest Project Recovery

### Authoritative Source of Truth
- Guest persistence is local-first. The authoritative source for unmigrated guest work is the browser's durable storage:
  - Small project metadata and document pointers in `localStorage` under `quynhtrang-recent-projects-v1`.
  - Binary artwork records in versioned `IndexedDB` (`quynhtrang_guest_db_v1`, object store `guest_assets_v1`) referenced by stable `blob ID` (`assetId`).
  - Active editor canvas state in memory and `sessionStorage` (`print-customizer-state-v1`).
- Supabase is never contacted on guest editor startup and holds no records for guest sessions until checkout order preparation.

### Inspection Sequence
1. Check `localStorage.getItem('quynhtrang-recent-projects-v1')` to confirm project presence, schema version, and metadata.
2. Inspect `IndexedDB` database `quynhtrang_guest_db_v1` store `guest_assets_v1` for the required `blob ID` entries and byte sizes.
3. Check `localStorage.getItem('quynhtrang-quarantined-projects-v1')` for quarantined corruption entries.
4. Check browser storage quota via `navigator.storage.estimate()`.

### Safe Retry, Refetch & Reconcile
1. **Quota pressure (`CLIENT_PERSISTENCE_ERROR`):**
   - The editor retains the current design document in working memory.
   - Run safe export: prompt customer to download a JSON/canvas backup.
   - Enforce existing retention: run `pruneExpiredRecentProjects()`.
2. **Corruption quarantine:**
   - Malformed JSON records or assets missing required fields are isolated into `quynhtrang-quarantined-projects-v1` with timestamp and failure reason.
   - Clean projects remain accessible in `quynhtrang-recent-projects-v1`.
3. **Retention protection:**
   - The 3-project/30-day retention rule prunes only projects where `now - updatedAt > 30 days` and respects `RetentionProtectionOptions`.
   - Never evict: the currently open project, the active checkout draft project (`quynhtrang_checkout_draft_v1`), or unmigrated projects with `syncedCloudProjectId == null`.

### Forbidden Actions
- **DO NOT** clear browser storage or reset site data while customer has unsaved artwork in memory.
- **DO NOT** serialize large raw base64 payloads into `localStorage`.
- **DO NOT** create anonymous Supabase auth sessions or database rows on guest editor launch.
- **DO NOT** discard quarantined records without operator inspection.

### Expected Successful Observable
- `saveRecentProjectAsync` resolves with `ok: true`.
- Top-bar save badge displays `Đã lưu` (or `Bản nháp máy`).
- On reload, canvas rehydrates all layers from IndexedDB blobs without blank canvas or broken object URLs.

---

## Cloud Autosave Recovery

### Authoritative Source of Truth
- Supabase `customer_projects` table row (`working_document`, `revision`, `updated_at`).
- Client editor maintains three distinct states:
  - `acknowledgedRevision`: the last confirmed `server revision`.
  - `baseRevision`: the base revision from which current edits branched.
  - `pendingSnapshot` (pending snapshot): uncommitted local modifications awaiting transmission or retry.

### Inspection Sequence
1. Query Supabase project record:
   ```sql
   select id, owner_user_id, revision, updated_at
   from public.customer_projects
   where id = :project_id;
   ```
2. Inspect client telemetry: check if client base revision matches current server revision.
3. Verify client save status badge: `idle`, `saving`, `saved`, `unsynced`, `conflict`, or `error`.

### Safe Retry, Refetch & Reconcile
1. **Network drop or 5xx (`unsynced`):**
   - Autosave worker retains `pendingSnapshot` and debounces retries.
   - Upon reconnect, client retries `save_customer_project_revision` with unchanged `p_expected_revision = baseRevision`.
2. **Revision conflict (`STALE_REVISION` / `REVISION_CONFLICT`):**
   - If another tab or session updated the row (`server revision > baseRevision`), the server rejects the write.
   - Client displays conflict dialog: "Thiết kế đã được cập nhật ở nơi khác." with option "Tải phiên bản mới".
   - Refetch canonical server revision into editor working memory upon user confirmation. Never overwrite server automatically.

### Forbidden Actions
- **DO NOT** implement automatic last-write-wins (LWW) or force unconditional updates (`UPDATE ... without WHERE revision = expected`).
- **DO NOT** discard the customer's `pendingSnapshot` on first network error.
- **DO NOT** show optimistic `Đã lưu` before server returns 200 with new revision.

### Expected Successful Observable
- Server revision increments monotonically by exactly 1 per write.
- Client save status transitions from `saving` to `saved`.
- Refetch confirms matching hash between client document and server `working_document`.

---

## Draft Lease Recovery

### Authoritative Source of Truth
- Database draft tables with lease columns:
  - Staff draft: `design_revision_drafts` (`locked_by`, `lock_session_id`, `lease_expires_at`, lease epoch `lease_epoch`, `status`).
  - Template draft: `template_drafts` (`locked_by`, `lock_session_id`, `lease_expires_at`, lease epoch `lease_epoch`).
- Lease invariants: lease duration = 120 seconds, heartbeat interval = 30 seconds.

### Inspection Sequence
1. Check current draft lease status:
   ```sql
   select id, status, locked_by, lock_session_id, lease_expires_at, lease_epoch, clock_timestamp() as now
   from public.design_revision_drafts
   where order_id = :order_id;
   ```
2. Determine if lease is active (`lease_expires_at > now`) or expired (`lease_expires_at <= now`).

### Safe Retry, Refetch & Reconcile
1. **Transient heartbeat failure:**
   - Active editor retries heartbeat with exponential backoff before 120s window elapses.
   - Restoring window visibility immediately issues a heartbeat.
2. **Expired lease reclamation:**
   - If previous editor closed tab or disconnected, wait for 120s expiry.
   - Once expired, another editor can acquire the lease normally.
3. **Explicit Admin takeover:**
   - If an urgent takeover is required before 120s expiry, an Admin may execute explicit takeover RPC.
   - Admin takeover increments the lease epoch (`lease_epoch`) and records an audit log entry with mandatory reason (3–500 chars).
   - Stale editor session with old epoch is fenced; subsequent writes fail with `LEASE_FENCED` / `STALE_EPOCH`.

### Forbidden Actions
- **DO NOT** bypass `lease_epoch` or `lease_expires_at` checks in draft update RPCs.
- **DO NOT** allow editor-role staff to execute forced lease takeover; takeover is Admin-only.
- **DO NOT** delete the draft row to clear a lock; wait for expiry or use takeover RPC.

### Expected Successful Observable
- Exactly one active editor holds the draft lease.
- Heartbeats maintain `lease_expires_at = now + 120s`.
- Fenced writer receives clear notification without corrupting the active editor's session.

---

## Order Submit Recovery

### Authoritative Source of Truth
- `orders` table (`id`, `public_order_code`, `idempotency_key`, `payment_status`, `fulfillment_status`).
- `order_events` append-only audit trail (`event = 'order_created'`).

### Inspection Sequence
1. Lookup by `idempotency key` or public order code:
   ```sql
   select id, public_order_code, idempotency_key, total_amount, payment_status, fulfillment_status, created_at
   from public.orders
   where idempotency_key = :idempotency_key or public_order_code = :public_order_code;
   ```
2. If found, inspect associated `order_events`:
   ```sql
   select id, event, created_at, metadata_diff
   from public.order_events
   where order_id = :order_id
   order by created_at asc;
   ```

### Safe Retry, Refetch & Reconcile
1. **Lost response / ambiguous network timeout (`UNKNOWN_OUTCOME`):**
   - Triage order status before asking customer to retry; **never recreate blindly**.
   - Retry `POST /api/orders` with the exact same `idempotency key` and payload.
   - The server preparation service detects the existing idempotency record and returns the existing order details, public order code, and payment instructions.
2. **Payload mismatch conflict (`BUSINESS_CONFLICT`):**
   - If the same idempotency key is reused with modified payload/items, the server rejects with 409 Conflict.
   - Generate a fresh idempotency key only if customer explicitly started a new checkout session.

### Forbidden Actions
- **DO NOT** instruct customer to submit checkout again with a new cart without checking database for existing order.
- **DO NOT** generate a second `orders` record for the same checkout intent.
- **DO NOT** delete an order on client timeout without verifying if the preparation transaction committed.

### Expected Successful Observable
- Exactly one order record exists with the specified `idempotency_key`.
- Exactly one `order_created` event exists in `order_events`.
- Replayed request returns 200 with identical `orderId` and `publicOrderCode`.

---

## Payment Report & Confirmation

### Authoritative Source of Truth
- Database state in `orders` (`payment_status`, `payment_policy`, `total_amount`) and `order_payments` (`status`, `amount`, `payment_reference`).
- Atomic RPC `report_checkout_payment` and `confirm_order_payment`.
- Append-only `order_events` (`customer_payment_reported`, `payment_confirmed`).

### Inspection Sequence
1. Query order and payment status:
   ```sql
   select o.id, o.public_order_code, o.payment_status, p.status as payment_record_status, p.amount, p.payment_reference
   from public.orders o
   left join public.order_payments p on p.order_id = o.id
   where o.id = :order_id;
   ```
2. Check payment event audit log:
   ```sql
   select id, event, actor_id, actor_role, created_at, metadata_diff
   from public.order_events
   where order_id = :order_id and event in ('customer_payment_reported', 'payment_confirmed')
   order by created_at asc;
   ```

### Safe Retry, Refetch & Reconcile
1. **Customer payment report retry:**
   - Route `POST /api/orders/[id]/payment/report` executes atomic RPC `report_checkout_payment`.
   - RPC returns structured outcome:
     - `reported`: first report recorded; adds `customer_payment_reported` event.
     - `already_reported`: customer or system already reported; no second event added.
     - `already_paid`: payment is already confirmed; never downgrades order status to reported.
2. **Lost response triage:**
   - Refetch order detail by public order code. If payment shows `reported` or `paid`, display updated state.
3. **Concurrent Admin confirmation:**
   - Admin confirmation uses `confirm_order_payment` with row lock `FOR UPDATE`.
   - First Admin sets `payment_status = 'paid'` and logs `payment_confirmed`.
   - Second Admin request returns replay result `already_paid` without duplicate events.

### Forbidden Actions
- **DO NOT** downgrade `payment_status = 'paid'` back to `reported` under any circumstance.
- **DO NOT** bypass atomic RPC `report_checkout_payment` by updating `orders` directly from route handlers.
- **DO NOT** allow non-Admin staff to confirm payments.

### Expected Successful Observable
- Order transitions cleanly from `unpaid` -> `reported` -> `paid`.
- Exactly one `customer_payment_reported` event and exactly one `payment_confirmed` event.
- Payment confirmation displays operator name, timestamp, and amount in audit trail.

---

## Production Artifact Generation

### Authoritative Source of Truth
- `design_render_jobs` table (`id`, `version_id`, `status`, `attempts`, `claimed_by`, `claim_expires_at`, `next_attempt_at`).
- `design_version_renders` and `design_versions` (`approved_thumbnail_path`, `output_files`).
- Storage bucket `approved-renders` (private).

### Inspection Sequence
1. Check render job queue:
   ```sql
   select id, version_id, order_id, status, attempts, claimed_by, claim_expires_at, error_code, next_attempt_at
   from public.design_render_jobs
   where version_id = :version_id;
   ```
2. Verify private storage output files and thumbnails:
   ```sql
   select id, version_number, approved_thumbnail_path, output_files
   from public.design_versions
   where id = :version_id;
   ```

### Safe Retry, Refetch & Reconcile
1. **Worker crash or expired lease reclamation:**
   - Worker claims jobs using atomic RPC `claim_next_render_job(p_worker_id, p_lease_seconds)`.
   - If a worker crashes while processing, the job remains `status = 'running'` until `claim_expires_at`.
   - `claim_next_render_job` automatically reclaims expired running jobs (`claim_expires_at <= clock_timestamp()`) and increments `attempts`.
2. **Failed attempt retry:**
   - If render fails, worker marks `status = 'failed'` and sets `next_attempt_at = now + 60s`.
   - Jobs with `attempts < 3` are retried automatically.
   - Jobs exceeding max attempts remain `failed` for operator inspection.
   - Operator triggers manual retry via `scripts/state39-render-jobs.ts --once`.
3. **Immutable DesignVersion preservation:**
   - Renderer processes immutable design versions. Never mutate or patch an immutable DesignVersion (`design_versions`) row to fix a render failure; fix worker dependencies or fonts.

### Forbidden Actions
- **DO NOT** mark a render job `completed` without verifying that rendered artifacts exist in storage and thumbnail path is set.
- **DO NOT** edit or overwrite `design_versions.document` of an approved design version.
- **DO NOT** reset `attempts` counter to 0 in production without diagnosing the underlying render crash.

### Expected Successful Observable
- Render job status reaches `completed`.
- `design_versions.approved_thumbnail_path` points to valid storage object.
- Order detail page renders high-resolution production preview thumbnail.

---

## Production Lifecycle Transitions

### Authoritative Source of Truth
- `orders` table (`fulfillment_status`, `production_started_at`, `production_completed_at`, `production_design_version_id`, `production_artifact_set_id`).
- Append-only `order_events` (`production_started`, `production_completed`).
- Atomic RPCs: `start_order_production` and `complete_order_production`.

### Inspection Sequence
1. Check order fulfillment status and production readiness:
   ```sql
   select id, public_order_code, fulfillment_status, payment_status, design_status,
          production_design_version_id, production_started_at, production_completed_at
   from public.orders
   where id = :order_id;
   ```
2. Check for active holds:
   ```sql
   select id, hold_reason, placed_at, released_at
   from public.order_holds
   where order_id = :order_id and released_at is null;
   ```

### Safe Retry, Refetch & Reconcile
1. **Start Production prerequisites & execution:**
   - Admin-only operation. Requires:
     - `payment_status = 'paid'`.
     - `design_status = 'approved'`.
     - No active hold (`released_at is not null` for all holds).
     - Valid `production_design_version_id` with verified artifacts.
     - `fulfillment_status in ('unprocessed', 'ready_for_production')`.
   - Call `start_order_production(p_order_id, p_admin_id)`.
   - The RPC atomically creates the frozen snapshot: sets `fulfillment_status = 'in_production'`, records `production_started_at`, and appends `production_started` event.
2. **Complete Production execution:**
   - Admin-only operation.
   - Strictly requires active `fulfillment_status = 'in_production'`. Direct transitions from `unprocessed` are blocked.
   - Sets `fulfillment_status = 'completed'`, records `production_completed_at`, and appends `production_completed` event.
3. **Reconciliation on lost response:**
   - If request timed out, refetch order detail before repeating. If status is already `in_production` or `completed`, the transition succeeded; do not repeat with a new request.

### Forbidden Actions
- **DO NOT** permit editor-role staff to start or complete production; enforce Admin-only role.
- **DO NOT** place a hold on an order actively in production (`in_production`).
- **DO NOT** cancel an order actively in production through the fulfillment interface.
- **DO NOT** modify the approved design document once production has started.

### Expected Successful Observable
- Exactly one `production_started` event and one `production_completed` event per order.
- The frozen snapshot permanently records the selected production design version and timestamp.

---

## Publish Recovery

### Authoritative Source of Truth
- Template system: `templates` (`current_published_version_id`, `status`), `template_versions` (immutable snapshots).
- Commercial catalog: `product_commercial_configs` (`current_version_id`, `revision`), `commercial_config_versions` (immutable snapshots).
- Request-to-version replay tracking in `asset_events`.

### Inspection Sequence
1. Check published template status and version pointer:
   ```sql
   select id, slug, status, current_published_version_id, updated_at
   from public.templates
   where id = :template_id;
   ```
2. Check commercial config current version:
   ```sql
   select product_id, current_version_id, revision, updated_at
   from public.product_commercial_configs
   where product_id = :product_id;
   ```
3. Inspect publish audit events:
   ```sql
   select id, target_id, event, metadata_diff, created_at
   from public.asset_events
   where event in ('template_published', 'commercial_config_published')
   order by created_at desc
   limit 5;
   ```

### Safe Retry, Refetch & Reconcile
1. **Template Publish retry on response loss:**
   - Template publish uses RPC `template_publish_draft` with unique `p_request` ID.
   - If network response was dropped, repeating with the same `requestId` resolves the existing published version without creating duplicate version rows.
2. **Commercial Publish retry & concurrency:**
   - Commercial publish service checks `resolvePublishedRequest(productId, draftRevision, productRevision, requestId)`.
   - If already published under the same request ID, returns the cached version.
   - If another admin published first, returns `REVISION_CONFLICT`; operator must refresh draft and re-verify pricing.
3. **Historical Order economics preservation:**
   - Publishing a new commercial version or template version NEVER mutates existing orders or quotes.
   - Historical orders retain their immutable commercial snapshots (`product_snapshot`, `variant_snapshot`, `price_quote_id`).

### Forbidden Actions
- **DO NOT** overwrite or update existing `template_versions` or `commercial_config_versions` rows; versions are strictly immutable.
- **DO NOT** delete published templates that have existing customer projects or orders.
- **DO NOT** recalculate pricing on historical orders when catalog pricing changes.

### Expected Successful Observable
- Template `current_published_version_id` points to the latest verified version.
- Commercial config `current_version_id` advances monotonically.
- Historical orders render original prices and specifications accurately.

---

## Migration & Upload Recovery

### Authoritative Source of Truth
- Account migration: `customer_projects.origin_local_project_id`, `guest_order_access` (`order_id`, `guest_token_hash`, `claimed_at`, `claimed_by`).
- Asset uploads: Supabase private storage `customer-assets` and `library-assets`.

### Inspection Sequence
1. Check guest order access claim status:
   ```sql
   select order_id, claimed_at, claimed_by, expires_at
   from public.guest_order_access
   where order_id = :order_id;
   ```
2. Check migrated cloud projects:
   ```sql
   select id, owner_user_id, origin_local_project_id, revision, created_at
   from public.customer_projects
   where owner_user_id = :user_id;
   ```

### Safe Retry, Refetch & Reconcile
1. **Proof-bound account claim:**
   - Customer claims guest order via `POST /api/orders/[id]/claim` using HttpOnly guest access cookie.
   - Claim strictly validates `guest_order_access` cryptographic proof and authenticated `auth.uid()`.
   - Replay is safe: if already claimed by the same user, returns `already_claimed: true`. If claimed by another user, returns 409 Conflict.
2. **Partial migration recovery:**
   - Local project migration processes projects sequentially.
   - Projects already migrated (`syncedCloudProjectId` set or matching `origin_local_project_id` in cloud) are skipped.
   - Failed projects remain in local storage with untouched original bytes for retry.
3. **Asset upload failure retry:**
   - In multi-file or multi-stage uploads, successful files remain in storage.
   - Only failed or unverified files are retried.
   - Reconcile storage objects before issuing cleanup commands.

### Forbidden Actions
- **DO NOT** claim guest orders based on phone number or email matching alone; valid guest proof is required.
- **DO NOT** delete local guest assets until upload and cloud project persistence are verified.
- **DO NOT** delete storage files if an upload transaction outcome is unknown; reconcile first.

### Expected Successful Observable
- Guest order `claimed_at` is set with customer's `auth.uid()`.
- Local projects gain `syncedCloudProjectId` and appear in `/my-designs`.
- No orphan or duplicate assets exist in private storage.

---

## Support-safe Diagnostics

### Support-Safe Information Rules
Customer support and operational staff diagnosing issues in customer conversations or public channels must follow strict redaction rules:

1. **Allowlisted Support Identifiers:**
   - **Public Order Code:** e.g., `#ORD-202610-ABCD` or numeric code displayed on receipt.
   - **Short Support Code:** 5-character alphanumeric token derived from error digest (e.g., `A7KF2`), generated via `createSupportCode()`.
   - **Operation ID:** e.g., `op_checkout_1728283921_abc12`.
   - **Product / Variant Code:** e.g., `die-cut-sticker`, `glossy-50mm`.
   - **Operation Status:** e.g., `UNSYNCED`, `PAYMENT_PENDING`, `CONFLICT`.

2. **Strictly Prohibited in Support Communications (NEVER EXPOSE):**
   - **Internal UUIDs:** Database primary keys (`order_id`, `version_id`, `project_id`).
   - **Tokens & Credentials:** Service role keys, Supabase anon keys, guest access tokens, session cookies.
   - **Signed URLs:** Direct presigned storage URLs with query signatures.
   - **Customer PII:** Unmasked phone numbers, shipping addresses, customer emails.
   - **Artwork Data:** Base64 image payloads, raw SVG code, complete `DesignDocument` JSON dumps.
   - **Internal Traces:** SQL error text, database schema details, stack traces.

### Support Escalation Template
```text
[HỖ TRỢ KỸ THUẬT - SỰ CỐ VẬN HÀNH]
Mã đơn hàng: #ORD-XXXXXX
Mã tham chiếu hỗ trợ: A7KF2
Thao tác: [Lưu thiết kế / Đặt hàng / Báo thanh toán / Duyệt sản xuất]
Trạng thái quan sát: [UNSYNCED / CONFLICT / UNKNOWN_OUTCOME]
Hành động đề xuất: [Tải lại trang / Thử lại thao tác / Chờ đối soát giao dịch]
Ghi chú bảo mật: Không gửi ảnh chụp màn hình chứa khóa bí mật hoặc thông tin cá nhân.
```

---

## Manual QA Verification Checklist

The following 18 manual verification scenarios must be executed and confirmed prior to release sign-off.

---

### QA-01: Guest save and reload
- **Preconditions:** Unauthenticated guest in desktop or mobile browser.
- **Steps:**
  1. Open editor on blank product (e.g., wrapping paper or sticker).
  2. Add text element and upload a custom image.
  3. Wait 1 second for autosave debounce, observe save badge.
  4. Reload the browser page (`F5` or mobile pull-to-refresh).
- **Expected UI:** Save badge displays `Đã lưu`. Upon reload, all elements (text, image layers, positions) restore accurately without blank canvas.
- **Expected authoritative observable:** `localStorage` contains metadata in `quynhtrang-recent-projects-v1`. `IndexedDB` contains image blob in `guest_assets_v1`. No network calls to Supabase.
- **Recovery/diagnostic check:** Verify image rehydration from IndexedDB blob ID; verify `quynhtrang-quarantined-projects-v1` is empty.

---

### QA-02: Guest storage failure
- **Preconditions:** Guest editor open with active project.
- **Steps:**
  1. In DevTools, simulate quota limit or block IndexedDB access (`indexedDB.open = () => throw new DOMException('QuotaExceeded')`).
  2. Modify canvas elements to trigger save.
- **Expected UI:** Editor displays warning: `Chưa thể lưu vào trình duyệt` with retry button. Editor remains functional; working design is NOT cleared or lost.
- **Expected authoritative observable:** Working design remains in JavaScript memory. `localStorage` retain existing clean snapshot. No data wipe.
- **Recovery/diagnostic check:** Unblock storage or free space, click `Thử lại`; verify save badge transitions back to `Đã lưu`.

---

### QA-03: Authenticated autosave failure and reconnect
- **Preconditions:** Authenticated customer signed in, editing a cloud project (`/?project=<id>`).
- **Steps:**
  1. Make edits to design canvas.
  2. In DevTools, toggle Network to Offline before debounce fires.
  3. Observe status indicator during network outage.
  4. Make additional edits while offline.
  5. Toggle Network back to Online.
- **Expected UI:** Status transitions to `Đang lưu...` -> `Chưa đồng bộ (unsynced)` with warning icon. Upon reconnecting, status automatically recovers to `Đã lưu`.
- **Expected authoritative observable:** Client retains `pendingSnapshot` with local edits. Upon reconnect, issues `save_customer_project_revision` with original `baseRevision`. Server revision increments from `N` to `N+1`.
- **Recovery/diagnostic check:** Verify `customer_projects.revision` in Supabase matches editor revision counter.

---

### QA-04: Cross-device revision conflict
- **Preconditions:** Same authenticated user account opened in two separate browser windows (Tab A and Tab B) on the same cloud project.
- **Steps:**
  1. In Tab A, add a sticker element and wait for save (`revision = 2`).
  2. In Tab B (still on `revision = 1`), add a text element and trigger save.
- **Expected UI:** Tab B save is rejected by server. Tab B displays conflict modal: "Thiết kế đã được cập nhật ở nơi khác." with action "Tải phiên bản mới".
- **Expected authoritative observable:** Tab B write does NOT overwrite Tab A. `customer_projects.revision` remains at 2. Server rejects write with `STALE_REVISION`.
- **Recovery/diagnostic check:** In Tab B, click "Tải phiên bản mới"; verify Tab B reloads canonical document containing Tab A's sticker.

---

### QA-05: Checkout refresh
- **Preconditions:** Guest customer with customized product proceeds to `/checkout`.
- **Steps:**
  1. Enter customer information (name, phone, address).
  2. Select payment method / review quote summary.
  3. Hard refresh the checkout page (`Ctrl+F5` / `Cmd+Shift+R`).
- **Expected UI:** Checkout draft state restores: design preview, quantity, selected options, and entered customer fields remain populated. No need to re-customize.
- **Expected authoritative observable:** Session storage `quynhtrang_checkout_draft_v1` preserves draft. Valid quote ID and TTL preserved.
- **Recovery/diagnostic check:** Verify customer can proceed to Order confirmation without re-entering form data.

---

### QA-06: Checkout offline
- **Preconditions:** Customer on checkout review step before final submission.
- **Steps:**
  1. Simulate network disconnect (Offline).
  2. Click "Đặt hàng ngay".
- **Expected UI:** UI shows non-blocking network error: "Không có kết nối mạng. Vui lòng kiểm tra và thử lại." Form inputs and cart items remain intact.
- **Expected authoritative observable:** No orphan order created in Supabase. Idempotency intent cached on client.
- **Recovery/diagnostic check:** Reconnect network, click "Đặt hàng ngay"; verify order submits successfully exactly once.

---

### QA-07: Order double-click
- **Preconditions:** Customer ready to submit order on `/checkout`.
- **Steps:**
  1. Rapidly double-click or triple-click the "Đặt hàng ngay" submit button.
- **Expected UI:** Button enters loading state immediately on first click, disabling duplicate pointer events.
- **Expected authoritative observable:** Server receives identical `idempotency_key`. Exactly ONE row created in `orders`. Exactly ONE `order_created` event in `order_events`.
- **Recovery/diagnostic check:** Query `orders` table filtered by `idempotency_key`; count must equal 1.

---

### QA-08: Order committed with lost response
- **Preconditions:** Automated interceptor or proxy configured to drop HTTP response on `POST /api/orders`.
- **Steps:**
  1. Submit order.
  2. Server commits order preparation transaction, but client network drops before receiving 200 response.
  3. Client encounters timeout and retries submit with identical idempotency key.
- **Expected UI:** Client recovers cleanly: navigates to Order Confirmation page showing public order code and payment QR code.
- **Expected authoritative observable:** Server detects existing order for idempotency key. Replays original order details without inserting a second order row.
- **Recovery/diagnostic check:** Verify total order count in database for customer intent is exactly 1.

---

### QA-09: Payment report committed with lost response
- **Preconditions:** Order placed, customer on Order Confirmation page with payment QR.
- **Steps:**
  1. Click "Tôi đã chuyển khoản".
  2. Server executes `report_checkout_payment` RPC successfully, but response is dropped.
  3. Customer clicks "Tôi đã chuyển khoản" again (retry).
- **Expected UI:** Status badge updates to "Đã báo thanh toán - Đang chờ xác nhận". No error toast.
- **Expected authoritative observable:** First call returned `reported` and inserted `customer_payment_reported` event. Second call returns `already_reported`. Exactly ONE event in `order_events`.
- **Recovery/diagnostic check:** Query `order_events` where `order_id = :id` and `event = 'customer_payment_reported'`; count must equal 1.

---

### QA-10: Two Admins confirming payment
- **Preconditions:** Order in `payment_status = 'reported'`. Two Admin tabs (Admin 1 and Admin 2) open on `/admin/orders/[id]`.
- **Steps:**
  1. Admin 1 clicks "Xác nhận thanh toán" and confirms dialog.
  2. Concurrently or immediately after, Admin 2 clicks "Xác nhận thanh toán".
- **Expected UI:** Admin 1 sees success toast; order status updates to `Đã thanh toán`. Admin 2 receives graceful notice that payment was already confirmed, and detail refreshes.
- **Expected authoritative observable:** `confirm_order_payment` executes with row lock. Admin 1 commits transition. Admin 2 receives replay outcome `already_paid`. Exactly ONE `payment_confirmed` event.
- **Recovery/diagnostic check:** Inspect `order_events` table; verify single `payment_confirmed` event with Admin 1 identity.

---

### QA-11: Staff Draft refresh
- **Preconditions:** Staff editor editing a customer design revision at `/admin/orders/[id]/design`.
- **Steps:**
  1. Make edits to the design layout in staff editor mode.
  2. Wait for staff debounce (800ms) or click Save.
  3. Hard refresh the browser window.
- **Expected UI:** Editor reloads the latest persisted staff draft document. Revision number and modifications match pre-refresh state.
- **Expected authoritative observable:** `design_revision_drafts.document` contains latest state. Lease remains valid with current session token.
- **Recovery/diagnostic check:** Check `design_revision_drafts.updated_at` and `revision` counter in database.

---

### QA-12: Two Staff Draft editors
- **Preconditions:** Two staff members (Editor A and Editor B) navigate to the same order design review page.
- **Steps:**
  1. Editor A acquires draft lease and begins editing.
  2. Editor B attempts to edit the same draft.
- **Expected UI:** Editor B sees read-only mode banner: "Bản nháp đang được chỉnh sửa bởi [Tên nhân viên]." Edit controls disabled.
- **Expected authoritative observable:** `design_revision_drafts.locked_by` points to Editor A with active `lease_expires_at`. Editor B write attempts rejected by lease fencing.
- **Recovery/diagnostic check:** Editor A closes tab, wait 120s for lease expiry; Editor B can now acquire lease. Or Admin executes takeover RPC.

---

### QA-13: Renderer failure and retry
- **Preconditions:** Order approved for production. Render job enqueued in `design_render_jobs`.
- **Steps:**
  1. Simulate worker crash or font loading failure during render job execution.
  2. Worker process terminates before writing output files.
  3. Restart worker via `scripts/state39-render-jobs.ts --once`.
- **Expected UI:** Admin order detail shows production status blocked until render completes; does not allow starting production prematurely.
- **Expected authoritative observable:** Initial attempt failed or expired lease reclaimed by `claim_next_render_job`. Attempt counter increments to 2. Second attempt completes successfully, uploads thumbnail to `approved-renders`, updates `design_versions.approved_thumbnail_path`.
- **Recovery/diagnostic check:** Verify `design_render_jobs.status = 'completed'` and `design_versions.approved_thumbnail_path is not null`.

---

### QA-14: Two Start Production attempts
- **Preconditions:** Order ready for production (`paid`, `approved`, no hold, render ready). Two Admin sessions open on order detail.
- **Steps:**
  1. Admin 1 and Admin 2 both click "Bắt đầu sản xuất" simultaneously.
- **Expected UI:** Admin 1 sees success toast; order status transitions to `Đang sản xuất`. Admin 2 receives notice that order is already in production, and view refreshes.
- **Expected authoritative observable:** Atomic RPC `start_order_production` executes. Admin 1 transitions order. Admin 2 receives idempotent replay or conflict. Exactly ONE `production_started` event in `order_events`.
- **Recovery/diagnostic check:** Query `order_events` where `order_id = :id` and `event = 'production_started'`; count must equal 1. Verify `production_started_at` is set.

---

### QA-15: Partial local-project migration
- **Preconditions:** Customer has three guest projects in browser storage. One project has intentional invalid asset corruption; two are valid.
- **Steps:**
  1. Customer completes checkout and signs up / signs in with OTP to save account.
  2. Local project migration service initiates.
- **Expected UI:** Migration completes with notification: "Đã lưu 2 thiết kế vào tài khoản. 1 thiết kế cần kiểm tra lại." Customer remains signed in.
- **Expected authoritative observable:** Two valid projects created in `customer_projects` with `owner_user_id = user.id`. Corrupt project remains in local storage quarantined without blocking account creation.
- **Recovery/diagnostic check:** Verify `/my-designs` displays the 2 successfully migrated projects. Corrupt item safely retained in local storage for manual retry.

---

### QA-16: Partial Sticker upload
- **Preconditions:** Admin in Asset Library (`/admin/content/stickers`).
- **Steps:**
  1. Batch upload 5 sticker SVG files.
  2. Simulate network abort or validation failure on file 3 during upload pipeline.
- **Expected UI:** Upload progress modal shows files 1, 2, 4, 5 succeeded (`Tải lên thành công`), file 3 failed (`Lỗi tải lên`). "Thử lại file lỗi" button active.
- **Expected authoritative observable:** Successful 4 sticker files committed to storage and `library_assets` table. Failed file 3 does not leave dangling records.
- **Recovery/diagnostic check:** Click "Thử lại file lỗi" for file 3; verify only file 3 is processed and committed without re-uploading the other 4.

---

### QA-17: Template Publish response-loss retry
- **Preconditions:** Admin editing template draft.
- **Steps:**
  1. Click "Xuất bản mẫu".
  2. Server RPC `template_publish_draft` commits, but response drops due to connection reset.
  3. Admin clicks "Xuất bản mẫu" again with same intent.
- **Expected UI:** Template detail view updates to "Đã xuất bản" with version `v2`. No duplicate version error.
- **Expected authoritative observable:** Replay request resolves existing published version created by first attempt. `templates.current_published_version_id` points to the new version. Exactly ONE `template_published` event in `asset_events`.
- **Recovery/diagnostic check:** Query `template_versions` for template; verify version sequence is contiguous with no duplicate version numbers.

---

### QA-18: Commercial Publish concurrency
- **Preconditions:** Product commercial draft open by two Admins simultaneously.
- **Steps:**
  1. Admin A modifies tier pricing and publishes (`expectedProductRevision = 5`).
  2. Admin B (still seeing old pricing) clicks publish with `expectedProductRevision = 5`.
- **Expected UI:** Admin A publish succeeds. Admin B publish fails with revision conflict error: "Cấu hình thương mại đã được cập nhật bởi quản trị viên khác. Vui lòng tải lại trang."
- **Expected authoritative observable:** Database CAS check protects catalog. Admin A increments revision to 6 and creates version. Admin B write is rejected. Old orders continue using original commercial snapshot.
- **Recovery/diagnostic check:** Query `product_commercial_configs.revision`; verify revision is 6. Check existing order snapshots to confirm zero price drift.
