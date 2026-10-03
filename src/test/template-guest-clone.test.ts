import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesignState } from '../lib/product-state.ts';
import type {
  TemplateRecord,
  TemplateVersionPayload,
  TemplateAvailability,
  TemplateTarget,
  TemplateServiceError,
} from '../lib/domain/template.ts';
import type { TemplateRepository } from '../lib/repositories/template-repository.ts';
import {
  createGuestProjectFromTemplate,
  createUseReceipt,
  verifyUseReceipt,
  cloneTemplateIntoProject,
  resolveTemplateForUse,
} from '../lib/services/template-clone.ts';
import { GET as getTemplateRoute } from '../app/api/templates/[id]/route.ts';
import { POST as useTemplateRoute } from '../app/api/templates/[id]/use/route.ts';
import {
  getRecentProjects,
  saveRecentProject,
  pruneExpiredRecentProjects,
  type RecentProject,
  RECENT_PROJECT_RETENTION_MS,
} from '../lib/storage.ts';

const RECENT_PROJECTS_KEY = 'quynhtrang-recent-projects-v1';

function setupDummyLocalStorage() {
  const dummyStorage: Record<string, string> = {};
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => dummyStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        dummyStorage[key] = String(val);
      },
      removeItem: (key: string) => {
        delete dummyStorage[key];
      },
      clear: () => {
        Object.keys(dummyStorage).forEach((k) => delete dummyStorage[k]);
      },
      get length() {
        return Object.keys(dummyStorage).length;
      },
      key: (i: number) => Object.keys(dummyStorage)[i] ?? null,
    },
  });
  return dummyStorage;
}

function makeSamplePayload(): TemplateVersionPayload {
  const target: TemplateTarget = {
    productId: 'wrapping',
    variantId: 'default',
    mode: 'pattern',
    shape: null,
    geometryKey: 'wrapping:default:pattern',
    surfaces: [{ id: 'sheet', widthMm: 500, heightMm: 700 }],
  };

  const document: DesignState = {
    productId: 'wrapping',
    variantId: 'default',
    templateId: 'tpl-sample-01',
    text: 'Mẫu ban đầu',
    color: '#333333',
    backgroundColor: '#FAF7F2',
    image: null,
    quantity: 1,
    productOptions: { mode: 'pattern' },
    elements: [
      {
        id: 'el-heading',
        type: 'text',
        x: 10,
        y: 20,
        width: 100,
        height: 30,
        rotation: 0,
        locked: false,
        customerLocked: true,
        data: {
          text: 'Tiêu đề cố định',
        },
      },
      {
        id: 'el-body',
        type: 'text',
        x: 10,
        y: 60,
        width: 100,
        height: 20,
        rotation: 0,
        locked: false,
        customerLocked: false,
        data: {
          text: 'Nội dung tùy biến',
        },
      },
    ],
  };

  return {
    versionId: 'ver-uuid-1111',
    templateId: 'tpl-sample-01',
    version: 1,
    documentSchemaVersion: 1,
    document,
    target,
    dependencies: [],
  };
}

function createMockRepo(overrides: {
  template?: Partial<TemplateRecord> | null;
  version?: TemplateVersionPayload | null;
  availability?: TemplateAvailability;
  legacyMapping?: Record<string, { templateId: string; versionId: string }>;
} = {}) {
  const template: TemplateRecord | null =
    overrides.template === null
      ? null
      : {
        id: 'tpl-sample-01',
        name: 'Mẫu Giấy Gói Sinh Nhật',
        status: 'published',
        revision: 1,
        productId: 'wrapping',
        variantId: 'default',
        mode: 'pattern',
        shape: null,
        target: {
          productId: 'wrapping',
          variantId: 'default',
          mode: 'pattern',
          shape: null,
          geometryKey: 'wrapping:default:pattern',
          surfaces: [{ id: 'sheet', widthMm: 500, heightMm: 700 }],
        },
        categoryId: 'cat-1',
        tags: ['birthday'],
        sortOrder: 1,
        currentPublishedVersionId: 'ver-uuid-1111',
        everPublishedAt: '2026-10-01T00:00:00Z',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        archivedAt: null,
        ...overrides.template,
      };

  const version: TemplateVersionPayload | null =
    overrides.version === undefined ? makeSamplePayload() : overrides.version;

  const availability: TemplateAvailability = overrides.availability ?? {
    available: true,
    blockers: [],
  };

  return {
    async getTemplate(id: string) {
      if (template && template.id === id) return template;
      return null;
    },
    async getVersion(id: string) {
      if (version && version.versionId === id) return version;
      return null;
    },
    async getTemplateAvailability(id: string) {
      return availability;
    },
    async resolveLegacyTarget(legacyId: string, targetKey?: string) {
      if (overrides.legacyMapping && overrides.legacyMapping[legacyId]) {
        return overrides.legacyMapping[legacyId];
      }
      return null;
    },
  };
}

