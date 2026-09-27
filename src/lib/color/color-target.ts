import type { ColorTarget, ColorValue, HexColor } from './color-types.ts';
import { createSolidColor, ensureColorValue, normalizeHexColor } from './color-validation.ts';
import { getTextData, type DesignState } from '../product-state.ts';

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
      if (target.elementId === 'text-1') {
        const optVal = (state.productOptions as Record<string, unknown> | undefined)?.textColorValue;
        return ensureColorValue(optVal ?? state.color, '#2E3338');
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

  // 1. Surface background & top-level text color
  addColor((state.productOptions as Record<string, unknown> | undefined)?.backgroundColorValue ?? state.backgroundColor);
  addColor((state.productOptions as Record<string, unknown> | undefined)?.textColorValue ?? state.color);

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
