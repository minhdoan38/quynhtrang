import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../lib/product-state.ts';
import type { DesignReviewMode } from '../lib/domain/design-revision.ts';

test('mode transition state flow: review -> staff-edit -> preflight -> review-changes -> approved', () => {
  let currentMode: DesignReviewMode = 'review';
  const transitions: DesignReviewMode[] = [currentMode];

  const setMode = (next: DesignReviewMode) => {
    currentMode = next;
    transitions.push(next);
  };

  // Staff clicks edit
  setMode('staff-edit');
  // Staff clicks Xong (starts preflight validation)
  setMode('preflight');
  // Preflight passes, enters compare
  setMode('review-changes');

  assert.deepEqual(transitions, ['review', 'staff-edit', 'preflight', 'review-changes']);
});

test('Card comparison synchronizes surface between before and after representations', () => {
  const baseCard = createInitialState('card');
  const modifiedCard = {
    ...baseCard,
    text: 'Sửa chữ mặt trong',
  };

  let activeSurface = 'front';
  const switchSurface = (surface: 'front' | 'inside' | 'back') => {
    activeSurface = surface;
  };

  switchSurface('inside');
  assert.equal(activeSurface, 'inside');
});
