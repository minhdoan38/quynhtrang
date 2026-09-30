import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOrderNextAction,
} from '../lib/admin/order-next-action.ts';
import type {
  ActiveOrderHold,
  OrderNextActionKind,
  OrderOperationalState,
} from '../lib/domain/order.ts';

function createState(overrides: Partial<OrderOperationalState> = {}): OrderOperationalState {
  return {
    paymentStatus: 'pending_payment',
    designStatus: 'awaiting_review',
    fulfillmentStatus: 'unprocessed',
    activeHold: null,
    ...overrides,
  };
}

const mockHold: ActiveOrderHold = {
  id: 'hold-123',
  reason: 'Khách yêu cầu tạm dừng để đổi thông tin in',
  heldAt: '2026-09-30T10:00:00Z',
  heldBy: {
    userId: 'user-admin-1',
    displayName: 'Admin Minh',
    role: 'admin',
  },
};

describe('resolveOrderNextAction', () => {
  const cases: Array<[string, OrderOperationalState, OrderNextActionKind]> = [
    [
      'hold overrides payment report',
      createState({ activeHold: mockHold, paymentStatus: 'payment_reported' }),
      'release_hold',
    ],
    [
      'hold overrides paid and approved',
      createState({ activeHold: mockHold, paymentStatus: 'paid', designStatus: 'approved', fulfillmentStatus: 'ready_for_production' }),
      'release_hold',
    ],
    [
      'cancelled fulfillment has no action',
      createState({ fulfillmentStatus: 'cancelled' }),
      'none',
    ],
    [
      'cancelled payment has no action',
      createState({ paymentStatus: 'cancelled' }),
      'none',
    ],
    [
      'completed fulfillment has no action',
      createState({ fulfillmentStatus: 'completed', paymentStatus: 'paid', designStatus: 'approved' }),
      'none',
    ],
    [
      'reported payment precedes design review',
      createState({ paymentStatus: 'payment_reported', designStatus: 'awaiting_review' }),
      'verify_payment',
    ],
    [
      'reported payment precedes ready design',
      createState({ paymentStatus: 'payment_reported', designStatus: 'ready' }),
      'verify_payment',
    ],
    [
      'pending payment waits for payment',
      createState({ paymentStatus: 'pending_payment' }),
      'wait_for_payment',
    ],
    [
      'paid and in production reflects production in progress',
      createState({ paymentStatus: 'paid', fulfillmentStatus: 'in_production', designStatus: 'approved' }),
      'production_in_progress',
    ],
    [
      'paid awaiting review opens design review',
      createState({ paymentStatus: 'paid', designStatus: 'awaiting_review' }),
      'review_design',
    ],
    [
      'paid ready opens design review',
      createState({ paymentStatus: 'paid', designStatus: 'ready' }),
      'review_design',
    ],
    [
      'paid needs changes requires resolving changes',
      createState({ paymentStatus: 'paid', designStatus: 'needs_changes' }),
      'resolve_design_changes',
    ],
    [
      'paid editing requires resolving changes',
      createState({ paymentStatus: 'paid', designStatus: 'editing' }),
      'resolve_design_changes',
    ],
    [
      'paid approved is production ready with unprocessed fulfillment',
      createState({ paymentStatus: 'paid', designStatus: 'approved', fulfillmentStatus: 'unprocessed' }),
      'ready_for_production',
    ],
    [
      'paid approved is production ready with ready_for_production fulfillment',
      createState({ paymentStatus: 'paid', designStatus: 'approved', fulfillmentStatus: 'ready_for_production' }),
      'ready_for_production',
    ],
    [
      'unrecognized combination falls back to neutral none',
      createState({ paymentStatus: 'payment_failed' }),
      'none',
    ],
  ];

  for (const [description, state, expectedKind] of cases) {
    it(description, () => {
      const result = resolveOrderNextAction(state);
      assert.equal(result.kind, expectedKind);
      assert.ok(result.title.length > 0);
      assert.ok(result.description.length > 0);
      assert.ok(result.eyebrow.length > 0);
    });
  }

  it('is deterministic, returns deep-equal results for identical inputs, and does not mutate input', () => {
    const input = createState({ activeHold: mockHold, paymentStatus: 'payment_reported' });
    const inputCopy = JSON.parse(JSON.stringify(input));

    const result1 = resolveOrderNextAction(input);
    const result2 = resolveOrderNextAction(input);

    assert.deepEqual(result1, result2);
    assert.deepEqual(input, inputCopy);
  });

  it('yields correct CTAs for interactive next actions', () => {
    const holdResult = resolveOrderNextAction(createState({ activeHold: mockHold }));
    assert.equal(holdResult.kind, 'release_hold');
    assert.equal(holdResult.cta?.type, 'release_hold');

    const paymentResult = resolveOrderNextAction(createState({ paymentStatus: 'payment_reported' }));
    assert.equal(paymentResult.kind, 'verify_payment');
    assert.equal(paymentResult.cta?.type, 'confirm_payment');

    const reviewResult = resolveOrderNextAction(createState({ paymentStatus: 'paid', designStatus: 'awaiting_review' }));
    assert.equal(reviewResult.kind, 'review_design');
    assert.equal(reviewResult.cta?.type, 'navigate');

    const waitingResult = resolveOrderNextAction(createState({ paymentStatus: 'pending_payment' }));
    assert.equal(waitingResult.kind, 'wait_for_payment');
    assert.equal(waitingResult.cta, null);

    const completedResult = resolveOrderNextAction(createState({ fulfillmentStatus: 'completed' }));
    assert.equal(completedResult.kind, 'none');
    assert.equal(completedResult.cta, null);
  });
});
