import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  PRODUCT_PHYSICAL_WIDTH_INCHES,
  PRODUCT_QUALITY_THRESHOLDS,
  evaluateImageQuality,
} from '../lib/image-quality.ts';
import {
  createInitialState,
  getPreflight,
  type CanvasElement,
  type ProductId,
} from '../lib/product-state.ts';

const selectionOverlaySource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/selection-overlay.tsx'),
  'utf8',
);
const qualitySheetSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/image-quality-sheet.tsx'),
  'utf8',
);

function makeImage(
  id: string,
  sourceWidth: number,
  overrides: Partial<CanvasElement> = {},
): CanvasElement {
  const { data: overrideData, ...restOverrides } = overrides;
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    surface: 'front',
    data: {
      src: `blob:${id}.png`,
      sourceWidth,
      sourceHeight: sourceWidth,
      scale: 1,
      ...((overrideData ?? {}) as Record<string, unknown>),
    },
    ...restOverrides,
  };
}

test('evaluates images at actual printed physical size for wrapping, card, sticker, and notebook', () => {
  const cases: Array<{ productId: ProductId; sourceWidth: number }> = [
    { productId: 'wrapping', sourceWidth: 7200 },
    { productId: 'card', sourceWidth: 1800 },
    { productId: 'sticker', sourceWidth: 600 },
    { productId: 'notebook', sourceWidth: 1800 },
  ];

  for (const { productId, sourceWidth } of cases) {
    const report = evaluateImageQuality({
      productId,
      sourceWidth,
      sourceHeight: sourceWidth,
      elementWidthPct: 100,
    });

    assert.equal(report.level, 'good', `${productId} should be good at source size`);
    assert.equal(report.badgeLabel, 'Tốt');
    assert.ok(
      report.effectivePpi >= PRODUCT_QUALITY_THRESHOLDS[productId].goodMinPpi,
      `${productId} must use printed width ${PRODUCT_PHYSICAL_WIDTH_INCHES[productId]}in`,
    );
  }

  assert.deepEqual(PRODUCT_PHYSICAL_WIDTH_INCHES, {
    wrapping: 33.11,
    card: 5.83,
    sticker: 1.97,
    notebook: 5.83,
  });
});

test('enlarging image degrades effective PPI and shrinking restores good quality', () => {
  const good = evaluateImageQuality({
    productId: 'card',
    sourceWidth: 2400,
    sourceHeight: 2400,
    elementWidthPct: 50,
    scale: 1,
  });
  const enlarged = evaluateImageQuality({
    productId: 'card',
    sourceWidth: 2400,
    sourceHeight: 2400,
    elementWidthPct: 50,
    scale: 4,
  });
  const shrunk = evaluateImageQuality({
    productId: 'card',
    sourceWidth: 2400,
    sourceHeight: 2400,
    elementWidthPct: 50,
    scale: 1,
  });

  assert.equal(good.badgeLabel, 'Tốt');
  assert.ok(enlarged.badgeLabel === 'Có thể hơi mờ' || enlarged.badgeLabel === 'Ảnh quá nhỏ');
  assert.ok(enlarged.effectivePpi < good.effectivePpi);
  assert.equal(shrunk.badgeLabel, 'Tốt');
  assert.equal(shrunk.effectivePpi, good.effectivePpi);
});

test('heavy crop reduces available source pixels and effective PPI', () => {
  const uncropped = evaluateImageQuality({
    productId: 'card',
    sourceWidth: 2400,
    sourceHeight: 2400,
    elementWidthPct: 50,
    cropFraction: 1,
  });
  const heavilyCropped = evaluateImageQuality({
    productId: 'card',
    sourceWidth: 2400,
    sourceHeight: 2400,
    elementWidthPct: 50,
    cropFraction: 0.2,
  });

  assert.ok((heavilyCropped.effectivePixels ?? 0) < (uncropped.effectivePixels ?? 0));
  assert.ok(heavilyCropped.effectivePpi < uncropped.effectivePpi);
  assert.ok(
    heavilyCropped.badgeLabel === 'Có thể hơi mờ' || heavilyCropped.badgeLabel === 'Ảnh quá nhỏ',
  );
});

