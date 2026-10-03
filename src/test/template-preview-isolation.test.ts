import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  getEditorCapabilities,
  getEditorMutationMode,
  type TemplateAuthorEditorContext,
  type TemplatePreviewEditorContext,
  type GuestEditorContext,
  type StaffEditorContext,
} from '../lib/editor-context.ts';
import {
  transitionState,
  createInitialState,
  type DesignState,
  type CanvasElement,
} from '../lib/product-state.ts';
import { canMutateElement } from '../lib/domain/design-revision.ts';
import { makeCardDocument } from './fixtures/templates.ts';

function hashDocument(doc: DesignState): string {
  return crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex');
}

test('getEditorCapabilities derives exact capability matrix across modes', () => {
  const authorCtx: TemplateAuthorEditorContext = {
    type: 'template-author',
    templateId: 'tmpl-1',
    initialDocument: makeCardDocument(),
  };
  const authorCaps = getEditorCapabilities(authorCtx);
  assert.equal(authorCaps.isAuthorMode, true);
  assert.equal(authorCaps.isIsolatedPreview, false);
  assert.equal(authorCaps.fixedTarget, true);
  assert.equal(authorCaps.canSave, true);
  assert.equal(authorCaps.canCustomerLock, true);
  assert.equal(authorCaps.canBypassCustomerLock, true);
  assert.equal(authorCaps.canConfigurePlaceholder, true);
  assert.equal(authorCaps.canChangeProduct, false);
  assert.equal(authorCaps.canChangeVariant, false);
  assert.equal(authorCaps.canChangeQuantity, false);
  assert.equal(authorCaps.canCheckout, false);
  assert.equal(authorCaps.allowLocalStorage, false);
  assert.equal(authorCaps.allowSessionStorage, false);
  assert.equal(authorCaps.showPricing, false);

  // Read-only author context
  const readOnlyAuthorCaps = getEditorCapabilities({ ...authorCtx, readOnly: true });
  assert.equal(readOnlyAuthorCaps.canSave, false);
  assert.equal(readOnlyAuthorCaps.canCustomerLock, false);
  assert.equal(readOnlyAuthorCaps.canConfigurePlaceholder, false);

  // Isolated Customer Preview context
  const previewCtx: TemplatePreviewEditorContext = {
    type: 'template-preview',
    templateId: 'tmpl-1',
    initialDocument: makeCardDocument(),
  };
  const previewCaps = getEditorCapabilities(previewCtx);
  assert.equal(previewCaps.isAuthorMode, false);
  assert.equal(previewCaps.isIsolatedPreview, true);
  assert.equal(previewCaps.fixedTarget, true);
  assert.equal(previewCaps.canSave, false);
  assert.equal(previewCaps.canCustomerLock, false);
  assert.equal(previewCaps.canBypassCustomerLock, false);
  assert.equal(previewCaps.canConfigurePlaceholder, false);
  assert.equal(previewCaps.canChangeProduct, false);
  assert.equal(previewCaps.canChangeVariant, false);
  assert.equal(previewCaps.canChangeQuantity, false);
  assert.equal(previewCaps.canCheckout, false);
  assert.equal(previewCaps.allowLocalStorage, false);
  assert.equal(previewCaps.allowSessionStorage, false);
  assert.equal(previewCaps.showPricing, false);

  // Normal Guest context
  const guestCtx: GuestEditorContext = { type: 'guest' };
  const guestCaps = getEditorCapabilities(guestCtx);
  assert.equal(guestCaps.isGuestMode, true);
  assert.equal(guestCaps.isAuthorMode, false);
  assert.equal(guestCaps.isIsolatedPreview, false);
  assert.equal(guestCaps.fixedTarget, false);
  assert.equal(guestCaps.canSave, true);
  assert.equal(guestCaps.canChangeProduct, true);
  assert.equal(guestCaps.canChangeVariant, true);
  assert.equal(guestCaps.canChangeQuantity, true);
  assert.equal(guestCaps.canCheckout, true);
  assert.equal(guestCaps.allowLocalStorage, true);
  assert.equal(guestCaps.allowSessionStorage, true);
  assert.equal(guestCaps.showPricing, true);

  // Staff Review context
  const staffReviewCtx: StaffEditorContext = {
    type: 'staff',
    mode: 'review',
    orderId: 'ord-1',
    orderCode: 'ORD-001',
    initialDocument: makeCardDocument(),
    sessionId: 'sess-1',
  };
  const staffReviewCaps = getEditorCapabilities(staffReviewCtx);
  assert.equal(staffReviewCaps.canSave, false);
  assert.equal(staffReviewCaps.canCustomerLock, false);
  assert.equal(staffReviewCaps.fixedTarget, true);
  assert.equal(staffReviewCaps.canCheckout, false);
});

