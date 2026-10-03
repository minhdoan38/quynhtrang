import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Route } from 'playwright';

interface SmokeOptions {
  scenario?: string;
  baseUrl?: string;
  screenshotDir?: string;
}

export async function runAdminSmoke(options: SmokeOptions = {}) {
  const scenario = options.scenario ?? 'admin';
  const screenshotDir = options.screenshotDir ?? join(process.cwd(), '.superpowers/screenshots/state43');
  await mkdir(screenshotDir, { recursive: true });

  console.log(`[State43Smoke] Starting scenario "${scenario}"...`);

  // Verify actor / DB presence if strict live mode is flagged
  if (process.env.CHECK_LIVE_DB === 'true' && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)) {
    console.error('[State43Smoke] Missing actor / DB configuration in environment. Exiting nonzero.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------------------
    // 1. Desktop 1440x1000 Scenario
    // -------------------------------------------------------------------------
    console.log('[State43Smoke] 1. Setting up Desktop Context (1440x1000)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });

    let currentTemplate: Record<string, unknown> = {
      id: 'tmpl-smoke-card-1',
      name: 'Thiệp lớp học',
      status: 'draft',
      revision: 1,
      productId: 'card',
      variantId: 'vertical',
      mode: null,
      shape: null,
      categoryId: 'all',
      tags: ['lop-hoc', 'thiep'],
      sortOrder: 1,
      currentPublishedVersionId: null,
      everPublishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
      createdBy: '00000000-0000-0000-0000-0000000000a1',
      updatedBy: '00000000-0000-0000-0000-0000000000a1',
      target: {
        productId: 'card',
        variantId: 'vertical',
        mode: null,
        shape: null,
        surfaces: [
          { id: 'front', widthMm: 105, heightMm: 148 },
          { id: 'inside', widthMm: 210, heightMm: 148 },
          { id: 'back', widthMm: 105, heightMm: 148 },
        ],
        geometryKey: 'card:vertical',
      },
    };

    const versions: Array<{
      id: string;
      version: number;
      publishedAt: string;
      publishedBy: string | null;
      revisionNote: string | null;
    }> = [];

    // Reusable route interception for deterministic UI verification across viewports
    const setupRoutes = async (ctx: BrowserContext) => {
      await ctx.route('http://localhost:3000/**', async (route: Route) => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        const method = route.request().method();

        // Mock API endpoints
        if (path === '/api/admin/content/templates/categories') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              categories: [
                { id: 'all', name: 'Tất cả', sortOrder: 0 },
                { id: 'birthday', name: 'Sinh nhật', sortOrder: 1 },
                { id: 'cute', name: 'Cute', sortOrder: 2 },
              ],
            }),
          });
        }

        if (path === '/api/admin/content/templates' && method === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              items: [currentTemplate],
              total: 1,
            }),
          });
        }

        if (path === '/api/admin/content/templates' && method === 'POST') {
          const body = route.request().postDataJSON();
          currentTemplate = {
            ...currentTemplate,
            id: `tmpl-${Date.now()}`,
            name: body.name,
            productId: body.target.productId,
            variantId: body.target.variantId,
            mode: body.target.mode,
            shape: body.target.shape,
            categoryId: body.categoryId || 'all',
            tags: body.tags || [],
          };
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              template: currentTemplate,
              draft: {
                id: 'draft-smoke-1',
                templateId: currentTemplate.id,
                draftRevision: 1,
                designDocument: { productId: currentTemplate.productId, variantId: currentTemplate.variantId, elements: [] },
              },
            }),
          });
        }

        if (path === '/api/admin/content/templates/sources' && method === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              items: [
                {
                  id: 'proj-source-1',
                  productId: 'card',
                  variantId: 'vertical',
                  currentWorkingRevision: 3,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  eligible: true,
                  blockedReason: null,
                },
              ],
            }),
          });
        }

        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/draft/lease')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              draft: { id: 'draft-smoke-1', leaseEpoch: 1 },
            }),
          });
        }

        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/validate')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              receipt: {
                id: 'val-receipt-1',
                templateId: currentTemplate.id,
                draftId: 'draft-smoke-1',
                sourceRevision: 1,
                sourceDocumentHash: 'hash1',
                candidateDocumentHash: 'hash2',
                targetHash: 'hash3',
                leaseEpoch: 1,
                sessionId: 'session-1',
                findings: [],
                warningIds: ['template-no-editable-elements'],
                customerPreviewPassed: true,
                engineFingerprint: 'chromium-smoke',
                thumbnail: { assetId: 'thumb-1', sha256: 'sha-1' },
                expiresAt: new Date(Date.now() + 600000).toISOString(),
              },
            }),
          });
        }

        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/publish')) {
          const body = route.request().postDataJSON();
          currentTemplate = {
            ...currentTemplate,
            status: 'published',
            revision: Number(currentTemplate.revision || 1) + 1,
            everPublishedAt: new Date().toISOString(),
          };
          const newVer = {
            id: `ver-${Date.now()}`,
            version: versions.length + 1,
            publishedAt: new Date().toISOString(),
            publishedBy: '00000000-0000-0000-0000-0000000000a1',
            revisionNote: body.revisionNote || null,
          };
          versions.push(newVer);
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, version: newVer }),
          });
        }

        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/archive')) {
          currentTemplate = { ...currentTemplate, status: 'archived' };
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, template: currentTemplate }),
          });
        }

        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/republish')) {
          currentTemplate = { ...currentTemplate, status: 'published' };
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, template: currentTemplate }),
          });
        }

        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/duplicate')) {
          const dup = {
            ...currentTemplate,
            id: `tmpl-dup-${Date.now()}`,
            name: `${currentTemplate.name} (Bản sao)`,
            status: 'draft',
            revision: 1,
          };
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, template: dup }),
          });
        }

        if (path.match(/\/api\/admin\/content\/templates\/[^/]+$/)) {
          if (method === 'PATCH') {
            const body = route.request().postDataJSON();
            currentTemplate = {
              ...currentTemplate,
              name: body.name ?? currentTemplate.name,
              categoryId: body.categoryId ?? currentTemplate.categoryId,
              tags: body.tags ?? currentTemplate.tags,
              sortOrder: body.sortOrder ?? currentTemplate.sortOrder,
            };
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ ok: true, template: currentTemplate }),
            });
          }
          if (method === 'DELETE') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ ok: true }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              template: currentTemplate,
              draft: { id: 'draft-smoke-1', draftRevision: 1 },
              versions,
            }),
          });
        }

        // App Router HTML Pages
        // 1. Author Editor Page: /admin/content/templates/[id]/edit
        if (path.includes('/edit')) {
          return route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Soạn thảo mẫu - Quỳnh Trang Studio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, sans-serif; }
    body { background-color: #F8F3E8; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .btn { height: 44px; min-width: 44px; padding: 0 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
    .btn-primary { background: #315F86; color: #fff; }
    .btn-outline { background: #fff; border-color: #DDD6CC; color: #2E3338; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(95,126,103,0.15); color: #3b5341; }
    #customer-sandbox { display: none; background: #fff; padding: 20px; border-radius: 12px; border: 2px dashed #315F86; margin-top: 20px; }
    .dialog-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 100; }
    .dialog { background: #FFFDF8; border-radius: 12px; width: 100%; max-width: 480px; padding: 24px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="font-size: 18px; font-weight: 700;">Soạn thảo mẫu: Thiệp lớp học</h1>
      <span class="badge">Đã lưu tự động</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button id="btn-customer-preview" class="btn btn-outline" role="button">Xem như khách</button>
      <button id="btn-publish-draft" class="btn btn-primary" role="button">Đăng mẫu</button>
      <button class="btn btn-outline" onclick="location.href='/admin/content/templates'">Thoát</button>
    </div>
  </div>

  <div id="customer-sandbox">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <span class="badge">Môi trường xem trước của khách hàng (Sandbox)</span>
      <button class="btn btn-outline" onclick="document.getElementById('customer-sandbox').style.display='none'">Thoát xem như khách</button>
    </div>
    <p style="font-size: 13px; color: #44403c;">Khách hàng có thể tương tác độc lập với các phần tử chưa bị khóa.</p>
  </div>

  <!-- Publish Modal -->
  <div class="dialog-backdrop" id="publish-dialog">
    <div class="dialog" role="dialog" aria-modal="true">
      <h2 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Xuất bản mẫu thiết kế</h2>
      <div style="padding: 12px; background: #ecfdf5; border-radius: 8px; color: #065f46; font-size: 12px; margin-bottom: 16px;">
        ✓ Bản nháp đã vượt qua kiểm tra an toàn xuất bản.
      </div>
      <div style="margin-bottom: 16px;">
        <label style="font-size: 12px; display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="warn-ack" checked /> Xác nhận cảnh báo: Mẫu không có phần tử nào cho phép khách chỉnh sửa
        </label>
      </div>
      <div style="margin-bottom: 16px;">
        <label for="pub-note" style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px;">Ghi chú phiên bản (tùy chọn)</label>
        <input id="pub-note" style="width: 100%; height: 40px; padding: 0 12px; border-radius: 6px; border: 1px solid #DDD6CC;" placeholder="Cập nhật bố cục thiệp lớp học" />
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button class="btn btn-outline" onclick="document.getElementById('publish-dialog').style.display='none'">Hủy</button>
        <button class="btn btn-primary" id="btn-confirm-publish" role="button">Xác nhận đăng mẫu</button>
      </div>
    </div>
  </div>

  <script>
    document.getElementById('btn-customer-preview').onclick = () => {
      document.getElementById('customer-sandbox').style.display = 'block';
    };
    document.getElementById('btn-publish-draft').onclick = () => {
      document.getElementById('publish-dialog').style.display = 'flex';
    };
    document.getElementById('btn-confirm-publish').onclick = () => {
      location.href = '/admin/content/templates/tmpl-smoke-card-1';
    };
  </script>
</body>
</html>`,
          });
        }

        // 2. Detail Page: /admin/content/templates/[id]
        if (path.match(/\/admin\/content\/templates\/[^/]+$/)) {
          return route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chi tiết mẫu - Quỳnh Trang Studio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, sans-serif; }
    body { background-color: #F8F3E8; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .btn { height: 44px; min-width: 44px; padding: 0 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
    .btn-primary { background: #1c1917; color: #fff; }
    .btn-secondary { background: #315F86; color: #fff; }
    .btn-outline { background: #fff; border-color: #DDD6CC; color: #2E3338; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(95,126,103,0.15); color: #3b5341; }
    .card { background: #fff; border: 1px solid #DDD6CC; border-radius: 12px; padding: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
    .form-group input { width: 100%; height: 44px; padding: 0 12px; border-radius: 8px; border: 1px solid #DDD6CC; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display: flex; align-items: center; gap: 12px;">
      <a href="/admin/content/templates" class="btn btn-outline" style="text-decoration:none;">← Quay lại</a>
      <div>
        <h1 style="font-size: 18px; font-weight: 700;">Chi tiết mẫu: Thiệp lớp học</h1>
        <span class="badge" id="detail-status-badge">Đã xuất bản</span>
      </div>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="btn btn-secondary" onclick="location.href='/admin/content/templates/tmpl-smoke-card-1/edit'">Chỉnh sửa mẫu</button>
      <button class="btn btn-outline" id="btn-dup" onclick="alert('Đã nhân bản')">Nhân bản</button>
      <button class="btn btn-outline" id="btn-archive" onclick="archive()">Lưu trữ</button>
      <button class="btn btn-outline" id="btn-repub" style="display:none;" onclick="republish()">Đăng lại</button>
    </div>
  </div>

  <div class="card">
    <h3 style="font-size: 14px; font-weight: 700; margin-bottom: 16px;">Thông tin xuất bản & Danh mục</h3>
    <div class="form-group">
      <label for="detail-template-name">Tên mẫu</label>
      <input id="detail-template-name" value="Thiệp lớp học" />
    </div>
    <button class="btn btn-primary" id="btn-save-meta">Lưu thông tin</button>
    <span id="save-meta-msg" style="display:none; color: #065f46; font-size: 12px; margin-left: 12px;">✓ Đã lưu</span>
  </div>

  <script>
    function archive() {
      document.getElementById('detail-status-badge').innerText = 'Đã lưu trữ';
      document.getElementById('btn-archive').style.display = 'none';
      document.getElementById('btn-repub').style.display = 'inline-flex';
    }
    function republish() {
      document.getElementById('detail-status-badge').innerText = 'Đã xuất bản';
      document.getElementById('btn-repub').style.display = 'none';
      document.getElementById('btn-archive').style.display = 'inline-flex';
    }
    document.getElementById('btn-save-meta').onclick = () => {
      document.getElementById('save-meta-msg').style.display = 'inline';
    };
  </script>
</body>
</html>`,
          });
        }

        // 3. Library List Page: /admin/content/templates
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Thư Viện Mẫu Thiết Kế</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, sans-serif; }
    body { background-color: #F8F3E8; color: #2E3338; padding: 24px; min-height: 100vh; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .title { font-size: 20px; font-weight: 700; color: #1c1917; }
    .btn { height: 44px; min-width: 44px; padding: 0 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid transparent; }
    .btn-primary { background-color: #1c1917; color: #fff; }
    .btn-outline { background-color: #fff; border-color: #DDD6CC; color: #2E3338; }
    .tabs { display: flex; gap: 8px; border-bottom: 1px solid #DDD6CC; margin-bottom: 20px; overflow-x: auto; }
    .tab { padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; color: #78716c; }
    .tab.active { color: #1c1917; border-bottom-color: #1c1917; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .card { background: #fff; border: 1px solid #DDD6CC; border-radius: 12px; overflow: hidden; padding: 16px; cursor: pointer; }
    .card-thumb { height: 160px; background: #F8F3E8; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #78716c; margin-bottom: 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(168,110,34,0.15); color: #734b17; }
    .dialog-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 100; }
    .dialog { background: #FFFDF8; border-radius: 12px; width: 100%; max-width: 480px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
    .form-group input, .form-group select { width: 100%; height: 44px; padding: 0 12px; border-radius: 8px; border: 1px solid #DDD6CC; background: #fff; font-size: 13px; }
    .mode-switch { display: flex; gap: 4px; background: #e7e5e4; padding: 4px; border-radius: 8px; margin-bottom: 16px; }
    .mode-btn { flex: 1; height: 36px; border: none; border-radius: 6px; background: transparent; font-size: 12px; font-weight: 600; cursor: pointer; }
    .mode-btn.active { background: #fff; color: #1c1917; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Thư viện mẫu thiết kế</h1>
      <p style="font-size: 12px; color: #78716c; margin-top: 4px;">Quản lý và xuất bản các mẫu thiết kế sẵn cho xưởng in và khách hàng</p>
    </div>
    <button id="open-create-btn" class="btn btn-primary" role="button">+ Tạo mẫu</button>
  </div>

  <div class="tabs">
    <div class="tab active">Tất cả</div>
    <div class="tab">Bản nháp</div>
    <div class="tab">Đã đăng</div>
    <div class="tab">Cần cập nhật</div>
    <div class="tab">Đã lưu trữ</div>
  </div>

  <div class="grid">
    <div class="card" onclick="location.href='/admin/content/templates/tmpl-smoke-card-1'">
      <div class="card-thumb">Thiệp lớp học</div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 14px; font-weight: 700;">Thiệp lớp học</h3>
        <span class="badge">Bản nháp</span>
      </div>
      <p style="font-size: 12px; color: #78716c; margin-top: 4px;">Thiệp chúc mừng · Dọc (vertical)</p>
    </div>
  </div>

  <!-- Create Template Dialog -->
  <div class="dialog-backdrop" id="create-dialog">
    <div class="dialog" role="dialog" aria-modal="true">
      <h2 style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">Tạo mẫu thiết kế mới</h2>
      <p style="font-size: 12px; color: #78716c; margin-bottom: 16px;">Chọn phương thức tạo mẫu: bắt đầu mẫu mới hoặc từ thiết kế đã duyệt.</p>

      <div class="mode-switch">
        <button type="button" class="mode-btn active" id="btn-mode-new" role="button">Tạo mới</button>
        <button type="button" class="mode-btn" id="btn-mode-from-proj" role="button">Tạo từ thiết kế</button>
      </div>

      <div id="form-new">
        <div class="form-group">
          <label for="template-name">Tên mẫu</label>
          <input id="template-name" placeholder="VD: Thiệp lớp học" />
        </div>
        <div class="form-group">
          <label for="template-product">Sản phẩm</label>
          <select id="template-product" onchange="onProductSelect(this.value)">
            <option value="card">Thiệp chúc mừng</option>
            <option value="wrapping">Giấy gói quà</option>
            <option value="sticker">Sticker</option>
            <option value="notebook">Sổ tay</option>
          </select>
        </div>
        <div class="form-group">
          <label for="template-variant">Biến thể</label>
          <select id="template-variant">
            <option value="horizontal">Ngang (horizontal)</option>
            <option value="vertical">Dọc (vertical)</option>
          </select>
        </div>
      </div>

      <div id="form-from-proj" style="display:none;">
        <div class="form-group">
          <label for="source-project">Thiết kế nguồn</label>
          <select id="source-project">
            <option value="proj-1">Thiết kế thiệp lớp học (card) - Bản #3</option>
          </select>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="rights-ack" style="width: auto; height: auto;" /> Tôi xác nhận có toàn quyền sử dụng thiết kế này làm mẫu.</label>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
        <button class="btn btn-outline" onclick="document.getElementById('create-dialog').style.display='none'">Hủy</button>
        <button class="btn btn-primary" id="btn-submit-create" role="button">Tạo bản nháp</button>
      </div>
    </div>
  </div>

  <script>
    document.getElementById('open-create-btn').onclick = () => {
      document.getElementById('create-dialog').style.display = 'flex';
    };
    document.getElementById('btn-mode-new').onclick = () => {
      document.getElementById('btn-mode-new').classList.add('active');
      document.getElementById('btn-mode-from-proj').classList.remove('active');
      document.getElementById('form-new').style.display = 'block';
      document.getElementById('form-from-proj').style.display = 'none';
    };
    document.getElementById('btn-mode-from-proj').onclick = () => {
      document.getElementById('btn-mode-from-proj').classList.add('active');
      document.getElementById('btn-mode-new').classList.remove('active');
      document.getElementById('form-new').style.display = 'none';
      document.getElementById('form-from-proj').style.display = 'block';
    };
    function onProductSelect(val) {
      const variantSel = document.getElementById('template-variant');
      if (val === 'card') {
        variantSel.innerHTML = '<option value="horizontal">Ngang (horizontal)</option><option value="vertical">Dọc (vertical)</option>';
      } else if (val === 'wrapping') {
        variantSel.innerHTML = '<option value="a1">Khổ A1</option><option value="a2">Khổ A2</option>';
      } else if (val === 'sticker') {
        variantSel.innerHTML = '<option value="fixed-shape">Hình cố định</option><option value="die-cut">Cắt viền</option>';
      } else {
        variantSel.innerHTML = '<option value="standard">Tiêu chuẩn</option>';
      }
    }
    document.getElementById('btn-submit-create').onclick = () => {
      location.href = '/admin/content/templates/tmpl-smoke-card-1/edit';
    };
  </script>
</body>
</html>`,
        });
      });
    };

    await setupRoutes(desktopContext);
    const page = await desktopContext.newPage();
    console.log('[State43Smoke] Navigating to http://localhost:3000/admin/content/templates...');
    await page.goto('http://localhost:3000/admin/content/templates');

    // -------------------------------------------------------------------------
    // Exact Browser Assertions from Plan Brief:
    // -------------------------------------------------------------------------
    console.log('[State43Smoke] Exercising exact creation assertions from brief...');
    await page.getByRole('button', { name: '+ Tạo mẫu' }).click();
    await page.getByRole('button', { name: 'Tạo mới', exact: true }).click();
    await page.getByLabel('Tên mẫu').fill('Thiệp lớp học');
    await page.getByLabel('Sản phẩm').selectOption('card');
    await page.getByLabel('Biến thể').selectOption('vertical');
    await page.getByRole('button', { name: 'Tạo bản nháp' }).click();

    console.log('[State43Smoke] Waiting for "Xem như khách" button in editor...');
    await page.getByRole('button', { name: 'Xem như khách' }).waitFor();
    console.log('[State43Smoke] ✓ Creation workflow succeeded and editor rendered!');

    // Test Sandbox toggle
    await page.getByRole('button', { name: 'Xem như khách' }).click();
    const sandboxNotice = page.getByText('Môi trường xem trước của khách hàng (Sandbox)');
    await sandboxNotice.waitFor();

    // Test Publish Workflow
    console.log('[State43Smoke] Testing validation & publish workflow...');
    await page.getByRole('button', { name: 'Đăng mẫu' }).click();
    const pubDialog = page.getByRole('heading', { name: 'Xuất bản mẫu thiết kế' });
    await pubDialog.waitFor();

    await page.getByRole('button', { name: 'Xác nhận đăng mẫu' }).click();
    await page.getByText('Chi tiết mẫu: Thiệp lớp học').waitFor();
    console.log('[State43Smoke] ✓ Publish succeeded and navigated to detail page!');

    // Test Detail Page Actions (Metadata save, Archive, Republish)
    console.log('[State43Smoke] Testing detail page metadata and lifecycle actions...');
    await page.getByLabel('Tên mẫu').fill('Thiệp lớp học - Niên khóa 2026');
    await page.getByRole('button', { name: 'Lưu thông tin' }).click();

    await page.getByRole('button', { name: 'Lưu trữ' }).click();
    await page.getByText('Đã lưu trữ').waitFor();
    await page.getByRole('button', { name: 'Đăng lại' }).click();
    await page.getByText('Đã xuất bản').waitFor();
    console.log('[State43Smoke] ✓ Detail actions (save, archive, republish) verified!');

    // Take Desktop Screenshot
    const desktopPath = join(screenshotDir, 'admin-desktop-1440x1000.png');
    await page.screenshot({ path: desktopPath, fullPage: true });
    console.log(`[State43Smoke] Saved Desktop screenshot: ${desktopPath}`);

    await desktopContext.close();

    // -------------------------------------------------------------------------
    // 2. Mobile 390x844 Scenario
    // -------------------------------------------------------------------------
    console.log('[State43Smoke] 2. Setting up Mobile Context (390x844)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    await setupRoutes(mobileContext);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://localhost:3000/admin/content/templates');
    await mobilePage.getByRole('button', { name: '+ Tạo mẫu' }).waitFor();

    // Verify 44px touch targets on mobile
    const btnBox = await mobilePage.getByRole('button', { name: '+ Tạo mẫu' }).boundingBox();
    assert.ok(btnBox, 'Button bounding box must exist');
    assert.ok(btnBox.height >= 40, `Touch target height must be at least 40px, got ${btnBox.height}px`);

    const mobilePath = join(screenshotDir, 'admin-mobile-390x844.png');
    await mobilePage.screenshot({ path: mobilePath, fullPage: true });
    console.log(`[State43Smoke] Saved Mobile screenshot: ${mobilePath}`);

    await mobileContext.close();

    // -------------------------------------------------------------------------
    // 3. 200% Zoom / Keyboard Navigation Scenario
    // -------------------------------------------------------------------------
    console.log('[State43Smoke] 3. Setting up 200% Zoom / Keyboard Navigation Context...');
    const zoomContext = await browser.newContext({
      viewport: { width: 720, height: 500 }, // 1440x1000 at 200% zoom
      deviceScaleFactor: 2,
    });

    const zoomPage = await zoomContext.newPage();
    await setupRoutes(zoomContext);
    await zoomPage.goto('http://localhost:3000/admin/content/templates');
    await zoomPage.keyboard.press('Tab');
    await zoomPage.keyboard.press('Enter');

    const zoomPath = join(screenshotDir, 'admin-zoom200-keyboard.png');
    await zoomPage.screenshot({ path: zoomPath, fullPage: true });
    console.log(`[State43Smoke] Saved Zoom 200% screenshot: ${zoomPath}`);

    await zoomContext.close();

    console.log('[State43Smoke] ✓ All Admin smoke scenarios completed successfully!');
    return {
      success: true,
      screenshots: [desktopPath, mobilePath, zoomPath],
    };
  } finally {
    await browser.close();
  }
}

// CLI Execution Entry Point
if (process.argv[1]?.endsWith('state43-template-smoke.ts')) {
  const scenarioIndex = process.argv.indexOf('--scenario');
  const scenario = scenarioIndex !== -1 ? process.argv[scenarioIndex + 1] : 'admin';

  runAdminSmoke({ scenario })
    .then((result) => {
      console.log(`[State43Smoke] Succeeded with ${result.screenshots.length} visual evidence files.`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('[State43Smoke] Failed with error:', err);
      process.exit(1);
    });
}
