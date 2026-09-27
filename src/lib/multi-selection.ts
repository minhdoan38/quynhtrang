import type { CanvasElement } from './product-state.ts';

export interface CombinedBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/**
 * Computes outer axis-aligned bounding box enclosing all given elements
 */
export function computeCombinedBounds(elements: readonly CanvasElement[]): CombinedBounds | null {
  if (!elements || elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const halfW = (el.width || 0) / 2;
    const halfH = (el.height || 0) / 2;
    const left = el.x - halfW;
    const right = el.x + halfW;
    const top = el.y - halfH;
    const bottom = el.y + halfH;

    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;

  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;

  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX,
    centerY,
    width,
    height,
  };
}

/**
 * Translates an array of elements by (dx, dy)
 */
export function moveElements(
  elements: CanvasElement[],
  ids: readonly string[],
  dx: number,
  dy: number
): CanvasElement[] {
  const idSet = new Set(ids);
  return elements.map((el) => {
    if (!idSet.has(el.id) || el.locked) return el;
    return {
      ...el,
      x: el.x + dx,
      y: el.y + dy,
    };
  });
}

/**
 * Scales an array of elements uniformly relative to their combined center
 */
export function scaleElementsUniform(
  elements: CanvasElement[],
  ids: readonly string[],
  initialBounds: CombinedBounds,
  scaleRatio: number
): CanvasElement[] {
  const idSet = new Set(ids);
  const ratio = Math.max(0.05, Math.min(10, scaleRatio));

  return elements.map((el) => {
    if (!idSet.has(el.id) || el.locked) return el;

    const relX = el.x - initialBounds.centerX;
    const relY = el.y - initialBounds.centerY;

    return {
      ...el,
      x: Number((initialBounds.centerX + relX * ratio).toFixed(2)),
      y: Number((initialBounds.centerY + relY * ratio).toFixed(2)),
      width: Math.max(2, Math.round((el.width || 10) * ratio)),
      height: Math.max(2, Math.round((el.height || 10) * ratio)),
    };
  });
}

/**
 * Rotates an array of elements around their collective center point
 */
export function rotateElementsAroundCenter(
  elements: CanvasElement[],
  ids: readonly string[],
  center: { x: number; y: number },
  deltaDegrees: number
): CanvasElement[] {
  const idSet = new Set(ids);
  const rad = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return elements.map((el) => {
    if (!idSet.has(el.id) || el.locked) return el;

    const dx = el.x - center.x;
    const dy = el.y - center.y;

    const nextX = center.x + (dx * cos - dy * sin);
    const nextY = center.y + (dx * sin + dy * cos);
    const nextRotation = (el.rotation + deltaDegrees + 360) % 360;

    return {
      ...el,
      x: Number(nextX.toFixed(2)),
      y: Number(nextY.toFixed(2)),
      rotation: Math.round(nextRotation),
    };
  });
}

/**
 * Filters target IDs down to only editable, unlocked elements belonging to the active surface
 */
export function filterEditableSelection(
  elements: readonly CanvasElement[],
  ids: readonly string[],
  activeSurface: string = 'front'
): string[] {
  const idSet = new Set(ids);
  return elements
    .filter((el) => {
      if (!idSet.has(el.id)) return false;
      if (el.locked) return false;
      const elSurface = el.surface || 'front';
      if (elSurface !== activeSurface) return false;
      return true;
    })
    .map((el) => el.id);
}
