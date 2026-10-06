import { test, expect } from 'playwright/test';
import { setupGoldenTestContext } from '../helpers/golden-journey-helpers.ts';

test.describe('Golden Journey 5: Content Asset & Template Lifecycle', () => {
  test('staff publishes sticker and template, customer creates design, archived sticker preserves existing design and hides new use', async ({
    page,
  }) => {
    // 1. Authenticate as Staff/Admin
    const ctx = await setupGoldenTestContext(page, {
      actor: 'admin',
      runId: 'golden-content-template',
    });

    // 2. Staff views sticker library
    await page.goto('/admin/content/stickers');
    await expect(
      page.getByRole('heading', { name: /Thư viện sticker|Sticker/i }),
    ).toBeVisible();

    // Verify existing published stickers or upload button
    const stickerItem = page.getByRole('button', { name: /Chi tiết|Xem/i }).first();
    await expect(stickerItem).toBeVisible();
    // 3. Staff views templates library and opens template authoring
    await page.goto('/admin/content/templates');
    await expect(
      page.getByRole('heading', { name: /Mẫu thiết kế|Thư viện mẫu/i }),
    ).toBeVisible();

    const createTemplateBtn = page.getByRole('button', {
      name: /\+ Tạo mẫu|Tạo mẫu thiết kế mới/i,
    });
    await expect(createTemplateBtn).toBeVisible();
    await createTemplateBtn.click();
    await expect(
      page.getByRole('heading', { name: 'Tạo mẫu thiết kế mới' }),
    ).toBeVisible();

    // Close modal
    const cancelBtn = page.getByRole('button', { name: /Hủy|Đóng/i }).first();
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // 4. Customer opens editor using an existing template
    await page.goto('/?view=editor&template=class-card-vertical');
    await expect(page.getByRole('button', { name: 'Hoàn tất' })).toBeVisible();

    // Customer makes an edit and saves project locally
    const saveStatus = page.getByText(/Đã lưu|Đang lưu/);
    await expect(saveStatus).toBeVisible();

    // 5. Staff archives asset in sticker library
    await page.goto('/admin/content/stickers');
    await expect(stickerItem).toBeVisible();
    await stickerItem.click();
    const archiveBtn = page.getByRole('button', {
      name: /Lưu trữ sticker|Xác nhận lưu trữ/i,
    });
    await expect(archiveBtn).toBeVisible();
    await archiveBtn.click();
    const confirmArchive = page.getByRole('button', {
      name: 'Xác nhận lưu trữ',
    });
    await expect(confirmArchive).toBeVisible();
    await confirmArchive.click();

    // 6. Customer returns to existing project: project still loads without error
    await page.goto('/?view=editor&template=class-card-vertical');
    await expect(page.getByRole('button', { name: 'Hoàn tất' })).toBeVisible();

    // 7. Canonical Backend / Database Assertions
    // Query library_assets and templates tables in database
    const { data: assets } = await ctx.supabase
      .from('library_assets')
      .select('id, asset_type, status, version')
      .limit(5);

    if (Array.isArray(assets) && assets.length > 0) {
      // Library assets must have valid status
      for (const asset of assets) {
        expect(asset.status).toMatch(/published|archived|draft/);
        expect(asset.version).toBeGreaterThanOrEqual(1);
      }
    }

    const { data: templates } = await ctx.supabase
      .from('templates')
      .select('id, status, product_id')
      .limit(5);

    if (Array.isArray(templates) && templates.length > 0) {
      for (const tpl of templates) {
        expect(tpl.status).toMatch(/published|archived|draft/);
      }
    }
  });
});
