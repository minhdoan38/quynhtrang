export type MaskType = 'none' | 'rectangle' | 'circle' | 'oval' | 'rounded' | 'heart';

export interface MaskPreset {
 id: MaskType;
 label: string;
 description: string;
 clipPath?: string;
 borderRadius?: string;
}

export const MASK_PRESETS: Readonly<MaskPreset[]> = Object.freeze([
 {
  id: 'none',
  label: 'Không',
  description: 'Khung ảnh chữ nhật nguyên bản',
  clipPath: 'none',
  borderRadius: '0px',
 },
 {
  id: 'rectangle',
  label: 'Chữ nhật',
  description: 'Khung chữ nhật chuẩn',
  clipPath: 'none',
  borderRadius: '0px',
 },
 {
  id: 'circle',
  label: 'Tròn',
  description: 'Khung tròn đồng tâm',
  clipPath: 'circle(50% at 50% 50%)',
  borderRadius: '9999px',
 },
 {
  id: 'oval',
  label: 'Oval',
  description: 'Khung hình bầu dục',
  clipPath: 'ellipse(50% 50% at 50% 50%)',
  borderRadius: '50%',
 },
 {
  id: 'rounded',
  label: 'Bo góc',
  description: 'Khung bo góc mềm mại',
  clipPath: 'inset(0% round 16px)',
  borderRadius: '16px',
 },
 {
  id: 'heart',
  label: 'Tim',
  description: 'Khung hình trái tim tình cảm',
  clipPath: 'url(#mask-heart)',
 },
]);

export function getMaskPreset(type?: string | null): MaskPreset {
 const found = MASK_PRESETS.find((p) => p.id === type);
 return found ?? MASK_PRESETS[0];
}

export function getMaskStyle(type?: string | null): React.CSSProperties {
 const preset = getMaskPreset(type);
 if (preset.id === 'none' || preset.id === 'rectangle') {
  return {};
 }
 if (preset.id === 'heart') {
  return {
   clipPath: 'url(#mask-heart)',
   WebkitClipPath: 'url(#mask-heart)',
  };
 }
 if (preset.id === 'rounded') {
  return {
   borderRadius: preset.borderRadius || '16px',
   overflow: 'hidden',
  };
 }
 if (preset.id === 'circle' || preset.id === 'oval') {
  return {
   clipPath: preset.clipPath,
   WebkitClipPath: preset.clipPath,
   borderRadius: preset.borderRadius,
   overflow: 'hidden',
  };
 }
 return {};
}

/**
 * Global SVG mask definitions markup for clipPath references.
 */
export const HEART_MASK_PATH =
 'M 0.5,0.85 C 0.1,0.55 0,0.35 0,0.22 C 0,0.1 0.1,0 0.25,0 C 0.35,0 0.44,0.06 0.5,0.15 C 0.56,0.06 0.65,0 0.75,0 C 0.9,0 1,0.1 1,0.22 C 1,0.35 0.9,0.55 0.5,0.85 Z';