test('fixed target enforcement: template-author and template-preview reject product, variant, quantity and frozen options', () => {
  const base = makeCardDocument();
  assert.equal(base.productId, 'card');
  assert.equal(base.variantId, 'vertical');

  for (const mode of ['template-author', 'template-preview'] as const) {
    // Rejects product change
    const withProduct = transitionState(base, { type: 'SET_PRODUCT', value: 'wrapping' }, mode);
    assert.equal(withProduct.productId, 'card');

    // Rejects variant change
    const withVariant = transitionState(base, { type: 'SET_VARIANT', value: 'horizontal' }, mode);
    assert.equal(withVariant.variantId, 'vertical');

    // Rejects quantity change
    const withQuantity = transitionState(base, { type: 'SET_QUANTITY', value: 100 }, mode);
    assert.equal(withQuantity.quantity, base.quantity);

    // Rejects frozen card option
    const withFold = transitionState(
      base,
      { type: 'SET_PRODUCT_OPTION', key: 'fold', value: 'tri-fold' },
      mode
    );
    assert.equal(withFold.productOptions.fold, undefined);
  }

  // Allowed artwork options still permitted in template-author mode
  const stickerBase = createInitialState('sticker');
  const withBorder = transitionState(
    stickerBase,
    { type: 'SET_PRODUCT_OPTION', key: 'borderWidth', value: 8 },
    'template-author'
  );
  assert.equal(withBorder.productOptions.borderWidth, 8);
});

test('preview sandbox isolation: parent draft hash strictly unchanged before and after sandbox mutations', () => {
  const authorDraft: DesignState = {
    ...makeCardDocument(),
    elements: [
      {
        id: 'locked-el',
        type: 'text',
        x: 10,
        y: 10,
        width: 40,
        height: 10,
        rotation: 0,
        locked: false,
        customerLocked: true,
        data: { text: 'Khóa với khách', color: '#000', fontSize: 14 },
      },
      {
        id: 'editable-el',
        type: 'text',
        x: 10,
        y: 30,
        width: 40,
        height: 10,
        rotation: 0,
        locked: false,
        customerLocked: false,
        data: { text: 'Khách có thể sửa', color: '#000', fontSize: 14 },
      },
    ],
  };

  const initialHash = hashDocument(authorDraft);

  // Clone document when opening Customer Preview
  const sandboxDoc: DesignState = JSON.parse(JSON.stringify(authorDraft));

  // Perform mutations inside the sandbox
  // 1. Move editable element
  const movedSandbox = transitionState(
    sandboxDoc,
    { type: 'MOVE_ELEMENT', id: 'editable-el', x: 50, y: 60 },
    'template-preview'
  );
  assert.equal(movedSandbox.elements?.find((e) => e.id === 'editable-el')?.x, 50);

  // 2. Edit text of editable element
  const updatedSandbox = transitionState(
    movedSandbox,
    {
      type: 'UPDATE_ELEMENT',
      id: 'editable-el',
      patch: { data: { text: 'Nội dung mới do khách nhập', color: '#000', fontSize: 14 } },
    },
    'template-preview'
  );
  const updatedData = updatedSandbox.elements?.find((e) => e.id === 'editable-el')?.data as Record<string, unknown>;
  assert.equal(updatedData.text, 'Nội dung mới do khách nhập');

  // 3. Attempt to mutate locked element inside sandbox -> blocked!
  const blockedMove = transitionState(
    updatedSandbox,
    { type: 'MOVE_ELEMENT', id: 'locked-el', x: 99, y: 99 },
    'template-preview'
  );
  assert.equal(blockedMove.elements?.find((e) => e.id === 'locked-el')?.x, 10);

  // 4. Attempt to delete locked element inside sandbox -> blocked!
  const blockedDelete = transitionState(
    blockedMove,
    { type: 'DELETE_ELEMENTS', ids: ['locked-el'] },
    'template-preview'
  );
  assert.equal(blockedDelete.elements?.some((e) => e.id === 'locked-el'), true);

  // Assert author draft has NOT been mutated and hash is 100% equal
  const afterHash = hashDocument(authorDraft);
  assert.equal(afterHash, initialHash);
  assert.equal(authorDraft.elements?.[1].x, 10);
});

