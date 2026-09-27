# Color & Gradient UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, mobile-first Color & Gradient property sheet for the print customization editor with live canvas preview, semantic ColorValue representation, strongly-typed ColorTarget resolver, transient history batching, and recent color management.

**Architecture:** A domain-driven color architecture separating canonical semantic `ColorValue` (Solid, Linear, Radial) from CSS/renderer adapters; a generic `ColorTarget` resolver for Text, Shapes, Stickers, and Surface Backgrounds; an isolated `ColorEditSession` ensuring live preview without undo pollution and committing exactly one history record upon closing; and separate project/device recent color storage outside undo state.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict, no `any`), Tailwind CSS v4, Lucide icons, Node.js test runner (`node:test`, `node:assert/strict`).

**Spec:** `docs/superpowers/specs/2026-09-27-color-gradient-ux-design.md`

## Global Constraints

- No `any` in TypeScript code (`ts-no-any`). Use strict types and interfaces.
- Canonical color values must be semantic objects (`kind: 'solid'` or `kind: 'gradient'`), never raw CSS gradient strings.
- Gradient in MVP supports exactly two colors: `Linear` (with 4 directional presets: `right`, `bottom-right`, `bottom`, `bottom-left`) and `Radial` (fixed `center`).
- Native `<input type="color">` + normalized 6-digit uppercase `#RRGGBB` input with validation; invalid hex must never default to `#000000` or overwrite valid state.
- Live canvas updates during picker interaction must not pollute the undo history; closing the sheet commits at most one undo state if values changed.
- Recent colors reside in project metadata and device localStorage outside `DesignState` and undo history.
- UI language is Vietnamese, following the pastel stationery workbench design system (`#315F86` primary, `#2E3338` ink, `#FFFDF8` paper).

## Review Focus

1. **Invalid HEX handling**: Typing an invalid HEX string (e.g. `#12`, `xyz`) retains the last valid color on canvas without defaulting to black or corrupting state.
2. **Solid ↔ Gradient transition stability**: Converting a solid color to gradient pairs the current color with `#FFFFFF` without crashing; converting back to solid selects `colors[0]`.
3. **Session undo isolation**: Rapidly selecting 10 different colors and dragging the picker in one session appends exactly 1 undo entry when closed, and pressing Undo restores the initial color immediately.
4. **Target preservation**: Closing the color sheet preserves the currently selected canvas element and its contextual toolbar.
5. **Renderer adaptation**: Both text fill (using `-webkit-background-clip: text` for gradients) and shape/surface backgrounds render correctly without raw CSS gradient leaks.

---

### Task 1: Color Types, Normalization, and Renderer Adapters

**Files:**
- Create: `src/lib/color/color-types.ts`
- Create: `src/lib/color/color-validation.ts`
- Create: `src/lib/color/color-renderers.ts`
- Test: `src/test/color-system.test.ts`

**Interfaces:**
- Produces: `HexColor`, `SolidColor`, `LinearGradientColor`, `RadialGradientColor`, `ColorValue`, `GradientDirection`, `normalizeHexColor`, `isValidHexColor`, `createSolidColor`, `createDefaultLinearGradient`, `createDefaultRadialGradient`, `solidToGradient`, `gradientToSolid`, `colorValueToCss`, `gradientDirectionToCssAngle`.

- [ ] **Step 1: Write failing tests for color validation, normalization, and renderers**

```ts
// src/test/color-system.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHexColor,
  isValidHexColor,
  createSolidColor,
  createDefaultLinearGradient,
  createDefaultRadialGradient,
  solidToGradient,
  gradientToSolid,
} from '../lib/color/color-validation.ts';
import {
  colorValueToCss,
  gradientDirectionToCssAngle,
} from '../lib/color/color-renderers.ts';

test('normalizes hex colors correctly to #RRGGBB uppercase', () => {
  assert.equal(normalizeHexColor('#fff'), '#FFFFFF');
  assert.equal(normalizeHexColor('fff'), '#FFFFFF');
  assert.equal(normalizeHexColor('#315f86'), '#315F86');
  assert.equal(normalizeHexColor('315F86'), '#315F86');
  assert.equal(normalizeHexColor('#invalid'), null);
  assert.equal(normalizeHexColor('12'), null);
});

test('validates hex colors strictly', () => {
  assert.equal(isValidHexColor('#FFFFFF'), true);
  assert.equal(isValidHexColor('#315F86'), true);
  assert.equal(isValidHexColor('blue'), false);
  assert.equal(isValidHexColor('#GGG'), false);
});

test('converts solid to gradient deterministically', () => {
  const solid = createSolidColor('#E8BCC9');
  const grad = solidToGradient(solid);
  assert.equal(grad.kind, 'gradient');
  assert.equal(grad.gradientType, 'linear');
  assert.deepEqual(grad.colors, ['#E8BCC9', '#FFFFFF']);
  assert.equal(grad.direction, 'right');
});

test('converts gradient to solid taking first stop', () => {
  const grad = createDefaultLinearGradient('#315F86', '#F2DFA0', 'bottom');
  const solid = gradientToSolid(grad);
  assert.equal(solid.kind, 'solid');
  assert.equal(solid.color, '#315F86');
});

test('renders color values to valid CSS strings', () => {
  const solid = createSolidColor('#315F86');
  assert.equal(colorValueToCss(solid), '#315F86');

  const linear = createDefaultLinearGradient('#E8BCC9', '#315F86', 'bottom-right');
  assert.equal(colorValueToCss(linear), 'linear-gradient(135deg, #E8BCC9, #315F86)');

  const radial = createDefaultRadialGradient('#FFFDF8', '#2E3338');
  assert.equal(colorValueToCss(radial), 'radial-gradient(circle at center, #FFFDF8, #2E3338)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/color-system.test.ts`
Expected: FAIL with module not found `../lib/color/color-validation.ts`

- [ ] **Step 3: Implement color-types, color-validation, and color-renderers**

Create `src/lib/color/color-types.ts`:
```ts
export type HexColor = `#${string}`;

export type GradientDirection = 'right' | 'bottom-right' | 'bottom' | 'bottom-left';

export interface SolidColor {
  kind: 'solid';
  color: HexColor;
}

export interface LinearGradientColor {
  kind: 'gradient';
  gradientType: 'linear';
  colors: [HexColor, HexColor];
  direction: GradientDirection;
}

