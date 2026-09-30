import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../lib/product-state.ts';
import { evaluateDraftPreflight } from '../lib/services/staff-design-preflight.ts';

test('evaluateDraftPreflight returns findings and extracts warningIds', () => {
  const cardDoc = createInitialState('card');
  const assessment = evaluateDraftPreflight({
    draftId: 'draft-1',
    orderId: 'order-1',
    baseVersionId: 'ver-1',
    expectedProductionVersionId: 'ver-1',
    revision: 1,
    document: cardDoc,
    actorUserId: 'user-1',
    leaseEpoch: 1,
  });

  assert.equal(assessment.draftId, 'draft-1');
  assert.equal(assessment.revision, 1);
  assert.ok(assessment.id);
  assert.ok(assessment.documentHash);
  assert.ok(Array.isArray(assessment.warningIds));
  assert.equal(typeof assessment.findings.level, 'string');
});

test('evaluateDraftPreflight detects blocking errors on invalid sticker', () => {
  const stickerDoc = createInitialState('sticker');
  stickerDoc.elements = []; // Empty sticker content gives error

  const assessment = evaluateDraftPreflight({
    draftId: 'draft-2',
    orderId: 'order-1',
    baseVersionId: 'ver-1',
    expectedProductionVersionId: 'ver-1',
    revision: 2,
    document: stickerDoc,
    actorUserId: 'user-1',
    leaseEpoch: 1,
  });

  assert.equal(assessment.findings.level, 'error');
  const hasContentError = assessment.findings.checks.some(
    (c) => c.id === 'sticker-content' && c.level === 'error'
  );
  assert.equal(hasContentError, true);
});
