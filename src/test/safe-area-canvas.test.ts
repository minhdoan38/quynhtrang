import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type { DesignCanvasProps } from '../components/customizer/design-canvas.tsx';
import type { SafetyReport } from '../lib/safe-area.ts';

test('DesignCanvasProps accepts showSafeAreaGuide and activeSafetyReport', () => {
  const safeReport: SafetyReport = { risk: 'safe' };
  const warningReport: SafetyReport = { risk: 'near-edge', badgeLabel: 'Cận viền' };

  const propsWithGuide: DesignCanvasProps = {
    productId: 'card',
    backgroundColor: '#ffffff',
    productOptions: {},
    showSafeAreaGuide: true,
    activeSafetyReport: warningReport,
  };

  const propsWithoutGuide: DesignCanvasProps = {
    productId: 'notebook',
    backgroundColor: '#ffffff',
    productOptions: {},
    showSafeAreaGuide: false,
    activeSafetyReport: safeReport,
  };

  const propsWithNullReport: DesignCanvasProps = {
    productId: 'sticker',
    backgroundColor: '#ffffff',
    productOptions: {},
    showSafeAreaGuide: undefined,
    activeSafetyReport: null,
  };

  assert.equal(propsWithGuide.showSafeAreaGuide, true);
  assert.equal(propsWithGuide.activeSafetyReport?.risk, 'near-edge');
  assert.equal(propsWithoutGuide.showSafeAreaGuide, false);
  assert.equal(propsWithoutGuide.activeSafetyReport?.risk, 'safe');
  assert.equal(propsWithNullReport.showSafeAreaGuide, undefined);
  assert.equal(propsWithNullReport.activeSafetyReport, null);
});

test('design-canvas.tsx defines non-interactive safe area guide markup with exact classes and label', () => {
  const canvasPath = path.resolve(process.cwd(), 'src/components/customizer/design-canvas.tsx');
  const canvasCode = fs.readFileSync(canvasPath, 'utf8');

  assert.ok(canvasCode.includes("import type { SafetyReport } from '@/lib/safe-area';"));
  assert.ok(canvasCode.includes('showSafeAreaGuide?: boolean;'));
  assert.ok(canvasCode.includes('activeSafetyReport?: SafetyReport | null;'));
  assert.ok(canvasCode.includes('data-ui-guide="safe-area"'));
  assert.ok(canvasCode.includes('pointer-events-none'));
  assert.ok(canvasCode.includes('border-[#315F86]/35'));
  assert.ok(canvasCode.includes('aria-hidden="true"'));
  assert.ok(canvasCode.includes('Vùng an toàn'));
  assert.ok(
    canvasCode.includes(
      "(showSafeAreaGuide || (activeSafetyReport && activeSafetyReport.risk !== 'safe'))"
    )
  );
});
