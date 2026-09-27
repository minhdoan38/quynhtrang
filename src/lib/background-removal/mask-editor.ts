import type { BrushStroke, RefineSessionState, StrokePoint } from './types';

export function createRefineSessionState(initialBrushSize = 24): RefineSessionState {
 return {
  strokes: [],
  currentMode: 'erase',
  brushSize: initialBrushSize,
  showOriginal: false,
  canUndo: false,
 };
}

export function addBrushStroke(
 state: RefineSessionState,
 stroke: BrushStroke
): RefineSessionState {
 const nextStrokes = [...state.strokes, stroke];
 return {
  ...state,
  strokes: nextStrokes,
  canUndo: nextStrokes.length > 0,
 };
}

export function undoLastStroke(state: RefineSessionState): RefineSessionState {
 if (state.strokes.length === 0) return state;
 const nextStrokes = state.strokes.slice(0, -1);
 return {
  ...state,
  strokes: nextStrokes,
  canUndo: nextStrokes.length > 0,
 };
}

export function createNewStroke(
 mode: 'erase' | 'restore',
 size: number,
 initialPoint: StrokePoint
): BrushStroke {
 return {
  id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  mode,
  size: Math.max(4, Math.min(80, size)),
  points: [initialPoint],
 };
}

export function appendPointToStroke(
 stroke: BrushStroke,
 point: StrokePoint
): BrushStroke {
 return {
  ...stroke,
  points: [...stroke.points, point],
 };
}

/**
 * Renders brush strokes onto a 2D canvas context.
 * 'erase' removes alpha (destination-out).
 * 'restore' reveals content (source-over).
 */
export function drawStrokeOnContext(
 ctx: CanvasRenderingContext2D,
 stroke: BrushStroke
) {
 if (stroke.points.length === 0) return;

 ctx.save();
 ctx.lineCap = 'round';
 ctx.lineJoin = 'round';
 ctx.lineWidth = stroke.size;

 if (stroke.mode === 'erase') {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
 } else {
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
  ctx.fillStyle = 'rgba(255, 255, 255, 1)';
 }

 if (stroke.points.length === 1) {
  const p = stroke.points[0];
  ctx.beginPath();
  ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
  ctx.fill();
 } else {
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
   ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
 }

 ctx.restore();
}
