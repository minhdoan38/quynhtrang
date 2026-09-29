import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  getPreflight,
  type DesignState,
} from '../lib/product-state.ts';

test('important element near edge produces preflight warning with elementId and surfaceId', () => {
  const state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [
      {
        id: 'txt-near-edge',
        type: 'text',
        x: 2,
        y: 20,
        width: 30,
        height: 10,
        rotation: 0,
        surface: 'front',
      },
    ],
  };

  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'safe-area-txt-near-edge');

  assert.ok(check, 'Expected safe area check for txt-near-edge');
  assert.equal(check.level, 'warning');
  assert.equal(check.type, 'warning');
  assert.equal(check.elementId, 'txt-near-edge');
  assert.equal(check.surfaceId, 'front');
  assert.equal(check.label, 'Hơi sát mép');
  assert.equal(check.description, 'Chi tiết này hơi sát mép.');
  assert.equal(preflight.level, 'warning');
});

test('important element outside bounds produces preflight error with elementId and surfaceId', () => {
  const state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [
      {
        id: 'txt-outside',
        type: 'text',
        x: -5,
        y: 20,
        width: 30,
        height: 10,
        rotation: 0,
        surface: 'front',
      },
    ],
  };

  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'safe-area-txt-outside');

  assert.ok(check, 'Expected safe area check for txt-outside');
  assert.equal(check.level, 'error');
  assert.equal(check.type, 'error');
  assert.equal(check.elementId, 'txt-outside');
  assert.equal(check.surfaceId, 'front');
  assert.equal(check.label, 'Một phần chi tiết nằm ngoài mép');
  assert.equal(check.description, 'Một phần chi tiết này nằm ngoài vùng thành phẩm.');
  assert.equal(preflight.level, 'error');
});

test('background shape or decorative image near edge does NOT trigger safe area warning', () => {
  const state: DesignState = {
    ...createInitialState('wrapping'),
    elements: [
      {
        id: 'shape-edge',
        type: 'shape',
        x: 1,
        y: 1,
        width: 40,
        height: 40,
        rotation: 0,
        surface: 'front',
      },
      {
        id: 'img-edge',
        type: 'image',
        x: 2,
        y: 2,
        width: 50,
        height: 50,
        rotation: 0,
        surface: 'front',
        data: {
          src: 'https://example.com/test.jpg',
          sourceWidth: 2000,
          sourceHeight: 2000,
        },
      },
    ],
  };

  const preflight = getPreflight(state);
  const safeAreaChecks = preflight.checks.filter((c) => c.id.startsWith('safe-area-'));
  assert.equal(safeAreaChecks.length, 0);
});

test('card inside fold warning has surfaceId: inside', () => {
  const state: DesignState = {
    ...createInitialState('card'),
    productOptions: {
      surface: 'inside',
      orientation: 'horizontal',
    },
    elements: [
      {
        id: 'txt-fold',
        type: 'text',
        x: 49,
        y: 30,
        width: 10,
        height: 10,
        rotation: 0,
        surface: 'inside',
      },
    ],
  };

  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'safe-area-txt-fold');

  assert.ok(check, 'Expected safe area fold check for txt-fold');
  assert.equal(check.level, 'warning');
  assert.equal(check.type, 'warning');
  assert.equal(check.elementId, 'txt-fold');
  assert.equal(check.surfaceId, 'inside');
  assert.equal(check.label, 'Quá gần nếp gấp');
  assert.equal(check.description, 'Chi tiết quan trọng đang nằm quá gần nếp gấp.');
});

test('notebook binding warning has surfaceId: front', () => {
  const state: DesignState = {
    ...createInitialState('notebook'),
    backgroundColor: '#ffffff',
    elements: [
      {
        id: 'txt-nb-binding',
        type: 'text',
        x: 5,
        y: 30,
        width: 20,
        height: 10,
        rotation: 0,
        surface: 'front',
      },
    ],
  };

  const preflight = getPreflight(state);
  const safeAreaCheck = preflight.checks.find((c) => c.id === 'safe-area-txt-nb-binding');

  assert.ok(safeAreaCheck, 'Expected safe area check for txt-nb-binding');
  assert.equal(safeAreaCheck.level, 'warning');
  assert.equal(safeAreaCheck.type, 'warning');
  assert.equal(safeAreaCheck.elementId, 'txt-nb-binding');
  assert.equal(safeAreaCheck.surfaceId, 'front');
  assert.equal(safeAreaCheck.label, 'Khá gần gáy');
  assert.equal(safeAreaCheck.description, 'Chi tiết này đang khá gần gáy.');

  // Also verify legacy notebook-binding-zone check exists and compatibility retained
  const legacyCheck = preflight.checks.find((c) => c.id === 'notebook-binding-zone');
  assert.ok(legacyCheck, 'Expected legacy notebook-binding-zone check to exist');
  assert.equal(legacyCheck.level, 'warning');
});
