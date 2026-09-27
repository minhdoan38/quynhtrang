export interface ImageCropData {
 scale?: number; // 1.0 = base cover
 offsetX?: number; // px offset in frame space
 offsetY?: number; // px offset in frame space
 rotation?: number; // degrees
 // Optional normalized / legacy bounds
 x?: number;
 y?: number;
 width?: number;
 height?: number;
}

export const DEFAULT_CROP: Readonly<ImageCropData> = Object.freeze({
 scale: 1,
 offsetX: 0,
 offsetY: 0,
 rotation: 0,
});

export function createDefaultCrop(): ImageCropData {
 return { ...DEFAULT_CROP };
}

/**
 * Calculates base cover dimensions for an image inside a frame.
 */
export function calculateCoverDimensions(
 frameWidth: number,
 frameHeight: number,
 imageWidth: number,
 imageHeight: number
): { width: number; height: number; baseScale: number } {
 const fw = Math.max(1, frameWidth);
 const fh = Math.max(1, frameHeight);
 const iw = Math.max(1, imageWidth || fw);
 const ih = Math.max(1, imageHeight || fh);

 const scale = Math.max(fw / iw, fh / ih);
 return {
  width: Math.round(iw * scale),
  height: Math.round(ih * scale),
  baseScale: scale,
 };
}

/**
 * Clamps crop offsets so the image content stays covering the frame as much as possible,
 * or allows elastic repositioning with sensible bounds.
 */
export function clampCropOffsets(
 crop: ImageCropData,
 frameWidth: number,
 frameHeight: number,
 imageWidth: number,
 imageHeight: number
): ImageCropData {
 const currentScale = Math.max(1, Math.min(5, crop.scale || 1));
 const cover = calculateCoverDimensions(frameWidth, frameHeight, imageWidth, imageHeight);
 const renderedW = cover.width * currentScale;
 const renderedH = cover.height * currentScale;

 // Maximum allowed pan distance from center (half excess dimension)
 const maxPanX = Math.max(0, (renderedW - frameWidth) / 2);
 const maxPanY = Math.max(0, (renderedH - frameHeight) / 2);

 const clampedX = Math.max(-maxPanX, Math.min(maxPanX, crop.offsetX || 0));
 const clampedY = Math.max(-maxPanY, Math.min(maxPanY, crop.offsetY || 0));

 return {
  scale: Number(currentScale.toFixed(3)),
  offsetX: Math.round(clampedX),
  offsetY: Math.round(clampedY),
  rotation: crop.rotation ?? 0,
 };
}

/**
 * Applies relative pan (drag) to crop state.
 */
export function applyCropPan(
 current: ImageCropData,
 deltaX: number,
 deltaY: number,
 frameWidth: number,
 frameHeight: number,
 imageWidth: number,
 imageHeight: number
): ImageCropData {
 const next = {
  ...current,
  offsetX: (current.offsetX || 0) + deltaX,
  offsetY: (current.offsetY || 0) + deltaY,
 };
 return clampCropOffsets(next, frameWidth, frameHeight, imageWidth, imageHeight);
}

/**
 * Applies pinch zoom to crop state.
 */
export function applyCropPinch(
 current: ImageCropData,
 scaleMultiplier: number,
 frameWidth: number,
 frameHeight: number,
 imageWidth: number,
 imageHeight: number
): ImageCropData {
 const nextScale = (current.scale || 1) * scaleMultiplier;
 const next = {
  ...current,
  scale: nextScale,
 };
 return clampCropOffsets(next, frameWidth, frameHeight, imageWidth, imageHeight);
}

/**
 * Returns CSS transform string for rendering the image content inside its fixed frame.
 */
export function getCropTransformStyle(
 crop?: ImageCropData | null
): { transform: string; transformOrigin: string } {
 if (!crop) {
  return {
   transform: 'translate3d(0px, 0px, 0px) scale(1)',
   transformOrigin: 'center center',
  };
 }

 const s = crop.scale || 1;
 const x = crop.offsetX || 0;
 const y = crop.offsetY || 0;
 const r = crop.rotation || 0;

 let transform = `translate3d(${x}px, ${y}px, 0px) scale(${s})`;
 if (r) {
  transform += ` rotate(${r}deg)`;
 }

 return {
  transform,
  transformOrigin: 'center center',
 };
}
