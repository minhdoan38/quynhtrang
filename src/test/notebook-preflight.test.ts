import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  getPreflight,
  type CanvasElement,
  type DesignState,
} from '../lib/product-state.ts';

const makeTextElement = (overrides: Partial<CanvasElement> = {}): CanvasElement => ({
  id: 'text-1',
  type: 'text',
  x: 20,
  y: 20,
  width: 30,
  height: 10,
  rotation: 0,
  data: {
    text: 'Sổ tay của tôi',
    color: '#111827',
    fontFamily: 'Be Vietnam Pro',
    fontSize: 16,
    fontWeight: 'medium',
    fontStyle: 'normal',
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  ...overrides,
});

test('empty notebook cover triggers "Bìa vở chưa có nội dung"', () => {
  const state: DesignState = {
    ...createInitialState('notebook'),
    elements: [],
    backgroundColor: '#ffffff',
  };

  const preflight = getPreflight(state);
  const contentCheck = preflight.checks.find((check) => check.id === 'notebook-content');

  assert.ok(contentCheck, 'Expected notebook-content check to exist');
  assert.equal(contentCheck.level, 'warning');
  assert.equal(contentCheck.type, 'warning');
  assert.equal(contentCheck.label, 'Bìa vở chưa có nội dung');
  assert.equal(
    contentCheck.description,
    'Thêm hình ảnh, chữ hoặc sticker để bìa sổ sinh động hơn.'
  );
  assert.equal(preflight.level, 'warning');
});

test('notebook with custom background color does NOT trigger empty warning', () => {
  const state: DesignState = {
    ...createInitialState('notebook'),
    elements: [],
    backgroundColor: '#fef3c7',
  };

  const preflight = getPreflight(state);
  const contentCheck = preflight.checks.find((check) => check.id === 'notebook-content');

  assert.equal(contentCheck, undefined);
  assert.equal(
    preflight.checks.some((check) => check.label === 'Bìa vở chưa có nội dung'),
    false
  );
  assert.notEqual(preflight.level, 'error');
  assert.equal(preflight.checks.some((check) => check.id === 'notebook-binding-zone'), false);
});

test('notebook with text at x = 5 triggers "Văn bản nằm gần mép gáy sổ"', () => {
  const state: DesignState = {
    ...createInitialState('notebook'),
    elements: [makeTextElement({ x: 5 })],
    backgroundColor: '#ffffff',
  };

  const preflight = getPreflight(state);
  const bindingCheck = preflight.checks.find((check) => check.id === 'notebook-binding-zone');

  assert.ok(bindingCheck, 'Expected notebook-binding-zone check to exist');
  assert.equal(bindingCheck.level, 'warning');
  assert.equal(bindingCheck.type, 'warning');
  assert.equal(bindingCheck.label, 'Văn bản nằm gần mép gáy sổ');
  assert.equal(
    bindingCheck.description,
    'Giữ chữ quan trọng cách mép này một chút để không bị che bởi gáy hoặc lỗ lò xo.'
  );
  assert.equal(preflight.level, 'warning');
  assert.equal(preflight.checks.some((check) => check.id === 'notebook-content'), false);
});

test('notebook with text at x = 25 passes clean without binding warning', () => {
  const state: DesignState = {
    ...createInitialState('notebook'),
    elements: [makeTextElement({ x: 25 })],
    backgroundColor: '#ffffff',
  };

  const preflight = getPreflight(state);
  const bindingCheck = preflight.checks.find((check) => check.id === 'notebook-binding-zone');
  const contentCheck = preflight.checks.find((check) => check.id === 'notebook-content');

  assert.equal(bindingCheck, undefined);
  assert.equal(contentCheck, undefined);
  assert.equal(
    preflight.checks.some((check) => check.label === 'Văn bản nằm gần mép gáy sổ'),
    false
  );
  assert.equal(
    preflight.checks.some((check) => check.label === 'Bìa vở chưa có nội dung'),
    false
  );
  assert.equal(preflight.level, 'pass');
});
