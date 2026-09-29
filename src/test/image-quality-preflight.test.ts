import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  getPreflight,
  type CanvasElement,
  type DesignState,
} from '../lib/product-state.ts';

test('preflight checks include elementId and surfaceId for image elements', () => {
  const base = createInitialState('sticker');
  const imageElement: CanvasElement = {
    id: 'img-sticker-1',
    type: 'image',
    x: 10,
    y: 10,
    width: 50,
    height: 50,
    rotation: 0,
    surface: 'front',
    data: {
      src: 'blob:sticker.png',
      sourceWidth: 2000,
      sourceHeight: 2000,
    },
  };

  const state: DesignState = {
    ...base,
    elements: [imageElement],
  };

  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'image-quality-img-sticker-1');

  assert.ok(check, 'Expected image quality check for img-sticker-1');
  assert.equal(check.elementId, 'img-sticker-1');
  assert.equal(check.surfaceId, 'front');
  assert.equal(check.level, 'pass');
  assert.equal(check.type, 'pass');
  assert.equal(check.label, 'Chất lượng ảnh đạt chuẩn');
  assert.ok(check.description);
});

test('multiple images across different card surfaces get evaluated and referenced with their own surfaceId', () => {
  const base = createInitialState('card');
  const frontImage: CanvasElement = {
    id: 'img-card-front',
    type: 'image',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotation: 0,
    surface: 'front',
    data: {
      src: 'blob:front.png',
      sourceWidth: 2400,
      sourceHeight: 2400,
      scale: 1,
    },
  };

  const insideImage: CanvasElement = {
    id: 'img-card-inside',
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    surface: 'inside',
    data: {
      src: 'blob:inside.png',
      sourceWidth: 1000,
      sourceHeight: 1000,
      scale: 1,
    },
  };

  const state: DesignState = {
    ...base,
    elements: [frontImage, insideImage],
  };

  const preflight = getPreflight(state);
  const frontCheck = preflight.checks.find((c) => c.id === 'image-quality-img-card-front');
  const insideCheck = preflight.checks.find((c) => c.id === 'image-quality-img-card-inside');

  assert.ok(frontCheck, 'Expected front check');
  assert.equal(frontCheck.elementId, 'img-card-front');
  assert.equal(frontCheck.surfaceId, 'front');
  assert.equal(frontCheck.level, 'pass');

  assert.ok(insideCheck, 'Expected inside check');
  assert.equal(insideCheck.elementId, 'img-card-inside');
  assert.equal(insideCheck.surfaceId, 'inside');
  assert.equal(insideCheck.level, 'warning');
  assert.equal(insideCheck.label, 'Ảnh có thể hơi mờ khi in');
});

test('low resolution image triggers warning with exact label "Ảnh có thể hơi mờ khi in"', () => {
  const base = createInitialState('notebook');
  const lowResImage: CanvasElement = {
    id: 'img-notebook-warning',
    type: 'image',
    x: 10,
    y: 10,
    width: 80,
    height: 80,
    rotation: 0,
    surface: 'front',
    data: {
      src: 'blob:lowres.png',
      sourceWidth: 900,
      sourceHeight: 900,
      scale: 1,
    },
  };

  const state: DesignState = {
    ...base,
    elements: [lowResImage],
  };

  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'image-quality-img-notebook-warning');

  assert.ok(check, 'Expected warning check');
  assert.equal(check.level, 'warning');
  assert.equal(check.type, 'warning');
  assert.equal(check.label, 'Ảnh có thể hơi mờ khi in');
  assert.equal(check.elementId, 'img-notebook-warning');
  assert.equal(check.surfaceId, 'front');
  assert.equal(preflight.level, 'warning');
});

test('critical resolution image triggers error with exact label "Ảnh quá nhỏ để in rõ"', () => {
  const base = createInitialState('card');
  const tinyImage: CanvasElement = {
    id: 'img-card-critical',
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    surface: 'inside',
    data: {
      src: 'blob:tiny.png',
      sourceWidth: 200,
      sourceHeight: 200,
      scale: 2,
    },
  };

  const state: DesignState = {
    ...base,
    elements: [tinyImage],
  };

  const preflight = getPreflight(state);
  const check = preflight.checks.find((c) => c.id === 'image-quality-img-card-critical');

  assert.ok(check, 'Expected critical error check');
  assert.equal(check.level, 'error');
  assert.equal(check.type, 'error');
  assert.equal(check.label, 'Ảnh quá nhỏ để in rõ');
  assert.equal(check.elementId, 'img-card-critical');
  assert.equal(check.surfaceId, 'inside');
  assert.equal(preflight.level, 'error');
});
