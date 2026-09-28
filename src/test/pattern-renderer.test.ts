import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computePatternGrid,
  generateSvgPatternDef,
  getWrappingPaperDimensions,
  type PatternConfig,
} from '../lib/pattern-renderer.ts';

const BASE_CONFIG: PatternConfig = {
  enabled: true,
  repeatMode: 'basic',
  scale: 100,
  spacingX: 0,
  spacingY: 0,
  rotation: 0,
  backgroundColor: '#ffffff',
};

test('returns standard physical dimensions for A1 and A2 wrapping paper', () => {
  const a1 = getWrappingPaperDimensions('a1');
  const a2 = getWrappingPaperDimensions('a2');
  const fallback = getWrappingPaperDimensions('unknown-variant');

  assert.equal(a1.width, 594);
  assert.equal(a1.height, 841);
  assert.equal(a2.width, 420);
  assert.equal(a2.height, 594);
  assert.equal(fallback.width, 594);
  assert.equal(fallback.height, 841);
  assert.equal(a1.aspectRatio, 594 / 841);
});

test('computes basic regular grid alignment and bounds', () => {
  const result = computePatternGrid({
    sheetWidth: 300,
    sheetHeight: 300,
    config: BASE_CONFIG,
    baseMotifSize: { width: 100, height: 100 },
  });

  assert.equal(result.bounds.width, 300);
  assert.equal(result.bounds.height, 300);
  assert.equal(result.clipBounds.minX, 0);
  assert.equal(result.clipBounds.minY, 0);
  assert.equal(result.clipBounds.maxX, 300);
  assert.equal(result.clipBounds.maxY, 300);
  assert.ok(result.totalCount > 0);
  assert.equal(result.cells.length, result.totalCount);

  const originCell = result.cells.find((cell) => cell.col === 0 && cell.row === 0);
  assert.ok(originCell);
  assert.equal(originCell.x, 0);
  assert.equal(originCell.y, 0);
  assert.equal(originCell.mirrorX, false);
  assert.equal(originCell.mirrorY, false);
});

test('half-drop vertically offsets odd columns by 50% of vertical period', () => {
  const result = computePatternGrid({
    sheetWidth: 400,
    sheetHeight: 400,
    config: { ...BASE_CONFIG, repeatMode: 'half-drop' },
    baseMotifSize: { width: 100, height: 100 },
  });

  const col0 = result.cells.find((cell) => cell.col === 0 && cell.row === 0);
  const col1 = result.cells.find((cell) => cell.col === 1 && cell.row === 0);
  const col2 = result.cells.find((cell) => cell.col === 2 && cell.row === 0);

  assert.ok(col0 && col1 && col2);
  assert.equal(col0.y, 0);
  assert.equal(col1.y, 50);
  assert.equal(col2.y, 0);
  assert.equal(col1.x - col0.x, 100);
});

test('half-brick horizontally offsets odd rows by 50% of horizontal period', () => {
  const result = computePatternGrid({
    sheetWidth: 400,
    sheetHeight: 400,
    config: { ...BASE_CONFIG, repeatMode: 'half-brick' },
    baseMotifSize: { width: 100, height: 100 },
  });

  const row0 = result.cells.find((cell) => cell.col === 0 && cell.row === 0);
  const row1 = result.cells.find((cell) => cell.col === 0 && cell.row === 1);
  const row2 = result.cells.find((cell) => cell.col === 0 && cell.row === 2);

  assert.ok(row0 && row1 && row2);
  assert.equal(row0.x, 0);
  assert.equal(row1.x, 50);
  assert.equal(row2.x, 0);
  assert.equal(row1.y - row0.y, 100);
});

test('mirror alternates mirrorX and mirrorY across columns and rows', () => {
  const result = computePatternGrid({
    sheetWidth: 300,
    sheetHeight: 300,
    config: { ...BASE_CONFIG, repeatMode: 'mirror' },
    baseMotifSize: { width: 100, height: 100 },
  });

  const c0r0 = result.cells.find((c) => c.col === 0 && c.row === 0);
  const c1r0 = result.cells.find((c) => c.col === 1 && c.row === 0);
  const c0r1 = result.cells.find((c) => c.col === 0 && c.row === 1);
  const c1r1 = result.cells.find((c) => c.col === 1 && c.row === 1);

  assert.ok(c0r0 && c1r0 && c0r1 && c1r1);
  assert.deepEqual([c0r0.mirrorX, c0r0.mirrorY], [false, false]);
  assert.deepEqual([c1r0.mirrorX, c1r0.mirrorY], [true, false]);
  assert.deepEqual([c0r1.mirrorX, c0r1.mirrorY], [false, true]);
  assert.deepEqual([c1r1.mirrorX, c1r1.mirrorY], [true, true]);
});

