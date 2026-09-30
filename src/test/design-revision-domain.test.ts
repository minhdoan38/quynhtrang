import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../lib/product-state.ts';
import {
  isDesignMutationEligible,
  assertStaffArtworkCompatible,
  canMutateElement,
  validateRevisionReason,
} from '../lib/domain/design-revision.ts';

test('isDesignMutationEligible permits only unprocessed and ready_for_production', () => {
  assert.equal(isDesignMutationEligible({ fulfillmentStatus: 'unprocessed' }), true);
  assert.equal(isDesignMutationEligible({ fulfillmentStatus: 'ready_for_production' }), true);
  assert.equal(isDesignMutationEligible({ fulfillmentStatus: 'in_production' }), false);
  assert.equal(isDesignMutationEligible({ fulfillmentStatus: 'completed' }), false);
  assert.equal(isDesignMutationEligible({ fulfillmentStatus: 'cancelled' }), false);
});

test('assertStaffArtworkCompatible: allows valid artwork text/color/elements/pattern changes', () => {
  const baseCard = createInitialState('card');
  const nextCard = {
    ...baseCard,
    text: 'Lời chúc mới',
    color: '#ff0000',
    backgroundColor: '#fff0f0',
    elements: [
      {
        id: 'el-1',
        type: 'text' as const,
        x: 10,
        y: 10,
        width: 50,
        height: 20,
        rotation: 0,
        locked: false,
      },
    ],
  };
  assert.doesNotThrow(() => assertStaffArtworkCompatible(baseCard, nextCard));

  const baseWrapping = createInitialState('wrapping');
  const nextWrapping = {
    ...baseWrapping,
    productOptions: {
      ...baseWrapping.productOptions,
      patternScale: 150,
      spacingX: 10,
    },
  };
  assert.doesNotThrow(() => assertStaffArtworkCompatible(baseWrapping, nextWrapping));

  const baseSticker = createInitialState('sticker');
  const nextSticker = {
    ...baseSticker,
    productOptions: {
      ...baseSticker.productOptions,
      borderWidth: 4,
      hasWhiteBorder: false,
    },
  };
  assert.doesNotThrow(() => assertStaffArtworkCompatible(baseSticker, nextSticker));
});

test('assertStaffArtworkCompatible: freezes productId, variantId, quantity and physical options', () => {
  const base = createInitialState('card');

  // Product ID change
  assert.throws(
    () => assertStaffArtworkCompatible(base, { ...base, productId: 'wrapping' }),
    /sản phẩm/i
  );

  // Variant ID change
  assert.throws(
    () => assertStaffArtworkCompatible(base, { ...base, variantId: 'vertical' }),
    /loại|khổ/i
  );

  // Quantity change
  assert.throws(
    () => assertStaffArtworkCompatible(base, { ...base, quantity: base.quantity + 1 }),
    /số lượng/i
  );

  // Card fold change
  const cardWithFold = {
    ...base,
    productOptions: { ...base.productOptions, fold: 'half' },
  };
  assert.throws(
    () =>
      assertStaffArtworkCompatible(cardWithFold, {
        ...cardWithFold,
        productOptions: { ...cardWithFold.productOptions, fold: 'tri-fold' },
      }),
    /tùy chọn|cấu hình/i
  );

  // Sticker shape change
  const stickerWithShape = {
    ...createInitialState('sticker'),
    productOptions: { shape: 'circle', borderWidth: 2 },
  };
  assert.throws(
    () =>
      assertStaffArtworkCompatible(stickerWithShape, {
        ...stickerWithShape,
        productOptions: { ...stickerWithShape.productOptions, shape: 'square' },
      }),
    /tùy chọn|cấu hình/i
  );

  // Unknown options injection
  assert.throws(
    () =>
      assertStaffArtworkCompatible(base, {
        ...base,
        productOptions: { ...base.productOptions, maliciousKey: 'hack' },
      }),
    /không hợp lệ/i
  );
});

test('canMutateElement matrix for review, guest, staff-edit', () => {
  const lockedElement = { id: '1', locked: true };
  const unlockedElement = { id: '2', locked: false };

  // review mode: all false
  assert.equal(canMutateElement('review', lockedElement), false);
  assert.equal(canMutateElement('review', unlockedElement), false);
  assert.equal(canMutateElement('preflight', lockedElement), false);
  assert.equal(canMutateElement('review-changes', lockedElement), false);

  // guest: only unlocked
  assert.equal(canMutateElement('guest', lockedElement), false);
  assert.equal(canMutateElement('guest', unlockedElement), true);
  assert.equal(canMutateElement(undefined, lockedElement), false);
  assert.equal(canMutateElement(undefined, unlockedElement), true);

  // staff-edit: can edit both locked and unlocked artwork elements
  assert.equal(canMutateElement('staff-edit', lockedElement), true);
  assert.equal(canMutateElement('staff-edit', unlockedElement), true);
});

test('validateRevisionReason validates trimmed length 3-500 characters', () => {
  assert.equal(validateRevisionReason('ab').valid, false);
  assert.equal(validateRevisionReason('   ab   ').valid, false);
  assert.equal(validateRevisionReason('').valid, false);
  assert.equal(validateRevisionReason('Chỉnh sửa lề in theo yêu cầu').valid, true);

  const longReason = 'a'.repeat(501);
  assert.equal(validateRevisionReason(longReason).valid, false);

  const maxReason = 'a'.repeat(500);
  assert.equal(validateRevisionReason(maxReason).valid, true);
});
