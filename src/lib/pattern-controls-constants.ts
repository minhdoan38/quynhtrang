import type { PatternRepeatMode } from './product-state';

export interface RepeatModeOption {
  readonly mode: PatternRepeatMode;
  readonly label: string;
  readonly description: string;
}

export const REPEAT_MODE_OPTIONS: readonly RepeatModeOption[] = [
  { mode: 'basic', label: 'Đều', description: 'Các họa tiết thẳng hàng ngang và dọc' },
  { mode: 'half-drop', label: 'So le dọc', description: 'Hàng dọc so le một nửa khoảng cách' },
  { mode: 'half-brick', label: 'So le ngang', description: 'Hàng ngang so le dạng xếp gạch' },
  { mode: 'mirror', label: 'Gương', description: 'Họa tiết lật đối xứng xen kẽ' },
] as const;

export const PATTERN_SCALE_LIMITS = Object.freeze({
  min: 40,
  max: 250,
  default: 100,
  step: 1,
});

export const PATTERN_SPACING_LIMITS = Object.freeze({
  min: 0,
  max: 60,
  default: 0,
  step: 1,
});

export const ROTATION_PRESETS: readonly number[] = [0, 15, 30, 45] as const;

export const CUSTOMER_LABELS = Object.freeze({
  repeatMode: 'Kiểu lặp',
  scale: 'Kích thước',
  spacing: 'Khoảng cách',
  background: 'Nền',
  rotate: 'Xoay họa tiết',
  reset: 'Khôi phục mặc định',
  scaleSmall: 'Họa tiết nhỏ',
  scaleLarge: 'Họa tiết lớn',
  spacingClose: 'Gần',
  spacingFar: 'Xa',
});

export const FORBIDDEN_TERMS = Object.freeze([
  'Tile',
  'Half-Drop',
  'Half-Brick',
  'Pattern Cell',
  'Repeat Matrix',
  'DPI',
  'PPI',
  'mm',
]);
