import type { PatternConfig, PatternRepeatMode } from './product-state.ts';

export type { PatternConfig, PatternRepeatMode, WrappingPaperMode } from './product-state.ts';

export interface PatternCell {
 readonly col: number;
 readonly row: number;
 readonly x: number;
 readonly y: number;
 readonly width: number;
 readonly height: number;
 readonly scale: number;
 readonly rotation: number;
 readonly mirrorX: boolean;
 readonly mirrorY: boolean;
}

export interface PatternBounds {
 readonly width: number;
 readonly height: number;
}

export interface PatternRect {
 readonly minX: number;
 readonly minY: number;
 readonly maxX: number;
 readonly maxY: number;
}

export interface PatternGridResult {
 readonly cells: PatternCell[];
 readonly bounds: PatternBounds;
 readonly overdraw: PatternRect;
 readonly clipBounds: PatternRect;
 readonly clippingBounds: PatternRect;
 readonly totalCount: number;
}

export interface BaseMotifSize {
 readonly width: number;
 readonly height: number;
}

const SHEET_SIZES: Readonly<Record<string, PatternBounds>> = Object.freeze({
 a1: Object.freeze({ width: 594, height: 841 }),
 a2: Object.freeze({ width: 420, height: 594 }),
});

const DEFAULT_MOTIF_SIZE: BaseMotifSize = Object.freeze({ width: 100, height: 100 });

/** Return physical millimetre dimensions for wrapping-paper variants. */
export function getWrappingPaperDimensions(variantId: string): {
 width: number;
 height: number;
 aspectRatio: number;
} {
 const key = variantId.trim().toLowerCase();
 const size = SHEET_SIZES[key] ?? SHEET_SIZES.a1;
 return { width: size.width, height: size.height, aspectRatio: size.width / size.height };
}

/**
 * Build repeat transforms in physical design coordinates.
 * Returned cells are render instructions only; source design elements stay untouched.
 */
export function computePatternGrid(params: {
 sheetWidth: number;
 sheetHeight: number;
 config: PatternConfig;
 baseMotifSize?: BaseMotifSize;
}): PatternGridResult {
 const sheetWidth = Number.isFinite(params.sheetWidth) && params.sheetWidth > 0 ? params.sheetWidth : 1;
 const sheetHeight = Number.isFinite(params.sheetHeight) && params.sheetHeight > 0 ? params.sheetHeight : 1;
 const config = params.config;
 const motif = params.baseMotifSize ?? DEFAULT_MOTIF_SIZE;
 const baseWidth = Number.isFinite(motif.width) && motif.width > 0 ? motif.width : DEFAULT_MOTIF_SIZE.width;
 const baseHeight = Number.isFinite(motif.height) && motif.height > 0 ? motif.height : DEFAULT_MOTIF_SIZE.height;
 const scaleRaw = Number.isFinite(config.scale) && config.scale > 0 ? config.scale : 100;
 const scale = scaleRaw / 100;
 const width = baseWidth * scale;
 const height = baseHeight * scale;
 const spacingX = Number.isFinite(config.spacingX) ? Math.max(0, config.spacingX) : 0;
 const spacingY = Number.isFinite(config.spacingY) ? Math.max(0, config.spacingY) : 0;
 const periodX = width + spacingX;
 const periodY = height + spacingY;
 const rawRotation = Number.isFinite(config.rotation) ? config.rotation : 0;
 const rotation = ((rawRotation % 360) + 360) % 360;
 const radians = (rotation * Math.PI) / 180;
 const sin = Math.abs(Math.sin(radians));
 const cos = Math.abs(Math.cos(radians));
 const rotWidth = width * cos + height * sin;
 const rotHeight = width * sin + height * cos;

 const buffer = Math.max(width, height, rotWidth, rotHeight, periodX, periodY);
 const overdraw: PatternRect = Object.freeze({
  minX: -buffer,
  minY: -buffer,
  maxX: sheetWidth + buffer,
  maxY: sheetHeight + buffer,
 });

 const firstCol = Math.floor(overdraw.minX / periodX) - 1;
 const lastCol = Math.ceil(overdraw.maxX / periodX) + 1;
 const firstRow = Math.floor(overdraw.minY / periodY) - 1;
 const lastRow = Math.ceil(overdraw.maxY / periodY) + 1;
 const cells: PatternCell[] = [];
 const repeatMode: PatternRepeatMode = config.repeatMode;

 for (let row = firstRow; row <= lastRow; row += 1) {
  for (let col = firstCol; col <= lastCol; col += 1) {
   const isOddRow = Math.abs(row) % 2 === 1;
   const isOddCol = Math.abs(col) % 2 === 1;
   const xOffset = repeatMode === 'half-brick' && isOddRow ? periodX / 2 : 0;
   const yOffset = repeatMode === 'half-drop' && isOddCol ? periodY / 2 : 0;
   cells.push({
    col,
    row,
    x: col * periodX + xOffset,
    y: row * periodY + yOffset,
    width,
    height,
    scale,
    rotation,
    mirrorX: repeatMode === 'mirror' && isOddCol,
    mirrorY: repeatMode === 'mirror' && isOddRow,
   });
  }
 }

 const clipBounds: PatternRect = Object.freeze({
  minX: 0,
  minY: 0,
  maxX: sheetWidth,
  maxY: sheetHeight,
 });

 return {
  cells,
  bounds: { width: sheetWidth, height: sheetHeight },
  overdraw,
  clipBounds,
  clippingBounds: clipBounds,
  totalCount: cells.length,
 };
}

export interface SvgPatternDefinitionOptions {
 readonly id?: string;
 readonly content?: string;
}

/** Render a grid as reusable SVG pattern markup without creating document elements. */
export function generateSvgPatternDef(
 grid: PatternGridResult,
 options: SvgPatternDefinitionOptions = {},
): string {
 const id = options.id ?? 'wrapping-paper-pattern';
 const content = options.content ?? '';
 const cells = grid.cells.map((cell) => {
  const flipX = cell.mirrorX ? -1 : 1;
  const flipY = cell.mirrorY ? -1 : 1;
  const transform = `translate(${cell.x} ${cell.y}) rotate(${cell.rotation} ${cell.width / 2} ${cell.height / 2}) scale(${flipX * cell.scale} ${flipY * cell.scale})`;
  return `<g data-col="${cell.col}" data-row="${cell.row}" transform="${transform}">${content}</g>`;
 }).join('');
 return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${grid.bounds.width}" height="${grid.bounds.height}"><g data-origin="${grid.bounds.width / 2} ${grid.bounds.height / 2}">${cells}</g></pattern>`;
}
