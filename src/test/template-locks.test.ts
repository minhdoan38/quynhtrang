import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transitionState,
  type CanvasElement,
  type DesignState,
} from '../lib/product-state.ts';
import { canMutateElement } from '../lib/domain/design-revision.ts';
import {
  groupElements,
  ungroupElement,
  duplicateSelectedElements,
  deleteSelectedElements,
} from '../lib/grouping.ts';
import { moveElements } from '../lib/multi-selection.ts';
import { createDesignHistoryManager } from '../lib/use-design-history.ts';
import type { SelectionSnapshot } from '../lib/history.ts';
import { makeCardDocument } from './fixtures/templates.ts';

test('minimal test pattern from brief: UPDATE, DELETE_ELEMENTS, MOVE across modes', () => {
  const doc = makeCardDocument();
  doc.elements![0].customerLocked = true;

  assert.deepEqual(transitionState(doc, { type: 'UPDATE_ELEMENT', id: 'name', patch: { x: 90 } }, 'guest'), doc);
  assert.deepEqual(transitionState(doc, { type: 'DELETE_ELEMENTS', ids: ['name'] }, 'template-preview'), doc);
  assert.equal(transitionState(doc, { type: 'MOVE_ELEMENT', id: 'name', x: 25, y: 20 }, 'template-author').elements![0].x, 25);
  assert.deepEqual(transitionState(doc, { type: 'MOVE_ELEMENT', id: 'name', x: 25, y: 20 }, 'review'), doc);
});

test('bypass prevention: guest cannot modify customerLocked via UPDATE_ELEMENT or bulk delete', () => {
  const doc = makeCardDocument();
  doc.elements![0].customerLocked = true;

  // Attempting to unlock via patch in guest mode
  const patched = transitionState(
    doc,
    { type: 'UPDATE_ELEMENT', id: 'name', patch: { customerLocked: false, x: 99 } },
    'guest'
  );
  assert.deepEqual(patched, doc);

  // Attempting to delete via DELETE_ELEMENT in guest mode
  const afterDelete = transitionState(doc, { type: 'DELETE_ELEMENT', id: 'name' }, 'guest');
  assert.deepEqual(afterDelete, doc);

  // Attempting to delete via REMOVE_CANVAS_ELEMENT in template-preview mode
  const afterRemove = transitionState(doc, { type: 'REMOVE_CANVAS_ELEMENT', id: 'name' }, 'template-preview');
  assert.deepEqual(afterRemove, doc);
});