test('rotation and opacity do not degrade effective PPI', () => {
  const base = makeImage('transform-base', 2400);
  const rotated = makeImage('transform-rotated', 2400, { rotation: 90 });
  const transparent = makeImage('transform-transparent', 2400, {
    data: { opacity: 0.35 },
  });

  const reportFor = (element: CanvasElement) => {
    const data = element.data as Record<string, unknown>;
    return evaluateImageQuality({
      productId: 'card',
      sourceWidth: data.sourceWidth as number,
      sourceHeight: data.sourceHeight as number,
      scale: (data.scale as number | undefined) ?? 1,
      elementWidthPct: element.width,
    });
  };
  const reports = [base, rotated, transparent].map(reportFor);

  assert.deepEqual(
    reports.map((report) => report.badgeLabel),
    ['Tốt', 'Tốt', 'Tốt'],
  );
  assert.deepEqual(
    reports.map((report) => report.effectivePpi),
    [reports[0].effectivePpi, reports[0].effectivePpi, reports[0].effectivePpi],
  );
});

test('contextual badge renders exact plain-language labels without raw DPI or PPI', () => {
  const labels = [
    evaluateImageQuality({ productId: 'card', sourceWidth: 2400, elementWidthPct: 50 }).badgeLabel,
    evaluateImageQuality({ productId: 'card', sourceWidth: 1000, elementWidthPct: 100 }).badgeLabel,
    evaluateImageQuality({ productId: 'card', sourceWidth: 200, elementWidthPct: 100 }).badgeLabel,
  ];

  assert.deepEqual(labels, ['Tốt', 'Có thể hơi mờ', 'Ảnh quá nhỏ']);
  assert.match(selectionOverlaySource, /<span>\{qualityReport\.badgeLabel\}<\/span>/);
  assert.doesNotMatch(selectionOverlaySource, /\b(?:dpi|ppi)\b/i);
  assert.doesNotMatch(qualitySheetSource, /\b(?:dpi|ppi)\b/i);
});

test('tapping quality badge exposes scale-down and replace-image actions', () => {
  assert.match(selectionOverlaySource, /onQualityClick\?\.?\(\)/);
  assert.match(selectionOverlaySource, /role="button"/);
  assert.match(qualitySheetSource, /<span>Thu nhỏ ảnh<\/span>/);
  assert.match(qualitySheetSource, /<span>Thay ảnh<\/span>/);
  assert.match(qualitySheetSource, /onScaleDown\(report\.recommendedScale\)/);
  assert.match(qualitySheetSource, /onReplaceImage\(\)/);
});

test('preflight warnings retain exact elementId and surfaceId across products', () => {
  const cases: Array<{ productId: ProductId; id: string; sourceWidth: number; surface: 'front' | 'inside' }> = [
    { productId: 'wrapping', id: 'img-wrapping-warning', sourceWidth: 350, surface: 'front' },
    { productId: 'card', id: 'img-card-warning', sourceWidth: 1000, surface: 'inside' },
    { productId: 'sticker', id: 'img-sticker-warning', sourceWidth: 200, surface: 'front' },
    { productId: 'notebook', id: 'img-notebook-warning', sourceWidth: 900, surface: 'front' },
  ];

  for (const { productId, id, sourceWidth, surface } of cases) {
    const state = createInitialState(productId);
    const image = makeImage(id, sourceWidth, { surface });
    const preflight = getPreflight({ ...state, elements: [image] });
    const check = preflight.checks.find((entry) => entry.id === `image-quality-${id}`);

    assert.ok(check, `Expected image quality check for ${id}`);
    assert.equal(check.elementId, id);
    assert.equal(check.surfaceId, surface);
    assert.ok(check.level === 'warning' || check.level === 'error');
  }
});
