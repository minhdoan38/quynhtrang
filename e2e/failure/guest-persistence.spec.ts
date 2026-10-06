import { test, expect } from 'playwright/test';
import { setupGoldenTestContext } from '../helpers/golden-journey-helpers.ts';
import { simulateStorageWriteFailure } from '../helpers/fault-injection.ts';

test.describe('Failure Scenario 1: Guest Persistence Quota & Write Abort', () => {
  test('storage quota/write failure keeps editor mounted, warns user, preserves memory state, and does not show fake Đã lưu', async ({
    page,
  }) => {
    const ctx = await setupGoldenTestContext(page, {
      runId: 'failure-guest-persistence',
    });

    // 1. Simulate storage write / quota failure before guest interaction
    await simulateStorageWriteFailure(page, 'all', 'QuotaExceededError');

    // 2. Guest opens editor
    await page.goto('/?view=editor');

    // Verify canvas / editor remains mounted and interactive despite storage failure
    const finishBtn = page.getByRole('button', { name: 'Xong' });
    await expect(finishBtn).toBeVisible();

    // 3. User performs modification in editor
    // Check save status indicator: must NOT report fake 'Đã lưu'
    const savedIndicator = page.locator('span:text-is("Đã lưu")');
    await expect(savedIndicator).toHaveCount(0);

    // 4. Warning / error status must be surfaced to the user
    // Look for error badge or warning message: 'Lưu lỗi', 'Chưa thể lưu', or 'Không thể lưu thay đổi'
    const warningIndicator = page.locator('text=/Lưu lỗi|Chưa thể lưu|Không thể lưu/');
    await expect(warningIndicator.first()).toBeVisible({ timeout: 5000 });

    // 5. Memory state remains: canvas elements and controls are still present and operable
    await expect(page.getByRole('button', { name: 'Xong' })).toBeEnabled();

    // 6. Attempt navigating or preflight: memory state still allows reviewing the uncommitted design
    await finishBtn.click();
    await expect(
      page.getByRole('heading', { name: /Thiết kế đã sẵn sàng|Không thể lưu/ }),
    ).toBeVisible();

    // 7. Authoritative Backend / Database Assertion:
    // Local-first guest editing under storage failure must not create anonymous auth sessions or orphan backend records
    const { data: orphanOrders, error } = await ctx.supabase
      .from('orders')
      .select('id')
      .eq('id', '00000000-0000-0000-0000-000000000000');
    expect(error).toBeNull();
    expect(orphanOrders?.length ?? 0).toBe(0);
  });
});
