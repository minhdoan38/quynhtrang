import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateImageQuality } from '../lib/image-quality.ts';

test('uses the three customer quality labels at product PPI thresholds', () => {
  const good = evaluateImageQuality({
    sourceWidth: 1000,
    sourceHeight: 1000,
    productId: 'sticker',
  });
  const warning = evaluateImageQuality({
    sourceWidth: 1000,
    sourceHeight: 1000,
    productId: 'card',
  });
  const critical = evaluateImageQuality({
    sourceWidth: 600,
    sourceHeight: 600,
    productId: 'notebook',
  });

  assert.deepEqual(
    [good.badgeLabel, warning.badgeLabel, critical.badgeLabel],
    ['Tốt', 'Có thể hơi mờ', 'Ảnh quá nhỏ'],
  );
  assert.deepEqual(
    [good.level, warning.level, critical.level],
    ['good', 'warning', 'critical'],
  );
});

test('judges the same source pixels against actual printed product size', () => {
  const sticker = evaluateImageQuality({
    sourceWidth: 1000,
    sourceHeight: 1200,
    productId: 'sticker',
  });
  const enlargedNotebook = evaluateImageQuality({
    sourceWidth: 1000,
    sourceHeight: 1200,
    productId: 'notebook',
    scale: 2,
  });

  assert.equal(sticker.effectivePpi, Math.round(1000 / 1.97));
  assert.equal(sticker.level, 'good');
  assert.equal(enlargedNotebook.effectivePpi, Math.round(1000 / (5.83 * 2)));
  assert.equal(enlargedNotebook.level, 'critical');
});

test('recommends the scale that reaches good print quality', () => {
  const report = evaluateImageQuality({
    sourceWidth: 1000,
    sourceHeight: 1000,
    productId: 'card',
    scale: 1,
  });

  assert.equal(report.level, 'warning');
  assert.equal(report.canScaleDown, true);
  assert.equal(report.recommendedScale, 1000 / (5.83 * 220));
  assert.ok(report.recommendedScale < 1);

  const improved = evaluateImageQuality({
    sourceWidth: 1000,
    sourceHeight: 1000,
    productId: 'card',
    scale: report.recommendedScale,
  });
  assert.equal(improved.level, 'good');
});
