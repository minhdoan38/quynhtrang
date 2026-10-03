import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Route } from 'playwright';

interface SmokeOptions {
  scenario?: string;
  baseUrl?: string;
  screenshotDir?: string;
}
function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}


async function checkServerRunning(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl);
    return res.status < 500;
  } catch {
    return false;
  }
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

  // 1. Ensure Next.js dev server is running on port 3000
  let serverProc: ChildProcess | null = null;
  const baseUrl = options.baseUrl ?? 'http://localhost:3000';
  const isAlreadyRunning = await checkServerRunning(baseUrl);

  if (!isAlreadyRunning) {
    console.log(`[State43Smoke] No running server detected at ${baseUrl}. Starting Next.js dev server...`);
    serverProc = spawn('cmd.exe', ['/c', 'npx', 'next', 'dev', '-p', '3000'], {
      env: { ...process.env, PORT: '3000', SMOKE_TEST_STAFF_ROLE: 'admin' },
      stdio: 'ignore',
    });

    let ready = false;
    for (let i = 0; i < 40; i++) {
      await delay(500);
      if (await checkServerRunning(baseUrl)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      throw new Error(`Next.js server failed to respond on ${baseUrl} within 20s`);
    }
    console.log(`[State43Smoke] Next.js dev server ready at ${baseUrl}`);
  } else {
    console.log(`[State43Smoke] Connected to existing server at ${baseUrl}`);
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
    await desktopContext.addCookies([
      { name: 'smoke_staff_role', value: 'admin', url: 'http://localhost:3000' },
    ]);

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

    // Reusable API route handler for application data without mocking HTML documents
    const setupRoutes = async (ctx: BrowserContext) => {
      await ctx.route('http://localhost:3000/api/**', async (route: Route) => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        const method = route.request().method();

        // 1. Categories
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

        // 2. Templates list
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

        // 3. Create template
        if (path === '/api/admin/content/templates' && method === 'POST') {
          const body = route.request().postDataJSON() || {};
          currentTemplate = {
            ...currentTemplate,
            id: `tmpl-${Date.now()}`,
            name: body.name || 'Thiệp lớp học',
            productId: body.target?.productId || 'card',
            variantId: body.target?.variantId || 'vertical',
            mode: body.target?.mode || null,
            shape: body.target?.shape || null,
            categoryId: body.categoryId || 'all',
            tags: body.tags || ['lop-hoc', 'thiep'],
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
                designDocument: {
                  productId: currentTemplate.productId,
                  variantId: currentTemplate.variantId,
                  text: currentTemplate.name,
                  color: '#2E3338',
                  backgroundColor: '#FFFDF8',
                  productOptions: { surface: 'front', fold: 'half' },
                  elements: [],
                },
              },
            }),
          });
        }

        // 4. Sources
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

        // 5. Draft lease
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
        // Draft heartbeat
        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/draft/heartbeat')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              expiresAt: new Date(Date.now() + 60000).toISOString(),
            }),
          });
        }

        // Draft GET and POST save
        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/draft')) {
          if (method === 'POST') {
            const body = route.request().postDataJSON() || {};
            const rev = Number(body.expectedRevision || 1) + 1;
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                ok: true,
                value: {
                  revision: rev,
                  currentRevision: rev,
                  status: 'saved',
                },
                draftRevision: rev,
              }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              draft: {
                id: 'draft-smoke-1',
                templateId: currentTemplate.id,
                draftRevision: 1,
                leaseEpoch: 1,
                designDocument: {
                  productId: currentTemplate.productId,
                  variantId: currentTemplate.variantId,
                  text: currentTemplate.name,
                  color: '#2E3338',
                  backgroundColor: '#FFFDF8',
                  productOptions: { surface: 'front', fold: 'half' },
                  elements: [],
                },
              },
            }),
          });
        }

        // 6. Validate
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
                findings: [
                  {
                    code: 'template-no-editable-elements',
                    message: 'Mẫu không có phần tử nào cho phép khách chỉnh sửa',
                    surfaceId: 'front',
                  },
                ],
                warningIds: ['template-no-editable-elements'],
                customerPreviewPassed: true,
                engineFingerprint: 'chromium-smoke',
                thumbnail: { assetId: 'thumb-1', sha256: 'sha-1' },
                expiresAt: new Date(Date.now() + 600000).toISOString(),
              },
            }),
          });
        }

        // 7. Publish
        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/publish')) {
          const body = route.request().postDataJSON() || {};
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

        // 8. Archive
        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/archive')) {
          currentTemplate = { ...currentTemplate, status: 'archived' };
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, template: currentTemplate }),
          });
        }

        // 9. Republish
        if (path.startsWith('/api/admin/content/templates/') && path.endsWith('/republish')) {
          currentTemplate = { ...currentTemplate, status: 'published' };
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, template: currentTemplate }),
          });
        }

        // 10. Duplicate
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

        // 11. Detail / PATCH / DELETE
        if (path.match(/\/api\/admin\/content\/templates\/[^/]+$/)) {
          if (method === 'PATCH') {
            const body = route.request().postDataJSON() || {};
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
              draft: {
                id: 'draft-smoke-1',
                draftRevision: 1,
                designDocument: {
                  productId: currentTemplate.productId,
                  variantId: currentTemplate.variantId,
                  text: currentTemplate.name,
                  color: '#2E3338',
                  backgroundColor: '#FFFDF8',
                  productOptions: { surface: 'front', fold: 'half' },
                  elements: [],
                },
              },
              versions,
            }),
          });
        }

        return route.continue();
      });
    };

    await setupRoutes(desktopContext);
    const page = await desktopContext.newPage();
    page.on('console', msg => console.log('[BrowserConsole]', msg.text()));
    page.on('pageerror', err => console.error('[BrowserPageError]', err.message));
    console.log('[State43Smoke] Navigating to http://localhost:3000/admin/content/templates...');
    await page.goto('http://localhost:3000/admin/content/templates');
    console.log('[State43Smoke] Current page URL:', page.url());
    // -------------------------------------------------------------------------
    // Exact Browser Assertions on real Next.js application pages:
    // -------------------------------------------------------------------------
    console.log('[State43Smoke] Exercising creation workflow on real application page...');
    const createBtn = page.getByRole('button', { name: '+ Tạo mẫu' });
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.click();

    await page.getByRole('button', { name: 'Tạo mới', exact: true }).click();
    await page.getByLabel('Tên mẫu', { exact: true }).fill('Thiệp lớp học');
    await page.getByLabel('Sản phẩm', { exact: true }).selectOption('card');
    await page.getByLabel('Biến thể', { exact: true }).selectOption('vertical');
    await page.getByRole('button', { name: 'Tạo bản nháp' }).click();

    // Editor: TemplateAuthorControls
    console.log('[State43Smoke] Waiting for editor and "Xem như khách" button...');
    const previewBtn = page.getByRole('button', { name: 'Xem như khách' });
    await previewBtn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('[State43Smoke] ✓ Creation workflow succeeded and real editor rendered!');

    // Test Sandbox toggle
    await previewBtn.click();
    const sandboxBanner = page.getByText('Chế độ xem như khách — Dùng thử tự do');
    await sandboxBanner.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[State43Smoke] ✓ Customer Preview sandbox opened!');
    await page.getByRole('button', { name: 'Đóng chế độ xem như khách' }).click();

    // Test Publish Workflow
    console.log('[State43Smoke] Testing validation & publish workflow...');
    await page.getByRole('button', { name: 'Đăng mẫu' }).click();
    const pubDialogHeading = page.getByRole('heading', { name: 'Xuất bản mẫu thiết kế' });
    await pubDialogHeading.waitFor({ state: 'visible', timeout: 10000 });

    // Acknowledge warning checkbox if visible
    const warnCheckbox = page.getByRole('checkbox');
    if (await warnCheckbox.isVisible()) {
      await warnCheckbox.check();
    }

    // Confirm publish
    await page.getByRole('button', { name: 'Xác nhận đăng mẫu' }).click();

    // Navigated to detail page:
    console.log('[State43Smoke] Waiting for detail page...');
    await page.waitForURL(/\/admin\/content\/templates\/[^/]+$/, { timeout: 15000 });
    await page.getByRole('heading', { name: 'Thiệp lớp học' }).waitFor({ state: 'visible', timeout: 10000 });
    console.log('[State43Smoke] ✓ Publish succeeded and real detail page loaded!');

    // Test Detail Page Actions: Metadata save, Archive, Republish
    console.log('[State43Smoke] Testing detail page metadata and lifecycle actions...');
    await page.getByLabel('Tên mẫu', { exact: true }).fill('Thiệp lớp học - Niên khóa 2026');
    await page.getByRole('button', { name: 'Lưu thông tin' }).click();

    // Archive
    await page.getByRole('button', { name: 'Lưu trữ' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận lưu trữ' }).click();
    await page.getByText('Đã lưu trữ').first().waitFor({ state: 'visible', timeout: 10000 });

    // Republish
    await page.getByRole('button', { name: 'Đăng lại' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Đăng lại' }).click();
    await page.getByText('Đã xuất bản').first().waitFor({ state: 'visible', timeout: 10000 });
    console.log('[State43Smoke] ✓ Detail actions (save, archive, republish) verified on real page!');

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
    await mobileContext.addCookies([
      { name: 'smoke_staff_role', value: 'admin', url: 'http://localhost:3000' },
    ]);

    await setupRoutes(mobileContext);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto('http://localhost:3000/admin/content/templates');
    const mobileCreateBtn = mobilePage.getByRole('button', { name: '+ Tạo mẫu' });
    await mobileCreateBtn.waitFor({ state: 'visible', timeout: 15000 });

    // Verify 44px touch targets on mobile
    const btnBox = await mobileCreateBtn.boundingBox();
    assert.ok(btnBox, 'Button bounding box must exist');
    assert.ok(btnBox.height >= 44, `Touch target height must be at least 44px, got ${btnBox.height}px`);

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
    await zoomContext.addCookies([
      { name: 'smoke_staff_role', value: 'admin', url: 'http://localhost:3000' },
    ]);

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
    if (serverProc && typeof serverProc.pid === 'number') {
      const pid = serverProc.pid;
      console.log('[State43Smoke] Terminating spawned Next.js server...');
      const { promise, resolve } = Promise.withResolvers<void>();
      const killer = spawn('taskkill', ['/pid', pid.toString(), '/f', '/t']);
      killer.on('close', () => resolve());
      await promise;
      await delay(1000);
    }
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