test('atomic rejection: group containing customerLocked descendant blocks mutations atomically', () => {
  const base = makeCardDocument();
  const elements: CanvasElement[] = [
    { id: 'grp-1', type: 'group', x: 50, y: 50, width: 40, height: 40, rotation: 0, zIndex: 1 },
    { id: 'child-unlocked', type: 'text', parentGroupId: 'grp-1', x: 40, y: 40, width: 20, height: 10, rotation: 0, zIndex: 2 },
    { id: 'child-locked', type: 'text', parentGroupId: 'grp-1', customerLocked: true, x: 60, y: 60, width: 20, height: 10, rotation: 0, zIndex: 3 },
  ];
  const doc: DesignState = { ...base, elements };

  // MOVE_ELEMENT on group rejected atomically
  assert.deepEqual(transitionState(doc, { type: 'MOVE_ELEMENT', id: 'grp-1', x: 10, y: 10 }, 'guest'), doc);

  // RESIZE_ELEMENT on group rejected atomically
  assert.deepEqual(transitionState(doc, { type: 'RESIZE_ELEMENT', id: 'grp-1', width: 80, height: 80 }, 'guest'), doc);

  // ROTATE_ELEMENT on group rejected atomically
  assert.deepEqual(transitionState(doc, { type: 'ROTATE_ELEMENT', id: 'grp-1', rotation: 45 }, 'guest'), doc);

  // DELETE_ELEMENT on group rejected atomically (cascading child protected)
  assert.deepEqual(transitionState(doc, { type: 'DELETE_ELEMENT', id: 'grp-1' }, 'guest'), doc);

  // UNGROUP_ELEMENT on group rejected atomically
  assert.deepEqual(transitionState(doc, { type: 'UNGROUP_ELEMENT', groupId: 'grp-1' }, 'guest'), doc);

  // MOVE_ELEMENTS on group rejected atomically
  assert.deepEqual(transitionState(doc, { type: 'MOVE_ELEMENTS', ids: ['grp-1'], dx: 10, dy: 10 }, 'guest'), doc);

  // DUPLICATE_ELEMENTS on group rejected atomically
  assert.deepEqual(transitionState(doc, { type: 'DUPLICATE_ELEMENTS', ids: ['grp-1'] }, 'guest'), doc);

  // DELETE_ELEMENTS on group rejected atomically
  assert.deepEqual(transitionState(doc, { type: 'DELETE_ELEMENTS', ids: ['grp-1'] }, 'guest'), doc);

  // direct helper checks
  assert.deepEqual(groupElements(doc, ['child-unlocked', 'child-locked'], 'guest'), { state: doc, groupId: '' });
  assert.deepEqual(ungroupElement(doc, 'grp-1', 'guest'), doc);
  assert.deepEqual(deleteSelectedElements(doc, ['grp-1'], 'guest'), doc);
  assert.deepEqual(duplicateSelectedElements(doc, ['grp-1'], 'guest'), { state: doc, newIds: [] });
  assert.deepEqual(moveElements(elements, ['grp-1'], 10, 10, 'guest'), elements);

  // template-author bypasses customer lock on group
  const authorMoved = transitionState(doc, { type: 'MOVE_ELEMENT', id: 'grp-1', x: 25, y: 25 }, 'template-author');
  assert.equal(authorMoved.elements?.find((e) => e.id === 'grp-1')?.x, 25);

  // staff-edit bypasses customer lock on group
  const staffDeleted = transitionState(doc, { type: 'DELETE_ELEMENT', id: 'grp-1' }, 'staff-edit');
  assert.equal(staffDeleted.elements?.length, 0);
});

test('layer reorder: customer cannot alter layer order of customerLocked elements', () => {
  const base = makeCardDocument();
  const elements: CanvasElement[] = [
    { id: 'el-1', type: 'text', customerLocked: true, x: 10, y: 10, width: 20, height: 10, rotation: 0, zIndex: 1 },
    { id: 'el-2', type: 'text', x: 20, y: 20, width: 20, height: 10, rotation: 0, zIndex: 2 },
    { id: 'el-3', type: 'text', x: 30, y: 30, width: 20, height: 10, rotation: 0, zIndex: 3 },
  ];
  const doc: DesignState = { ...base, elements };

  // Attempting to move locked el-1 to the top in guest mode
  assert.deepEqual(
    transitionState(doc, { type: 'REORDER_ELEMENTS', orderedIds: ['el-2', 'el-3', 'el-1'] }, 'guest'),
    doc
  );

  // BRING_FORWARD on locked el-1 in guest mode rejected
  assert.deepEqual(transitionState(doc, { type: 'BRING_FORWARD', id: 'el-1' }, 'guest'), doc);

  // SEND_BACKWARD on adjacent el-2 swapping with locked el-1 in guest mode rejected
  assert.deepEqual(transitionState(doc, { type: 'SEND_BACKWARD', id: 'el-2' }, 'guest'), doc);

  // Reordering unlocked elements el-2 and el-3 while preserving locked el-1 is allowed
  const unlockedReorder = transitionState(
    doc,
    { type: 'REORDER_ELEMENTS', orderedIds: ['el-1', 'el-3', 'el-2'] },
    'guest'
  );
  assert.notDeepEqual(unlockedReorder, doc);

  // template-author can reorder locked elements freely
  const authorReorder = transitionState(
    doc,
    { type: 'REORDER_ELEMENTS', orderedIds: ['el-2', 'el-3', 'el-1'] },
    'template-author'
  );
  assert.notDeepEqual(authorReorder, doc);
});

