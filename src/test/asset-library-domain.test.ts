import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLibraryTransition,
  canDeleteDraft,
  canManageLibrary,
  normalizeAssetId,
  parseLibraryMetadata,
} from '../lib/domain/asset-library.ts';

const allowedTransitions = [
  ['draft', 'draft'],
  ['draft', 'published'],
  ['published', 'published'],
  ['published', 'archived'],
  ['archived', 'archived'],
  ['archived', 'published'],
] as const;

const rejectedTransitions = [
  ['draft', 'archived'],
  ['published', 'draft'],
  ['archived', 'draft'],
] as const;

test('published binary cannot become draft or accept storage mutation', () => {
  assert.throws(() => assertLibraryTransition('published', 'draft'));
  assert.throws(() => parseLibraryMetadata({ storagePath: 'other.svg' }));
  assert.deepEqual(parseLibraryMetadata({ displayName: 'Hoa' }), { displayName: 'Hoa' });
});

test('library lifecycle permits only publication, archival, restoration, and no-op transitions', () => {
  for (const [from, to] of allowedTransitions) {
    assert.doesNotThrow(() => assertLibraryTransition(from, to), `${from} -> ${to}`);
  }

  for (const [from, to] of rejectedTransitions) {
    assert.throws(
      () => assertLibraryTransition(from, to),
      new RegExp(`Invalid library transition: ${from} -> ${to}`),
    );
  }
});

test('metadata parser trims and returns only supported metadata fields', () => {
  assert.deepEqual(parseLibraryMetadata({
    displayName: '  Hoa sen  ',
    description: '  Mô tả  ',
    category: '  floral  ',
    tags: ['  hoa ', 'sen  '],
    searchKeywords: ['  mùa hè ', ' Việt Nam  '],
    sampleText: '  Tiếng Việt  ',
  }), {
    displayName: 'Hoa sen',
    description: 'Mô tả',
    category: 'floral',
    tags: ['hoa', 'sen'],
    searchKeywords: ['mùa hè', 'Việt Nam'],
    sampleText: 'Tiếng Việt',
  });
});

test('metadata parser accepts every inclusive boundary', () => {
  assert.deepEqual(parseLibraryMetadata({
    displayName: 'n'.repeat(120),
    description: '',
    category: 'c'.repeat(50),
    tags: Array.from({ length: 20 }, (_, index) => `${index}`.padStart(40, 't')),
    searchKeywords: Array.from({ length: 20 }, (_, index) => `${index}`.padStart(40, 'k')),
    sampleText: 's'.repeat(500),
  }), {
    displayName: 'n'.repeat(120),
    description: '',
    category: 'c'.repeat(50),
    tags: Array.from({ length: 20 }, (_, index) => `${index}`.padStart(40, 't')),
    searchKeywords: Array.from({ length: 20 }, (_, index) => `${index}`.padStart(40, 'k')),
    sampleText: 's'.repeat(500),
  });
});

test('metadata parser rejects non-object input and unknown client-controlled fields', () => {
  for (const input of [null, [], 'name', 42]) {
    assert.throws(() => parseLibraryMetadata(input));
  }

  for (const key of [
    'storagePath',
    'actor',
    'checksum',
    'validationId',
    'validationReceipt',
    'browserProofHash',
    'productionProofHash',
    'unknown',
  ]) {
    assert.throws(() => parseLibraryMetadata({ [key]: 'forged' }));
  }
});

test('metadata parser rejects invalid scalar bounds and types', () => {
  for (const input of [
    { displayName: '' },
    { displayName: '   ' },
    { displayName: 'n'.repeat(121) },
    { displayName: 1 },
    { description: 'd'.repeat(2001) },
    { description: null },
    { category: '' },
    { category: ' '.repeat(3) },
    { category: 'c'.repeat(51) },
    { category: false },
    { sampleText: 's'.repeat(501) },
    { sampleText: [] },
  ]) {
    assert.throws(() => parseLibraryMetadata(input));
  }
});

test('metadata parser rejects invalid tag and keyword collections', () => {
  for (const key of ['tags', 'searchKeywords'] as const) {
    for (const value of [
      'not-an-array',
      Array.from({ length: 21 }, () => 'item'),
      [''],
      ['   '],
      ['x'.repeat(41)],
      ['valid', 1],
    ]) {
      assert.throws(() => parseLibraryMetadata({ [key]: value }));
    }
  }
});

test('staff roles manage both asset kinds while non-staff roles manage neither', () => {
  for (const role of ['admin', 'editor'] as const) {
    assert.equal(canManageLibrary(role, 'sticker'), true);
    assert.equal(canManageLibrary(role, 'font-face'), true);
  }

  assert.equal(canManageLibrary('customer' as 'admin', 'sticker'), false);
  assert.equal(canManageLibrary('admin', 'template' as 'sticker'), false);
});

test('only admins can delete drafts that have never been published', () => {
  assert.equal(canDeleteDraft('admin', 'draft', null), true);
  assert.equal(canDeleteDraft('editor', 'draft', null), false);
  assert.equal(canDeleteDraft('admin', 'published', null), false);
  assert.equal(canDeleteDraft('admin', 'archived', null), false);
  assert.equal(canDeleteDraft('admin', 'draft', '2026-10-02T00:00:00.000Z'), false);
});

test('asset IDs are normalized without changing valid dashes or underscores', () => {
  assert.equal(normalizeAssetId('  Summer Rose 01  '), 'summer-rose-01');
  assert.equal(normalizeAssetId('FONT___Face---Bold'), 'font___face-bold');
  assert.equal(normalizeAssetId('two...words / together'), 'two-words-together');
  assert.equal(normalizeAssetId('already_valid-id'), 'already_valid-id');
});
