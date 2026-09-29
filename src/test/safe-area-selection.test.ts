import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type { SelectionOverlayProps } from '../components/customizer/selection-overlay.tsx';
import type { SafetyReport } from '../lib/safe-area.ts';

test('SelectionOverlayProps accepts safetyReport prop', () => {
  const nearEdgeReport: SafetyReport = {
    risk: 'near-edge',
    badgeLabel: 'Hơi sát mép',
  };

  const highRiskReport: SafetyReport = {
    risk: 'high-risk',
    badgeLabel: 'Quá gần nếp gấp',
  };

  const propsWithNearEdge: SelectionOverlayProps = {
    onHandlePointerDown: () => { },
    safetyReport: nearEdgeReport,
  };

  const propsWithHighRisk: SelectionOverlayProps = {
    onHandlePointerDown: () => { },
    safetyReport: highRiskReport,
  };

  const propsWithNull: SelectionOverlayProps = {
    onHandlePointerDown: () => { },
    safetyReport: null,
  };

  const propsWithUndefined: SelectionOverlayProps = {
    onHandlePointerDown: () => { },
    safetyReport: undefined,
  };

  assert.equal(propsWithNearEdge.safetyReport?.risk, 'near-edge');
  assert.equal(propsWithNearEdge.safetyReport?.badgeLabel, 'Hơi sát mép');
  assert.equal(propsWithHighRisk.safetyReport?.risk, 'high-risk');
  assert.equal(propsWithHighRisk.safetyReport?.badgeLabel, 'Quá gần nếp gấp');
  assert.equal(propsWithNull.safetyReport, null);
  assert.equal(propsWithUndefined.safetyReport, undefined);
});

test('selection-overlay.tsx renders contextual warning badge with expected accessibility, classes, and labels', () => {
  const overlayPath = path.resolve(
    process.cwd(),
    'src/components/customizer/selection-overlay.tsx'
  );
  const overlayCode = fs.readFileSync(overlayPath, 'utf8');

  assert.ok(
    overlayCode.includes("import type { SafetyReport } from '@/lib/safe-area';"),
    'Expected SafetyReport import'
  );
  assert.ok(
    overlayCode.includes('safetyReport?: SafetyReport | null;'),
    'Expected safetyReport in SelectionOverlayProps'
  );
  assert.ok(
    overlayCode.includes("safetyReport && safetyReport.risk !== 'safe'"),
    'Expected badge render condition to exclude safe risk'
  );
  assert.ok(overlayCode.includes('role="status"'), 'Expected role="status" on warning badge');
  assert.ok(
    overlayCode.includes('aria-live="polite"'),
    'Expected aria-live="polite" on warning badge'
  );
  assert.ok(
    overlayCode.includes(
      "aria-label={`Cảnh báo an toàn: ${safetyReport.badgeLabel || 'Chi tiết này hơi sát mép'}`}"
    ),
    'Expected exact aria-label with fallback'
  );
  assert.ok(
    overlayCode.includes(
      'absolute -top-8 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold shadow-xs whitespace-nowrap z-30'
    ),
    'Expected exact wrapper layout classes'
  );
  assert.ok(
    overlayCode.includes(
      "safetyReport.risk === 'high-risk'\n              ? 'bg-[#FDF0ED] text-[#A63626] border border-[#F5C7C0]'\n              : 'bg-[#FEF6E7] text-[#9A6214] border border-[#F4DCB0]'"
    ) ||
    overlayCode.includes("safetyReport.risk === 'high-risk'") &&
    overlayCode.includes("'bg-[#FDF0ED] text-[#A63626] border border-[#F5C7C0]'") &&
    overlayCode.includes("'bg-[#FEF6E7] text-[#9A6214] border border-[#F4DCB0]'"),
    'Expected warning and error styling branches for near-edge and high-risk'
  );
  assert.ok(
    overlayCode.includes("<AlertTriangle className=\"w-3 h-3 shrink-0\" />"),
    'Expected AlertTriangle icon in badge'
  );
  assert.ok(
    overlayCode.includes("<span>{safetyReport.badgeLabel || 'Hơi sát mép'}</span>"),
    'Expected badge label render with fallback'
  );
});

test('design-canvas.tsx passes activeSafetyReport into SelectionOverlay', () => {
  const canvasPath = path.resolve(
    process.cwd(),
    'src/components/customizer/design-canvas.tsx'
  );
  const canvasCode = fs.readFileSync(canvasPath, 'utf8');

  assert.ok(
    canvasCode.includes('safetyReport={activeSafetyReport}'),
    'Expected SelectionOverlay callsite to receive safetyReport={activeSafetyReport}'
  );
});