test('ordinary locked vs customerLocked semantics and SET_CUSTOMER_LOCK permissions', () => {
  const base = makeCardDocument();
  const elements: CanvasElement[] = [
    { id: 'ordinary', type: 'text', locked: true, x: 10, y: 10, width: 20, height: 10, rotation: 0 },
    { id: 'customer', type: 'text', customerLocked: true, x: 20, y: 20, width: 20, height: 10, rotation: 0 },
  ];
  const doc: DesignState = { ...base, elements };

  // 1. Customer CAN unlock ordinary locked element via LOCK_ELEMENT
  const unlockedOrdinary = transitionState(doc, { type: 'LOCK_ELEMENT', id: 'ordinary', locked: false }, 'guest');
  assert.equal(unlockedOrdinary.elements?.find((e) => e.id === 'ordinary')?.locked, false);

  // 2. Customer CANNOT unlock or lock a customerLocked element via LOCK_ELEMENT
  assert.deepEqual(transitionState(doc, { type: 'LOCK_ELEMENT', id: 'customer', locked: true }, 'guest'), doc);
  assert.deepEqual(transitionState(doc, { type: 'LOCK_ELEMENT', id: 'customer', locked: false }, 'guest'), doc);

  // 3. SET_CUSTOMER_LOCK is rejected in guest, customer, template-preview, review
  assert.deepEqual(transitionState(doc, { type: 'SET_CUSTOMER_LOCK', id: 'ordinary', customerLocked: true }, 'guest'), doc);
  assert.deepEqual(transitionState(doc, { type: 'SET_CUSTOMER_LOCK', id: 'ordinary', customerLocked: true }, 'customer'), doc);
  assert.deepEqual(transitionState(doc, { type: 'SET_CUSTOMER_LOCK', id: 'ordinary', customerLocked: true }, 'template-preview'), doc);
  assert.deepEqual(transitionState(doc, { type: 'SET_CUSTOMER_LOCK', id: 'ordinary', customerLocked: true }, 'review'), doc);

  // 4. SET_CUSTOMER_LOCK is allowed in template-author and staff-edit
  const authorLocked = transitionState(doc, { type: 'SET_CUSTOMER_LOCK', id: 'ordinary', customerLocked: true }, 'template-author');
  assert.equal(authorLocked.elements?.find((e) => e.id === 'ordinary')?.customerLocked, true);

  const staffUnlocked = transitionState(doc, { type: 'SET_CUSTOMER_LOCK', id: 'customer', customerLocked: false }, 'staff-edit');
  assert.equal(staffUnlocked.elements?.find((e) => e.id === 'customer')?.customerLocked, false);

  // 5. canMutateElement distinction:
  // - In template-author: customerLocked element is editable, ordinary locked requires unlock
  assert.equal(canMutateElement('template-author', { customerLocked: true }), true);
  assert.equal(canMutateElement('template-author', { locked: true }), false);
  // - In staff-edit: both ordinary and customer locked are editable
  assert.equal(canMutateElement('staff-edit', { customerLocked: true }), true);
  assert.equal(canMutateElement('staff-edit', { locked: true }), true);
});

