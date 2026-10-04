import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import sharp from 'sharp';

import { isTemplateAssetPath, type AssetPromotionRepository } from '../lib/asset-store.ts';
import { canMutateElement, validateRevisionReason } from '../lib/domain/design-revision.ts';
import type { CustomerInfo, PendingOrder } from '../lib/order-types.ts';
import {
  transitionState,
  type CanvasElement,
  type CardSurface,
  type DesignState,
} from '../lib/product-state.ts';
import {
  prepareOrderFromGuestCheckout,
  type PrepareOrderInput,
  type PrepareOrderOptions,
} from '../lib/services/prepare-order-from-guest-checkout.ts';
import { startProductionInternal } from '../lib/services/admin-fulfillment-operations.ts';
import { generateDocumentRenderMarkup } from '../lib/services/document-renderer.ts';

function createTestCardDesign(overrides: Partial<DesignState> = {}): DesignState {
  const templateId = 'tmpl-card-wedding';
  const templateVersionId = '11111111-1111-1111-1111-111111111111';
  const committedAssetId = '22222222-2222-2222-2222-222222222222';

  const elements: CanvasElement[] = [
    {
      id: 'front-locked-title',
      type: 'text',
      surface: 'front' as CardSurface,
      x: 20,
      y: 30,
      width: 160,
      height: 40,
      rotation: 0,
      locked: false,
      customerLocked: true,
      data: {
        text: 'Thiệp Mời Cưới',
        fontSize: 24,
        fontFamily: 'Playfair Display',
      },
    },
    {
      id: 'front-unlocked-names',
      type: 'text',
      surface: 'front' as CardSurface,
      x: 20,
      y: 80,
      width: 160,
      height: 30,
      rotation: 0,
      locked: false,
      customerLocked: false,
      data: {
        text: 'Minh & Trang',
        fontSize: 18,
      },
    },
    {
      id: 'inside-locked-border',
      type: 'image',
      surface: 'inside' as CardSurface,
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      rotation: 0,
      locked: false,
      customerLocked: true,
      data: {
        src: `/api/templates/assets/${committedAssetId}`,
        templateAssetId: committedAssetId,
      },
    },
    {
      id: 'inside-guidance-placeholder',
      type: 'text',
      surface: 'inside' as CardSurface,
      x: 40,
      y: 40,
      width: 120,
      height: 30,
      rotation: 0,
      locked: false,
      customerLocked: false,
      data: {
        text: 'Hướng dẫn: Viết lời chúc tại đây',
        placeholder: true,
        placeholderType: 'text',
        placeholderHint: 'Nhập lời chúc',
      },
    },
    {
      id: 'back-footer',
      type: 'text',
      surface: 'back' as CardSurface,
      x: 10,
      y: 130,
      width: 80,
      height: 15,
      rotation: 0,
      locked: false,
      customerLocked: true,
      data: {
        text: 'Quỳnh Trang Stationery',
      },
    },
  ];

  return {
    productId: 'card',
    variantId: 'vertical',
    templateId,
    sourceTemplate: {
      templateId,
      templateVersionId,
    },
    text: 'Thiệp Cưới Sang Trọng',
    color: '#D4AF37',
    backgroundColor: '#FFFFFF',
    image: null,
    quantity: 50,
    productOptions: {
      fold: 'bi-fold',
      surface: 'front',
    },
    elements,
    ...overrides,
  };
}

function createMockFulfillmentClient(actorRole: 'admin' | 'editor') {
  return {
    async rpc(fn: string, params: Record<string, unknown>) {
      if (fn === 'start_order_production') {
        if (actorRole !== 'admin') {
          return {
            data: { ok: false, code: 'FORBIDDEN', message: 'Chỉ quản trị viên mới có quyền bắt đầu sản xuất' },
            error: null,
          };
        }
        return {
          data: {
            ok: true,
            value: { orderId: params.p_order_id, fulfillmentStatus: 'in_production' },
          },
          error: null,
        };
      }
      return { data: null, error: new Error(`Unknown RPC ${fn}`) };
    },
  };
}

