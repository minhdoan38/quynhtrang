import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateElementSafety,
  isElementImportant,
  type EvaluateSafetyParams,
} from '../lib/safe-area.ts';

test('isElementImportant: classifies text, qr, barcode, logo as important and others as decorative', () => {
  assert.equal(isElementImportant('text'), true);
  assert.equal(isElementImportant('qr'), true);
  assert.equal(isElementImportant('barcode'), true);
  assert.equal(isElementImportant('logo'), true);

  assert.equal(isElementImportant('shape'), false);
  assert.equal(isElementImportant('image'), false);
  assert.equal(isElementImportant('sticker'), false);
  assert.equal(isElementImportant('unknown'), false);
});

test('evaluateElementSafety: returns safe for centered important text within safe area', () => {
  const params: EvaluateSafetyParams = {
    productId: 'wrapping',
    canvasWidth: 100,
    canvasHeight: 100,
    element: {
      id: 'txt-center',
      type: 'text',
      x: 20,
      y: 20,
      width: 40,
      height: 20,
    },
  };

  const report = evaluateElementSafety(params);
  assert.deepEqual(report, { risk: 'safe' });
});

test('evaluateElementSafety: returns near-edge outer-edge when text crosses 4% inset margin', () => {
  const params: EvaluateSafetyParams = {
    productId: 'wrapping',
    canvasWidth: 100,
    canvasHeight: 100,
    element: {
      id: 'txt-edge',
      type: 'text',
      x: 2,
      y: 20,
      width: 20,
      height: 10,
    },
  };

  const report = evaluateElementSafety(params);
  assert.equal(report.risk, 'near-edge');
  assert.equal(report.regionType, 'outer-edge');
  assert.equal(report.badgeLabel, 'Hơi sát mép');
  assert.equal(report.description, 'Chi tiết này hơi sát mép.');
  assert.equal(
    report.advice,
    'Di chuyển vào trong một chút để tránh bị sát hoặc mất khi thành phẩm được cắt.'
  );
});

test('evaluateElementSafety: returns high-risk outside-bounds when important text crosses outside canvas bounds', () => {
  const params: EvaluateSafetyParams = {
    productId: 'wrapping',
    canvasWidth: 100,
    canvasHeight: 100,
    element: {
      id: 'txt-out',
      type: 'text',
      x: -5,
      y: 20,
      width: 20,
      height: 10,
    },
  };

  const report = evaluateElementSafety(params);
  assert.equal(report.risk, 'high-risk');
  assert.equal(report.regionType, 'outside-bounds');
  assert.equal(report.badgeLabel, 'Một phần chi tiết nằm ngoài mép');
  assert.equal(report.description, 'Một phần chi tiết này nằm ngoài vùng thành phẩm.');
  assert.equal(report.advice, 'Hãy kéo chi tiết này vào trong để tránh bị mất.');
});

test('evaluateElementSafety: returns near-edge notebook-binding when intersecting left 12% margin', () => {
  const params: EvaluateSafetyParams = {
    productId: 'notebook',
    canvasWidth: 100,
    canvasHeight: 100,
    element: {
      id: 'txt-nb',
      type: 'text',
      x: 10,
      y: 20,
      width: 20,
      height: 10,
    },
  };

  const report = evaluateElementSafety(params);
  assert.equal(report.risk, 'near-edge');
  assert.equal(report.regionType, 'notebook-binding');
  assert.equal(report.badgeLabel, 'Khá gần gáy');
  assert.equal(report.description, 'Chi tiết này đang khá gần gáy.');
  assert.equal(report.advice, 'Di chuyển chữ hoặc chi tiết quan trọng vào trong một chút.');
});

test('evaluateElementSafety: returns near-edge card-fold when intersecting fold margin on inside surface', () => {
  const horizontalParams: EvaluateSafetyParams = {
    productId: 'card',
    surface: 'inside',
    cardOrientation: 'horizontal',
    canvasWidth: 296,
    canvasHeight: 105,
    element: {
      id: 'txt-fold-h',
      type: 'text',
      x: 145,
      y: 30,
      width: 20,
      height: 10,
    },
  };

  const horizontalReport = evaluateElementSafety(horizontalParams);
  assert.equal(horizontalReport.risk, 'near-edge');
  assert.equal(horizontalReport.regionType, 'card-fold');
  assert.equal(horizontalReport.badgeLabel, 'Quá gần nếp gấp');
  assert.equal(horizontalReport.description, 'Chi tiết quan trọng đang nằm quá gần nếp gấp.');
  assert.equal(horizontalReport.advice, 'Kéo chi tiết lệch khỏi đường gấp để tránh bị gãy nét chữ.');

  const verticalParams: EvaluateSafetyParams = {
    productId: 'card',
    surface: 'inside',
    cardOrientation: 'vertical',
    canvasWidth: 210,
    canvasHeight: 148,
    element: {
      id: 'txt-fold-v',
      type: 'text',
      x: 104,
      y: 30,
      width: 15,
      height: 10,
    },
  };

  const verticalReport = evaluateElementSafety(verticalParams);
  assert.equal(verticalReport.risk, 'near-edge');
  assert.equal(verticalReport.regionType, 'card-fold');

  const normalizedParams: EvaluateSafetyParams = {
    productId: 'card',
    surface: 'inside',
    cardOrientation: 'horizontal',
    canvasWidth: 100,
    canvasHeight: 100,
    element: {
      id: 'txt-fold-norm',
      type: 'text',
      x: 49,
      y: 30,
      width: 10,
      height: 10,
    },
  };

  const normalizedReport = evaluateElementSafety(normalizedParams);
  assert.equal(normalizedReport.risk, 'near-edge');
  assert.equal(normalizedReport.regionType, 'card-fold');
});

test('evaluateElementSafety: background shapes and images near edges remain safe within bounds', () => {
  const shapeReport = evaluateElementSafety({
    productId: 'wrapping',
    canvasWidth: 100,
    canvasHeight: 100,
    element: {
      id: 'shape-edge',
      type: 'shape',
      x: 1,
      y: 1,
      width: 98,
      height: 98,
    },
  });
  assert.deepEqual(shapeReport, { risk: 'safe' });

  const imageReport = evaluateElementSafety({
    productId: 'notebook',
    canvasWidth: 100,
    canvasHeight: 100,
    element: {
      id: 'img-edge',
      type: 'image',
      x: 2,
      y: 2,
      width: 30,
      height: 30,
    },
  });
  assert.deepEqual(imageReport, { risk: 'safe' });
});