test('SET_ELEMENTS prevents customer lock tampering in guest/preview modes', () => {
  const doc = makeCardDocument();
  doc.elements![0].customerLocked = true;

  // 1. Customer attempts to drop customerLocked element via SET_ELEMENTS
  assert.deepEqual(transitionState(doc, { type: 'SET_ELEMENTS', value: [] }, 'guest'), doc);

  // 2. Customer attempts to alter customerLocked element position via SET_ELEMENTS
  const altered = [{ ...doc.elements![0], x: 999 }];
  assert.deepEqual(transitionState(doc, { type: 'SET_ELEMENTS', value: altered }, 'guest'), doc);

  // 3. Customer attempts to inject new customerLocked element via SET_ELEMENTS
  const injected = [
    { ...doc.elements![0] },
    { id: 'new-el', type: 'text' as const, customerLocked: true, x: 0, y: 0, width: 10, height: 10, rotation: 0 },
  ];
  assert.deepEqual(transitionState(doc, { type: 'SET_ELEMENTS', value: injected }, 'guest'), doc);

  // 4. Staff-edit and template-author can update elements freely via SET_ELEMENTS
  const authorUpdated = transitionState(doc, { type: 'SET_ELEMENTS', value: altered }, 'template-author');
  assert.equal(authorUpdated.elements?.[0]?.x, 999);
});

test('history reset from preview: allows unlocked editing, protects locked, cleanly resets', () => {
  const base = makeCardDocument();
  const elements: CanvasElement[] = [
    { id: 'locked-el', type: 'text', customerLocked: true, x: 10, y: 10, width: 20, height: 10, rotation: 0 },
    { id: 'unlocked-el', type: 'text', customerLocked: false, x: 30, y: 30, width: 20, height: 10, rotation: 0 },
  ];
  const doc: DesignState = { ...base, elements };

  let selection: SelectionSnapshot = {
    selectedTarget: null,
    selectedElementId: null,
    selectedElementIds: [],
    selectionMode: 'default',
    activeGroupId: null,
  };

  const manager = createDesignHistoryManager(
    doc,
    () => selection,
    (s) => { selection = s; },
    50,
    'template-preview'
  );

  // Mutation on customerLocked element in preview rejected (no history created)
  const rejectedEntry = manager.executeAction(
    { type: 'MOVE_ELEMENT', id: 'locked-el', x: 90, y: 90 },
    { type: 'move', label: 'Di chuyển' }
  );
  assert.equal(rejectedEntry, null);
  assert.equal(manager.getState().elements?.find((e) => e.id === 'locked-el')?.x, 10);
  assert.equal(manager.canUndo(), false);

  // Mutation on unlocked element in preview succeeds (history created)
  const successEntry = manager.executeAction(
    { type: 'MOVE_ELEMENT', id: 'unlocked-el', x: 50, y: 50 },
    { type: 'move', label: 'Di chuyển' }
  );
  assert.ok(successEntry);
  assert.equal(manager.getState().elements?.find((e) => e.id === 'unlocked-el')?.x, 50);
  assert.equal(manager.canUndo(), true);

  // Undo works
  manager.undo();
  assert.equal(manager.getState().elements?.find((e) => e.id === 'unlocked-el')?.x, 30);

  // Redo works
  manager.redo();
  assert.equal(manager.getState().elements?.find((e) => e.id === 'unlocked-el')?.x, 50);

  // History reset restores initial state and customerLocked elements
  manager.resetHistory(doc);
  assert.equal(manager.canUndo(), false);
  assert.equal(manager.canRedo(), false);
  assert.deepEqual(manager.getState(), doc);
  assert.equal(manager.getState().elements?.find((e) => e.id === 'locked-el')?.customerLocked, true);
});

