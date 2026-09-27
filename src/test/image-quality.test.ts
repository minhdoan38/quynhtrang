import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateImageQuality } from '../lib/image-quality.ts';

test('evaluateImageQuality returns "Ảnh đẹp" for high-resolution images', () => {
  const report = evaluateImageQuality({
    sourceWidth: 2000,
    sourceHeight: 1500,
    scale: 1,
    cropFraction: 1,
  });
  assert.equal(report.level, 'good');
  assert.equal(report.badgeLabel, 'Ảnh đẹp');
  assert.equal(report.effectivePixels, 1500);
});

test('evaluateImageQuality degrades to "Có thể hơi mờ" when scaled up', () => {
  const report = evaluateImageQuality({
    sourceWidth: 1000,
    sourceHeight: 1000,
    scale: 2.5, // 1000 / 2.5 = 400 effectivePixels
    cropFraction: 1,
  });
  assert.equal(report.level, 'warning');
  assert.equal(report.badgeLabel, 'Có thể hơi mờ');
  assert.equal(report.effectivePixels, 400);
});

test('evaluateImageQuality degrades to "Ảnh quá nhỏ" for small or heavy crops', () => {
  const report = evaluateImageQuality({
    sourceWidth: 600,
    sourceHeight: 600,
    scale: 2.5,
    cropFraction: 0.5, // 600 * 0.5 / 2.5 = 120 effectivePixels
  });
  assert.equal(report.level, 'critical');
  assert.equal(report.badgeLabel, 'Ảnh quá nhỏ');
  assert.equal(report.effectivePixels, 120);
});

test('evaluateImageQuality improves when user scales down', () => {
  const warningReport = evaluateImageQuality({
    sourceWidth: 800,
    sourceHeight: 800,
    scale: 2.0, // 400 -> warning
  });
  assert.equal(warningReport.level, 'warning');

  const improvedReport = evaluateImageQuality({
    sourceWidth: 800,
    sourceHeight: 800,
    scale: 1.0, // 800 -> good
  });
  assert.equal(improvedReport.level, 'good');
});
