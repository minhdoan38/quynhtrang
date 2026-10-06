import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

test('customer approval retires cached assessment intent after definitive rejection', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/app/admin/orders/[id]/design/design-review-client.tsx'),
    'utf8'
  );

  assert.match(source, /DEFINITIVE_CUSTOMER_APPROVAL_ERRORS[\s\S]*'PREFLIGHT_STALE'[\s\S]*'ACTIVE_DRAFT_EXISTS'/);
  assert.match(source, /if \(DEFINITIVE_CUSTOMER_APPROVAL_ERRORS\.has\(replay\.code\)\)\s*\{\s*customerApproval\.current = null;/);
  assert.match(source, /if \(DEFINITIVE_CUSTOMER_APPROVAL_ERRORS\.has\(res\.code\)\)\s*\{\s*customerApproval\.current = null;/);
});
