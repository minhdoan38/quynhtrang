import type {
  HexColor,
  SolidColor,
  LinearGradientColor,
  RadialGradientColor,
  GradientColor,
  ColorValue,
  GradientDirection,
} from './color-types.ts';

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
