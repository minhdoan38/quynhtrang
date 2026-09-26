export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  isFit: boolean;
}

export interface WorkspaceBounds {
  width: number;
  height: number;
}

export interface CanvasBounds {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 3.0;
export const FIT_PADDING = 32;

export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Math.max(min, Math.min(max, Number(zoom.toFixed(3))));
}

export function computeFitScale(
  workspace: WorkspaceBounds,
  canvas: CanvasBounds,
  padding = FIT_PADDING
): number {
  if (workspace.width <= 0 || workspace.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    return 1.0;
  }
  const availW = Math.max(10, workspace.width - padding * 2);
  const availH = Math.max(10, workspace.height - padding * 2);
  const scaleX = availW / canvas.width;
  const scaleY = availH / canvas.height;
  return clampZoom(Math.min(scaleX, scaleY));
}

export function canOneFingerPan(
  viewport: ViewportState,
  workspace: WorkspaceBounds,
  canvas: CanvasBounds
): boolean {
  if (viewport.isFit && viewport.zoom <= 1.05) {
    return false;
  }
  const effectiveW = canvas.width * viewport.zoom;
  const effectiveH = canvas.height * viewport.zoom;
  // ponytail: one-finger pan only when canvas overflows viewport bounds
  return effectiveW > workspace.width || effectiveH > workspace.height || viewport.zoom > 1.1;
}

export function applyPan(
  current: ViewportState,
  deltaX: number,
  deltaY: number,
  canPan: boolean
): ViewportState {
  if (!canPan) return current;
  return {
    ...current,
    panX: current.panX + deltaX,
    panY: current.panY + deltaY,
    isFit: false,
  };
}

export function applyPinchZoom(
  current: ViewportState,
  startDistance: number,
  currentDistance: number,
  centerDeltaX = 0,
  centerDeltaY = 0
): ViewportState {
  if (startDistance <= 0 || currentDistance <= 0) return current;
  const ratio = currentDistance / startDistance;
  const nextZoom = clampZoom(current.zoom * ratio);
  return {
    zoom: nextZoom,
    panX: current.panX + centerDeltaX,
    panY: current.panY + centerDeltaY,
    isFit: false,
  };
}

export function resetToFit(): ViewportState {
  return {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isFit: true,
  };
}
