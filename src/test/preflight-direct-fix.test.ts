import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createInitialState,
  type CanvasElement,
  type CardSurface,
  type DesignState,
  type PreflightCheck,
} from '../lib/product-state.ts';

type SelectedTarget = 'image' | 'text' | 'group' | null;

interface DirectFixShellSimulatorState {
  overlayMode: 'preview' | 'preflight' | null;
  activeCardSurface: CardSurface;
  selectedElementId: string | null;
  selectedTarget: SelectedTarget;
  selectedTextId: string | null;
  showSafeAreaGuide: boolean;
  activeSheet: string | null;
}

function runDirectFix(
  state: DesignState,
  check: PreflightCheck,
  initial: Partial<DirectFixShellSimulatorState> = {},
): DirectFixShellSimulatorState {
  let overlayMode: 'preview' | 'preflight' | null = initial.overlayMode ?? 'preflight';
  let activeCardSurface: CardSurface = initial.activeCardSurface ?? 'front';
  let selectedElementId: string | null = initial.selectedElementId ?? null;
  let selectedTarget: SelectedTarget = initial.selectedTarget ?? null;
  let selectedTextId: string | null = initial.selectedTextId ?? null;
  let showSafeAreaGuide = initial.showSafeAreaGuide ?? false;
  let activeSheet: string | null = initial.activeSheet ?? null;

  const setOverlayMode = (mode: 'preview' | 'preflight' | null) => {
    overlayMode = mode;
  };
  const setActiveCardSurface = (surface: CardSurface) => {
    activeCardSurface = surface;
  };
  const setSelectedElementId = (id: string | null) => {
    selectedElementId = id;
  };
  const setSelectedTarget = (target: SelectedTarget) => {
    selectedTarget = target;
  };
  const setSelectedTextId = (id: string | null) => {
    selectedTextId = id;
  };
  const setShowSafeAreaGuide = (show: boolean) => {
    showSafeAreaGuide = show;
  };
  const setActiveSheet = (sheet: string | null) => {
    activeSheet = sheet;
  };

  // Mirrors handlePreflightFix contract from CustomizerShell
  setOverlayMode(null);
  if (state.productId === 'card' && check.surfaceId) {
    setActiveCardSurface(check.surfaceId as CardSurface);
  }
  if (check.elementId) {
    const elements = state.elements ?? [];
    const targetElement = elements.find((e) => e.id === check.elementId);
    if (targetElement) {
      setSelectedElementId(targetElement.id);
      setSelectedTarget(targetElement.type as SelectedTarget);
      if (targetElement.type === 'text') {
        setSelectedTextId(targetElement.id);
      }
    }
  }
  if (check.category === 'safe-area') {
    setShowSafeAreaGuide(true);
  }
  if (check.id === 'sticker-contour') {
    setActiveSheet('sticker-border');
  }

  return {
    overlayMode,
    activeCardSurface,
    selectedElementId,
    selectedTarget,
    selectedTextId,
    showSafeAreaGuide,
    activeSheet,
  };
}

const shellSource = readFileSync(
  resolve(process.cwd(), 'src/components/customizer/customizer-shell.tsx'),
  'utf8',
);