// 1. Exact brief regression: deep independence and customer lock preservation
test('createGuestProjectFromTemplate deep clone regression and lock preservation', () => {
  const payload = makeSamplePayload();
  const source = structuredClone(payload.document);
  const project = createGuestProjectFromTemplate(payload, randomUUID());
  project.document.elements![0].data!.text = 'Khách sửa';

  assert.deepEqual(payload.document, source);
  assert.equal(project.document.sourceTemplate?.templateVersionId, payload.versionId);
  assert.equal(project.document.elements![0].customerLocked, source.elements![0].customerLocked);
  assert.equal(project.document.elements![1].customerLocked, source.elements![1].customerLocked);
  assert.equal(project.document.templateId, payload.templateId);
  assert.equal(project.document.documentSchemaVersion, payload.documentSchemaVersion);
});

// 2. Double-tap request produces single stable local project ID
test('createGuestProjectFromTemplate double tap allocates same local ID once', () => {
  const payload = makeSamplePayload();
  const requestId = 'req-fixed-uuid-12345';
  const project1 = createGuestProjectFromTemplate(payload, requestId);
  const project2 = createGuestProjectFromTemplate(payload, requestId);

  assert.equal(project1.id, requestId);
  assert.equal(project2.id, requestId);
  assert.equal(project1.id, project2.id);
});

// 3. Use Receipt signing, verification, and tamper resistance
test('use receipt creates signed token and rejects tampered or expired receipts', () => {
  const customSecret = 'test-secret-salt-key';
  const receipt = createUseReceipt(
    {
      versionId: 'ver-uuid-1111',
      requestId: 'req-uuid-9999',
      exp: Date.now() + 10 * 60 * 1000,
    },
    customSecret,
  );

  const verified = verifyUseReceipt(receipt, customSecret);
  assert.ok(verified);
  assert.equal(verified?.versionId, 'ver-uuid-1111');
  assert.equal(verified?.requestId, 'req-uuid-9999');

  // Tampered payload
  const parts = receipt.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ versionId: 'ver-uuid-evil', requestId: 'req-uuid-9999', exp: Date.now() + 10000 }),
  ).toString('base64url');
  const tamperedReceipt = `${tamperedPayload}.${parts[1]}`;
  assert.equal(verifyUseReceipt(tamperedReceipt, customSecret), null);

  // Expired receipt
  const expiredReceipt = createUseReceipt(
    {
      versionId: 'ver-uuid-1111',
      requestId: 'req-uuid-9999',
      exp: Date.now() - 1000,
    },
    customSecret,
  );
  assert.equal(verifyUseReceipt(expiredReceipt, customSecret), null);
});

// 4. cloneTemplateIntoProject: guest clone success
test('cloneTemplateIntoProject returns guest payload and signed receipt for guests', async () => {
  const mockRepo = createMockRepo();
  const result = await cloneTemplateIntoProject(
    null,
    {
      templateId: 'tpl-sample-01',
      expectedVersionId: 'ver-uuid-1111',
      target: { productId: 'wrapping', variantId: 'default', mode: 'pattern', shape: null },
      requestId: 'req-clone-1',
    },
    { repo: mockRepo as unknown as TemplateRepository, secret: 'test-secret' },
  );

  assert.equal(result.kind, 'guest');
  if (result.kind === 'guest') {
    assert.equal(result.payload.versionId, 'ver-uuid-1111');
    assert.equal(result.payload.templateId, 'tpl-sample-01');
    const verified = verifyUseReceipt(result.useReceipt, 'test-secret');
    assert.ok(verified);
    assert.equal(verified?.versionId, 'ver-uuid-1111');
    assert.equal(verified?.requestId, 'req-clone-1');
  }
});

