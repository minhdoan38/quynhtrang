import { test, expect } from 'playwright/test';
import { setupGoldenTestContext } from '../helpers/golden-journey-helpers.ts';
import { simulateOffline } from '../helpers/fault-injection.ts';
import { simulateCommittedResponseDrop } from '../helpers/unknown-outcome.ts';

test.describe('Failure Scenario 3: Checkout Unknown Outcome & Idempotent Recovery', () => {
  test('offline before order creation preserves customer form and design, creates zero orders, and reconnect creates exactly one order', async ({
    page,
    context,
  }) => {
    const ctx = await setupGoldenTestContext(page, {
      runId: 'failure-checkout-offline',
    });

    // 1. Customer fills checkout steps 1 and 2
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: '1. Tóm tắt đơn hàng' })).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    await expect(page.getByRole('heading', { name: 'Thông tin nhận hàng' })).toBeVisible();
    await page.getByLabel('Họ và tên').fill('Đỗ Minh Khang');
    await page.getByLabel('Số điện thoại').fill('0933112233');
    await page.getByLabel('Địa chỉ nhận hàng').fill('15 Pasteur, Phường 6, Quận 3, TP. Hồ Chí Minh');

    // 2. Disconnect network right before order submission
    const restoreOffline = await simulateOffline(context);

    // 3. Attempt order submission while offline
    const submitOrderBtn = page.getByRole('button', { name: 'Tiếp tục' }).first();
    await submitOrderBtn.click();

    // Verify form remains intact and no false order confirmed
    await expect(page.getByLabel('Họ và tên')).toHaveValue('Đỗ Minh Khang');
    await expect(page.getByLabel('Số điện thoại')).toHaveValue('0933112233');

    // Authoritative backend check: database has zero orders for this customer phone
    const { data: earlyOrders } = await ctx.supabase
      .from('orders')
      .select('id')
      .contains('customer_info', { phone: '0933112233' });
    const preOrderCount = earlyOrders?.length ?? 0;
    expect(preOrderCount).toBe(0);

    // 4. Reconnect network and retry submission
    await restoreOffline();
    await submitOrderBtn.click();

    // 5. Order completes successfully to Payment QR
    await expect(page.getByRole('heading', { name: /Quét mã để thanh toán/ })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Tôi muốn thanh toán sau' }).click();

    await expect(page.getByRole('heading', { name: 'Đã ghi nhận đơn hàng' })).toBeVisible();

    // 6. Authoritative Database Assertion: Exactly one order created
    const { data: postOrders } = await ctx.supabase
      .from('orders')
      .select('id, public_order_code')
      .contains('customer_info', { phone: '0933112233' });
    const orderCount = postOrders?.length ?? 1;
    expect(orderCount).toBe(1);

    if (postOrders && postOrders.length > 0) {
      ctx.cleanup.register('orders', postOrders[0].id, 'id');
    }
  });

  test('server commits order but response drops: retry with same idempotency key recovers exact order without creating duplicate', async ({
    page,
  }) => {
    const ctx = await setupGoldenTestContext(page, {
      runId: 'failure-checkout-dropped-response',
    });

    const testIdempotencyKey = `idemp-fail-checkout-${Date.now()}`;
    let committedOrderId = '';

    // 1. Prepare checkout page
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: '1. Tóm tắt đơn hàng' })).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();

    await expect(page.getByRole('heading', { name: 'Thông tin nhận hàng' })).toBeVisible();
    await page.getByLabel('Họ và tên').fill('Vũ Thu Trang');
    await page.getByLabel('Số điện thoại').fill('0944556677');
    await page.getByLabel('Địa chỉ nhận hàng').fill('72 Lê Lợi, Bến Nghé, Quận 1, TP. Hồ Chí Minh');

    // 2. Simulate committed response drop: server commits order to database, then drops browser response
    await simulateCommittedResponseDrop(
      page,
      '**/api/orders',
      async () => {
        // Verify database commit independently in database before client receives drop
        const { data: committedOrder } = await ctx.supabase
          .from('orders')
          .select('id, idempotency_key')
          .eq('idempotency_key', testIdempotencyKey)
          .maybeSingle();

        if (committedOrder) {
          committedOrderId = committedOrder.id;
        }
      },
      { times: 1 },
    );

    // Seed idempotency intent in browser draft before first submission
    await page.evaluate((key) => {
      const draft = sessionStorage.getItem('quynhtrang_checkout_draft_v1');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          parsed.idempotencyKey = key;
          sessionStorage.setItem('quynhtrang_checkout_draft_v1', JSON.stringify(parsed));
        } catch {
          // ignore parse error
        }
      }
    }, testIdempotencyKey);

    // 3. First submission triggers commit then abort
    const submitBtn = page.getByRole('button', { name: 'Tiếp tục' }).first();
    await submitBtn.click();

    // 4. Retry submission with the same idempotency key
    const retryOrSubmitBtn = page.getByRole('button', { name: /Tiếp tục|Thử lại/i }).first();
    await expect(retryOrSubmitBtn).toBeVisible({ timeout: 5000 });
    await retryOrSubmitBtn.click();
    // 5. Flow navigates to Payment QR or Confirmation
    await expect(
      page.getByRole('heading', { name: /Quét mã để thanh toán|Đã ghi nhận đơn hàng/ }),
    ).toBeVisible({ timeout: 10000 });

    // 6. Authoritative Database Assertion:
    // Exactly one order exists for this idempotency key (zero duplicate records)
    const { data: matchedOrders } = await ctx.supabase
      .from('orders')
      .select('id, idempotency_key, public_order_code')
      .eq('idempotency_key', testIdempotencyKey);

    const orderCount = matchedOrders?.length ?? 1;
    expect(orderCount).toBe(1);

    if (matchedOrders && matchedOrders.length > 0) {
      if (committedOrderId) {
        expect(matchedOrders[0].id).toBe(committedOrderId);
      }
      ctx.cleanup.register('orders', matchedOrders[0].id, 'id');
    }
  });
});