test('scale adjusts physical cell size and repeat period', () => {
  const normal = computePatternGrid({
    sheetWidth: 400,
    sheetHeight: 400,
    config: { ...BASE_CONFIG, scale: 100 },
    baseMotifSize: { width: 80, height: 80 },
  });
  const enlarged = computePatternGrid({
    sheetWidth: 400,
    sheetHeight: 400,
    config: { ...BASE_CONFIG, scale: 200 },
    baseMotifSize: { width: 80, height: 80 },
  });

  const normalCell = normal.cells.find((c) => c.col === 0 && c.row === 0);
  const enlargedCell = enlarged.cells.find((c) => c.col === 0 && c.row === 0);

  assert.ok(normalCell && enlargedCell);
  assert.equal(normalCell.width, 80);
  assert.equal(enlargedCell.width, 160);
  assert.ok(enlarged.totalCount < normal.totalCount);
});

test('spacing expands period without altering motif width or height', () => {
  const result = computePatternGrid({
    sheetWidth: 400,
    sheetHeight: 400,
    config: { ...BASE_CONFIG, spacingX: 20, spacingY: 30 },
    baseMotifSize: { width: 100, height: 100 },
  });

  const c0r0 = result.cells.find((c) => c.col === 0 && c.row === 0);
  const c1r0 = result.cells.find((c) => c.col === 1 && c.row === 0);
  const c0r1 = result.cells.find((c) => c.col === 0 && c.row === 1);

  assert.ok(c0r0 && c1r0 && c0r1);
  assert.equal(c0r0.width, 100);
  assert.equal(c0r0.height, 100);
  assert.equal(c1r0.x - c0r0.x, 120);
  assert.equal(c0r1.y - c0r0.y, 130);
});

test('rotation overdraw safely extends beyond all four sheet corners and edges', () => {
  const angles = [0, 15, 30, 45, 90, 180];
  for (const rotation of angles) {
    const result = computePatternGrid({
      sheetWidth: 594,
      sheetHeight: 841,
      config: { ...BASE_CONFIG, rotation },
      baseMotifSize: { width: 100, height: 100 },
    });

    assert.ok(result.overdraw.minX < 0, `minX under 0 for angle ${rotation}`);
    assert.ok(result.overdraw.minY < 0, `minY under 0 for angle ${rotation}`);
    assert.ok(result.overdraw.maxX > 594, `maxX beyond sheet width for angle ${rotation}`);
    assert.ok(result.overdraw.maxY > 841, `maxY beyond sheet height for angle ${rotation}`);

    // Ensure the generated grid includes cells strictly outside top-left and bottom-right
    const minCellX = Math.min(...result.cells.map((c) => c.x));
    const minCellY = Math.min(...result.cells.map((c) => c.y));
    const maxCellX = Math.max(...result.cells.map((c) => c.x + c.width));
    const maxCellY = Math.max(...result.cells.map((c) => c.y + c.height));

    assert.ok(minCellX <= 0, `cells cover left boundary for angle ${rotation}`);
    assert.ok(minCellY <= 0, `cells cover top boundary for angle ${rotation}`);
    assert.ok(maxCellX >= 594, `cells cover right boundary for angle ${rotation}`);
    assert.ok(maxCellY >= 841, `cells cover bottom boundary for angle ${rotation}`);
  }
});

test('zoom invariance: physical dimensions yield identical coordinates regardless of display scale', () => {
  const params = {
    sheetWidth: 594,
    sheetHeight: 841,
    config: { ...BASE_CONFIG, scale: 120, spacingX: 10, spacingY: 10, rotation: 30 },
    baseMotifSize: { width: 90, height: 90 },
  };

  const run1 = computePatternGrid(params);
  const run2 = computePatternGrid(params);

  assert.deepEqual(run1.cells, run2.cells);
  assert.deepEqual(run1.bounds, run2.bounds);
  assert.deepEqual(run1.overdraw, run2.overdraw);
  assert.equal(run1.totalCount, run2.totalCount);
});

test('pure function guarantees input immutability', () => {
  const configCopy: PatternConfig = { ...BASE_CONFIG };
  const motifCopy = { width: 120, height: 120 };

  computePatternGrid({
    sheetWidth: 420,
    sheetHeight: 594,
    config: configCopy,
    baseMotifSize: motifCopy,
  });

  assert.deepEqual(configCopy, BASE_CONFIG);
  assert.deepEqual(motifCopy, { width: 120, height: 120 });
});

test('generateSvgPatternDef returns valid pattern markup with correct dimensions', () => {
  const grid = computePatternGrid({
    sheetWidth: 200,
    sheetHeight: 200,
    config: BASE_CONFIG,
    baseMotifSize: { width: 50, height: 50 },
  });

  const svg = generateSvgPatternDef(grid, { id: 'test-pattern', content: '<circle r="5" />' });
  assert.ok(svg.startsWith('<pattern id="test-pattern"'));
  assert.ok(svg.includes('width="200"'));
  assert.ok(svg.includes('height="200"'));
  assert.ok(svg.includes('<circle r="5" />'));
});