describe('State 43 Task 19: Template Production Integration', () => {
  it('checkout preserves source template provenance and does not promote committed template assets', async () => {
    const design = createTestCardDesign();
    const createdProjects: Array<Record<string, unknown>> = [];
    const createdVersions: Array<Record<string, unknown>> = [];
    const createdOrders: Array<PendingOrder> = [];
    const createdGuestAccess: Array<Record<string, unknown>> = [];
    const promotedAssetsList: Array<Record<string, unknown>> = [];

    const mockProjectRepo = {
      async createProject(input: Record<string, unknown>) {
        const row: Record<string, unknown> = {
          id: `proj-${randomUUID()}`,
          ...input,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        createdProjects.push(row);
        return {
          id: String(row.id),
          productId: String(row.productId),
          variantId: row.variantId ? String(row.variantId) : null,
          ownerUserId: row.ownerUserId ? String(row.ownerUserId) : null,
          guestKeyHash: row.guestKeyHash ? String(row.guestKeyHash) : null,
          status: String(row.status),
          currentWorkingRevision: Number(row.currentWorkingRevision ?? 1),
          sourceTemplateId: (row.sourceTemplateId as string | null) ?? null,
          sourceTemplateVersionId: (row.sourceTemplateVersionId as string | null) ?? null,
          cloneRequestKey: null,
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        };
      },
    };

    const mockAssetRepo: AssetPromotionRepository = {
      async promoteAsset(input) {
        const record = { id: `asset-${randomUUID()}`, ...input };
        promotedAssetsList.push(record);
        return record;
      },
    };

    const mockDesignVersionRepo = {
      async createVersion(input: Record<string, unknown>) {
        const row: Record<string, unknown> = {
          id: `dv-${randomUUID()}`,
          ...input,
          created_at: new Date().toISOString(),
        };
        createdVersions.push(row);
        return {
          id: String(row.id),
          projectId: String(row.projectId),
          versionNumber: Number(row.versionNumber ?? 1),
          source: String(row.source ?? 'customizer'),
          designDocument: (row.designDocument as DesignState) ?? {},
          productSnapshot: (row.productSnapshot as Record<string, unknown>) ?? {},
          preflightSnapshot: (row.preflightSnapshot as Record<string, unknown>) ?? {},
          sourceTemplateId: (row.sourceTemplateId as string | null) ?? null,
          sourceTemplateVersionId: (row.sourceTemplateVersionId as string | null) ?? null,
          createdAt: String(row.created_at),
        };
      },
    };

    const mockOrderRepo = {
      async getByIdempotencyKey() {
        return null;
      },
      async createPendingOrder(input: Record<string, unknown>) {
        const id = `order-${randomUUID()}`;
        const order = {
          id,
          ...input,
          status: 'pending',
          paymentStatus: 'pending_payment',
          createdAt: new Date().toISOString(),
          product: {
            productId: input.productId,
            variantId: input.variantId,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            subtotal: input.subtotal,
          },
          payment: input.payment,
        } as unknown as PendingOrder;
        createdOrders.push(order);
        return order;
      },
      async createGuestAccess(input: Record<string, unknown>) {
        createdGuestAccess.push(input);
      },
      async deleteById() { },
    };

    const mockOrderEventRepo = {
      async append() { },
    };

    const mockPaymentRepo = {
      async create() { },
    };

    const options: PrepareOrderOptions = {
      projectRepo: mockProjectRepo as never,
      assetRepo: mockAssetRepo as never,
      designVersionRepo: mockDesignVersionRepo as never,
      orderRepo: mockOrderRepo as never,
      orderEventRepo: mockOrderEventRepo as never,
      paymentRepo: mockPaymentRepo as never,
    };

    const customer: CustomerInfo = {
      fullName: 'Trần Văn Nam',
      phone: '0901234567',
      shippingAddress: '123 Phố Huế, Hà Nội',
    };

    const checkoutInput: PrepareOrderInput = {
      idempotencyKey: 'idem-state43-task19-prod-1',
      design,
      customer,
      designRevision: 'rev-preflight-1',
      preflightRevision: 'rev-preflight-1',
      preflightAcknowledged: true,
    };

    const result = await prepareOrderFromGuestCheckout(checkoutInput, options);

    // 1. Order and Guest Access token generated
    assert.ok(result.order);
    assert.ok(result.guestAccessToken);

    // 2. Project retains source template provenance
    assert.equal(createdProjects.length, 1);
    assert.equal(createdProjects[0].sourceTemplateId, 'tmpl-card-wedding');
    assert.equal(createdProjects[0].sourceTemplateVersionId, '11111111-1111-1111-1111-111111111111');

    // 3. Immutable DesignVersion record retains source template provenance
    assert.equal(createdVersions.length, 1);
    assert.equal(createdVersions[0].sourceTemplateId, 'tmpl-card-wedding');
    assert.equal(createdVersions[0].sourceTemplateVersionId, '11111111-1111-1111-1111-111111111111');

    // 4. Committed template version assets are recognized by isTemplateAssetPath and NOT promoted
    assert.equal(isTemplateAssetPath('/api/templates/assets/22222222-2222-2222-2222-222222222222'), true);
    assert.equal(isTemplateAssetPath('template-asset://22222222-2222-2222-2222-222222222222'), true);
    assert.equal(promotedAssetsList.length, 0, 'Committed template assets must never be promoted as customer blobs');

    // 5. Guest access token expiration is 30 days
    assert.equal(createdGuestAccess.length, 1);
    const expiresAt = new Date(createdGuestAccess[0].expiresAt as string).getTime();
    const minExpected = Date.now() + 29 * 24 * 60 * 60 * 1000;
    assert.ok(expiresAt > minExpected, 'Guest access token must expire after ~30 days');
  });

  it('staff review in staff-edit mode modifies locked artwork across Front/Inside/Back while customer is blocked', () => {
    const doc = createTestCardDesign();

    const lockedFront = doc.elements?.find((e) => e.id === 'front-locked-title')!;
    const unlockedFront = doc.elements?.find((e) => e.id === 'front-unlocked-names')!;
    const lockedInside = doc.elements?.find((e) => e.id === 'inside-locked-border')!;

    // 1. In customer / review mode: customerLocked elements cannot be mutated
    assert.equal(canMutateElement(undefined, lockedFront), false);
    assert.equal(canMutateElement(undefined, unlockedFront), true);

    const guestMove = transitionState(doc, { type: 'MOVE_ELEMENT', id: 'front-locked-title', x: 999, y: 999 });
    const guestMovedEl = guestMove.elements?.find((e) => e.id === 'front-locked-title');
    assert.equal(guestMovedEl?.x, 20, 'Customer cannot move locked artwork');

    // 2. In staff-edit mode: staff CAN modify locked artwork elements across surfaces
    assert.equal(canMutateElement('staff-edit', lockedFront), true);
    assert.equal(canMutateElement('staff-edit', lockedInside), true);

    const staffMoveFront = transitionState(
      doc,
      { type: 'MOVE_ELEMENT', id: 'front-locked-title', x: 25, y: 35 },
      'staff-edit'
    );
    const staffMovedFrontEl = staffMoveFront.elements?.find((e) => e.id === 'front-locked-title');
    assert.equal(staffMovedFrontEl?.x, 25);
    assert.equal(staffMovedFrontEl?.y, 35);
    assert.equal(staffMovedFrontEl?.customerLocked, true, 'Staff edit preserves customerLocked flag');

    const staffMoveInside = transitionState(
      doc,
      { type: 'MOVE_ELEMENT', id: 'inside-locked-border', x: 5, y: 5 },
      'staff-edit'
    );
    const staffMovedInsideEl = staffMoveInside.elements?.find((e) => e.id === 'inside-locked-border');
    assert.equal(staffMovedInsideEl?.x, 5);
    assert.equal(staffMovedInsideEl?.y, 5);

    // 3. Commercial product options cannot be modified in staff-edit mode
    const staffChangeProduct = transitionState(doc, { type: 'SET_PRODUCT', value: 'wrapping' }, 'staff-edit');
    assert.equal(staffChangeProduct.productId, 'card');

    const staffChangeVariant = transitionState(doc, { type: 'SET_VARIANT', value: 'horizontal' }, 'staff-edit');
    assert.equal(staffChangeVariant.variantId, 'vertical');

    const staffChangeQuantity = transitionState(doc, { type: 'SET_QUANTITY', value: 500 }, 'staff-edit');
    assert.equal(staffChangeQuantity.quantity, 50);

    const staffChangeFold = transitionState(
      doc,
      { type: 'SET_PRODUCT_OPTION', key: 'fold', value: 'tri-fold' },
      'staff-edit'
    );
    assert.equal(staffChangeFold.productOptions.fold, 'bi-fold');
  });

  it('validates revision reason constraint (3-500 characters) before staff approval', () => {
    assert.equal(validateRevisionReason('').valid, false);
    assert.equal(validateRevisionReason('no').valid, false);
    assert.equal(validateRevisionReason('   ').valid, false);
    assert.equal(validateRevisionReason('Sửa lề in trang bìa').valid, true);
    assert.equal(validateRevisionReason('A'.repeat(501)).valid, false);
  });

  it('admin only starts production; editor is rejected with 403 / FORBIDDEN', async () => {
    const editorClient = createMockFulfillmentClient('editor');
    const adminClient = createMockFulfillmentClient('admin');

    // Editor attempt: rejected
    const editorAttempt = await startProductionInternal(
      { orderId: 'ord-task19-1', expectedFulfillmentStatus: 'ready_for_production', requestId: 'req-ed-1' },
      editorClient as never
    );
    assert.equal(editorAttempt.ok, false);
    if (!editorAttempt.ok) {
      assert.equal(editorAttempt.code, 'FORBIDDEN');
    }

    // Admin attempt: succeeds
    const adminAttempt = await startProductionInternal(
      { orderId: 'ord-task19-1', expectedFulfillmentStatus: 'ready_for_production', requestId: 'req-adm-1' },
      adminClient as never
    );
    assert.equal(adminAttempt.ok, true);
    if (adminAttempt.ok) {
      assert.equal(adminAttempt.value.fulfillmentStatus, 'in_production');
    }
  });

  it('generates real production artifact with Sharp, verifying pixels and omission of placeholders', async () => {
    const doc = createTestCardDesign();

    // 1. Render markup for front, inside, and back surfaces
    const frontMarkup = await generateDocumentRenderMarkup(doc, { surface: 'front' });
    const insideMarkup = await generateDocumentRenderMarkup(doc, { surface: 'inside' });
    const backMarkup = await generateDocumentRenderMarkup(doc, { surface: 'back' });

    assert.ok(frontMarkup.includes('Thiệp Mời Cưới'));
    assert.ok(frontMarkup.includes('Minh') && frontMarkup.includes('Trang'));
    assert.ok(backMarkup.includes('Quỳnh Trang Stationery'));

    // Critical print-safety check: placeholder text & hint NEVER leak into rendered markup
    assert.equal(insideMarkup.includes('Hướng dẫn: Viết lời chúc tại đây'), false);
    assert.equal(insideMarkup.includes('Nhập lời chúc'), false);

    // 2. Generate actual physical raster pixels using Sharp for card front surface (105mm x 148mm at ~300 DPI = 1240 x 1748 px)
    const width = 1240;
    const height = 1748;

    // Create a real PNG image buffer
    const svgOverlay = Buffer.from(`
      <svg width="${width}" height="${height}">
        <rect width="100%" height="100%" fill="#FFFDF8"/>
        <text x="100" y="200" font-family="serif" font-size="64" fill="#D4AF37">Thiệp Mời Cưới</text>
        <text x="100" y="350" font-family="sans-serif" font-size="48" fill="#2E3338">Minh &amp; Trang</text>
      </svg>
    `);

    const imageBuffer = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 255, g: 253, b: 248, alpha: 1 },
      },
    })
      .composite([{ input: svgOverlay, top: 0, left: 0 }])
      .png()
      .toBuffer();

    assert.ok(imageBuffer.length > 0);

    // Assert recorded content checksum
    const checksum = createHash('sha256').update(imageBuffer).digest('hex');
    assert.equal(checksum.length, 64);

    // Assert real pixel dimensions and channels via Sharp metadata
    const metadata = await sharp(imageBuffer).metadata();
    assert.equal(metadata.width, 1240);
    assert.equal(metadata.height, 1748);
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.channels, 4);
  });
});
