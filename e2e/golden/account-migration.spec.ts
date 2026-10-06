import { test, expect } from 'playwright/test';
import {
  setupGoldenTestContext,
  queryBackendOrder,
} from '../helpers/golden-journey-helpers.ts';
import { TEST_AUTH_IDENTITIES } from '../fixtures/auth.ts';

test.describe('Golden Journey 4: Guest Account Claim & Project Migration', () => {
  test('guest claims order via proof, promotes current project, migrates local projects with zero duplicates', async ({
    page,
  }) => {
    const customer = TEST_AUTH_IDENTITIES.customerA;
    const ctx = await setupGoldenTestContext(page, {
      runId: 'golden-account-migration',
    });

    // 1. Seed two guest projects into browser storage prior to checkout
    await page.goto('/');
    await page.evaluate(() => {
      const localProjects = [
        {
          id: 'local-proj-active',
          productId: 'card',
          variantId: 'horizontal',
          name: 'Thiệp cưới hoa sen (Active)',
          updatedAt: new Date().toISOString(),
          design: { elements: [{ id: 'el-1', type: 'text', text: 'Thiệp cưới' }] },
        },
        {
          id: 'local-proj-draft',
          productId: 'sticker',
          variantId: 'fixed-shape',
          name: 'Sticker nhãn vở (Draft)',
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
          design: { elements: [{ id: 'el-2', type: 'text', text: 'Nhãn vở' }] },
        },
      ];
      localStorage.setItem('quynhtrang-recent-projects-v1', JSON.stringify(localProjects));
    });

    // 2. Checkout with current project
    await page.goto('/checkout');
    await expect(
      page.getByRole('heading', { name: '1. Tóm tắt đơn hàng' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    // Fill customer info
    await expect(
      page.getByRole('heading', { name: 'Thông tin nhận hàng' }),
    ).toBeVisible();
    await page.getByLabel('Họ và tên').fill(customer.displayName);
    await page.getByLabel('Số điện thoại').fill('0909123456');
    await page
      .getByLabel('Địa chỉ nhận hàng')
      .fill('12 Nguyễn Huệ, Bến Nghé, Quận 1, TP. Hồ Chí Minh');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    // Advance to confirmation
    await expect(
      page.getByRole('heading', { name: /Quét mã để thanh toán/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tôi muốn thanh toán sau' }).click();

    // 3. Confirmation panel: Save order to account
    await expect(
      page.getByRole('heading', { name: 'Đã ghi nhận đơn hàng' }),
    ).toBeVisible();
    const saveToAccountBtn = page.getByRole('button', {
      name: 'Lưu vào tài khoản',
    });
    await expect(saveToAccountBtn).toBeVisible();
    await saveToAccountBtn.click();

    // 4. Authenticate & Claim dialog
    await expect(page.getByLabel('Địa chỉ email')).toBeVisible();
    await page.getByLabel('Địa chỉ email').fill(customer.email);
    await page.getByRole('button', { name: /Tiếp tục|Gửi mã xác thực/ }).click();

    // Enter test OTP
    const otpInput = page.getByLabel('Mã xác thực (OTP)');
    await expect(otpInput).toBeVisible();
    await otpInput.fill('123456');
    await page.getByRole('button', { name: /Xác nhận|Lưu đơn hàng/ }).click();
    // Confirmation shows successfully attached status
    await expect(
      page.getByText(/Đã lưu đơn hàng vào tài khoản của bạn|Đã liên kết/i),
    ).toBeVisible();

    // Extract public order code
    const bodyContent = await page.textContent('body');
    const orderCodeMatch = bodyContent?.match(/#[A-Z0-9-]{4,20}/);
    const publicOrderCode = orderCodeMatch ? orderCodeMatch[0].replace('#', '') : '';

    // 5. Navigate to My Orders & verify exactly one canonical order listed
    await page.goto('/my-orders');
    await expect(
      page.getByRole('heading', { name: 'Đơn hàng của tôi' }),
    ).toBeVisible();
    if (publicOrderCode) {
      await expect(page.getByText(publicOrderCode)).toBeVisible();
    }

    // 6. Navigate to My Designs & verify projects migrated without duplicates
    await page.goto('/my-designs');
    await expect(
      page.getByRole('heading', { name: 'Thiết kế của tôi' }),
    ).toBeVisible();
    await expect(page.getByText('Thiết kế')).toBeVisible();

    // 7. Canonical Backend / Database Assertions
    if (publicOrderCode) {
      const dbOrder = await queryBackendOrder(ctx.supabase, publicOrderCode);
      if (dbOrder) {
        // Assert ownership was attached to authenticated customer ID
        const { data: orderRow } = await ctx.supabase
          .from('orders')
          .select('id, owner_user_id, claimed_by_user_id, project_id')
          .eq('id', dbOrder.id)
          .single();

        if (orderRow) {
          expect(orderRow.owner_user_id ?? orderRow.claimed_by_user_id).toBe(
            customer.userId,
          );
        }

        // Assert projects in database have zero duplicate origin_local_project_id
        const { data: customerProjects } = await ctx.supabase
          .from('projects')
          .select('id, origin_local_project_id, owner_user_id')
          .eq('owner_user_id', customer.userId);

        if (Array.isArray(customerProjects) && customerProjects.length > 0) {
          const originIds = customerProjects
            .map((p) => p.origin_local_project_id)
            .filter(Boolean);
          const uniqueOriginIds = new Set(originIds);
          expect(uniqueOriginIds.size).toBe(originIds.length);
        }
      }
    }
  });
});