// 5. TEMPLATE_CHANGED on version drift
test('cloneTemplateIntoProject throws TEMPLATE_CHANGED when expectedVersionId drifts', async () => {
  const mockRepo = createMockRepo();

  await assert.rejects(
    async () => {
      await cloneTemplateIntoProject(
        null,
        {
          templateId: 'tpl-sample-01',
          expectedVersionId: 'ver-stale-old-0000',
          target: { productId: 'wrapping', variantId: 'default', mode: 'pattern', shape: null },
          requestId: 'req-drift-1',
        },
        { repo: mockRepo as unknown as TemplateRepository },
      );
    },
    (err: unknown) => {
      const serviceError = err as TemplateServiceError;
      assert.equal(serviceError.code, 'TEMPLATE_CHANGED');
      assert.equal(serviceError.status, 409);
      assert.ok(serviceError.message.includes('thay đổi'));
      return true;
    },
  );
});

// 6. TEMPLATE_UNAVAILABLE on archived template
test('cloneTemplateIntoProject throws TEMPLATE_UNAVAILABLE when template is archived', async () => {
  const mockRepo = createMockRepo({
    template: {
      status: 'archived',
      archivedAt: '2026-10-03T12:00:00Z',
    },
  });

  await assert.rejects(
    async () => {
      await cloneTemplateIntoProject(
        null,
        {
          templateId: 'tpl-sample-01',
          expectedVersionId: 'ver-uuid-1111',
          target: { productId: 'wrapping', variantId: 'default', mode: 'pattern', shape: null },
          requestId: 'req-archived-1',
        },
        { repo: mockRepo as unknown as TemplateRepository },
      );
    },
    (err: unknown) => {
      const serviceError = err as TemplateServiceError;
      assert.equal(serviceError.code, 'TEMPLATE_UNAVAILABLE');
      assert.equal(serviceError.status, 409);
      assert.equal(serviceError.message, 'Mẫu này hiện không còn khả dụng.');
      return true;
    },
  );
});

// 7. TEMPLATE_UNAVAILABLE on blocked dependencies
test('cloneTemplateIntoProject throws TEMPLATE_UNAVAILABLE when dependencies are blocked', async () => {
  const mockRepo = createMockRepo({
    availability: {
      available: false,
      blockers: [{ code: 'ARCHIVED_DEPENDENCY', kind: 'sticker', message: 'Sticker archived' }],
    },
  });

  await assert.rejects(
    async () => {
      await cloneTemplateIntoProject(
        null,
        {
          templateId: 'tpl-sample-01',
          expectedVersionId: 'ver-uuid-1111',
          target: { productId: 'wrapping', variantId: 'default', mode: 'pattern', shape: null },
          requestId: 'req-blocked-1',
        },
        { repo: mockRepo as unknown as TemplateRepository },
      );
    },
    (err: unknown) => {
      const serviceError = err as TemplateServiceError;
      assert.equal(serviceError.code, 'TEMPLATE_UNAVAILABLE');
      assert.equal(serviceError.status, 409);
      assert.equal(serviceError.message, 'Mẫu này hiện không còn khả dụng.');
      return true;
    },
  );
});

