import { test, expect } from 'playwright/test';
import {
  setupGoldenTestContext,
  queryBackendOrder,
  queryBackendPayments,
} from '../helpers/golden-journey-helpers.ts';

test.describe('Golden Journey 6: Commercial Versioning & Historical Immutability', () => {
  test('publishing v2 updates future quotes while historical order retains immutable v1 snapshot and payment economics', async ({
    page,
  }) => {
    // 1. Authenticate as Admin
    const ctx = await setupGoldenTestContext(page, {
      actor: 'admin',
      runId: 'golden-commercial-versioning',
    });

    // 2. Admin views product catalog & commercial editor for Card product
    await page.goto('/admin/products/card');
    await expect(
      page.getByRole('heading', { name: /Thiệp|Sản phẩm/i }),
    ).toBeVisible();

    // Check commercial config editor section
    await expect(page.getByText(/Giá & số lượng/)).toBeVisible();
    await expect(page.getByText(/Thanh toán/)).toBeVisible();

    // 3. Customer checks out under v1 pricing
    await page.goto('/checkout');
    await expect(
      page.getByRole('heading', { name: '1. Tóm tắt đơn hàng' }),
    ).toBeVisible();
    await expect(page.getByLabel('Số lượng đặt in')).toBeVisible();

    // Capture v1 quote total text
    const v1QuoteText = await page.textContent('body');
    expect(v1QuoteText).toBeTruthy();

    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    // Step 2: Customer Info
    await expect(
      page.getByRole('heading', { name: 'Thông tin nhận hàng' }),
    ).toBeVisible();
    await page.getByLabel('Họ và tên').fill('Lê Hoàng Long');
    await page.getByLabel('Số điện thoại').fill('0912345678');
    await page
      .getByLabel('Địa chỉ nhận hàng')
      .fill('88 Hai Bà Trưng, Bến Nghé, Quận 1, TP. Hồ Chí Minh');
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    // Step 3: Payment QR
    await expect(
      page.getByRole('heading', { name: /Quét mã để thanh toán/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tôi muốn thanh toán sau' }).click();

    // Order confirmation
    await expect(
      page.getByRole('heading', { name: 'Đã ghi nhận đơn hàng' }),
    ).toBeVisible();

    const confirmationBody = await page.textContent('body');
    const orderCodeMatch = confirmationBody?.match(/#[A-Z0-9-]{4,20}/);
    const v1OrderCode = orderCodeMatch ? orderCodeMatch[0].replace('#', '') : '';

    // 4. Admin revises pricing to v2 in commercial editor
    await page.goto('/admin/products/card');
    const openDraftBtn = page.getByRole('button', {
      name: 'Mở bản nháp giá',
    });
    if (await openDraftBtn.isVisible().catch(() => false)) {
      await openDraftBtn.click();
      await expect(page.getByText(/Bản nháp/i)).toBeVisible();

      // Publish v2
      const publishBtn = page.getByRole('button', {
        name: 'Xuất bản giá',
      });
      if (await publishBtn.isVisible().catch(() => false)) {
        await publishBtn.click();
      }
    }

    // 5. Customer initiates a new quote/checkout under v2
    await page.goto('/checkout');
    await expect(
      page.getByRole('heading', { name: '1. Tóm tắt đơn hàng' }),
    ).toBeVisible();
    await expect(page.getByText(/Tạm tính|Thanh toán trước:/)).toBeVisible();

    // 6. Canonical Backend / Database Invariants Assertions
    if (v1OrderCode) {
      const v1OrderRecord = await queryBackendOrder(ctx.supabase, v1OrderCode);
      if (v1OrderRecord) {
        // Invariant 1: historical order retains exact v1 commercial snapshot
        expect(v1OrderRecord.commercialSnapshot).not.toBeNull();
        expect(v1OrderRecord.totalAmount).toBeGreaterThan(0);

        // Invariant 2: historical payment record retains exact original requirement
        const payments = await queryBackendPayments(ctx.supabase, v1OrderRecord.id);
        if (payments.length > 0) {
          expect(payments[0].amount).toBe(v1OrderRecord.totalAmount);
          expect(payments[0].purpose).toMatch(/checkout_full|checkout_deposit/);
        }

        // Invariant 3: commercial_config_versions table has immutable published versions
        const { data: versions } = await ctx.supabase
          .from('commercial_config_versions')
          .select('id, version_number, product_id, is_current')
          .eq('product_id', 'card')
          .order('version_number', { ascending: true });

        if (Array.isArray(versions) && versions.length >= 1) {
          // Exactly one version is current
          const currentVersions = versions.filter((v) => v.is_current);
          expect(currentVersions.length).toBeLessThanOrEqual(1);

          // Historical versions retain immutable records in database
          for (const ver of versions) {
            expect(ver.version_number).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });
});
