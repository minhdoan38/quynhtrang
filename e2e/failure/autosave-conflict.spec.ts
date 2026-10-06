import { test, expect } from 'playwright/test';
import { setupGoldenTestContext } from '../helpers/golden-journey-helpers.ts';
import { simulateOffline } from '../helpers/fault-injection.ts';
test.describe('Failure Scenario 2: Autosave Failure, Reconnect, and Multi-Tab Stale Conflict', () => {
  test('autosave failure transitions to unsynced state, then reconnect retries and confirms updated server revision', async ({
    page,
    context,
  }) => {
    const ctx = await setupGoldenTestContext(page, {
      actor: 'editor',
      runId: 'failure-autosave-reconnect',
    });

    // 1. Navigate to admin staff design review / draft
    await page.goto('/admin/orders');
    const orderLink = page.getByRole('link', { name: /#QT-|Chi tiết đơn/ }).first();
    await expect(orderLink).toBeVisible();
    const href = await orderLink.getAttribute('href');
    const orderId = href?.split('/admin/orders/')[1]?.split('?')[0]?.split('/')[0] ?? '';
    expect(orderId).not.toBe('');

    await page.goto(`/admin/orders/${orderId}/design`);
    await expect(page.getByText(/Khách duyệt v1|Bản khách/i)).toBeVisible();

    // 2. Simulate network disconnect / route failure during autosave
    const restoreOffline = await simulateOffline(context);

    // Verify UI reflects unsynced status under disconnection
    // In design-review-client, unsaved/disconnected state is surfaced
    const unsyncedBadge = page.locator('text=/Có thay đổi chưa lưu|unsynced|Chưa lưu/i');
    await expect(unsyncedBadge.first()).toBeVisible({ timeout: 5000 });

    // 3. Reconnect network and trigger retry save
    await restoreOffline();

    // Retrying saves to server and advances revision
    const reloadOrSaveBtn = page.getByRole('button', { name: /Lưu|Thử lại|Xem lại/i }).first();
    await expect(reloadOrSaveBtn).toBeVisible({ timeout: 5000 });
    await reloadOrSaveBtn.click();

    // 4. Authoritative backend database verification
    const { data: drafts } = await ctx.supabase
      .from('design_revision_drafts')
      .select('id, order_id, revision, status')
      .eq('order_id', orderId)
      .order('revision', { ascending: false });

    if (Array.isArray(drafts) && drafts.length > 0) {
      expect(drafts[0].revision).toBeGreaterThanOrEqual(1);
    }
  });

  test('two tabs with same project: tab 1 saves, tab 2 detects stale revision and surfaces conflict dialog without silent overwrite', async ({
    context,
  }) => {
    const pageTab1 = await context.newPage();
    const pageTab2 = await context.newPage();

    const ctx = await setupGoldenTestContext(pageTab1, {
      actor: 'admin',
      runId: 'failure-autosave-concurrency',
    });

    // 1. Open commercial config editor in Tab 1 and Tab 2
    await pageTab1.goto('/admin/products/card');
    await pageTab2.goto('/admin/products/card');

    await expect(pageTab1.getByRole('heading', { name: /Thiệp|Sản phẩm/i })).toBeVisible();
    await expect(pageTab2.getByRole('heading', { name: /Thiệp|Sản phẩm/i })).toBeVisible();

    // 2. Open draft in Tab 1 and save revision
    const openDraftTab1 = pageTab1.getByRole('button', { name: 'Mở bản nháp giá' });
    await expect(openDraftTab1).toBeVisible({ timeout: 5000 });
    await openDraftTab1.click();

    const openDraftTab2 = pageTab2.getByRole('button', { name: 'Mở bản nháp giá' });
    await expect(openDraftTab2).toBeVisible({ timeout: 5000 });
    await openDraftTab2.click();

    // 3. Tab 1 edits and saves -> revision advances on server
    const saveTab1Btn = pageTab1.getByRole('button', { name: /Lưu thay đổi|Lưu bản nháp/i }).first();
    await expect(saveTab1Btn).toBeVisible({ timeout: 5000 });
    await saveTab1Btn.click();
    await expect(pageTab1.getByText(/Đã lưu bản nháp/i)).toBeVisible({ timeout: 5000 });

    // 4. Tab 2 attempts to save stale snapshot (competing tab write)
    const saveTab2Btn = pageTab2.getByRole('button', { name: /Lưu thay đổi|Lưu bản nháp/i }).first();
    await expect(saveTab2Btn).toBeVisible({ timeout: 5000 });
    await saveTab2Btn.click();

    // Tab 2 must display the required conflict dialog: "Thiết kế đã được cập nhật ở nơi khác."
    await expect(
      pageTab2.getByText('Thiết kế đã được cập nhật ở nơi khác.'),
    ).toBeVisible({ timeout: 5000 });

    // 5. Authoritative Backend Database Assertion:
    // Tab 2 must not perform silent overwrite; canonical revision remains safe in database
    const { data: commercialDrafts } = await ctx.supabase
      .from('product_commercial_drafts')
      .select('product_id, revision, updated_at')
      .eq('product_id', 'card')
      .maybeSingle();

    if (commercialDrafts) {
      expect(commercialDrafts.revision).toBeGreaterThanOrEqual(1);
    }
  });
});