test('multi-surface lock and staff-edit bypass', () => {
  const base = makeCardDocument();
  const elements: CanvasElement[] = [
    { id: 'front-unlocked', type: 'text', surface: 'front', customerLocked: false, x: 10, y: 10, width: 20, height: 10, rotation: 0 },
    { id: 'inside-locked', type: 'text', surface: 'inside', customerLocked: true, x: 20, y: 20, width: 20, height: 10, rotation: 0 },
  ];
  const doc: DesignState = { ...base, elements };

  // Guest can move front unlocked element
  const guestMovedFront = transitionState(doc, { type: 'MOVE_ELEMENT', id: 'front-unlocked', x: 15, y: 15 }, 'guest');
  assert.equal(guestMovedFront.elements?.find((e) => e.id === 'front-unlocked')?.x, 15);

  // Guest CANNOT move inside locked element
  const guestMovedInside = transitionState(doc, { type: 'MOVE_ELEMENT', id: 'inside-locked', x: 25, y: 25 }, 'guest');
  assert.deepEqual(guestMovedInside, doc);

  // Staff-edit CAN move inside locked element (staff-edit bypass)
  const staffMovedInside = transitionState(doc, { type: 'MOVE_ELEMENT', id: 'inside-locked', x: 25, y: 25 }, 'staff-edit');
  const movedInsideEl = staffMovedInside.elements?.find((e) => e.id === 'inside-locked');
  assert.equal(movedInsideEl?.x, 25);
  // Preserves customerLocked flag!
  assert.equal(movedInsideEl?.customerLocked, true);
});

test('text, style, and image mutation paths on customerLocked elements are guarded', () => {
  const base = makeCardDocument();
  const elements: CanvasElement[] = [
    {
      id: 'text-locked',
      type: 'text',
      customerLocked: true,
      x: 10,
      y: 10,
      width: 20,
      height: 10,
      rotation: 0,
      data: { text: 'Gốc', fontSize: 16 },
    },
    {
      id: 'img-locked',
      type: 'image',
      customerLocked: true,
      x: 30,
      y: 30,
      width: 40,
      height: 40,
      rotation: 0,
      data: { src: 'https://example.com/original.png', opacity: 100 },
    },
  ];
  const doc: DesignState = { ...base, elements };

  // COMMIT_TEXT_EDIT guarded
  assert.deepEqual(transitionState(doc, { type: 'COMMIT_TEXT_EDIT', id: 'text-locked', text: 'Mới' }, 'guest'), doc);

  // UPDATE_TEXT_STYLE guarded
  assert.deepEqual(transitionState(doc, { type: 'UPDATE_TEXT_STYLE', id: 'text-locked', patch: { fontSize: 24 } }, 'guest'), doc);

  // REPLACE_IMAGE_ASSET guarded
  assert.deepEqual(
    transitionState(doc, { type: 'REPLACE_IMAGE_ASSET', id: 'img-locked', asset: { src: 'https://example.com/new.png' } }, 'guest'),
    doc
  );

  // SET_IMAGE_OPACITY guarded
  assert.deepEqual(transitionState(doc, { type: 'SET_IMAGE_OPACITY', id: 'img-locked', opacity: 50 }, 'guest'), doc);

  // APPLY_REMOVE_BACKGROUND guarded
  assert.deepEqual(
    transitionState(doc, { type: 'APPLY_REMOVE_BACKGROUND', id: 'img-locked', derivedSrc: 'https://example.com/nobg.png' }, 'guest'),
    doc
  );

  // COMMIT_REFINE_MASK guarded
  assert.deepEqual(
    transitionState(doc, { type: 'COMMIT_REFINE_MASK', id: 'img-locked', refinedSrc: 'https://example.com/refined.png' }, 'guest'),
    doc
  );

  // COMMIT_IMAGE_CROP guarded
  assert.deepEqual(
    transitionState(doc, { type: 'COMMIT_IMAGE_CROP', id: 'img-locked', crop: { scale: 2, offsetX: 0, offsetY: 0, rotation: 0 } }, 'guest'),
    doc
  );

  // RESET_IMAGE_CROP guarded
  assert.deepEqual(transitionState(doc, { type: 'RESET_IMAGE_CROP', id: 'img-locked' }, 'guest'), doc);

  // SET_IMAGE_MASK guarded
  assert.deepEqual(transitionState(doc, { type: 'SET_IMAGE_MASK', id: 'img-locked', mask: 'circle' }, 'guest'), doc);

  // RESTORE_ORIGINAL_IMAGE guarded
  assert.deepEqual(transitionState(doc, { type: 'RESTORE_ORIGINAL_IMAGE', id: 'img-locked' }, 'guest'), doc);
});
