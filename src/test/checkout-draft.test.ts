import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../lib/product-state.ts';
import {
  clearCheckoutDraft,
  createCheckoutDraft,
  loadCheckoutDraft,
  saveCheckoutDraft,
  attachQuoteToDraft,
  isQuoteExpired,
  scrubCheckoutDraftPII,
} from '../lib/checkout-draft.ts';
function setupSessionStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
    },
  });
  return values;
}

test('creates draft with clean customer defaults and design isolation', () => {
  setupSessionStorage();
  const design = { ...createInitialState('card'), quantity: 4 };
  const draft = createCheckoutDraft(design);

  assert.deepEqual(draft.customer, { fullName: '', phone: '', shippingAddress: '' });
  assert.equal(draft.productId, design.productId);
  assert.equal(draft.variantId, design.variantId);
  assert.equal(draft.quantity, 4);
  assert.deepEqual(draft.design, design);
  assert.equal('customer' in draft.design, false);
  assert.equal('fullName' in draft.design, false);
  assert.equal('shippingAddress' in draft.design, false);
});

test('keeps idempotency key stable while draft content changes', () => {
  setupSessionStorage();
  const draft = createCheckoutDraft(createInitialState('wrapping'));
  const key = draft.idempotencyKey;
  draft.quantity = 7;
  draft.customer.fullName = 'Nguyễn Văn A';
  saveCheckoutDraft(draft);

  const loaded = loadCheckoutDraft();
  assert.ok(loaded);
  assert.equal(loaded.idempotencyKey, key);
  assert.equal(loaded.quantity, 7);
  assert.equal(loaded.customer.fullName, 'Nguyễn Văn A');
});

test('saves and rehydrates draft from sessionStorage', () => {
  setupSessionStorage();
  const draft = createCheckoutDraft(createInitialState('sticker'), {
    fullName: 'Trần Thị B',
    phone: '0901234567',
    shippingAddress: '456 Lê Lợi, Quận 1, TP.HCM',
  });
  saveCheckoutDraft(draft);

  assert.deepEqual(loadCheckoutDraft(), draft);
  clearCheckoutDraft();
  assert.equal(loadCheckoutDraft(), null);
});

test('customer update preserves design and product quantity', () => {
  setupSessionStorage();
  const design = { ...createInitialState('wrapping'), quantity: 9, text: 'Thiết kế' };
  const draft = createCheckoutDraft(design, { fullName: 'Nguyễn Văn A' });
  const before = structuredClone(draft.design);
  draft.customer.shippingAddress = '123 Đường Hoa Lan, Quận Phú Nhuận, TP.HCM';

  assert.deepEqual(draft.design, before);
  assert.equal(draft.quantity, 9);
  assert.equal(draft.customer.fullName, 'Nguyễn Văn A');
});

test('persists quote metadata in draft without deleting design or customer data on expiry', () => {
  setupSessionStorage();
  const design = { ...createInitialState('card'), quantity: 15, text: 'Thiệp cảm ơn' };
  const customer = { fullName: 'Lê Văn C', phone: '0988776655', shippingAddress: '12 Nguyễn Trãi, Q1' };
  const draft = createCheckoutDraft(design, customer);

  // Attach unexpired quote
  const validQuote = {
    id: 'quote-test-123',
    commercialConfigVersionId: 'ver-card-1',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    calculation: {
      unitPrice: 20000,
      totalAmount: 300000,
      amountDueNow: 50000,
      remainingAmount: 250000,
      paymentPolicy: { kind: 'fixed_deposit' as const, depositAmount: 50000 },
    },
  };
  const draftWithQuote = attachQuoteToDraft(draft, validQuote);
  saveCheckoutDraft(draftWithQuote);

  const loadedValid = loadCheckoutDraft();
  assert.ok(loadedValid);
  assert.equal(loadedValid.priceQuoteId, 'quote-test-123');
  assert.equal(loadedValid.totalAmount, 300000);
  assert.equal(loadedValid.amountDueNow, 50000);
  assert.equal(loadedValid.remainingAmount, 250000);
  assert.equal(isQuoteExpired(loadedValid), false);

  // Simulate expired quote
  loadedValid.quoteExpiresAt = new Date(Date.now() - 1000).toISOString();
  saveCheckoutDraft(loadedValid);

  const loadedExpired = loadCheckoutDraft();
  assert.ok(loadedExpired);
  assert.equal(isQuoteExpired(loadedExpired), true);
  // Design and customer data MUST remain completely intact
  assert.equal(loadedExpired.quantity, 15);
  assert.equal(loadedExpired.design.text, 'Thiệp cảm ơn');
  assert.equal(loadedExpired.customer.fullName, 'Lê Văn C');
  assert.equal(loadedExpired.customer.phone, '0988776655');
  assert.equal(loadedExpired.customer.shippingAddress, '12 Nguyễn Trãi, Q1');
});

test('scrubs customer PII from checkout draft while retaining order identity and design', () => {
  setupSessionStorage();
  const draft = createCheckoutDraft(createInitialState('card'), {
    fullName: 'Lê Văn C',
    phone: '0988776655',
    shippingAddress: '12 Nguyễn Trãi, Q1',
  });
  draft.orderId = 'QT-ORDER-123';
  draft.status = 'ready-for-payment';
  saveCheckoutDraft(draft);

  scrubCheckoutDraftPII();

  const loaded = loadCheckoutDraft();
  assert.ok(loaded);
  assert.equal(loaded.customer.fullName, '');
  assert.equal(loaded.customer.phone, '');
  assert.equal(loaded.customer.shippingAddress, '');
  assert.equal(loaded.orderId, 'QT-ORDER-123');
  assert.equal(loaded.status, 'ready-for-payment');
  assert.equal(loaded.idempotencyKey, draft.idempotencyKey);
});
