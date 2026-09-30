import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrderNextAction } from '../lib/admin/order-next-action.ts';
import {
  deriveAttentionReasons,
  mapOrderActivityItem,
  type OrderOperationalState,
} from '../lib/domain/order.ts';

test('resolveOrderNextAction prioritizes active hold over editing', () => {
  const heldAndEditingState: OrderOperationalState = {
    paymentStatus: 'paid',
    designStatus: 'editing',
    fulfillmentStatus: 'unprocessed',
    activeHold: {
      id: 'hold-1',
      reason: 'Đợi khách gửi logo mới',
      heldAt: '2026-09-30T10:00:00Z',
      heldBy: { userId: 'u1', displayName: 'Admin', role: 'admin' },
    },
  };

  const action = resolveOrderNextAction(heldAndEditingState);
  assert.equal(action.kind, 'release_hold');
  assert.equal(action.eyebrow, 'CẦN XỬ LÝ');
});

test('resolveOrderNextAction yields continue_design_edit when paid and editing without hold', () => {
  const editingState: OrderOperationalState = {
    paymentStatus: 'paid',
    designStatus: 'editing',
    fulfillmentStatus: 'unprocessed',
    activeHold: null,
  };

  const action = resolveOrderNextAction(editingState);
  assert.equal(action.kind, 'continue_design_edit');
  assert.equal(action.title, 'Đang chỉnh sửa thiết kế');
  assert.equal(action.cta?.label, 'Tiếp tục chỉnh sửa');
});

test('deriveAttentionReasons includes DESIGN_CHANGES for editing status', () => {
  const reasons = deriveAttentionReasons('paid', 'editing', 'unprocessed');
  assert.ok(reasons.includes('DESIGN_CHANGES'));
});

test('mapOrderActivityItem formats State 39 lifecycle events into human-readable strings', () => {
  const staffMap = new Map([['u1', 'Thu Trang']]);

  const draftCreated = mapOrderActivityItem(
    {
      id: 'e1',
      event_type: 'design_draft_created',
      actor_user_id: 'u1',
      actor_role: 'editor',
      payload: { reason: 'Chỉnh viền cắt 2mm' },
      created_at: '2026-09-30T10:00:00Z',
    },
    staffMap
  );
  assert.equal(draftCreated.title, 'Tạo bản chỉnh sửa thiết kế');
  assert.equal(draftCreated.description, 'Lý do: Chỉnh viền cắt 2mm');
  assert.equal(draftCreated.actor.displayName, 'Thu Trang');

  const revisionApproved = mapOrderActivityItem(
    {
      id: 'e2',
      event_type: 'design_revision_approved',
      actor_user_id: 'u1',
      actor_role: 'admin',
      payload: { version_number: 2 },
      created_at: '2026-09-30T11:00:00Z',
    },
    staffMap
  );
  assert.equal(revisionApproved.title, 'Duyệt bản chỉnh sửa sản xuất');
  assert.equal(revisionApproved.description, 'Phiên bản sản xuất v2');

  const asIsApproved = mapOrderActivityItem({
    id: 'e3',
    event_type: 'design_approved_as_is',
    actor_user_id: 'u1',
    actor_role: 'editor',
    payload: {},
    created_at: '2026-09-30T12:00:00Z',
  });
  assert.equal(asIsApproved.title, 'Duyệt thiết kế nguyên bản');
});
