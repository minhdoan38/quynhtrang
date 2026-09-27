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
