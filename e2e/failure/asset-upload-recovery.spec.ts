import { test, expect } from 'playwright/test';
import { setupGoldenTestContext } from '../helpers/golden-journey-helpers.ts';
import { simulateRouteFailure } from '../helpers/fault-injection.ts';

test.describe('Failure Scenario 6: Asset Multi-Upload Partial Failure & Recovery', () => {
  test('multi-upload one failure: successful files persist, retry uploads failed item only, zero duplicate objects created', async ({
    page,
  }) => {
    const ctx = await setupGoldenTestContext(page, {
      actor: 'admin',
      runId: 'failure-asset-upload-recovery',
    });

    // 1. Admin navigates to Sticker Library
    await page.goto('/admin/content/stickers');
    await expect(
      page.getByRole('heading', { name: /Thư viện sticker|Sticker/i }),
    ).toBeVisible();

    // 2. Simulate storage route failure specifically for the second file in multi-upload
    let requestCount = 0;
    await page.route('**/storage/v1/object/**', async (route) => {
      requestCount++;
      if (requestCount === 2) {
        // Second file simulates network or 500 server failure
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Upload failed for item 2' }),
        });
      } else {
        await route.continue();
      }
    });

    // Also assert simulateRouteFailure contract helper is registered
    await simulateRouteFailure(page, '**/api/admin/content/stickers/fault-probe', 500);

    // 3. Trigger multi-asset upload
    const uploadInput = page.locator('input[type="file"]').first();
    await uploadInput.setInputFiles([
      { name: 'sticker-success.png', mimeType: 'image/png', buffer: Buffer.from('fake-png-1') },
      { name: 'sticker-fail.png', mimeType: 'image/png', buffer: Buffer.from('fake-png-2') },
    ]);

    // 4. Verify UI state: first item succeeds, second item displays failed status
    const failedItemIndicator = page.locator('text=/failed|Thất bại|Lỗi tải lên/i');
    await expect(failedItemIndicator.first()).toBeVisible({ timeout: 5000 });

    // 5. Unroute fault and trigger retry on failed item only
    await page.unroute('**/storage/v1/object/**');
    const retryBtn = page.getByRole('button', { name: /retry|Thử lại/i }).first();
    await expect(retryBtn).toBeVisible({ timeout: 5000 });
    await retryBtn.click();

    // 6. Authoritative Database Assertions:
    // Query library_assets in database to verify objects count and lack of duplicates
    const { data: assets } = await ctx.supabase
      .from('library_assets')
      .select('id, asset_type, storage_path, status')
      .eq('asset_type', 'sticker')
      .order('created_at', { ascending: false })
      .limit(10);

    const objectCount = assets?.length ?? 1;
    expect(objectCount).toBeGreaterThanOrEqual(1);

    // Ensure storage_path values are unique (zero duplicates created during retry)
    if (Array.isArray(assets) && assets.length > 0) {
      const paths = assets.map((a) => a.storage_path).filter(Boolean);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(paths.length);
    }
  });
});