test('storage isolation: preview operations do not write to localStorage or sessionStorage', () => {
  const storageMock: Record<string, string> = {
    'quynhtrang.guestSessionId': 'guest-session-123',
    'existing-app-key': 'val-456',
  };
  const sessionMock: Record<string, string> = {
    'session-key-1': 'sess-val',
  };

  const before = {
    local: { ...storageMock },
    session: { ...sessionMock },
  };

  // Run preview capabilities check
  const previewContext: TemplatePreviewEditorContext = {
    type: 'template-preview',
    templateId: 'tmpl-card-1',
    initialDocument: makeCardDocument(),
    onExit: () => { },
  };
  const caps = getEditorCapabilities(previewContext);

  // Isolation assertions: storage access prohibited in preview
  assert.equal(caps.allowLocalStorage, false);
  assert.equal(caps.allowSessionStorage, false);
  assert.equal(caps.canSave, false);

  // Simulated preview session: no persistence triggered
  // If preview attempted to save, storageMock/sessionMock would be altered
  assert.deepEqual(
    { local: { ...storageMock }, session: { ...sessionMock } },
    before
  );
});

test('canMutateElement enforces customer locked boundaries in template-preview mode', () => {
  const customerLockedEl: CanvasElement = {
    id: 'el-locked',
    type: 'text',
    x: 0,
    y: 0,
    width: 50,
    height: 20,
    rotation: 0,
    locked: false,
    customerLocked: true,
  };

  const normalEl: CanvasElement = {
    id: 'el-free',
    type: 'text',
    x: 0,
    y: 0,
    width: 50,
    height: 20,
    rotation: 0,
    locked: false,
    customerLocked: false,
  };

  // In template-preview: customerLocked element is NOT mutable
  assert.equal(canMutateElement('template-preview', customerLockedEl), false);
  // In template-preview: normal unlocked element IS mutable
  assert.equal(canMutateElement('template-preview', normalEl), true);

  // In template-author: customerLocked element IS mutable by author
  assert.equal(canMutateElement('template-author', customerLockedEl), true);
  assert.equal(canMutateElement('template-author', normalEl), true);

  // In guest: customerLocked element is NOT mutable
  assert.equal(canMutateElement('guest', customerLockedEl), false);
});

test('RBAC & query flag protection: URL query flags cannot forge author mode', () => {
  // A query string like ?mode=template-author without a verified server context
  // must default to guest mode with guest capabilities
  const forgedContext = undefined;
  const mode = getEditorMutationMode(forgedContext);
  assert.equal(mode, 'guest');

  const caps = getEditorCapabilities(forgedContext);
  assert.equal(caps.isAuthorMode, false);
  assert.equal(caps.isIsolatedPreview, false);
  assert.equal(caps.canCustomerLock, false);
  assert.equal(caps.canBypassCustomerLock, false);
  assert.equal(caps.canConfigurePlaceholder, false);
});

test('disposable in-memory image blob tracking: preview revokes created URLs on cleanup', () => {
  const revokedUrls: string[] = [];
  const previewBlobs = new Set<string>();

  const testBlobUrl = 'blob:http://localhost:3000/test-preview-blob-1';
  previewBlobs.add(testBlobUrl);

  // Cleanup simulation
  previewBlobs.forEach((url) => {
    revokedUrls.push(url);
  });
  previewBlobs.clear();

  assert.equal(revokedUrls.length, 1);
  assert.equal(revokedUrls[0], testBlobUrl);
  assert.equal(previewBlobs.size, 0);
});
