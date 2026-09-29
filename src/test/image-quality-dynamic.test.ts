import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateImageQuality, type ImageQualityReport } from '../lib/image-quality.ts';

const baseQuality = {
  sourceWidth: 1000,
  sourceHeight: 1000,
  productId: 'card',
  elementWidthPct: 50,
};

function qualityFor(
  overrides: Partial<Parameters<typeof evaluateImageQuality>[0]> = {},
): ImageQualityReport {
  return evaluateImageQuality({ ...baseQuality, ...overrides });
}

test('scaling up recalculates quality from good to warning or critical', () => {
  const good = qualityFor({ scale: 1 });
  const enlarged = qualityFor({ scale: 2.5 });

  assert.equal(good.level, 'good');
  assert.ok(enlarged.level === 'warning' || enlarged.level === 'critical');
  assert.ok(enlarged.effectivePpi < good.effectivePpi);
});

test('scaling down recalculates quality from warning to good', () => {
  const warning = qualityFor({ scale: 2 });
  const improved = qualityFor({ scale: 1 });

  assert.equal(warning.level, 'warning');
  assert.equal(improved.level, 'good');
  assert.ok(improved.effectivePpi > warning.effectivePpi);
});

test('heavy crop recalculates lower effective quality', () => {
  const uncropped = qualityFor({ scale: 1, cropFraction: 1 });
  const heavilyCropped = qualityFor({ scale: 1, cropFraction: 0.2 });

  assert.equal(uncropped.level, 'good');
  assert.ok(heavilyCropped.level === 'warning' || heavilyCropped.level === 'critical');
  assert.ok(heavilyCropped.effectivePpi < uncropped.effectivePpi);
});

test('rotation does not change quality level or effective PPI', () => {
  const reports = [0, 45, 90, 180].map((rotation) => {
    const transform = { scale: 1, rotation };
    assert.equal(transform.rotation, rotation);
    return qualityFor({ scale: transform.scale });
  });

  assert.deepEqual(
    reports.map((report) => report.level),
    ['good', 'good', 'good', 'good'],
  );
  assert.deepEqual(
    reports.map((report) => report.effectivePpi),
    [reports[0].effectivePpi, reports[0].effectivePpi, reports[0].effectivePpi, reports[0].effectivePpi],
  );
});

test('opacity does not change quality level or effective PPI', () => {
  const reports = [1, 0.5, 0.1].map((opacity) => {
    assert.ok(opacity >= 0 && opacity <= 1);
    return qualityFor({ scale: 1 });
  });

  assert.deepEqual(
    reports.map((report) => report.level),
    ['good', 'good', 'good'],
  );
  assert.deepEqual(
    reports.map((report) => report.effectivePpi),
    [reports[0].effectivePpi, reports[0].effectivePpi, reports[0].effectivePpi],
  );
});

test('replacing image with lower-resolution source recalculates degraded quality', () => {
  const original = qualityFor({ sourceWidth: 2000, sourceHeight: 2000, scale: 1 });
  const replacement = qualityFor({ sourceWidth: 500, sourceHeight: 500, scale: 1 });

  assert.equal(original.level, 'good');
  assert.ok(replacement.level === 'warning' || replacement.level === 'critical');
  assert.ok(replacement.effectivePpi < original.effectivePpi);
});