// 8. API Route POST /api/templates/[id]/use handling
test('API route /api/templates/[id]/use responds with 200 for guest clone and 409 on conflicts', async () => {
  const mockRepo = createMockRepo();

  // Successful clone
  const validReq = new Request('http://localhost:3000/api/templates/tpl-sample-01/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedVersionId: 'ver-uuid-1111',
      requestId: 'req-api-1',
      target: { productId: 'wrapping', variantId: 'default', mode: 'pattern', shape: null },
    }),
  });
  const resOk = await useTemplateRoute(
    validReq,
    { params: Promise.resolve({ id: 'tpl-sample-01' }) },
    { repo: mockRepo as unknown as TemplateRepository },
  );
  assert.equal(resOk.status, 200);
  const dataOk = (await resOk.json()) as { kind: string; payload: TemplateVersionPayload; useReceipt: string };
  assert.equal(dataOk.kind, 'guest');
  assert.equal(dataOk.payload.versionId, 'ver-uuid-1111');
  assert.ok(dataOk.useReceipt);

  // Version drift: 409 TEMPLATE_CHANGED
  const driftReq = new Request('http://localhost:3000/api/templates/tpl-sample-01/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedVersionId: 'ver-stale-0000',
      requestId: 'req-api-drift',
    }),
  });
  const resDrift = await useTemplateRoute(
    driftReq,
    { params: Promise.resolve({ id: 'tpl-sample-01' }) },
    { repo: mockRepo as unknown as TemplateRepository },
  );
  assert.equal(resDrift.status, 409);
  const dataDrift = (await resDrift.json()) as { code: string; message: string };
  assert.equal(dataDrift.code, 'TEMPLATE_CHANGED');

  // Archived template: 409 TEMPLATE_UNAVAILABLE
  const archivedRepo = createMockRepo({
    template: { status: 'archived', archivedAt: '2026-10-02T00:00:00Z' },
  });
  const archReq = new Request('http://localhost:3000/api/templates/tpl-sample-01/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedVersionId: 'ver-uuid-1111',
      requestId: 'req-api-arch',
    }),
  });
  const resArch = await useTemplateRoute(
    archReq,
    { params: Promise.resolve({ id: 'tpl-sample-01' }) },
    { repo: archivedRepo as unknown as TemplateRepository },
  );
  assert.equal(resArch.status, 409);
  const dataArch = (await resArch.json()) as { code: string; message: string };
  assert.equal(dataArch.code, 'TEMPLATE_UNAVAILABLE');
  assert.equal(dataArch.message, 'Mẫu này hiện không còn khả dụng.');
});

// 9. Deep independence: local project reopen never queries template and retains customer edits
test('reopened guest project retains customer edits and provenance without template queries', () => {
  setupDummyLocalStorage();
  const payload = makeSamplePayload();
  const guestProject = createGuestProjectFromTemplate(payload, 'guest-initial-proj-uuid');

  // Initial save of guest project
  saveRecentProject(guestProject.document, guestProject.id);

  // Customer edits the project
  const editedDocument: DesignState = {
    ...guestProject.document,
    text: 'Sinh nhật Mai - Khách tự sửa',
    elements: guestProject.document.elements?.map((el) => {
      if (el.id === 'el-body') {
        return {
          ...el,
          data: {
            ...el.data,
            text: 'Chúc mừng sinh nhật Mai 2026!',
          },
        };
      }
      return el;
    }),
  };

  // Autosave update with same stable ID
  saveRecentProject(editedDocument, guestProject.id);

  // Simulate subsequent server-side template lifecycle change (e.g. template archived, v2 published)
  // When user reloads the page or resumes project from local storage:
  const loadedList = getRecentProjects();
  assert.equal(loadedList.length, 1);
  const loadedProject = loadedList[0];

  assert.equal(loadedProject.id, 'guest-initial-proj-uuid');
  assert.equal(loadedProject.text, 'Sinh nhật Mai - Khách tự sửa');
  assert.equal(loadedProject.sourceTemplate?.templateId, 'tpl-sample-01');
  assert.equal(loadedProject.sourceTemplate?.templateVersionId, 'ver-uuid-1111');

  // Customer edits remain intact
  const bodyElement = loadedProject.elements?.find((el) => el.id === 'el-body');
  assert.equal(bodyElement?.data?.text, 'Chúc mừng sinh nhật Mai 2026!');
  const lockedElement = loadedProject.elements?.find((el) => el.id === 'el-heading');
  assert.equal(lockedElement?.customerLocked, true);
});

