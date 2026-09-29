import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../lib/product-state.ts';
import {
  clearCheckoutDraft,
  createCheckoutDraft,
  loadCheckoutDraft,
  saveCheckoutDraft,
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
