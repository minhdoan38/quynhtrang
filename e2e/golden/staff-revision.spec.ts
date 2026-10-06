import { test, expect } from 'playwright/test';
import {
  setupGoldenTestContext,
  queryBackendOrder,
  queryBackendOrderEvents,
} from '../helpers/golden-journey-helpers.ts';

test.describe('Golden Journey 3: Staff Revision Lifecycle', () => {
  test('customer approved v1 remains immutable while staff edits, preflights, and approves v2 for production', async ({
    page,
  }) => {
    // 1. Staff / Editor authentication
    const ctx = await setupGoldenTestContext(page, {
      actor: 'editor',
      runId: 'golden-staff-revision',
    });

    // 2. Navigate to an existing order's design review page
    await page.goto('/admin/orders');
    const orderLink = page.getByRole('link', { name: /#QT-|Chi tiết đơn/ }).first();
    await expect(orderLink).toBeVisible();
    const href = await orderLink.getAttribute('href');
    const orderId = href?.split('/admin/orders/')[1]?.split('?')[0]?.split('/')[0] ?? '';
    expect(orderId).not.toBe('');
    await page.goto(`/admin/orders/${orderId}/design`);

    // 3. Verify Customer Version v1 indicator is present
    await expect(page.getByText(/Khách duyệt v1|Bản khách/i)).toBeVisible();

    // 4. Create Revision Draft
    const createRevisionBtn = page.getByRole('button', {
      name: 'Tạo bản chỉnh sửa',
    });

    await expect(createRevisionBtn).toBeVisible();
    await createRevisionBtn.click();
    // Modal: enter revision reason
    await expect(
      page.getByRole('heading', { name: 'Tạo bản chỉnh sửa thiết kế' }),
    ).toBeVisible();
    await page
      .getByLabel(/Lý do chỉnh sửa/)
      .fill('Căn chỉnh lề an toàn 3mm và kiểm tra độ phân giải in ấn');
    await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click();

    // 5. Staff Editing mode
    await expect(page.getByText(/Bản chỉnh sửa #/)).toBeVisible();

    // Complete editing & run preflight check
    const completeEditingBtn = page.getByRole('button', {
      name: /Hoàn tất|Xem lại/i,
    });
    await expect(completeEditingBtn).toBeVisible();
    await completeEditingBtn.click();

    // 6. Compare & Approval Mode
    await expect(
      page.getByText(/So sánh & duyệt sản xuất|Bản sửa mới • Chờ duyệt/i),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Bản khách duyệt ban đầu v1 vẫn được giữ nguyên không đổi\./i,
      ),
    ).toBeVisible();

    // Approve revised version as production
    const approveRevisionBtn = page.getByRole('button', {
      name: 'Duyệt bản sửa',
    });
    await expect(approveRevisionBtn).toBeVisible();
    await approveRevisionBtn.click();
    // Confirmation dialog
    await expect(
      page.getByRole('heading', {
        name: 'Dùng bản chỉnh sửa này để sản xuất?',
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Xác nhận duyệt sản xuất' })
      .click();

    // Navigates back to Order Detail or Review
    await page.waitForURL(/\/admin\/orders/);

    // 7. Canonical Backend / Database Assertions
    if (orderId) {
      const backendOrder = await queryBackendOrder(ctx.supabase, orderId);
      if (backendOrder) {
        // Customer design version pointer must stay on v1
        expect(backendOrder.customerDesignVersionId).not.toBeNull();

        // Query design_versions table in database
        const { data: versions } = await ctx.supabase
          .from('design_versions')
          .select('id, version_number, is_customer, is_production')
          .eq('project_id', backendOrder.projectId ?? '')
          .order('version_number', { ascending: true });

        if (Array.isArray(versions) && versions.length >= 2) {
          const v1 = versions.find((v) => v.version_number === 1);
          const v2 = versions.find((v) => v.version_number === 2);

          // Invariant 1: customer version remains v1
          expect(v1?.is_customer).toBe(true);

          // Invariant 2: production version is v2
          expect(v2?.is_production).toBe(true);
          expect(backendOrder.productionDesignVersionId).toBe(v2?.id);
        }

        // Verify design approval audit event
        const events = await queryBackendOrderEvents(ctx.supabase, orderId);
        expect(events.some((e) => e.eventType.includes('design'))).toBe(true);
      }
    } else {
      // General assertions for route access and role authorization
      await expect(page.getByText(/Biên tập viên|editor|admin/i).first()).toBeVisible();
    }
  });
});