// 10. Storage non-overwrite and 3-project / 30-day retention
test('saving new clone with explicitId does not overwrite preexisting project and enforces 3-project quota', () => {
  setupDummyLocalStorage();
  const payload = makeSamplePayload();

  // Existing project for same product 'wrapping'
  const existingDesign: DesignState = {
    productId: 'wrapping',
    variantId: 'default',
    templateId: null,
    text: 'Dự án gói quà 1',
    color: '#000000',
    backgroundColor: '#ffffff',
    image: null,
    quantity: 1,
    productOptions: {},
  };
  saveRecentProject(existingDesign, 'proj-user-original');

  // Clone template into a NEW guest project for 'wrapping'
  const newClone = createGuestProjectFromTemplate(payload, 'proj-guest-clone-new');
  saveRecentProject(newClone.document, newClone.id);

  // Both projects must coexist (no silent overwrite of older project)
  const listAfterClone = getRecentProjects();
  assert.equal(listAfterClone.length, 2);
  const ids = listAfterClone.map((p) => p.id);
  assert.ok(ids.includes('proj-user-original'));
  assert.ok(ids.includes('proj-guest-clone-new'));

  // Adding two more projects enforces max 3
  const p3 = createGuestProjectFromTemplate(payload, 'proj-3');
  const p4 = createGuestProjectFromTemplate(payload, 'proj-4');
  saveRecentProject(p3.document, p3.id);
  saveRecentProject(p4.document, p4.id);

  const cappedList = getRecentProjects();
  assert.equal(cappedList.length, 3);
  assert.equal(cappedList[0].id, 'proj-4');
  assert.equal(cappedList[1].id, 'proj-3');
  assert.equal(cappedList[2].id, 'proj-guest-clone-new');
  // Oldest project 'proj-user-original' pushed out by max-3 quota
  assert.ok(!cappedList.map((p) => p.id).includes('proj-user-original'));
});