export interface RadialGradientColor {
  kind: 'gradient';
  gradientType: 'radial';
  colors: [HexColor, HexColor];
  center: 'center';
}

export type GradientColor = LinearGradientColor | RadialGradientColor;

export type ColorValue = SolidColor | GradientColor;

export type ColorTarget =
  | { kind: 'element'; elementId: string; property: 'fill' }
  | { kind: 'shape'; elementId: string; property: 'fill' | 'stroke' }
  | { kind: 'sticker'; elementId: string; property: 'border' }
  | { kind: 'surface'; surfaceId: string; property: 'background' };
```

Create `src/lib/color/color-validation.ts`:
```ts
import type {
  HexColor,
  SolidColor,
  LinearGradientColor,
  RadialGradientColor,
  GradientColor,
  ColorValue,
  GradientDirection,
} from './color-types';

const HEX_REGEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeHexColor(input: string): HexColor | null {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();
  if (!HEX_REGEX.test(clean)) return null;

  const hexOnly = clean.startsWith('#') ? clean.slice(1) : clean;
  if (hexOnly.length === 3) {
    const r = hexOnly[0];
    const g = hexOnly[1];
    const b = hexOnly[2];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase() as HexColor;
  }
  return `#${hexOnly}`.toUpperCase() as HexColor;
}

export function isValidHexColor(input: string): boolean {
  return normalizeHexColor(input) !== null;
}

export function createSolidColor(hex: string, fallback: HexColor = '#2E3338'): SolidColor {
  const norm = normalizeHexColor(hex) ?? fallback;
  return { kind: 'solid', color: norm };
}

export function createDefaultLinearGradient(
  color1: string,
  color2: string = '#FFFFFF',
  direction: GradientDirection = 'right'
): LinearGradientColor {
  const c1 = normalizeHexColor(color1) ?? '#2E3338';
  const c2 = normalizeHexColor(color2) ?? '#FFFFFF';
  return {
    kind: 'gradient',
    gradientType: 'linear',
    colors: [c1, c2],
    direction,
  };
}

export function createDefaultRadialGradient(
  color1: string,
  color2: string = '#FFFFFF'
): RadialGradientColor {
  const c1 = normalizeHexColor(color1) ?? '#2E3338';
  const c2 = normalizeHexColor(color2) ?? '#FFFFFF';
  return {
    kind: 'gradient',
    gradientType: 'radial',
    colors: [c1, c2],
    center: 'center',
  };
}

export function solidToGradient(solid: SolidColor): LinearGradientColor {
  return createDefaultLinearGradient(solid.color, '#FFFFFF', 'right');
}

export function gradientToSolid(gradient: GradientColor): SolidColor {
  return createSolidColor(gradient.colors[0]);
}

export function ensureColorValue(val: unknown, fallback: HexColor = '#2E3338'): ColorValue {
  if (!val || typeof val !== 'object') {
    if (typeof val === 'string') {
      return createSolidColor(val, fallback);
    }
    return createSolidColor(fallback, fallback);
  }
  const obj = val as Record<string, unknown>;
  if (obj.kind === 'solid' && typeof obj.color === 'string') {
    return createSolidColor(obj.color, fallback);
  }
  if (obj.kind === 'gradient') {
    const colors = Array.isArray(obj.colors) ? obj.colors : [];
    const c1 = typeof colors[0] === 'string' ? colors[0] : fallback;
    const c2 = typeof colors[1] === 'string' ? colors[1] : '#FFFFFF';
    if (obj.gradientType === 'radial') {
      return createDefaultRadialGradient(c1, c2);
    }
    const dir = (obj.direction as GradientDirection) || 'right';
    return createDefaultLinearGradient(c1, c2, dir);
  }
  return createSolidColor(fallback, fallback);
}
```

Create `src/lib/color/color-renderers.ts`:
```ts
import type { ColorValue, GradientDirection } from './color-types';

export function gradientDirectionToCssAngle(direction: GradientDirection): string {
  switch (direction) {
    case 'right':
      return '90deg';
    case 'bottom-right':
      return '135deg';
    case 'bottom':
      return '180deg';
    case 'bottom-left':
      return '225deg';
    default:
      return '90deg';
  }
}

export function colorValueToCss(value: ColorValue): string {
  if (value.kind === 'solid') {
    return value.color;
  }
  if (value.gradientType === 'linear') {
    const angle = gradientDirectionToCssAngle(value.direction);
    return `linear-gradient(${angle}, ${value.colors[0]}, ${value.colors[1]})`;
  }
  return `radial-gradient(circle at center, ${value.colors[0]}, ${value.colors[1]})`;
}

