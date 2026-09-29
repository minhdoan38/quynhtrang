import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateImageQuality } from '../lib/image-quality.ts';

test('evaluateImageQuality passes through badgeLabel and context metadata correctly', () => {
  const goodReport = evaluateImageQuality({
    sourceWidth: 2000,
    sourceHeight: 2000,
    productId: 'sticker',
    variantId: 'die-cut',
    patternScale: 100,
    elementWidthPct: 50,
    elementId: 'img-1',
    surfaceId: 'front',
  });

  assert.equal(goodReport.level, 'good');
  assert.equal(goodReport.badgeLabel, 'Tốt');
  assert.equal(goodReport.elementId, 'img-1');
  assert.equal(goodReport.surfaceId, 'front');

  const warningReport = evaluateImageQuality({
    sourceWidth: 1000,
    sourceHeight: 1000,
    scale: 1,
    productId: 'card',
    variantId: 'horizontal',
    patternScale: 100,
    elementWidthPct: 100,
    elementId: 'img-card',
    surfaceId: 'inside',
  });

  assert.equal(warningReport.level, 'warning');
  assert.equal(warningReport.badgeLabel, 'Có thể hơi mờ');
  assert.equal(warningReport.elementId, 'img-card');
  assert.equal(warningReport.surfaceId, 'inside');

  const criticalReport = evaluateImageQuality({
    sourceWidth: 400,
    sourceHeight: 400,
    scale: 2,
    productId: 'notebook',
    variantId: 'spiral',
    patternScale: 100,
    elementWidthPct: 80,
    elementId: 'img-notebook',
    surfaceId: 'front',
  });

  assert.equal(criticalReport.level, 'critical');
  assert.equal(criticalReport.badgeLabel, 'Ảnh quá nhỏ');
  assert.equal(criticalReport.elementId, 'img-notebook');
  assert.equal(criticalReport.surfaceId, 'front');
});
