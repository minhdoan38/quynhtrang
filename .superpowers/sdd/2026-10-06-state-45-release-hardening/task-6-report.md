# Task 6: Harden revisioned autosave, conflicts, and draft leases

## Overview
Hardened revisioned autosave queues, draft lease heartbeats, and conflict resolution across staff and template workflows:
1. `src/lib/staff-draft-autosave.ts`: Removed swallowed `try { await this.inner.flush(); } catch {}` in `StaffDraftSaveQueue.flush()`. Rejections from conflict (`REVISION_CONFLICT`) or network failure now propagate directly to callers and retain dirty/pending state.
2. `src/lib/draft-autosave.ts`: Added document snapshot generation tracking (`documentGeneration`, `inFlightGeneration`) and monotonic server revision updates (`Math.max(this.revision, res.value.revision)`). An older response cannot mark a newer local snapshot saved.
3. `src/lib/use-template-draft-session.ts`: Implemented `TemplateDraftHeartbeatScheduler` with bounded exponential retry and jitter (`baseRetryMs = 2000`, doubling up to 3 retries: ~2s, 4s, 8s) for transient heartbeat network failures before the 120s lease expires. On tab visibility restore (`visibilitychange`), triggers an immediate heartbeat. Stops retries immediately on lease conflicts (`LEASE_LOST`, `LEASE_CONFLICT`, `LEASE_EXPIRED`).
4. `src/lib/use-staff-draft-session.ts`: Integrated `TemplateDraftHeartbeatScheduler` for staff draft heartbeats and wired `flushSave()` to propagate queue flush errors.
5. `src/app/admin/orders/[id]/design/design-review-client.tsx`: Wrapped pre-transition and pre-approval `flushSave()` calls in try/catch. A failed flush blocks completion/approval, retains dirty local state, and displays actionable toast "Chưa thể lưu bản nháp, vui lòng thử lại". Mounted `ConflictDialog` across all modes (`staff-edit`, `review-changes`, `review`) with explicit conflict message "Thiết kế đã được cập nhật ở nơi khác." and action button "Tải phiên bản mới".
6. `src/components/admin/design-revision-dialogs.tsx`: Updated `ConflictDialog` default message to "Thiết kế đã được cập nhật ở nơi khác." and reload button text to "Tải phiên bản mới".
7. `src/components/admin/commercial-config-editor.tsx`: Standardized UI states to `idle | saving | saved | unsynced | conflict | error`. On `REVISION_CONFLICT`, displays an explicit conflict alert banner and provides "Tải phiên bản mới" refetch action.

## Verification
- Targeted six-module test suite:
  `node --test --experimental-strip-types src/test/cloud-project-autosave.test.ts src/test/staff-draft-autosave.test.ts src/test/template-draft-concurrency.test.ts src/test/template-management.test.ts src/test/design-draft-operations.test.ts src/test/commercial-config-service.test.ts`
  Result: 80/80 passed across 12 suites (0 failed).
- Commercial editor test suite:
  `node --test --experimental-strip-types src/test/admin-commercial-editor.test.ts`
  Result: 8/8 passed (0 failed).
- TypeScript check:
  `pnpm typecheck`
  Result: 0 errors.
- Full test suite:
  `pnpm test`
  Result: 1258/1258 passed across 98 suites (0 failed).

## Commit
- `11eb8e0`: `fix(autosave): preserve pending drafts and fence stale writes`

## Fix Round 1: Address Review Findings
### Root Causes & Fixes
1. **`src/lib/draft-autosave.ts`**:
   - Root cause: If user enqueued edits during an in-flight save and then reverted back to the in-flight snapshot before completion, `documentGeneration` advanced while `pendingDocument` was cleared on acknowledgement. The check `generationToSave >= this.documentGeneration` evaluated to false, skipping `drainFlushWaiters()` and `setStatus('saved')` and causing `flush()` to hang indefinitely.
   - Fix: When `pendingDocument === null` on successful save response, the in-memory document matches the acknowledged snapshot. Transitioned to `'saved'` and called `drainFlushWaiters()` without requiring generation check. Added regression test `StaffDraftSaveQueue flush resolves when edit is reverted to in-flight snapshot` in `src/test/staff-draft-autosave.test.ts`.
2. **`src/app/admin/orders/[id]/design/design-review-client.tsx`**:
   - Root cause: `ConflictDialog` used `router.refresh()` which kept client state (`currentDraft`, `draftSession.saveStatus`) intact, leaving `saveStatus = 'conflict'` and the dialog permanently open.
   - Fix: Created `handleReloadPersisted` using `window.location.reload()` across all three `ConflictDialog` mount points to ensure canonical server state reloads cleanly.
3. **`src/components/admin/commercial-config-editor.tsx`**:
   - Root cause: "Tải phiên bản mới" reload button stayed enabled during pending requests, allowing concurrent `openDraft()` requests from double-clicks where a delayed second response could overwrite newer state.
   - Fix: Disabled reload button while `pending === true`, added `openDraftInFlightRef` single-flight guard and sequence tracking `openDraftSeqRef` to ignore stale out-of-order responses. Added regression test in `src/test/admin-commercial-editor.test.ts`.

### Verification Evidence
- Seven-module test suite:
  `node --test --experimental-strip-types src/test/cloud-project-autosave.test.ts src/test/staff-draft-autosave.test.ts src/test/template-draft-concurrency.test.ts src/test/template-management.test.ts src/test/design-draft-operations.test.ts src/test/commercial-config-service.test.ts src/test/admin-commercial-editor.test.ts`
  Result: 90/90 passed across 13 suites (0 failed).
- TypeScript check:
  `pnpm typecheck`
  Result: 0 errors.
- Full test suite:
  `pnpm test`
  Result: 1260/1260 passed across 98 suites (0 failed).

### Commit
- `fix(autosave): resolve flush on semantic revert and fix conflict reload`