const handlerSource = shellSource.match(
  /const handlePreflightFix = useCallback\(\(check: PreflightCheck\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);/,
)?.[1];

test('shell source contains exact handlePreflightFix contract and wires onFix to EditorPreflightMode', () => {
  assert.ok(handlerSource, 'CustomizerShell must define handlePreflightFix');
  assert.match(handlerSource, /setOverlayMode\(null\);/);
  assert.match(handlerSource, /state\.productId === 'card' && check\.surfaceId/);
  assert.match(handlerSource, /setActiveCardSurface\(check\.surfaceId as CardSurface\);/);
  assert.match(handlerSource, /const elements = state\.elements \?\? getDefaultElements\(state\);/);
  assert.match(handlerSource, /elements\.find\(\(e\) => e\.id === check\.elementId\)/);
  assert.match(handlerSource, /setSelectedElementId\(targetElement\.id\);/);
  assert.match(handlerSource, /setSelectedTarget\(targetElement\.type as SelectedTarget\);/);
  assert.match(handlerSource, /targetElement\.type === 'text'[\s\S]*setSelectedTextId\(targetElement\.id\);/);
  assert.match(handlerSource, /check\.category === 'safe-area'[\s\S]*setShowSafeAreaGuide\(true\);/);
  assert.match(handlerSource, /check\.id === 'sticker-contour'[\s\S]*setActiveSheet\('sticker-border'\);/);

  assert.match(
    shellSource,
    /<EditorPreflightMode[\s\S]*?onFix=\{handlePreflightFix\}[\s\S]*?\/>/,
  );
});

test('preflight fix closes overlay and switches card surface when surfaceId is provided', () => {
  const cardState = createInitialState('card');
  const result = runDirectFix(
    cardState,
    {
      id: 'card-inside-check',
      level: 'warning',
      label: 'Mặt trong',
      surfaceId: 'inside',
    },
    { activeCardSurface: 'front', overlayMode: 'preflight' },
  );

  assert.equal(result.overlayMode, null);
  assert.equal(result.activeCardSurface, 'inside');
});

test('preflight fix selects target text element and synchronizes selectedTextId', () => {
  const base = createInitialState('card');
  const textElement: CanvasElement = {
    id: 'text-card-headline',
    type: 'text',
    x: 50,
    y: 50,
    width: 60,
    height: 20,
    rotation: 0,
    surface: 'inside',
    data: { text: 'Chúc mừng', fontSize: 24 },
  };
  const stateWithText: DesignState = {
    ...base,
    elements: [textElement],
  };

  const result = runDirectFix(
    stateWithText,
    {
      id: 'text-overflow',
      level: 'error',
      label: 'Chữ quá dài',
      elementId: 'text-card-headline',
      surfaceId: 'inside',
    },
    {
      activeCardSurface: 'front',
      selectedElementId: null,
      selectedTarget: null,
      selectedTextId: null,
      overlayMode: 'preflight',
    },
  );

  assert.equal(result.overlayMode, null);
  assert.equal(result.activeCardSurface, 'inside');
  assert.equal(result.selectedElementId, 'text-card-headline');
  assert.equal(result.selectedTarget, 'text');
  assert.equal(result.selectedTextId, 'text-card-headline');
});

test('preflight fix selects non-text element without overwriting selectedTextId', () => {
  const base = createInitialState('wrapping');
  const imageElement: CanvasElement = {
    id: 'photo-hero',
    type: 'image',
    x: 10,
    y: 10,
    width: 80,
    height: 80,
    rotation: 0,
    data: { src: 'blob:hero.png' },
  };
  const stateWithImage: DesignState = {
    ...base,
    elements: [imageElement],
  };

  const result = runDirectFix(
    stateWithImage,
    {
      id: 'image-low-dpi',
      level: 'warning',
      label: 'Ảnh độ phân giải thấp',
      elementId: 'photo-hero',
      surfaceId: 'front',
    },
    {
      selectedTextId: 'retained-text-id',
      overlayMode: 'preflight',
    },
  );

  assert.equal(result.overlayMode, null);
  assert.equal(result.selectedElementId, 'photo-hero');
  assert.equal(result.selectedTarget, 'image');
  assert.equal(result.selectedTextId, 'retained-text-id');
});

test('preflight fix ignores missing elementId and avoids invalid selection changes', () => {
  const base = createInitialState('sticker');
  const result = runDirectFix(
    base,
    {
      id: 'missing-element-check',
      level: 'warning',
      label: 'Không tìm thấy đối tượng',
      elementId: 'ghost-element-404',
    },
    {
      selectedElementId: 'preserved-selection',
      selectedTarget: 'image',
      selectedTextId: null,
    },
  );

  assert.equal(result.overlayMode, null);
  assert.equal(result.selectedElementId, 'preserved-selection');
  assert.equal(result.selectedTarget, 'image');
});

test('preflight fix enables safe-area guide for safe-area issues', () => {
  const base = createInitialState('notebook');
  const result = runDirectFix(
    base,
    {
      id: 'safe-area-violation',
      level: 'warning',
      category: 'safe-area',
      label: 'Đối tượng sát mép',
    },
    { showSafeAreaGuide: false },
  );

  assert.equal(result.overlayMode, null);
  assert.equal(result.showSafeAreaGuide, true);
});

test('preflight fix opens sticker-border sheet for sticker contour issues', () => {
  const base = createInitialState('sticker');
  const result = runDirectFix(
    base,
    {
      id: 'sticker-contour',
      level: 'warning',
      category: 'sticker',
      label: 'Viền cắt sticker chưa cấu hình',
    },
    { activeSheet: null },
  );

  assert.equal(result.overlayMode, null);
  assert.equal(result.activeSheet, 'sticker-border');
});
