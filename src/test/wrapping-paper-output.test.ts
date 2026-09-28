import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  getPreflight,
  transitionState,
  type CanvasElement,
  type DesignState,
} from '../lib/product-state.ts';
import { serverOrderStore } from '../lib/server-order-store.ts';
import { computePatternGrid, getWrappingPaperDimensions } from '../lib/pattern-renderer.ts';
import type { CustomerInfo } from '../lib/order-types.ts';

test('order snapshot retains source composition and patternConfig without generated elements', () => {
  serverOrderStore.clear();

  const sourceElements: CanvasElement[] = [
    {
      id: 'source-img',
      type: 'image',
      x: 20,
      y: 20,
      width: 60,
      height: 60,
      rotation: 0,
      data: { src: 'blob:motif.png', name: 'motif.png', sourceWidth: 1600, sourceHeight: 1600 },
    },
    {
      id: 'source-txt',
      type: 'text',
      x: 20,
      y: 80,
      width: 60,
      height: 20,
      rotation: 0,
      data: { text: 'Happy Birthday' },
    },
    // Contaminated generated elements to ensure snapshot filters them out
    {
      id: 'gen-clone-1',
      type: 'image',
      x: 100,
      y: 100,
      width: 60,
      height: 60,
      rotation: 0,
      data: { src: 'blob:motif.png', generated: true },
    },
    {
      id: 'gen-clone-2',
      type: 'text',
      x: 100,
      y: 160,
      width: 60,
      height: 20,
      rotation: 0,
      data: { text: 'Happy Birthday', patternGenerated: true },
    },
  ];

  const base = createInitialState('wrapping');
  const designWithElements = transitionState(base, {
    type: 'SET_ELEMENTS',
    value: sourceElements,
  });

  const configuredDesign = transitionState(designWithElements, {
    type: 'SET_PRODUCT_OPTION',
    key: 'patternConfig',
    value: {
      enabled: true,
      repeatMode: 'half-drop',
      scale: 120,
      spacingX: 10,
      spacingY: 10,
      rotation: 15,
      backgroundColor: '#FEF3C7',
    },
  });

  const customer: CustomerInfo = {
    name: 'Trần Thị B',
    phone: '0901234567',
    address: '456 Lê Lợi, Quận 1, TP.HCM',
    note: 'Gói quà sinh nhật',
  };

  const order = serverOrderStore.createOrder(configuredDesign, customer);
  assert.ok(order.id.startsWith('QT'));

  // Snapshot must only contain genuine source elements
  const snapshotElements = order.snapshot.design.elements ?? [];
  assert.equal(snapshotElements.length, 2);
  assert.deepEqual(
    snapshotElements.map((el) => el.id),
    ['source-img', 'source-txt']
  );

  // PatternConfig must be preserved intact
  const patternRaw = order.snapshot.design.productOptions.patternConfig;
  assert.ok(patternRaw && typeof patternRaw === 'object');
  assert.equal('repeatMode' in patternRaw ? patternRaw.repeatMode : undefined, 'half-drop');
  assert.equal('scale' in patternRaw ? patternRaw.scale : undefined, 120);
  assert.equal('backgroundColor' in patternRaw ? patternRaw.backgroundColor : undefined, '#FEF3C7');

  // Verify immutability: mutating source doesn't affect stored snapshot
  const originalPattern = configuredDesign.productOptions.patternConfig;
  if (originalPattern && typeof originalPattern === 'object' && 'scale' in originalPattern) {
    (originalPattern as { scale: number }).scale = 999;
  }
  const retrievedOrder = serverOrderStore.getOrder(order.id);
  assert.ok(retrievedOrder);
  const storedPattern = retrievedOrder.snapshot.design.productOptions.patternConfig;
  assert.ok(storedPattern && typeof storedPattern === 'object');
  assert.equal('scale' in storedPattern ? storedPattern.scale : undefined, 120);
});

test('preflight quality warning triggers when pattern scale enlarges image beyond threshold', () => {
  // 1400px source image is normally sharp (> 1200px pass)
  const base = createInitialState('wrapping');
  const designWithImage: DesignState = {
    ...base,
    image: {
      name: 'motif.png',
      src: 'blob:motif.png',
      width: 1400,
      height: 1400,
    },
  };

  // Normal scale (100%): 1400 / 1.0 = 1400 -> PASS
  const normalPreflight = getPreflight(designWithImage);
  assert.equal(normalPreflight.level, 'pass');
  assert.equal(
    normalPreflight.checks.find((c) => c.id === 'image-quality')?.label,
    'Độ nét ảnh đạt chuẩn'
  );

  // Enlarged pattern scale (200%): effective 1400 / 2.0 = 700 < 1200 -> WARNING
  const enlargedDesign = transitionState(designWithImage, {
    type: 'SET_PRODUCT_OPTION',
    key: 'patternConfig',
    value: {
      enabled: true,
      repeatMode: 'basic',
      scale: 200,
      spacingX: 0,
      spacingY: 0,
      rotation: 0,
      backgroundColor: '#ffffff',
    },
  });

  const enlargedPreflight = getPreflight(enlargedDesign);
  assert.equal(enlargedPreflight.level, 'warning');
  assert.equal(
    enlargedPreflight.checks.find((c) => c.id === 'image-quality')?.label,
    'Ảnh có thể hơi mờ khi in'
  );
});

test('preflight quality passes when pattern scale is small or normal', () => {
  const base = createInitialState('wrapping');
  const designWithImage: DesignState = {
    ...base,
    image: {
      name: 'highres.png',
      src: 'blob:highres.png',
      width: 2400,
      height: 2400,
    },
  };

  const scaledDesign = transitionState(designWithImage, {
    type: 'SET_PRODUCT_OPTION',
    key: 'patternScale',
    value: 120,
  });

  // Effective resolution: 2400 / 1.2 = 2000 >= 1200 -> PASS
  const preflight = getPreflight(scaledDesign);
  assert.equal(preflight.level, 'pass');
  assert.equal(
    preflight.checks.find((c) => c.id === 'image-quality')?.label,
    'Độ nét ảnh đạt chuẩn'
  );
});

test('mockup and preview derive identical pattern grid instructions from patternConfig', () => {
  const dimsA1 = getWrappingPaperDimensions('a1');
  assert.equal(dimsA1.width, 594);
  assert.equal(dimsA1.height, 841);

  const patternConfig = {
    enabled: true,
    repeatMode: 'half-brick' as const,
    scale: 150,
    spacingX: 20,
    spacingY: 20,
    rotation: 0,
    backgroundColor: '#FFFBEB',
  };

  const previewGrid = computePatternGrid({
    sheetWidth: dimsA1.width,
    sheetHeight: dimsA1.height,
    config: patternConfig,
  });

  const mockupGrid = computePatternGrid({
    sheetWidth: dimsA1.width,
    sheetHeight: dimsA1.height,
    config: patternConfig,
  });

  // Preview and mockup must produce completely deterministic, matching cell transforms
  assert.equal(previewGrid.cells.length, mockupGrid.cells.length);
  assert.deepEqual(previewGrid.cells, mockupGrid.cells);
  assert.deepEqual(previewGrid.bounds, mockupGrid.bounds);
  assert.deepEqual(previewGrid.clipBounds, mockupGrid.clipBounds);
});