export function colorValueToTextStyle(value: ColorValue): React.CSSProperties {
  if (value.kind === 'solid') {
    return { color: value.color };
  }
  const gradientCss = colorValueToCss(value);
  return {
    backgroundImage: gradientCss,
    WebkitBackgroundImage: gradientCss,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    display: 'inline-block',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/color-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/color/color-types.ts src/lib/color/color-validation.ts src/lib/color/color-renderers.ts src/test/color-system.test.ts
git commit -m "feat(color): implement core color types, normalization, and renderers"
```

---

### Task 2: Recent Colors Service (Project Metadata + Device Storage)

**Files:**
- Create: `src/lib/color/color-recents.ts`
- Modify: `src/test/color-system.test.ts`

**Interfaces:**
- Produces: `getDeviceRecentColors`, `addDeviceRecentColor`, `mergeRecentColors`, `MAX_RECENT_COLORS`.

- [ ] **Step 1: Write failing tests for recent colors merging and storage**

Append to `src/test/color-system.test.ts`:
```ts
import {
  mergeRecentColors,
  MAX_RECENT_COLORS,
} from '../lib/color/color-recents.ts';

test('merges project and device recents without duplicates and limits to MAX_RECENT_COLORS', () => {
  const project = ['#FFD1DC', '#FFF2CC'];
  const device = ['#FFD1DC', '#91C4F2', '#FFFFFF', '#315F86'];
  const merged = mergeRecentColors(project, device);

  assert.deepEqual(merged, [
    '#FFD1DC',
    '#FFF2CC',
    '#91C4F2',
    '#FFFFFF',
    '#315F86',
  ]);
  assert.ok(merged.length <= MAX_RECENT_COLORS);
});

test('handles invalid entries and deduplicates case-insensitively', () => {
  const merged = mergeRecentColors(
    ['#ffd1dc', 'invalid', '#315f86'],
    ['#FFD1DC', '#2E3338']
  );
  assert.deepEqual(merged, ['#FFD1DC', '#315F86', '#2E3338']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/color-system.test.ts`
Expected: FAIL with `color-recents.ts` not found.

- [ ] **Step 3: Implement color-recents.ts**

Create `src/lib/color/color-recents.ts`:
```ts
import type { HexColor } from './color-types';
import { normalizeHexColor } from './color-validation';

export const MAX_RECENT_COLORS = 8;
const DEVICE_RECENT_COLORS_KEY = 'customizer_device_recent_colors';

export function getDeviceRecentColors(): HexColor[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(DEVICE_RECENT_COLORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: HexColor[] = [];
    for (const item of parsed) {
      const norm = normalizeHexColor(String(item));
      if (norm && !valid.includes(norm)) {
        valid.push(norm);
      }
      if (valid.length >= MAX_RECENT_COLORS) break;
    }
    return valid;
  } catch {
    return [];
  }
}

export function addDeviceRecentColor(hex: string): HexColor[] {
  const norm = normalizeHexColor(hex);
  if (!norm) return getDeviceRecentColors();
  const current = getDeviceRecentColors().filter((c) => c !== norm);
  const updated = [norm, ...current].slice(0, MAX_RECENT_COLORS);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(DEVICE_RECENT_COLORS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage quota errors
    }
  }
  return updated;
}

export function mergeRecentColors(projectRecents: string[] = [], deviceRecents: string[] = []): HexColor[] {
  const result: HexColor[] = [];
  const seen = new Set<string>();

  const processList = (list: string[]) => {
    for (const item of list) {
      const norm = normalizeHexColor(item);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        result.push(norm);
        if (result.length >= MAX_RECENT_COLORS) return;
      }
    }
  };

  processList(projectRecents);
  if (result.length < MAX_RECENT_COLORS) {
    processList(deviceRecents);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/color-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/color/color-recents.ts src/test/color-system.test.ts
git commit -m "feat(color): implement recent color storage and deduplicated merging"
```

---

### Task 3: ColorTarget Resolver and Design Colors Extractor

**Files:**
- Create: `src/lib/color/color-target.ts`
- Create: `src/lib/color/index.ts`
- Modify: `src/lib/product-state.ts` (Add `colorValue` to `DesignState` / `TextElementData` / `CanvasElement`, handle `SET_COLOR_VALUE` action)
- Modify: `src/test/color-system.test.ts`

**Interfaces:**
- Produces: `getColorValue(state, target)`, `setColorValue(state, target, value)`, `supportsGradient(target)`, `extractDesignColors(state)`.

- [ ] **Step 1: Write failing tests for ColorTarget resolution and design colors extraction**

Append to `src/test/color-system.test.ts`:
```ts
import {
  getColorValue,
  setColorValue,
  supportsGradient,
  extractDesignColors,
} from '../lib/color/color-target.ts';
import { createInitialState, type DesignState } from '../lib/product-state.ts';

test('resolves and sets text fill color on element', () => {
  const initial = createInitialState('card');
  const target = { kind: 'element' as const, elementId: 'text-1', property: 'fill' as const };
  assert.equal(supportsGradient(target), true);

  const initialVal = getColorValue(initial, target);
  assert.ok(initialVal !== null);

  const newColor = createSolidColor('#315F86');
  const updated = setColorValue(initial, target, newColor);
  assert.deepEqual(getColorValue(updated, target), newColor);
});

test('resolves and sets surface background color', () => {
  const initial = createInitialState('wrapping');
  const target = { kind: 'surface' as const, surfaceId: 'front', property: 'background' as const };
  const grad = createDefaultLinearGradient('#FFFDF8', '#ECE6DC', 'bottom');

  const updated = setColorValue(initial, target, grad);
  assert.deepEqual(getColorValue(updated, target), grad);
});

test('extracts unique design colors across text, shapes, and background', () => {
  let state = createInitialState('wrapping');
  state = setColorValue(state, { kind: 'surface', surfaceId: 'front', property: 'background' }, createSolidColor('#F8F3E8'));
  state = setColorValue(state, { kind: 'element', elementId: 'text-1', property: 'fill' }, createDefaultLinearGradient('#315F86', '#E8BCC9'));

  const designColors = extractDesignColors(state);
  assert.ok(designColors.includes('#F8F3E8'));
  assert.ok(designColors.includes('#315F86'));
  assert.ok(designColors.includes('#E8BCC9'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/color-system.test.ts`
Expected: FAIL with `color-target.ts` not found.

- [ ] **Step 3: Implement color-target.ts and update product-state.ts**

Create `src/lib/color/color-target.ts`:
```ts
import type { ColorTarget, ColorValue, HexColor } from './color-types';
import { createSolidColor, ensureColorValue, normalizeHexColor } from './color-validation';
import { getTextData, type DesignState, type CanvasElement } from '../product-state';

export function supportsGradient(target: ColorTarget): boolean {
  switch (target.kind) {
    case 'element':
      return target.property === 'fill';
    case 'shape':
      return target.property === 'fill';
    case 'sticker':
      return false; // MVP: sticker borders are solid
    case 'surface':
      return target.property === 'background';
    default:
      return true;
  }
}

export function getColorValue(state: DesignState, target: ColorTarget): ColorValue | null {
  if (!state || !target) return null;
  const elements = state.elements || [];

  if (target.kind === 'element' && target.property === 'fill') {
    const el = elements.find((e) => e.id === target.elementId);
    if (!el) {
      if (target.elementId === 'text-1' && state.text) {
        return ensureColorValue(state.color, '#2E3338');
      }
      return null;
    }
    if (el.type === 'text') {
      const data = getTextData(el);
      const val = (el.data as Record<string, unknown> | undefined)?.colorValue ?? data?.color ?? state.color;
      return ensureColorValue(val, '#2E3338');
    }
    const val = (el.data as Record<string, unknown> | undefined)?.fill;
    return ensureColorValue(val, '#2E3338');
  }

  if (target.kind === 'shape') {
    const el = elements.find((e) => e.id === target.elementId && e.type === 'shape');
    if (!el || !el.data) return null;
    if (target.property === 'fill') {
      return ensureColorValue(el.data.fill, '#DCEBF4');
    }
    if (target.property === 'stroke') {
      return ensureColorValue(el.data.stroke, '#315F86');
    }
  }

  if (target.kind === 'sticker' && target.property === 'border') {
    const el = elements.find((e) => e.id === target.elementId && e.type === 'sticker');
    if (!el || !el.data) return null;
    return ensureColorValue(el.data.border, '#FFFFFF');
  }

  if (target.kind === 'surface' && target.property === 'background') {
    const optBg = (state.productOptions as Record<string, unknown> | undefined)?.backgroundColorValue;
    return ensureColorValue(optBg ?? state.backgroundColor, '#FFFFFF');
  }

  return null;
}

export function setColorValue(
  state: DesignState,
  target: ColorTarget,
  value: ColorValue
): DesignState {
  if (!state || !target || !value) return state;
  const elements = state.elements || [];

  if (target.kind === 'element' && target.property === 'fill') {
    const index = elements.findIndex((e) => e.id === target.elementId);
    const hexRep = value.kind === 'solid' ? value.color : value.colors[0];

    if (index === -1) {
      // Legacy text fallback
      if (target.elementId === 'text-1') {
        return {
          ...state,
          color: hexRep,
          productOptions: {
            ...state.productOptions,
            textColorValue: value,
          },
        };
      }
      return state;
    }

    const targetEl = elements[index];
    if (targetEl.locked) return state;

    const nextElements = [...elements];
    const oldData = (targetEl.data as Record<string, unknown>) || {};
    nextElements[index] = {
      ...targetEl,
      data: {
        ...oldData,
        color: hexRep,
        colorValue: value,
      },
    };

    const isFirstText = targetEl.type === 'text' && targetEl.id === elements.find((e) => e.type === 'text')?.id;
    return {
      ...state,
      color: isFirstText ? hexRep : state.color,
      elements: nextElements,
    };
  }

  if (target.kind === 'shape') {
    const index = elements.findIndex((e) => e.id === target.elementId && e.type === 'shape');
    if (index === -1) return state;
    const targetEl = elements[index];
    if (targetEl.locked) return state;

    const nextElements = [...elements];
    const oldData = (targetEl.data as Record<string, unknown>) || {};
    const hexRep = value.kind === 'solid' ? value.color : value.colors[0];
    nextElements[index] = {
      ...targetEl,
      data: {
        ...oldData,
        [target.property]: hexRep,
        [`${target.property}Value`]: value,
      },
    };
    return { ...state, elements: nextElements };
  }

  if (target.kind === 'sticker' && target.property === 'border') {
    const index = elements.findIndex((e) => e.id === target.elementId && e.type === 'sticker');
    if (index === -1) return state;
    const targetEl = elements[index];
    if (targetEl.locked) return state;

    const nextElements = [...elements];
    const oldData = (targetEl.data as Record<string, unknown>) || {};
    const hexRep = value.kind === 'solid' ? value.color : value.colors[0];
    nextElements[index] = {
      ...targetEl,
      data: {
        ...oldData,
        border: hexRep,
        borderValue: value,
      },
    };
    return { ...state, elements: nextElements };
  }

  if (target.kind === 'surface' && target.property === 'background') {
    const hexRep = value.kind === 'solid' ? value.color : value.colors[0];
    return {
      ...state,
      backgroundColor: hexRep,
      productOptions: {
        ...state.productOptions,
        backgroundColorValue: value,
      },
    };
  }

  return state;
}

export function extractDesignColors(state: DesignState): HexColor[] {
  const result: HexColor[] = [];
  const seen = new Set<string>();

  const addColor = (c: unknown) => {
    if (!c) return;
    if (typeof c === 'string') {
      const norm = normalizeHexColor(c);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        result.push(norm);
      }
      return;
    }
    if (typeof c === 'object') {
      const obj = c as Record<string, unknown>;
      if (obj.kind === 'solid' && typeof obj.color === 'string') {
        addColor(obj.color);
      } else if (obj.kind === 'gradient' && Array.isArray(obj.colors)) {
        addColor(obj.colors[0]);
        addColor(obj.colors[1]);
      }
    }
  };

  // 1. Surface background
  addColor((state.productOptions as Record<string, unknown> | undefined)?.backgroundColorValue ?? state.backgroundColor);

  // 2. Elements colors
  const elements = state.elements || [];
  for (const el of elements) {
    if (!el.data) continue;
    if (el.type === 'text') {
      addColor(el.data.colorValue ?? el.data.color);
    } else if (el.type === 'shape') {
      addColor(el.data.fillValue ?? el.data.fill);
      addColor(el.data.strokeValue ?? el.data.stroke);
    } else if (el.type === 'sticker') {
      addColor(el.data.borderValue ?? el.data.border);
    }
  }

  return result;
}
```

Create `src/lib/color/index.ts`:
```ts
export * from './color-types';
export * from './color-validation';
export * from './color-renderers';
export * from './color-recents';
export * from './color-target';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/color-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/color/ src/test/color-system.test.ts
git commit -m "feat(color): implement ColorTarget resolver and Design Colors extractor"
```

---

### Task 4: ColorEditSession and useColorEditor Controller

**Files:**
- Create: `src/components/customizer/use-color-editor.ts`
- Modify: `src/test/color-system.test.ts` (Add test for session snapshot and undo batching behavior)

**Interfaces:**
- Produces: `useColorEditor({ target, state, onUpdateState, onCommitUndo, projectRecents, onAddProjectRecent })`
- Returns: `{ currentColor, updateColorLive, closeSession, designColors, recentColors, isGradientSupported }`.

- [ ] **Step 1: Write test for session snapshot and undo batching behavior**

Append to `src/test/color-system.test.ts`:
```ts
test('session batches multiple edits into one history record', () => {
  const baseState = createInitialState('card');
  const target: ColorTarget = { kind: 'element', elementId: 'text-1', property: 'fill' };

  let currentState = baseState;
  const history: DesignState[] = [];

  const initialVal = getColorValue(currentState, target);
  assert.ok(initialVal);

  // Session begins with baseState captured
  const sessionBase = currentState;

  // Step 1: Change to Pink
  currentState = setColorValue(currentState, target, createSolidColor('#E8BCC9'));
  // Step 2: Change to Blue
  currentState = setColorValue(currentState, target, createSolidColor('#315F86'));
  // Step 3: Change to Green
  currentState = setColorValue(currentState, target, createSolidColor('#C8D8C4'));

  // Session closes: only sessionBase is pushed if changed
  const finalVal = getColorValue(currentState, target);
  if (JSON.stringify(initialVal) !== JSON.stringify(finalVal)) {
    history.push(sessionBase);
  }

  assert.equal(history.length, 1);
  assert.deepEqual(getColorValue(history[0], target), initialVal);
  assert.deepEqual(getColorValue(currentState, target), createSolidColor('#C8D8C4'));
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/color-system.test.ts`
Expected: PASS

- [ ] **Step 3: Implement use-color-editor.ts**

Create `src/components/customizer/use-color-editor.ts`:
```ts
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ColorTarget, ColorValue, HexColor } from '@/lib/color/color-types';
import {
  getColorValue,
  setColorValue,
  supportsGradient,
  extractDesignColors,
} from '@/lib/color/color-target';
import {
  getDeviceRecentColors,
  addDeviceRecentColor,
  mergeRecentColors,
} from '@/lib/color/color-recents';
import { createSolidColor } from '@/lib/color/color-validation';
import type { DesignState } from '@/lib/product-state';

export interface UseColorEditorProps {
  target: ColorTarget | null;
  state: DesignState;
  onUpdateState: (newState: DesignState) => void;
  onCommitUndo: (initialState: DesignState) => void;
  projectRecents: string[];
  onAddProjectRecent: (hex: HexColor) => void;
}

export function useColorEditor({
  target,
  state,
  onUpdateState,
  onCommitUndo,
  projectRecents,
  onAddProjectRecent,
}: UseColorEditorProps) {
  const sessionBaseStateRef = useRef<DesignState | null>(null);
  const sessionInitialValueRef = useRef<ColorValue | null>(null);

  // Active value resolution
  const currentColor = useMemo<ColorValue>(() => {
    if (!target) return createSolidColor('#2E3338');
    return getColorValue(state, target) ?? createSolidColor('#2E3338');
  }, [state, target]);

  const isGradientSupported = useMemo(() => {
    return target ? supportsGradient(target) : false;
  }, [target]);

  // Derived Design Colors from document
  const designColors = useMemo(() => {
    return extractDesignColors(state);
  }, [state]);

  // Device recents loaded client-side
  const [deviceRecents, setDeviceRecents] = useState<HexColor[]>([]);

  useEffect(() => {
    setDeviceRecents(getDeviceRecentColors());
  }, []);

  // Merged recents (Project + Device, deduplicated, max 8)
  const recentColors = useMemo(() => {
    return mergeRecentColors(projectRecents, deviceRecents);
  }, [projectRecents, deviceRecents]);

  // Capture session base on target change
  useEffect(() => {
    if (target && !sessionBaseStateRef.current) {
      sessionBaseStateRef.current = state;
      sessionInitialValueRef.current = getColorValue(state, target);
    }
  }, [target, state]);

  // Live color change without creating undo entry
  const updateColorLive = useCallback(
    (newVal: ColorValue) => {
      if (!target) return;
      const next = setColorValue(state, target, newVal);
      onUpdateState(next);
    },
    [target, state, onUpdateState]
  );

  // Close session: commit single undo entry if changed, add to recents
  const closeSession = useCallback(() => {
    const base = sessionBaseStateRef.current;
    const initialVal = sessionInitialValueRef.current;
    sessionBaseStateRef.current = null;
    sessionInitialValueRef.current = null;

    if (!target || !base || !initialVal) return;

    const finalVal = getColorValue(state, target);
    if (JSON.stringify(initialVal) !== JSON.stringify(finalVal)) {
      onCommitUndo(base);

      // Record solid colors into recents
      if (finalVal) {
        if (finalVal.kind === 'solid') {
          onAddProjectRecent(finalVal.color);
          const updated = addDeviceRecentColor(finalVal.color);
          setDeviceRecents(updated);
        } else {
          onAddProjectRecent(finalVal.colors[0]);
          addDeviceRecentColor(finalVal.colors[0]);
          onAddProjectRecent(finalVal.colors[1]);
          const updated = addDeviceRecentColor(finalVal.colors[1]);
          setDeviceRecents(updated);
        }
      }
    }
  }, [target, state, onCommitUndo, onAddProjectRecent]);

  return {
    currentColor,
    updateColorLive,
    closeSession,
    designColors,
    recentColors,
    isGradientSupported,
  };
}
```

- [ ] **Step 4: Check types on use-color-editor.ts**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/use-color-editor.ts src/test/color-system.test.ts
git commit -m "feat(color): implement useColorEditor session hook for history batching"
```

---

### Task 5: ColorPickerSheet Component

**Files:**
- Create: `src/components/customizer/color-picker-sheet.tsx`

**Interfaces:**
- Produces: `ColorPickerSheet` component.
- Props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `currentColor: ColorValue`
  - `onUpdateColor: (val: ColorValue) => void`
  - `designColors: HexColor[]`
  - `recentColors: HexColor[]`
  - `isGradientSupported: boolean`

- [ ] **Step 1: Implement ColorPickerSheet with Solid and Gradient tabs**

Create `src/components/customizer/color-picker-sheet.tsx`:
```tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, Plus, ArrowRight, ArrowDownRight, ArrowDown, ArrowDownLeft, X } from 'lucide-react';
import type {
  ColorValue,
  SolidColor,
  LinearGradientColor,
  RadialGradientColor,
  GradientDirection,
  HexColor,
} from '@/lib/color/color-types';
import {
  normalizeHexColor,
  isValidHexColor,
  createSolidColor,
  createDefaultLinearGradient,
  createDefaultRadialGradient,
  solidToGradient,
  gradientToSolid,
} from '@/lib/color/color-validation';
import { colorValueToCss } from '@/lib/color/color-renderers';

const BASIC_PALETTE: { name: string; hex: HexColor }[] = [
  { name: 'Mực đậm', hex: '#2E3338' },
  { name: 'Mực nhạt', hex: '#666A6D' },
  { name: 'Xanh mực', hex: '#315F86' },
  { name: 'Xanh nhạt', hex: '#DCEBF4' },
  { name: 'Hồng phấn', hex: '#E8BCC9' },
  { name: 'Hồng đậm', hex: '#B86C84' },
  { name: 'Vàng bơ', hex: '#F2DFA0' },
  { name: 'Xanh xô thơm', hex: '#C8D8C4' },
  { name: 'Xanh lá đậm', hex: '#5F7E67' },
  { name: 'Đỏ gạch', hex: '#C25953' },
  { name: 'Đỏ mận', hex: '#B3535D' },
  { name: 'Trắng', hex: '#FFFFFF' },
];

const DIRECTION_PRESETS: { dir: GradientDirection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { dir: 'right', label: 'Ngang', icon: ArrowRight },
  { dir: 'bottom-right', label: 'Chéo', icon: ArrowDownRight },
  { dir: 'bottom', label: 'Dọc', icon: ArrowDown },
  { dir: 'bottom-left', label: 'Chéo ngược', icon: ArrowDownLeft },
];

export interface ColorPickerSheetProps {
  currentColor: ColorValue;
  onUpdateColor: (val: ColorValue) => void;
  designColors: HexColor[];
  recentColors: HexColor[];
  isGradientSupported?: boolean;
  onClose: () => void;
}

export function ColorPickerContent({
  currentColor,
  onUpdateColor,
  designColors,
  recentColors,
  isGradientSupported = true,
  onClose,
}: ColorPickerSheetProps) {
  const [activeTab, setActiveTab] = useState<'solid' | 'gradient'>(() => {
    return currentColor.kind === 'gradient' && isGradientSupported ? 'gradient' : 'solid';
  });

  const [activeGradientStop, setActiveGradientStop] = useState<0 | 1>(0);
  const [isCustomExpanded, setIsCustomExpanded] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [hexError, setHexError] = useState(false);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  // Sync current solid hex into input
  const currentSolidHex = currentColor.kind === 'solid'
    ? currentColor.color
    : currentColor.colors[activeGradientStop];

  useEffect(() => {
    setHexInput(currentSolidHex);
    setHexError(false);
  }, [currentSolidHex]);

  // Tab switching
  const handleTabChange = (tab: 'solid' | 'gradient') => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (tab === 'gradient') {
      if (currentColor.kind === 'solid') {
        onUpdateColor(solidToGradient(currentColor));
      }
    } else {
      if (currentColor.kind === 'gradient') {
        onUpdateColor(gradientToSolid(currentColor));
      }
    }
  };

  // Picking a color swatch (Solid or Stop)
  const handleSelectHex = (hex: HexColor) => {
    if (activeTab === 'solid' || currentColor.kind !== 'gradient') {
      onUpdateColor(createSolidColor(hex));
    } else {
      const newColors: [HexColor, HexColor] = [...currentColor.colors];
      newColors[activeGradientStop] = hex;
      if (currentColor.gradientType === 'radial') {
        onUpdateColor({ ...currentColor, colors: newColors });
      } else {
        onUpdateColor({ ...currentColor, colors: newColors });
      }
    }
  };

  // Hex text input change
  const handleHexInputChange = (val: string) => {
    setHexInput(val);
    const norm = normalizeHexColor(val);
    if (norm) {
      setHexError(false);
      handleSelectHex(norm);
    } else {
      setHexError(true);
    }
  };

  // Gradient type toggle (linear / radial)
  const handleGradientTypeChange = (type: 'linear' | 'radial') => {
    if (currentColor.kind !== 'gradient') return;
    if (type === 'linear') {
      onUpdateColor(createDefaultLinearGradient(currentColor.colors[0], currentColor.colors[1], 'right'));
    } else {
      onUpdateColor(createDefaultRadialGradient(currentColor.colors[0], currentColor.colors[1]));
    }
  };

  // Gradient direction change
  const handleDirectionChange = (dir: GradientDirection) => {
    if (currentColor.kind !== 'gradient' || currentColor.gradientType !== 'linear') return;
    onUpdateColor({ ...currentColor, direction: dir });
  };

  return (
    <div className="space-y-4 pb-2 text-[#2E3338]">
      {/* Header with Title and Close Button */}
      <div className="flex items-center justify-between border-b border-[#ECE6DC] pb-2">
        <h2 className="text-sm font-semibold text-[#2E3338]">Chọn màu sắc</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng màu"
          className="p-1 rounded-lg text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs: Màu đơn | Gradient */}
      {isGradientSupported && (
        <div className="flex p-0.5 rounded-xl bg-[#F8F3E8] border border-[#ECE6DC]">
          <button
            type="button"
            onClick={() => handleTabChange('solid')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'solid'
                ? 'bg-white text-[#2E3338] shadow-xs'
                : 'text-[#666A6D] hover:text-[#2E3338]'
            }`}
          >
            Màu đơn
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('gradient')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'gradient'
                ? 'bg-white text-[#2E3338] shadow-xs'
                : 'text-[#666A6D] hover:text-[#2E3338]'
            }`}
          >
            Gradient
          </button>
        </div>
      )}

      {/* Gradient Controls Panel */}
      {activeTab === 'gradient' && currentColor.kind === 'gradient' && (
        <div className="space-y-3 p-3 rounded-xl bg-[#F8F3E8]/60 border border-[#ECE6DC]">
          {/* Linear vs Radial switch */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleGradientTypeChange('linear')}
              className={`flex-1 py-1 text-xs font-medium rounded-lg border transition-all ${
                currentColor.gradientType === 'linear'
                  ? 'border-[#315F86] bg-white text-[#315F86] font-semibold'
                  : 'border-[#DDD6CC] bg-white text-[#666A6D]'
              }`}
            >
              Linear
            </button>
            <button
              type="button"
              onClick={() => handleGradientTypeChange('radial')}
              className={`flex-1 py-1 text-xs font-medium rounded-lg border transition-all ${
                currentColor.gradientType === 'radial'
                  ? 'border-[#315F86] bg-white text-[#315F86] font-semibold'
                  : 'border-[#DDD6CC] bg-white text-[#666A6D]'
              }`}
            >
              Radial
            </button>
          </div>

          {/* Stop Pickers: Màu 1 & Màu 2 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setActiveGradientStop(0)}
              className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border bg-white transition-all ${
                activeGradientStop === 0 ? 'border-[#315F86] ring-1 ring-[#315F86]' : 'border-[#DDD6CC]'
              }`}
            >
              <span className="text-xs font-medium">Màu 1</span>
              <span
                className="w-5 h-5 rounded-full border border-black/15 shadow-xs"
                style={{ backgroundColor: currentColor.colors[0] }}
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveGradientStop(1)}
              className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border bg-white transition-all ${
                activeGradientStop === 1 ? 'border-[#315F86] ring-1 ring-[#315F86]' : 'border-[#DDD6CC]'
              }`}
            >
              <span className="text-xs font-medium">Màu 2</span>
              <span
                className="w-5 h-5 rounded-full border border-black/15 shadow-xs"
                style={{ backgroundColor: currentColor.colors[1] }}
              />
            </button>
          </div>

          {/* Direction Presets (Linear Only) */}
          {currentColor.gradientType === 'linear' && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-medium text-[#666A6D]">Hướng gradient</span>
              <div className="grid grid-cols-4 gap-2">
                {DIRECTION_PRESETS.map((p) => {
                  const Icon = p.icon;
                  const isSelected = currentColor.direction === p.dir;
                  return (
                    <button
                      key={p.dir}
                      type="button"
                      onClick={() => handleDirectionChange(p.dir)}
                      title={p.label}
                      className={`flex flex-col items-center justify-center py-1.5 rounded-lg border bg-white transition-all ${
                        isSelected
                          ? 'border-[#315F86] text-[#315F86] bg-[#DCEBF4]/30'
                          : 'border-[#DDD6CC] text-[#666A6D] hover:bg-[#F8F3E8]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 1: Màu trong thiết kế (Design Colors) */}
      {designColors.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-[#666A6D] uppercase tracking-wider text-[11px]">
            Màu trong thiết kế
          </span>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {designColors.map((hex) => {
              const isSelected = currentSolidHex.toUpperCase() === hex.toUpperCase();
              return (
                <button
                  key={`design-${hex}`}
                  type="button"
                  onClick={() => handleSelectHex(hex)}
                  title={hex}
                  className={`w-8 h-8 rounded-full border border-black/10 flex items-center justify-center transition-transform active:scale-95 shadow-xs ${
                    isSelected ? 'ring-2 ring-[#315F86] ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {isSelected && (
                    <Check
                      className={`w-4 h-4 ${
                        hex.toUpperCase() === '#FFFFFF' || hex.toUpperCase() === '#FFFDF8'
                          ? 'text-black'
                          : 'text-white'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: Gần đây (Recent Colors) */}
      {recentColors.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-[#666A6D] uppercase tracking-wider text-[11px]">
            Gần đây
          </span>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {recentColors.map((hex) => {
              const isSelected = currentSolidHex.toUpperCase() === hex.toUpperCase();
              return (
                <button
                  key={`recent-${hex}`}
                  type="button"
                  onClick={() => handleSelectHex(hex)}
                  title={hex}
                  className={`w-8 h-8 rounded-full border border-black/10 flex items-center justify-center transition-transform active:scale-95 shadow-xs ${
                    isSelected ? 'ring-2 ring-[#315F86] ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {isSelected && (
                    <Check
                      className={`w-4 h-4 ${
                        hex.toUpperCase() === '#FFFFFF' || hex.toUpperCase() === '#FFFDF8'
                          ? 'text-black'
                          : 'text-white'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: Bảng màu cơ bản (Basic Palette) */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-[#666A6D] uppercase tracking-wider text-[11px]">
          Bảng màu cơ bản
        </span>
        <div className="grid grid-cols-6 gap-2 pt-0.5">
          {BASIC_PALETTE.map((p) => {
            const isSelected = currentSolidHex.toUpperCase() === p.hex.toUpperCase();
            return (
              <button
                key={p.hex}
                type="button"
                onClick={() => handleSelectHex(p.hex)}
                title={p.name}
                className={`w-8 h-8 rounded-full border border-black/10 mx-auto flex items-center justify-center transition-transform active:scale-95 shadow-xs ${
                  isSelected ? 'ring-2 ring-[#315F86] ring-offset-2' : ''
                }`}
                style={{ backgroundColor: p.hex }}
              >
                {isSelected && (
                  <Check
                    className={`w-4 h-4 ${
                      p.hex === '#FFFFFF' || p.hex === '#F2DFA0' ? 'text-black' : 'text-white'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: Màu tùy chỉnh (Custom Color: Native Picker + HEX Input) */}
      <div className="pt-2 border-t border-[#ECE6DC]">
        {!isCustomExpanded ? (
          <button
            type="button"
            onClick={() => setIsCustomExpanded(true)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#315F86]" />
              <span className="text-xs font-medium text-[#2E3338]">Thêm màu tùy chỉnh</span>
            </div>
            <span
              className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
              style={{ backgroundColor: currentSolidHex }}
            />
          </button>
        ) : (
          <div className="p-3 rounded-xl border border-[#ECE6DC] bg-white space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#2E3338]">Màu tùy chỉnh</span>
              <button
                type="button"
                onClick={() => setIsCustomExpanded(false)}
                className="text-xs text-[#666A6D] hover:text-[#2E3338]"
              >
                Thu gọn
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Native swatch trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => nativeInputRef.current?.click()}
                  title="Mở bảng chọn màu hệ thống"
                  className="w-10 h-10 rounded-xl border border-[#DDD6CC] shadow-xs flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                  style={{ backgroundColor: currentSolidHex }}
                />
                <input
                  ref={nativeInputRef}
                  type="color"
                  value={currentSolidHex}
                  onChange={(e) => {
                    const norm = normalizeHexColor(e.target.value);
                    if (norm) handleSelectHex(norm);
                  }}
                  className="sr-only"
                />
              </div>

              {/* HEX text field */}
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDD6CC] bg-[#FFFDF8]">
                  <span className="text-xs font-mono text-[#666A6D]">HEX</span>
                  <input
                    type="text"
                    value={hexInput}
                    onChange={(e) => handleHexInputChange(e.target.value)}
                    placeholder="#RRGGBB"
                    maxLength={7}
                    className="w-full text-xs font-mono font-medium uppercase outline-none bg-transparent"
                  />
                </div>
                {hexError && (
                  <p className="text-[10px] text-[#B3535D] font-medium">Mã HEX không hợp lệ (ví dụ: #315F86)</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck ColorPickerSheet**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/customizer/color-picker-sheet.tsx
git commit -m "feat(ui): implement ColorPickerSheet component with solid and gradient tabs"
```

---

### Task 6: Integrate ColorPickerSheet into EditorSheets, CustomizerShell, and DesignCanvas

**Files:**
- Modify: `src/components/customizer/editor-sheets.tsx` (Replace old inline color drawer with `ColorPickerContent`)
- Modify: `src/components/customizer/customizer-shell.tsx` (Wire `useColorEditor`, session closing with single undo transaction, preserve selection)
- Modify: `src/components/customizer/design-canvas.tsx` (Support `ColorValue` in text/shape/background styles)

**Interfaces:**
- Consumes: `useColorEditor`, `ColorPickerContent`, `colorValueToCss`, `colorValueToTextStyle`.
- Produces: Integrated color experience for text, shapes, and background.

- [ ] **Step 1: Update design-canvas.tsx to support ColorValue for text fill and surface background**

In `src/components/customizer/design-canvas.tsx`, import `colorValueToCss` and `colorValueToTextStyle` from `@/lib/color`.
Update background style:
```ts
const backgroundCss = productOptions.backgroundColorValue
  ? colorValueToCss(productOptions.backgroundColorValue as ColorValue)
  : backgroundColor;
```
Update text item rendering:
```ts
const textStyle: React.CSSProperties = {
  fontFamily: data.fontFamily || (typeof productOptions.fontFamily === 'string' ? productOptions.fontFamily : undefined),
  fontSize: `${data.fontSize || 20}px`,
  fontWeight: data.fontWeight === 'bold' ? 700 : data.fontWeight === 'medium' ? 500 : 400,
  fontStyle: data.fontStyle || 'normal',
  textAlign: data.align || 'center',
  lineHeight: data.lineHeight || 1.4,
  letterSpacing: `${data.letterSpacing || 0}px`,
  ...(data.colorValue ? colorValueToTextStyle(data.colorValue as ColorValue) : { color: data.color || color }),
};
```

- [ ] **Step 2: Update editor-sheets.tsx to render ColorPickerContent**

In `src/components/customizer/editor-sheets.tsx`:
Replace the old `activeSheet === 'color'` block with:
```tsx
{activeSheet === 'color' && (
  <ColorPickerContent
    currentColor={colorValue}
    onUpdateColor={onUpdateColorValue}
    designColors={designColors}
    recentColors={recentColors}
    isGradientSupported={isGradientSupported}
    onClose={onClose}
  />
)}
```

- [ ] **Step 3: Update customizer-shell.tsx to wire useColorEditor and preserve target**

In `src/components/customizer/customizer-shell.tsx`:
1. Derive active `ColorTarget`:
```ts
const activeColorTarget = useMemo<ColorTarget | null>(() => {
  if (selectedTarget === 'text') {
    const targetId = selectedTextId || selectedElementId || 'text-1';
    return { kind: 'element', elementId: targetId, property: 'fill' };
  }
  if (selectedTarget === null) {
    // If no target selected, Color edits surface background
    return { kind: 'surface', surfaceId: 'front', property: 'background' };
  }
  return null;
}, [selectedTarget, selectedTextId, selectedElementId]);
```
2. Call `useColorEditor`:
```ts
const [projectRecents, setProjectRecents] = useState<string[]>([]);

const {
  currentColor,
  updateColorLive,
  closeSession,
  designColors,
  recentColors,
  isGradientSupported,
} = useColorEditor({
  target: activeColorTarget,
  state,
  onUpdateState: (newState) => setState(newState),
  onCommitUndo: (baseState) => {
    setPast((prev) => [...prev, baseState]);
    setFuture([]);
  },
  projectRecents,
  onAddProjectRecent: (hex) => {
    setProjectRecents((prev) => [hex, ...prev.filter((c) => c !== hex)].slice(0, 8));
  },
});
```
3. In `handleCloseSheet`:
```ts
if (activeSheet === 'color') {
  closeSession();
}
```

- [ ] **Step 4: Run typecheck and test suite**

Run: `pnpm run typecheck && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/customizer/design-canvas.tsx src/components/customizer/editor-sheets.tsx src/components/customizer/customizer-shell.tsx
git commit -m "feat(customizer): connect ColorPickerSheet to design canvas and customizer shell"
```

---

### Task 7: End-to-End Verification & Polish

**Files:**
- Test: All tests in `src/test/`
- Polish: Changed customizer components

- [ ] **Step 1: Run complete unit test suite**

Run: `pnpm test`
Expected: 52+ tests passing.

- [ ] **Step 2: Run production Next.js build**

Run: `pnpm build`
Expected: Compiled successfully with zero errors.

- [ ] **Step 3: Run Impeccable mechanical detector**

Run: `node /Users/minhmice/.agents/skills/impeccable/scripts/detect.mjs --json src/lib/color/color-types.ts src/lib/color/color-validation.ts src/lib/color/color-renderers.ts src/lib/color/color-recents.ts src/lib/color/color-target.ts src/components/customizer/color-picker-sheet.tsx src/components/customizer/use-color-editor.ts src/components/customizer/editor-sheets.tsx src/components/customizer/customizer-shell.tsx src/components/customizer/design-canvas.tsx`
Expected: 0 findings.

- [ ] **Step 4: Browser smoke verification (Mobile 390px & Desktop 1280px)**

Launch dev server and use browser automation:
1. Mobile viewport (390x844):
   - Select text -> tap "Màu" -> verify sheet opens compact, text stays selected on canvas.
   - Switch between swatches (e.g. #315F86 -> #E8BCC9) -> verify live text update.
   - Switch to Gradient tab -> select Linear -> choose Color 1 & Color 2 -> check text gradient rendering.
   - Close sheet -> verify text remains selected and toolbar persists.
   - Click Undo once -> verify text restores to initial color in a single step.
2. Desktop viewport (1280x800):
   - Verify layout is clean, no horizontal scroll or overlapping elements.
3. Check console errors: 0 errors.

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/plans/2026-09-27-color-gradient-ux.md
git commit -m "chore(plan): complete implementation plan for color and gradient ux"
```
