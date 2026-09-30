import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  transitionState,
  type DesignState,
  type CanvasElement,
} from '../lib/product-state.ts';

test('transitionState in review mode blocks all mutations', () => {
  const base = createInitialState('card');
  const action1 = { type: 'SET_TEXT' as const, value: 'New text' };
  const res1 = transitionState(base, action1, 'review');
  assert.equal(res1.text, base.text);

  const action2 = {
    type: 'MOVE_ELEMENT' as const,
    id: 'el-1',
    x: 20,
    y: 30,
  };
  const baseWithEl = {
    ...base,
    elements: [{ id: 'el-1', type: 'text' as const, x: 0, y: 0, width: 10, height: 10, rotation: 0, locked: false }],
  };
  const res2 = transitionState(baseWithEl, action2, 'review');
  assert.equal(res2.elements?.[0].x, 0);
});

test('transitionState in staff-edit mode allows editing locked artwork elements but retains locked flag', () => {
  const base = createInitialState('card');
  const lockedEl: CanvasElement = {
    id: 'el-locked',
    type: 'text',
    x: 0,
    y: 0,
    width: 50,
    height: 20,
    rotation: 0,
    locked: true,
  };
  const stateWithLocked = {
    ...base,
    elements: [lockedEl],
  };

  // In guest mode: move element is blocked because locked: true
  const guestMove = transitionState(
    stateWithLocked,
    { type: 'MOVE_ELEMENT', id: 'el-locked', x: 100, y: 100 },
    'guest'
  );
  assert.equal(guestMove.elements?.[0].x, 0);

  // In staff-edit mode: move element is permitted
  const staffMove = transitionState(
    stateWithLocked,
    { type: 'MOVE_ELEMENT', id: 'el-locked', x: 100, y: 100 },
    'staff-edit'
  );
  assert.equal(staffMove.elements?.[0].x, 100);
  assert.equal(staffMove.elements?.[0].y, 100);
  // Preserves locked flag!
  assert.equal(staffMove.elements?.[0].locked, true);
});

test('transitionState in staff-edit mode rejects business/commercial option changes', () => {
  const base = createInitialState('card');

  // SET_PRODUCT blocked
  const resProd = transitionState(base, { type: 'SET_PRODUCT', value: 'wrapping' }, 'staff-edit');
  assert.equal(resProd.productId, 'card');

  // SET_VARIANT blocked
  const resVar = transitionState(base, { type: 'SET_VARIANT', value: 'vertical' }, 'staff-edit');
  assert.equal(resVar.variantId, base.variantId);

  // SET_QUANTITY blocked
  const resQty = transitionState(base, { type: 'SET_QUANTITY', value: 100 }, 'staff-edit');
  assert.equal(resQty.quantity, base.quantity);

  // Frozen product option blocked (card fold)
  const resFold = transitionState(
    base,
    { type: 'SET_PRODUCT_OPTION', key: 'fold', value: 'tri-fold' },
    'staff-edit'
  );
  assert.notEqual(resFold.productOptions.fold, 'tri-fold');

  // Allowed artwork option permitted (card surface or sticker borderWidth)
  const stickerBase = createInitialState('sticker');
  const resBorder = transitionState(
    stickerBase,
    { type: 'SET_PRODUCT_OPTION', key: 'borderWidth', value: 5 },
    'staff-edit'
  );
  assert.equal(resBorder.productOptions.borderWidth, 5);
});
