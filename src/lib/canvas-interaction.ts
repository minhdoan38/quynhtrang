export type TransformHandle = 'nw' | 'ne' | 'se' | 'sw' | 'rotate';

export interface ElementBounds {
  x: number; // center x (or left)
  y: number; // center y (or top)
  width: number;
  height: number;
}

export interface HitElement extends ElementBounds {
  id: string;
  zIndex?: number;
  locked?: boolean;
}

export interface TapPoint {
  x: number;
  y: number;
  time: number;
}

export const TAP_THRESHOLD_PX = 6;
export const DOUBLE_TAP_MAX_DELAY_MS = 320;
export const DOUBLE_TAP_MAX_DIST_PX = 16;
export const MIN_ELEMENT_SIZE_PX = 24;

export function isTapGesture(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = TAP_THRESHOLD_PX
): boolean {
  const dx = endX - startX;
  const dy = endY - startY;
  return Math.hypot(dx, dy) <= threshold;
}

export function isPointInsideBounds(
  px: number,
  py: number,
  box: ElementBounds,
  isCentered = false
): boolean {
  const left = isCentered ? box.x - box.width / 2 : box.x;
  const top = isCentered ? box.y - box.height / 2 : box.y;
  return px >= left && px <= left + box.width && py >= top && py <= top + box.height;
}

export function resolveTopMostElement<T extends HitElement>(
  px: number,
  py: number,
  elements: readonly T[],
  isCentered = false
): T | null {
  const hits = elements.filter((el) => isPointInsideBounds(px, py, el, isCentered));
  if (hits.length === 0) return null;
  // Sort descending by zIndex or array index if tied
  return hits.sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))[0];
}

export function computeAspectResize(
  initial: ElementBounds,
  handle: TransformHandle,
  deltaX: number,
  deltaY: number,
  lockAspectRatio = true,
  minSize = MIN_ELEMENT_SIZE_PX
): ElementBounds {
  const aspect = initial.height > 0 ? initial.width / initial.height : 1;
  let signedDelta = 0;

  switch (handle) {
    case 'se':
      signedDelta = Math.max(deltaX, deltaY);
      break;
    case 'sw':
      signedDelta = Math.max(-deltaX, deltaY);
      break;
    case 'ne':
      signedDelta = Math.max(deltaX, -deltaY);
      break;
    case 'nw':
      signedDelta = Math.max(-deltaX, -deltaY);
      break;
    default:
      return initial;
  }

  let newWidth = Math.max(minSize, initial.width + signedDelta);
  let newHeight = lockAspectRatio ? newWidth / aspect : Math.max(minSize, initial.height + deltaY);

  if (newHeight < minSize) {
    newHeight = minSize;
    if (lockAspectRatio) newWidth = minSize * aspect;
  }

  // ponytail: anchor center during symmetric resize; asymmetric anchor upgrade when multi-anchor spec lands
  return {
    x: initial.x,
    y: initial.y,
    width: Math.round(newWidth),
    height: Math.round(newHeight),
  };
}

export function computeRotationAngle(
  centerX: number,
  centerY: number,
  pointerX: number,
  pointerY: number
): number {
  const radians = Math.atan2(pointerY - centerY, pointerX - centerX);
  const degrees = Math.round((radians * 180) / Math.PI);
  // Normalize 0-360 where top is 0deg (pointerY < centerY, pointerX = centerX is 270/top in canvas)
  // Standard atan2: right is 0, down is 90, left is 180, up is -90.
  // Converting to standard degrees: (degrees + 90 + 360) % 360
  return (degrees + 90 + 360) % 360;
}

export function isDoubleTap(
  prev: TapPoint,
  curr: TapPoint,
  maxDelay = DOUBLE_TAP_MAX_DELAY_MS,
  maxDist = DOUBLE_TAP_MAX_DIST_PX
): boolean {
  const dt = curr.time - prev.time;
  if (dt <= 0 || dt > maxDelay) return false;
  return Math.hypot(curr.x - prev.x, curr.y - prev.y) <= maxDist;
}
