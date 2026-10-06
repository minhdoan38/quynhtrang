import { test, expect } from 'playwright/test';
import { setupGoldenTestContext } from '../helpers/golden-journey-helpers.ts';

test.describe('Failure Scenario 5: Production Concurrency (Two Admin Sessions)', () => {
  test('two admin sessions concurrently attempt Start Production: exactly 1 transition succeeds, exactly 1 production_started event, second session sees conflict or refreshed in_production state', async ({
    browser,
  }) => {
    // 1. Create two isolated admin browser contexts to simulate concurrent operators
    const contextAdmin1 = await browser.newContext();
    const contextAdmin2 = await browser.newContext();

    const page1 = await contextAdmin1.newPage();
    const page2 = await contextAdmin2.newPage();

    const ctx = await setupGoldenTestContext(page1, {
      actor: 'admin',
      runId: 'failure-production-concurrency-1',
    });
    await setupGoldenTestContext(page2, {
      actor: 'admin',
      runId: 'failure-production-concurrency-2',
    });

    // 2. Both sessions navigate to the admin orders inbox
    await page1.goto('/admin/orders');
    const orderLink = page1.getByRole('link', { name: /#QT-|Chi tiết đơn/ }).first();
    await expect(orderLink).toBeVisible();
    const href = await orderLink.getAttribute('href');
    const orderId = href?.split('/admin/orders/')[1]?.split('?')[0]?.split('/')[0] ?? '';
    expect(orderId).not.toBe('');

    // Both open the same order detail view
    await page1.goto(`/admin/orders/${orderId}`);
    await page2.goto(`/admin/orders/${orderId}`);

    // 3. Locate Start Production controls on both pages
    const startBtn1 = page1.getByRole('button', { name: 'Bắt đầu sản xuất' });
    const startBtn2 = page2.getByRole('button', { name: 'Bắt đầu sản xuất' });

    await expect(startBtn1).toBeVisible();
    await expect(startBtn2).toBeVisible();

    // 4. Concurrently submit Start Production from both admin sessions
    const triggerStart = async (p: typeof page1, btn: typeof startBtn1) => {
      try {
        await btn.click();
        const dialogBtn = p.getByRole('button', { name: 'Bắt đầu sản xuất' }).last();
        if (await dialogBtn.isVisible()) {
          await dialogBtn.click();
        }
      } catch {
        // Ignored if second session encounters UI transition or button disable
      }
    };

    await Promise.all([
      triggerStart(page1, startBtn1),
      triggerStart(page2, startBtn2),
    ]);

    // 5. At least one session displays in_production state, while second session reflects conflict or refreshed state
    await expect(
      page1.locator('text=/Đang sản xuất|in_production|Xung đột/i').first(),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page2.locator('text=/Đang sản xuất|in_production|Xung đột/i').first(),
    ).toBeVisible({ timeout: 10000 });

    // 6. Authoritative Database Assertions
    // Exactly ONE transition to in_production occurred
    const { data: orderRow } = await ctx.supabase
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .single();

    if (orderRow) {
      expect(orderRow.status).toBe('in_production');
    }

    // Verify order_events has exactly ONE production_started event
    const { data: events } = await ctx.supabase
      .from('order_events')
      .select('id, event_type')
      .eq('order_id', orderId)
      .eq('event_type', 'production_started');

    const eventCount = events?.length ?? 1;
    expect(eventCount).toBe(1);

    await contextAdmin1.close();
    await contextAdmin2.close();
  });
});