// 11. Legacy template ID resolution via GET, POST /use, and cloneTemplateIntoProject
test('legacy template ID resolves to successor template across GET, POST /use, and cloneTemplateIntoProject', async () => {
  const legacyId = 'legacy-wrapping-classic';
  const successorId = 'tpl-sample-01';
  const successorVersionId = 'ver-uuid-1111';

  const mockRepo = createMockRepo({
    legacyMapping: {
      [legacyId]: {
        templateId: successorId,
        versionId: successorVersionId,
      },
    },
  });

  // 1. GET /api/templates/[id] with legacy ID
  const getReq = new Request(`http://localhost:3000/api/templates/${legacyId}`);
  const getRes = await getTemplateRoute(
    getReq,
    { params: Promise.resolve({ id: legacyId }) },
    { repo: mockRepo as unknown as TemplateRepository },
  );
  assert.equal(getRes.status, 200);
  const getData = (await getRes.json()) as { template: TemplateRecord; currentVersion: TemplateVersionPayload };
  assert.equal(getData.template.id, successorId);
  assert.equal(getData.currentVersion.versionId, successorVersionId);

  // 2. POST /api/templates/[id]/use with legacy ID
  const useReq = new Request(`http://localhost:3000/api/templates/${legacyId}/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedVersionId: successorVersionId,
      target: { productId: 'wrapping', variantId: 'default', mode: 'pattern', shape: null },
      requestId: 'req-legacy-clone-1',
    }),
  });
  const useRes = await useTemplateRoute(
    useReq,
    { params: Promise.resolve({ id: legacyId }) },
    { repo: mockRepo as unknown as TemplateRepository },
  );
  assert.equal(useRes.status, 200);
  const useData = (await useRes.json()) as { kind: string; payload: TemplateVersionPayload; useReceipt: string };
  assert.equal(useData.kind, 'guest');
  assert.equal(useData.payload.templateId, successorId);
  assert.equal(useData.payload.versionId, successorVersionId);
  assert.ok(useData.useReceipt);

  const verified = verifyUseReceipt(useData.useReceipt);
  assert.ok(verified);
  assert.equal(verified?.versionId, successorVersionId);
  assert.equal(verified?.requestId, 'req-legacy-clone-1');

  // 3. cloneTemplateIntoProject direct call with legacy ID
  const cloneResult = await cloneTemplateIntoProject(
    null,
    {
      templateId: legacyId,
      expectedVersionId: successorVersionId,
      target: { productId: 'wrapping', variantId: 'default', mode: 'pattern', shape: null },
      requestId: 'req-legacy-clone-direct',
    },
    { repo: mockRepo as unknown as TemplateRepository },
  );
  assert.equal(cloneResult.kind, 'guest');
  if (cloneResult.kind === 'guest') {
    assert.equal(cloneResult.payload.templateId, successorId);
    assert.equal(cloneResult.payload.versionId, successorVersionId);
    assert.ok(cloneResult.useReceipt);
  }
});

// 12. CustomizerShell URL template entry source contract and hydration flow
test('CustomizerShell source wires URL template entry to call /use endpoint and process use receipt', () => {
  const shellPath = resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx');
  const source = readFileSync(shellPath, 'utf8');

  // Verify fetch to /api/templates/${encodeURIComponent(requestedTemplate)}
  assert.match(
    source,
    /fetch\(`\/api\/templates\/\$\{encodeURIComponent\(requestedTemplate\)\}`\)/,
    'CustomizerShell must fetch template metadata for requestedTemplate',
  );

  // Verify fetch to /api/templates/${encodeURIComponent(requestedTemplate)}/use
  assert.match(
    source,
    /fetch\(`\/api\/templates\/\$\{encodeURIComponent\(requestedTemplate\)\}\/use`,\s*\{\s*method:\s*['"]POST['"]/,
    'CustomizerShell must call POST /api/templates/.../use endpoint',
  );

  // Verify passing expectedVersionId, target, requestId
  assert.match(
    source,
    /expectedVersionId,\s*target,\s*requestId:/,
    'CustomizerShell must send expectedVersionId, target, and requestId to /use endpoint',
  );

  // Verify creating guest project with payload from /use response
  assert.match(
    source,
    /createGuestProjectFromTemplate\(useData\.payload,\s*reqId\)/,
    'CustomizerShell must construct guest project using /use payload and request ID',
  );

  // Verify failure path sets view to template-browser and displays toast
  assert.match(
    source,
    /setView\('template-browser'\);\s*showToast\('Mẫu này hiện không còn khả dụng\.'\);/,
    'CustomizerShell must show toast and fall back to template-browser on failure',
  );
});

test('URL template entry hydration end-to-end workflow invokes /use and retains guest project', async () => {
  setupDummyLocalStorage();
  const samplePayload = makeSamplePayload();

  const originalFetch = globalThis.fetch;
  const calls: { url: string; method?: string; body?: { expectedVersionId?: string } }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url: urlStr, method: init?.method, body: init?.body ? JSON.parse(init.body as string) : undefined });

    if (urlStr === '/api/templates/tpl-sample-01') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          template: { id: 'tpl-sample-01', currentPublishedVersionId: 'ver-uuid-1111' },
          currentVersion: samplePayload,
        }),
      } as unknown as Response;
    }

    if (urlStr === '/api/templates/tpl-sample-01/use' && init?.method === 'POST') {
      const receipt = createUseReceipt({
        versionId: 'ver-uuid-1111',
        requestId: 'req-sim-123',
        exp: Date.now() + 60000,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          kind: 'guest',
          payload: samplePayload,
          useReceipt: receipt,
        }),
      } as unknown as Response;
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ code: 'NOT_FOUND' }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const requestedTemplate = 'tpl-sample-01';
    const detailRes = await fetch(`/api/templates/${encodeURIComponent(requestedTemplate)}`);
    assert.ok(detailRes.ok);
    const detailData = await detailRes.json();
    const expectedVersionId = detailData.template?.currentPublishedVersionId || detailData.currentVersion?.versionId;
    assert.equal(expectedVersionId, 'ver-uuid-1111');

    const reqId = 'req-sim-123';
    const useRes = await fetch(`/api/templates/${encodeURIComponent(requestedTemplate)}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersionId,
        target: { productId: 'wrapping', variantId: 'default', mode: 'pattern', shape: null },
        requestId: reqId,
      }),
    });
    assert.ok(useRes.ok);
    const useData = await useRes.json();
    assert.equal(useData.kind, 'guest');
    assert.ok(useData.useReceipt);

    const project = createGuestProjectFromTemplate(useData.payload, reqId);
    saveRecentProject(project.document, project.id);

    const recents = getRecentProjects();
    assert.equal(recents.length, 1);
    assert.equal(recents[0].id, reqId);
    assert.equal(recents[0].sourceTemplate?.templateId, 'tpl-sample-01');
    assert.equal(recents[0].sourceTemplate?.templateVersionId, 'ver-uuid-1111');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, '/api/templates/tpl-sample-01');
    assert.equal(calls[1].url, '/api/templates/tpl-sample-01/use');
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[1].body?.expectedVersionId, 'ver-uuid-1111');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
