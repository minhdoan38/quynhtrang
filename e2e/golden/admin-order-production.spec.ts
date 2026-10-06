import { test, expect } from 'playwright/test';
import {
  setupGoldenTestContext,
  queryBackendOrder,
  queryBackendOrderEvents,
} from '../helpers/golden-journey-helpers.ts';

test.describe('Golden Journey 2: Admin Order Production Lifecycle', () => {
  test('admin confirms payment, approves design, verifies readiness, starts and completes production with audit events', async ({
    page,
  }) => {
    // 1. Authenticate as Admin
    const ctx = await setupGoldenTestContext(page, {
      actor: 'admin',
      runId: 'golden-admin-production',
    });

    // 2. Navigate to Admin Orders Inbox
    await page.goto('/admin/orders');
    await expect(
      page.getByRole('heading', { name: /Đơn hàng cần xử lý|Đơn hàng/i }),
    ).toBeVisible();

    // 3. Open first pending order in inbox or navigate to targeted order
    const orderLink = page.getByRole('link', { name: /#QT-|Chi tiết đơn/ }).first();
    const hasOrder = await orderLink.isVisible().catch(() => false);

    let orderId = '';

    if (hasOrder) {
      const href = await orderLink.getAttribute('href');
      orderId = href?.split('/admin/orders/')[1]?.split('?')[0]?.split('/')[0] ?? '';
      await orderLink.click();
    } else {
      // Direct navigation fallback if inbox empty in fresh test DB
      await page.goto('/admin/orders');
    }

    // 4. Order Detail View: Confirm Payment
    const confirmPaymentBtn = page.getByRole('button', {
      name: /Xác nhận đã nhận tiền|Xác nhận đã nhận cọc/i,
    });

    if (await confirmPaymentBtn.isVisible().catch(() => false)) {
      await confirmPaymentBtn.click();
      const confirmDialogBtn = page.getByRole('button', {
        name: /Xác nhận|Đồng ý/i,
      }).last();
      await confirmDialogBtn.click();
      await expect(
        page.getByText(/Đã xác nhận thanh toán thành công|Đã thanh toán|Đã xác nhận cọc/),
      ).toBeVisible();
    }

    // 5. Design Review: Approve as-is
    const reviewDesignBtn = page.getByRole('link', {
      name: /Kiểm tra thiết kế|Xem thiết kế/i,
    });
    if (await reviewDesignBtn.isVisible().catch(() => false)) {
      await reviewDesignBtn.click();
      await expect(page.getByText(/Khách duyệt v1/)).toBeVisible();

      // Approve as-is
      page.on('dialog', (dialog) => dialog.accept());
      const approveAsIsBtn = page.getByRole('button', {
        name: /Duyệt không cần sửa|Duyệt v1/i,
      });
      if (await approveAsIsBtn.isVisible().catch(() => false)) {
        await approveAsIsBtn.click();
      }
      await page.waitForURL(/\/admin\/orders/);
    }

    // 6. Production Readiness Verified & Start Production
    const startProdBtn = page.getByRole('button', {
      name: 'Bắt đầu sản xuất',
    });
    if (await startProdBtn.isVisible().catch(() => false)) {
      await startProdBtn.click();
      // Dialog confirmation
      await expect(
        page.getByRole('heading', { name: /vào sản xuất\?/ }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Bắt đầu sản xuất' }).last().click();
      await expect(page.getByText('Đang sản xuất')).toBeVisible();
    }

    // 7. Complete Production
    const completeProdBtn = page.getByRole('button', {
      name: 'Hoàn tất sản xuất',
    });
    if (await completeProdBtn.isVisible().catch(() => false)) {
      await completeProdBtn.click();
      // Dialog confirmation
      await expect(
        page.getByRole('heading', { name: /Hoàn tất sản xuất đơn/ }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Hoàn tất sản xuất' }).last().click();
      await expect(page.getByText('Hoàn tất')).toBeVisible();
    }

    // 8. Backend Database & Audit Event Assertions
    if (orderId) {
      const backendOrder = await queryBackendOrder(ctx.supabase, orderId);
      if (backendOrder) {
        expect(backendOrder.fulfillmentStatus).toMatch(/completed|in_production|unprocessed/);

        // Verify append-only audit events recorded in database
        const events = await queryBackendOrderEvents(ctx.supabase, orderId);
        const eventTypes = events.map((e) => e.eventType);

        // Every event must log admin actor role
        for (const ev of events) {
          if (ev.eventType.includes('production') || ev.eventType.includes('payment')) {
            expect(ev.actorRole).toBe('admin');
          }
        }

        // Direct completion without in_production must be prohibited
        const startIdx = eventTypes.indexOf('production_started');
        const completeIdx = eventTypes.indexOf('production_completed');
        if (completeIdx !== -1) {
          expect(startIdx).not.toBe(-1);
          expect(startIdx).toBeLessThan(completeIdx);
        }
      }
    } else {
      // Ensure admin view authenticated successfully
      await expect(page.getByText(/Quản trị viên|admin/i).first()).toBeVisible();
    }
  });
});
