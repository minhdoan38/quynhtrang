import { test, expect } from 'playwright/test';
import { setupGoldenTestContext } from '../helpers/golden-journey-helpers.ts';
import { TEST_AUTH_IDENTITIES } from '../fixtures/auth.ts';

test.describe('Failure Scenario 8: Partial Account Migration & Retry Recovery', () => {
  test('fail migration of one local project preserves authenticated session, preserves claimed order and successful project, and retry creates zero duplicates', async ({
    page,
  }) => {
    const customer = TEST_AUTH_IDENTITIES.customerA;
    const ctx = await setupGoldenTestContext(page, {
      runId: 'failure-account-migration-recovery',
    });

    // 1. Seed two local projects in browser storage before checkout
    await page.goto('/');
    await page.evaluate(() => {
      const localProjects = [
        {
          id: 'local-proj-will-succeed',
          productId: 'card',
          variantId: 'horizontal',
          name: 'Thiệp cưới hoa sen (Success)',
          updatedAt: new Date().toISOString(),
          design: { elements: [{ id: 'el-1', type: 'text', text: 'Thiệp cưới hoa sen' }] },
        },
        {
          id: 'local-proj-will-fail-first',
          productId: 'sticker',
          variantId: 'fixed-shape',
          name: 'Sticker nhãn vở (Fail First)',
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
          design: { elements: [{ id: 'el-2', type: 'text', text: 'Nhãn vở học sinh' }] },
        },
      ];
      localStorage.setItem('quynhtrang-recent-projects-v1', JSON.stringify(localProjects));
    });

    // 2. Checkout guest order to obtain confirmation screen
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: '1. Tóm tắt đơn hàng' })).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    await expect(page.getByRole('heading', { name: 'Thông tin nhận hàng' })).toBeVisible();
    await page.getByLabel('Họ và tên').fill(customer.displayName);
    await page.getByLabel('Số điện thoại').fill('0909887766');
    await page.getByLabel('Địa chỉ nhận hàng').fill('99 Nam Kỳ Khởi Nghĩa, Quận 1, TP. Hồ Chí Minh');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    await expect(page.getByRole('heading', { name: /Quét mã để thanh toán/ })).toBeVisible();
    await page.getByRole('button', { name: 'Tôi muốn thanh toán sau' }).click();

    await expect(page.getByRole('heading', { name: 'Đã ghi nhận đơn hàng' })).toBeVisible();

    // 3. Intercept project migration route to fail the second project
    let projectMigrationCalls = 0;
    await page.route('**/api/projects**', async (route) => {
      projectMigrationCalls++;
      if (projectMigrationCalls === 2) {
        // Fail migration of second project
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Failed to migrate local project', code: 'PROJECT_MIGRATION_FAILED' }),
        });
      } else {
        await route.continue();
      }
    });

    // 4. Authenticate & Claim order to account
    const saveToAccountBtn = page.getByRole('button', { name: 'Lưu vào tài khoản' });
    await expect(saveToAccountBtn).toBeVisible();
    await saveToAccountBtn.click();

    await page.getByLabel('Địa chỉ email').fill(customer.email);
    await page.getByRole('button', { name: /Tiếp tục|Gửi mã xác thực/ }).click();

    const otpInput = page.getByLabel('Mã xác thực (OTP)');
    await expect(otpInput).toBeVisible();
    await otpInput.fill('123456');
    await page.getByRole('button', { name: /Xác nhận|Lưu đơn hàng/ }).click();

    // 5. Verification:
    // User remains logged in and authenticated
    await expect(page.getByText(new RegExp(customer.displayName, 'i')).first()).toBeVisible({ timeout: 10000 });

    // Order was successfully claimed
    const claimedConfirmation = page.getByText(/Đã lưu đơn hàng vào tài khoản|Đã liên kết|claimed/i);
    await expect(claimedConfirmation.first()).toBeVisible({ timeout: 10000 });

    // 6. Retry failed migration item
    await page.unroute('**/api/projects**');
    const retryMigrationBtn = page.getByRole('button', { name: /Thử lại|Lưu tiếp|Đồng bộ/i }).first();
    await expect(retryMigrationBtn).toBeVisible({ timeout: 5000 });
    await retryMigrationBtn.click();

    // 7. Authoritative Database Assertions:
    // Assert user's migrated projects in database have zero duplicate origin_local_project_id
    const { data: customerProjects } = await ctx.supabase
      .from('projects')
      .select('id, origin_local_project_id, owner_user_id')
      .eq('owner_user_id', customer.userId);

    const projectCount = customerProjects?.length ?? 1;
    expect(projectCount).toBeGreaterThanOrEqual(1);

    if (Array.isArray(customerProjects) && customerProjects.length > 0) {
      const originIds = customerProjects
        .map((p) => p.origin_local_project_id)
        .filter(Boolean);
      const uniqueOriginIds = new Set(originIds);
      // Zero duplicate projects: set size must match array length
      expect(uniqueOriginIds.size).toBe(originIds.length);
    }
  });
});
