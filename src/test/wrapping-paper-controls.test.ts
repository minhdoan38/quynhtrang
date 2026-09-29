import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateImageQuality,
  type EvaluateQualityParams,
} from '../lib/image-quality.ts';
import {
  createInitialState,
  transitionState,
  type DesignState,
  type PatternConfig,
} from '../lib/product-state.ts';
import {
  createDesignHistoryManager,
  type DesignHistoryManager,
} from '../lib/use-design-history.ts';
import {
  REPEAT_MODE_OPTIONS,
  PATTERN_SCALE_LIMITS,
  PATTERN_SPACING_LIMITS,
  CUSTOMER_LABELS,
  FORBIDDEN_TERMS,
  type RepeatModeOption,
} from '../lib/pattern-controls-constants.ts';

test('pattern customer copy strictly conforms and omits forbidden terms', () => {
  assert.equal(CUSTOMER_LABELS.repeatMode, 'Kiểu lặp');
  assert.equal(CUSTOMER_LABELS.scale, 'Kích thước');
  assert.equal(CUSTOMER_LABELS.spacing, 'Khoảng cách');
  assert.equal(CUSTOMER_LABELS.background, 'Nền');
  assert.equal(CUSTOMER_LABELS.rotate, 'Xoay họa tiết');

  const optionLabels = REPEAT_MODE_OPTIONS.map((opt: RepeatModeOption) => opt.label);
  assert.deepEqual(optionLabels, ['Đều', 'So le dọc', 'So le ngang', 'Gương']);

  const joinedText = [
    CUSTOMER_LABELS.repeatMode,
    CUSTOMER_LABELS.scale,
    CUSTOMER_LABELS.spacing,
    CUSTOMER_LABELS.background,
    CUSTOMER_LABELS.rotate,
    ...optionLabels,
  ].join(' ');

  for (const term of FORBIDDEN_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    assert.equal(
      regex.test(joinedText),
      false,
      `Forbidden customer-facing term exposed: ${term}`
    );
  }
});

test('pattern scale and spacing bounds enforce MVP design boundaries', () => {
  assert.equal(PATTERN_SCALE_LIMITS.min, 40);
  assert.equal(PATTERN_SCALE_LIMITS.max, 250);
  assert.equal(PATTERN_SCALE_LIMITS.default, 100);

  assert.equal(PATTERN_SPACING_LIMITS.min, 0);
  assert.equal(PATTERN_SPACING_LIMITS.max, 60);
  assert.equal(PATTERN_SPACING_LIMITS.default, 0);
});

test('image quality degrades appropriately when pattern scale increases', () => {
  const baseParams: EvaluateQualityParams = {
    sourceWidth: 1000,
    sourceHeight: 1000,
    scale: 1,
    cropFraction: 1,
    productId: 'wrapping',
    patternScale: 100,
  };

  const normalReport = evaluateImageQuality(baseParams);
  assert.equal(normalReport.level, 'good');
  assert.equal(normalReport.badgeLabel, 'Tốt');
  assert.equal(normalReport.effectivePixels, 1000);

  // Scaled up pattern motif to 250%
  const enlargedReport = evaluateImageQuality({
    ...baseParams,
    patternScale: 250,
  });
  // 1000 / (1 * 2.5) = 400 effectivePixels -> warning
  assert.equal(enlargedReport.level, 'warning');
  assert.equal(enlargedReport.badgeLabel, 'Có thể hơi mờ');
  assert.equal(enlargedReport.effectivePixels, 400);

  // Scaled up pattern motif to extreme size
  const tinyReport = evaluateImageQuality({
    ...baseParams,
    sourceWidth: 400,
    sourceHeight: 400,
    patternScale: 200,
  });
  // 400 / (1 * 2) = 200 -> critical
  assert.equal(tinyReport.level, 'critical');
  assert.equal(tinyReport.badgeLabel, 'Ảnh quá nhỏ');
  assert.equal(tinyReport.effectivePixels, 200);
});

test('committing pattern control updates records exactly one semantic history action', () => {
  let selection = {
    selectedTarget: null as 'image' | 'text' | 'group' | null,
    selectedElementId: null as string | null,
    selectedElementIds: [] as string[],
    selectionMode: 'default' as 'default' | 'multi-select' | 'group-edit',
    activeGroupId: null as string | null,
  };

  const historyManager: DesignHistoryManager = createDesignHistoryManager(
    createInitialState('wrapping'),
    () => selection,
    (s) => {
      selection = s;
    }
  );

  const initialHistoryLength = historyManager.getHistory().past.length;

  // 1. Change repeat mode
  historyManager.executeAction(
    {
      type: 'SET_PRODUCT_OPTION',
      key: 'patternConfig',
      value: {
        ...(historyManager.getState().productOptions.patternConfig as PatternConfig),
        repeatMode: 'half-drop',
      },
    },
    {
      type: 'change-pattern-repeat',
      label: 'Kiểu lặp',
    }
  );

  assert.equal(
    historyManager.getHistory().past.length,
    initialHistoryLength + 1
  );
  assert.equal(
    historyManager.getHistory().past[historyManager.getHistory().past.length - 1].type,
    'change-pattern-repeat'
  );

  // 2. Dragging scale live in transaction and committing on pointer up
  historyManager.startTransaction('change-pattern-scale', 'Kích thước họa tiết');
  for (const scale of [110, 120, 130, 140]) {
    historyManager.dispatchDirect({
      type: 'SET_PRODUCT_OPTION',
      key: 'patternConfig',
      value: {
        ...(historyManager.getState().productOptions.patternConfig as PatternConfig),
        scale,
      },
    });
  }
  // During dragging, past entries must not grow
  assert.equal(
    historyManager.getHistory().past.length,
    initialHistoryLength + 1
  );

  const commitScaleRes = historyManager.commitActiveTransaction();
  assert.ok(commitScaleRes !== null);
  assert.equal(
    historyManager.getHistory().past.length,
    initialHistoryLength + 2
  );
  assert.equal(commitScaleRes?.type, 'change-pattern-scale');

  const finalPattern = historyManager.getState().productOptions
    .patternConfig as PatternConfig;
  assert.equal(finalPattern.scale, 140);
  assert.equal(finalPattern.repeatMode, 'half-drop');
});
