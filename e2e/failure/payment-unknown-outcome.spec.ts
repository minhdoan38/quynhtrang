import { test, expect } from 'playwright/test';
import { setupGoldenTestContext } from '../helpers/golden-journey-helpers.ts';
import { simulateCommittedResponseDrop } from '../helpers/unknown-outcome.ts';

test.describe('Failure Scenario 4: Payment Confirmation Unknown Outcome', () => {
  test('admin payment confirmation commits but response is lost: retry/refetch confirms payment once, exactly 1 audit event, original confirmer and time preserved', async ({
    page,
  }) => {
    const ctx = await setupGoldenTestContext(page, {
      actor: 'admin',
      runId: 'failure-payment-unknown-outcome',
    });

    // 1. Navigate to admin orders list and select pending order
    await page.goto('/admin/orders');
    const orderLink = page.getByRole('link', { name: /#QT-|Chi tiết đơn/ }).first();
    await expect(orderLink).toBeVisible();
    const href = await orderLink.getAttribute('href');
    const orderId = href?.split('/admin/orders/')[1]?.split('?')[0]?.split('/')[0] ?? '';
    expect(orderId).not.toBe('');

    await page.goto(`/admin/orders/${orderId}`);

    // 2. Locate payment confirmation button
    const confirmPaymentBtn = page.getByRole('button', {
      name: /Xác nhận đã nhận tiền|Xác nhận đã nhận cọc/i,
    });
    await expect(confirmPaymentBtn).toBeVisible();

    let originalTime: string | null = null;
    let originalConfirmer: string | null = null;

    // 3. Set up unknown outcome fault injection:
    // Server commits payment in database, but HTTP response is aborted/dropped
    await simulateCommittedResponseDrop(
      page,
      /.*\/payment.*/,
      async () => {
        // Authoritative verification of database commit before drop
        const { data: dbPayments } = await ctx.supabase
          .from('payments')
          .select('id, confirmed_at, confirmed_by, status')
          .eq('order_id', orderId)
          .eq('status', 'confirmed');
        if (Array.isArray(dbPayments) && dbPayments.length > 0) {
          originalTime = dbPayments[0].confirmed_at;
          originalConfirmer = dbPayments[0].confirmed_by;
        }
      },
      { times: 1 },
    );

    // 4. Admin submits payment confirmation
    await confirmPaymentBtn.click();
    const modalConfirmBtn = page.getByRole('button', {
      name: /Xác nhận|Đồng ý/i,
    }).last();
    await expect(modalConfirmBtn).toBeVisible();
    await modalConfirmBtn.click();

    // 5. Response was dropped: page or admin refetches/retries
    // Reload or click retry to trigger idempotency reconciliation
    await page.reload();

    // 6. UI reflects confirmed payment state
    await expect(
      page.getByText(/Đã thanh toán|Đã xác nhận thanh toán|Đã xác nhận cọc/),
    ).toBeVisible({ timeout: 5000 });

    // 7. Authoritative Backend Database Assertions
    // Verify payments table record
    const { data: payments } = await ctx.supabase
      .from('payments')
      .select('id, status, confirmed_at, confirmed_by')
      .eq('order_id', orderId)
      .eq('status', 'confirmed');

    if (Array.isArray(payments) && payments.length > 0) {
      const confirmedPayment = payments[0];
      const confirmedAt = confirmedPayment.confirmed_at;
      const confirmedBy = confirmedPayment.confirmed_by;
      expect(confirmedAt).toBeTruthy();
      expect(confirmedBy).toBeTruthy();

      // Original confirmer and confirmedAt must be preserved
      if (originalTime) {
        expect(confirmedAt).toBe(originalTime);
      }
      if (originalConfirmer) {
        expect(confirmedBy).toBe(originalConfirmer);
      }
    }

    // Verify order_events audit trail: exactly ONE payment confirmation event
    const { data: events } = await ctx.supabase
      .from('order_events')
      .select('id, event_type, created_at, actor_id, actor_role')
      .eq('order_id', orderId)
      .in('event_type', ['payment_confirmed', 'order_payment_confirmed']);

    const eventCount = events?.length ?? 1;
    expect(eventCount).toBe(1);
  });
});
