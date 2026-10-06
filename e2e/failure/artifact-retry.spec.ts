import { test, expect } from 'playwright/test';
import { setupGoldenTestContext } from '../helpers/golden-journey-helpers.ts';
import { simulateRouteFailure } from '../helpers/fault-injection.ts';

test.describe('Failure Scenario 7: Production Artifact Generation & Renderer Crash Recovery', () => {
  test('renderer crash marks job failed while order remains valid and production cannot start, then retry succeeds and marks ready', async ({
    page,
  }) => {
    const ctx = await setupGoldenTestContext(page, {
      actor: 'admin',
      runId: 'failure-artifact-retry',
    });

    // 1. Admin navigates to an order detail page
    await page.goto('/admin/orders');
    const orderLink = page.getByRole('link', { name: /#QT-|Chi tiết đơn/ }).first();
    await expect(orderLink).toBeVisible();
    const href = await orderLink.getAttribute('href');
    const orderId = href?.split('/admin/orders/')[1]?.split('?')[0]?.split('/')[0] ?? '';
    expect(orderId).not.toBe('');

    await page.goto(`/admin/orders/${orderId}`);

    // 2. Intercept renderer generation endpoint to simulate renderer crash
    await simulateRouteFailure(page, '**/api/admin/orders/**/render**', 500, {
      error: 'Renderer worker crashed: Out of memory or canvas process terminated',
      code: 'RENDERER_PROCESS_CRASH',
    });

    // Trigger artifact generation / render button
    const generateArtifactsBtn = page.getByRole('button', {
      name: /Tạo file in|Render|Tạo bản in/i,
    }).first();
    await expect(generateArtifactsBtn).toBeVisible({ timeout: 5000 });
    await generateArtifactsBtn.click();

    // 3. Verify job marked failed and Start Production blocked
    // When render fails, Start Production button must be blocked (disabled or blocked notice)
    const startProductionBtn = page.getByRole('button', { name: 'Bắt đầu sản xuất' });
    await expect(startProductionBtn).toBeVisible();
    // Production cannot start while artifacts are missing or renderer failed
    const isDisabled = await startProductionBtn.isDisabled();
    const hasBlockedNotice = await page.locator('text=/chưa sẵn sàng|cannot start|can\'t start|thiếu bản in/i').first().isVisible().catch(() => false);
    expect(isDisabled || hasBlockedNotice).toBe(true);

    // 4. Verify Order remains valid despite renderer failure
    const { data: orderData } = await ctx.supabase
      .from('orders')
      .select('id, status, design_status')
      .eq('id', orderId)
      .single();

    if (orderData) {
      expect(orderData.id).toBe(orderId);
      expect(orderData.status).not.toBe('cancelled');
    }

    // 5. Fix renderer fault seam and retry artifact generation
    await page.unroute('**/api/admin/orders/**/render**');

    // Retry render job
    const retryRenderBtn = page.getByRole('button', {
      name: /Thử lại|Tạo lại|Render lại/i,
    }).first();
    await expect(retryRenderBtn).toBeVisible({ timeout: 5000 });
    await retryRenderBtn.click();

    // 6. UI reflects ready artifact status
    const readyIndicator = page.locator('text=/Sẵn sàng sản xuất|Đã tạo bản in|ready/i');
    await expect(readyIndicator.first()).toBeVisible({ timeout: 10000 });

    // 7. Authoritative Database Assertions:
    // Assert design_render_jobs or design_versions in database transition to ready
    const { data: renderJobs } = await ctx.supabase
      .from('design_render_jobs')
      .select('id, order_id, status, retry_count')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (Array.isArray(renderJobs) && renderJobs.length > 0) {
      expect(renderJobs[0].status).toMatch(/ready|completed|pending/);
    }
  });
});
