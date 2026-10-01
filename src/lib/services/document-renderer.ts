import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

import type { ColorValue } from '../color/color-types.ts';
import { colorValueToCss } from '../color/color-renderers.ts';
import { computePatternGrid, getWrappingPaperDimensions } from '../pattern-renderer.ts';
import type {
  CanvasElement,
  CardSurface,
  DesignState,
  FixedStickerShape,
  StickerOptions,
} from '../product-state.ts';
import {
  getImageData,
  getTextData,
  normalizeWrappingOptions,
} from '../product-state.ts';
import { computeStickerContour } from '../sticker-contour.ts';

export interface DocumentRenderOptions {
  surface?: string;
  widthPx?: number;
  heightPx?: number;
}

export interface DocumentRenderDimensions {
  width: number;
  height: number;
}

export interface DocumentRenderResult {
  png: Uint8Array;
  sha256: string;
  engineFingerprint: string;
}

const CARD_SURFACE_LOOKUP: Record<CardSurface, true> = {
  front: true,
  inside: true,
  back: true,
};

const MAX_RENDER_DIMENSION = 4096;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveCssColor(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    try {
      return colorValueToCss(value as ColorValue);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function resolveImageOpacity(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 100;
  const normalized = num > 1 ? num / 100 : num;
  return Math.max(0, Math.min(1, normalized));
}

function buildElementBoxStyle(
  element: CanvasElement,
  coordinateSpace?: { width: number; height: number },
): string {
  const x = typeof element.x === 'number' && Number.isFinite(element.x) ? element.x : 0;
  const y = typeof element.y === 'number' && Number.isFinite(element.y) ? element.y : 0;
  const w = typeof element.width === 'number' && Number.isFinite(element.width) ? element.width : 0;
  const h = typeof element.height === 'number' && Number.isFinite(element.height) ? element.height : 0;
  const z = typeof element.zIndex === 'number' && Number.isFinite(element.zIndex) ? element.zIndex : 0;
  const r = typeof element.rotation === 'number' && Number.isFinite(element.rotation) ? element.rotation : 0;

  const left = coordinateSpace ? (x / coordinateSpace.width) * 100 : x;
  const top = coordinateSpace ? (y / coordinateSpace.height) * 100 : y;
  const width = coordinateSpace ? (w / coordinateSpace.width) * 100 : w;
  const height = coordinateSpace ? (h / coordinateSpace.height) * 100 : h;

  return `left:${left}%;top:${top}%;width:${width}%;height:${height}%;z-index:${z};transform:translate(-50%,-50%) rotate(${r}deg);`;
}

function renderElementHtml(
  element: CanvasElement,
  design: DesignState,
  coordinateSpace?: { width: number; height: number },
): string {
  if (element.type === 'group') return '';
  const boxStyle = buildElementBoxStyle(element, coordinateSpace);

  if (element.type === 'image') {
    const data = getImageData(element);
    if (!data?.src || data.placeholder) return '';

    let maskStyle = '';
    if (data.mask === 'circle') {
      maskStyle = 'clip-path:circle(50% at 50% 50%);border-radius:50%;';
    } else if (data.mask === 'oval') {
      maskStyle = 'clip-path:ellipse(50% 50% at 50% 50%);border-radius:50%;';
    } else if (data.mask === 'rounded') {
      maskStyle = 'clip-path:inset(0 round 16px);border-radius:16px;';
    } else if (data.mask === 'heart') {
      maskStyle = 'clip-path:polygon(50% 92%,8% 52%,4% 32%,8% 15%,20% 5%,36% 7%,50% 22%,64% 7%,80% 5%,92% 15%,96% 32%,92% 52%);';
    }

    const crop = data.crop;
    const cropX = typeof crop?.offsetX === 'number' && Number.isFinite(crop.offsetX) ? crop.offsetX : 0;
    const cropY = typeof crop?.offsetY === 'number' && Number.isFinite(crop.offsetY) ? crop.offsetY : 0;
    const cropScale = typeof crop?.scale === 'number' && Number.isFinite(crop.scale) ? Math.max(0.01, crop.scale) : 1;
    const cropRotation = typeof crop?.rotation === 'number' && Number.isFinite(crop.rotation) ? crop.rotation : 0;
    const cropTransform = `translate3d(${cropX}px,${cropY}px,0) scale(${cropScale}) rotate(${cropRotation}deg)`;

    return `<div class="dr-element dr-image-frame" data-render-element="image" style="${boxStyle}${maskStyle}opacity:${resolveImageOpacity(data.opacity)}"><img src="${escapeHtml(data.src)}" alt="" style="transform:${cropTransform}" /></div>`;
  }

  if (element.type === 'text') {
    const data = getTextData(element);
    if (!data?.text || data.text.trim().length === 0 || data.placeholder) return '';

    const resolvedColor = resolveCssColor(
      (element.data as Record<string, unknown> | undefined)?.colorValue,
      data.color || design.color,
    );
    const colorStyle = resolvedColor.includes('gradient(')
      ? `background-image:${resolvedColor};background-clip:text;-webkit-background-clip:text;color:transparent;-webkit-text-fill-color:transparent;`
      : `color:${resolvedColor};`;

    const fontWeight = data.fontWeight === 'bold' ? 700 : data.fontWeight === 'medium' ? 500 : 400;
    const fontSize = typeof data.fontSize === 'number' && Number.isFinite(data.fontSize) ? Math.max(1, data.fontSize) : 20;
    const lineHeight = typeof data.lineHeight === 'number' && Number.isFinite(data.lineHeight) ? Math.max(0.1, data.lineHeight) : 1.4;
    const letterSpacing = typeof data.letterSpacing === 'number' && Number.isFinite(data.letterSpacing) ? data.letterSpacing : 0;

    return `<div class="dr-element dr-text" data-render-element="text" style="${boxStyle}${colorStyle}font-family:${escapeHtml(data.fontFamily || 'sans-serif')};font-size:${fontSize}px;font-style:${data.fontStyle === 'italic' ? 'italic' : 'normal'};font-weight:${fontWeight};line-height:${lineHeight};letter-spacing:${letterSpacing}px;text-align:${data.align || 'center'}">${escapeHtml(data.text)}</div>`;
  }

  const rawData = (element.data ?? {}) as Record<string, unknown>;
  const fill = resolveCssColor(rawData.fillValue ?? rawData.fill ?? rawData.color, design.color || '#111827');
  const stroke = resolveCssColor(rawData.strokeValue ?? rawData.stroke ?? rawData.border, 'transparent');
  const strokeWidth = typeof rawData.strokeWidth === 'number' && Number.isFinite(rawData.strokeWidth)
    ? Math.max(0, rawData.strokeWidth)
    : typeof rawData.borderWidth === 'number' && Number.isFinite(rawData.borderWidth)
      ? Math.max(0, rawData.borderWidth)
      : 0;

  return `<div class="dr-element dr-shape" data-render-element="${escapeHtml(element.type)}" style="${boxStyle}background:${fill};border:${strokeWidth}px solid ${stroke};border-radius:${escapeHtml(rawData.borderRadius ?? '8px')};"></div>`;
}

function renderLegacyContent(design: DesignState): string {
  const imageHtml = design.image?.src
    ? `<img class="dr-legacy-image" src="${escapeHtml(design.image.src)}" alt="" />`
    : '';
  const textHtml = design.text && design.text.trim().length > 0
    ? `<div class="dr-legacy-text" style="color:${escapeHtml(design.color || '#111827')}">${escapeHtml(design.text)}</div>`
    : '';
  return `${imageHtml}${textHtml}`;
}

function renderCardMarkup(design: DesignState, surface: CardSurface): string {
  const elements = [...(design.elements ?? [])]
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
    .filter((element) => (element.surface ?? 'front') === surface);

  const inner = elements.map((element) => renderElementHtml(element, design)).join('')
    || (surface === 'front' ? renderLegacyContent(design) : '');
  const background = resolveCssColor(design.productOptions.backgroundColorValue, design.backgroundColor || '#ffffff');

  return `<div class="dr-surface dr-card" data-product="card" data-surface="${surface}" style="background:${background}">${inner}</div>`;
}

function renderWrappingMarkup(design: DesignState): string {
  const options = normalizeWrappingOptions(design.productOptions);
  const variantKey = design.variantId || String(design.productOptions.variant || 'a1');
  const dimensions = getWrappingPaperDimensions(variantKey);
  const elements = [...(design.elements ?? [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const background = resolveCssColor(
    design.productOptions.backgroundColorValue,
    options.patternConfig.backgroundColor || design.backgroundColor || '#ffffff',
  );

  if (options.mode === 'pattern' && options.patternConfig.enabled) {
    const rawScale = typeof options.patternConfig.scale === 'number' && Number.isFinite(options.patternConfig.scale)
      ? options.patternConfig.scale
      : 100;
    const boundedConfig = {
      ...options.patternConfig,
      scale: Math.max(10, Math.min(500, rawScale)),
    };
    const grid = computePatternGrid({
      sheetWidth: dimensions.width,
      sheetHeight: dimensions.height,
      config: boundedConfig,
    });

    const motifMarkup = elements.map((element) => renderElementHtml(element, design)).join('') || renderLegacyContent(design);
    const cellsMarkup = grid.cells.map((cell) => {
      const left = (cell.x / dimensions.width) * 100;
      const top = (cell.y / dimensions.height) * 100;
      const width = (cell.width / dimensions.width) * 100;
      const height = (cell.height / dimensions.height) * 100;
      const mirrorX = cell.mirrorX ? -1 : 1;
      const mirrorY = cell.mirrorY ? -1 : 1;
      return `<div class="dr-pattern-cell" data-pattern-cell style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;transform:rotate(${cell.rotation}deg) scaleX(${mirrorX}) scaleY(${mirrorY})"><div class="dr-motif">${motifMarkup}</div></div>`;
    }).join('');

    return `<div class="dr-surface dr-wrapping" data-product="wrapping" data-mode="pattern" style="background:${background}">${cellsMarkup}</div>`;
  }

  const inner = elements.map((element) => renderElementHtml(element, design, dimensions)).join('') || renderLegacyContent(design);
  return `<div class="dr-surface dr-wrapping" data-product="wrapping" data-mode="full-sheet" style="background:${background}">${inner}</div>`;
}

function renderStickerMarkup(design: DesignState): string {
  const options = design.productOptions as StickerOptions;
  const elements = [...(design.elements ?? [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const inner = elements.map((element) => renderElementHtml(element, design)).join('') || renderLegacyContent(design);
  const background = resolveCssColor(design.productOptions.backgroundColorValue, design.backgroundColor || '#ffffff');
  const shape = options.shape as FixedStickerShape | undefined;
  const rawBorder = typeof options.borderWidth === 'number' && Number.isFinite(options.borderWidth) ? options.borderWidth : 2;
  const borderWidth = options.hasWhiteBorder ? Math.max(0, rawBorder) : 0;

  if (shape) {
    const aspect = shape === 'circle' || shape === 'square' ? '1 / 1' : '1.4 / 1';
    const borderRadius = shape === 'circle' || shape === 'oval'
      ? '50%'
      : shape === 'rounded-rectangle'
        ? '16px'
        : '0';

    return `<div class="dr-surface dr-sticker"><div class="dr-sticker-fixed" data-product="sticker" data-sticker-shape="${escapeHtml(shape)}" style="aspect-ratio:${aspect};border-radius:${borderRadius};border:${borderWidth}px solid white;background:${background}">${inner}</div></div>`;
  }

  const contour = computeStickerContour(elements, options);
  const borderPath = contour.borderSvgPath || 'M2 2 H98 V98 H2 Z';
  const borderSvg = options.hasWhiteBorder
    ? `<svg class="dr-sticker-border" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${escapeHtml(borderPath)}" fill="white" stroke="white" stroke-width="${Math.max(1, borderWidth * 0.8)}" stroke-linejoin="round" /></svg>`
    : '';

  return `<div class="dr-surface dr-sticker" data-product="sticker" data-sticker-shape="die-cut" style="background:transparent">${borderSvg}<div class="dr-sticker-art" style="background:${background}">${inner}</div></div>`;
}

function renderNotebookMarkup(design: DesignState): string {
  const elements = [...(design.elements ?? [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const inner = elements.map((element) => renderElementHtml(element, design)).join('') || renderLegacyContent(design);
  const background = resolveCssColor(design.productOptions.backgroundColorValue, design.backgroundColor || '#ffffff');
  return `<div class="dr-surface dr-notebook" data-product="notebook" style="background:${background}">${inner}</div>`;
}

export function resolveDocumentRenderSurface(design: DesignState, requestedSurface?: string): CardSurface {
  const candidate = requestedSurface ?? design.productOptions.surface;
  if (typeof candidate === 'string' && candidate in CARD_SURFACE_LOOKUP) {
    return candidate as CardSurface;
  }
  return 'front';
}

export function getDocumentRenderDimensions(
  design: DesignState,
  options: DocumentRenderOptions = {},
): DocumentRenderDimensions {
  const surface = resolveDocumentRenderSurface(design, options.surface);
  const isVertical = design.variantId === 'vertical'
    || design.productOptions.orientation === 'vertical'
    || design.productOptions.variant === 'vertical';

  let naturalDimensions: DocumentRenderDimensions;
  switch (design.productId) {
    case 'card':
      naturalDimensions = isVertical
        ? { width: surface === 'inside' ? 840 : 420, height: 592 }
        : { width: surface === 'inside' ? 1184 : 592, height: 420 };
      break;
    case 'wrapping':
      naturalDimensions = { width: 600, height: 600 };
      break;
    case 'sticker':
      naturalDimensions = { width: 400, height: 400 };
      break;
    case 'notebook':
      naturalDimensions = { width: 592, height: 840 };
      break;
    default:
      throw new Error(`Unsupported product: ${String((design as DesignState).productId)}`);
  }

  const width = options.widthPx ?? naturalDimensions.width;
  const height = options.heightPx ?? naturalDimensions.height;

  if (
    !Number.isInteger(width)
    || width < 2
    || width > MAX_RENDER_DIMENSION
    || !Number.isInteger(height)
    || height < 2
    || height > MAX_RENDER_DIMENSION
  ) {
    throw new RangeError(`Render dimensions must be integers from 2 to ${MAX_RENDER_DIMENSION}`);
  }

  return { width, height };
}

export function generateDocumentRenderMarkup(
  design: DesignState,
  options: DocumentRenderOptions = {},
): string {
  switch (design.productId) {
    case 'card':
      return renderCardMarkup(design, resolveDocumentRenderSurface(design, options.surface));
    case 'wrapping':
      return renderWrappingMarkup(design);
    case 'sticker':
      return renderStickerMarkup(design);
    case 'notebook':
      return renderNotebookMarkup(design);
    default:
      throw new Error(`Unsupported product: ${String((design as DesignState).productId)}`);
  }
}

export function getDocumentRenderCss(): string {
  return `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
body{font-family:Arial,sans-serif}
#render-container{position:relative;overflow:hidden}
.dr-surface{position:relative;width:100%;height:100%;overflow:hidden;isolation:isolate}
.dr-element{position:absolute;box-sizing:border-box}
.dr-image-frame{overflow:hidden}
.dr-image-frame img{display:block;width:100%;height:100%;object-fit:cover;transform-origin:center}
.dr-text{display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;padding:1px}
.dr-shape{overflow:hidden}
.dr-legacy-image{position:absolute;inset:15%;width:70%;height:70%;object-fit:contain}
.dr-legacy-text{position:absolute;inset:10%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:clamp(18px,6vw,64px);white-space:pre-wrap}
.dr-pattern-cell{position:absolute;transform-origin:center;overflow:visible}
.dr-motif{position:relative;width:100%;height:100%;overflow:hidden}
.dr-wrapping{overflow:hidden}
.dr-sticker{display:flex;align-items:center;justify-content:center}
.dr-sticker-fixed{position:relative;max-width:100%;max-height:100%;width:100%;overflow:hidden}
.dr-sticker-art{position:absolute;inset:0;overflow:hidden}
.dr-sticker-border{position:absolute;inset:0;width:100%;height:100%;z-index:0}
.dr-sticker-art{z-index:1}
.dr-notebook{overflow:hidden}
`;
}

export function generateDocumentRenderHtml(
  design: DesignState,
  options: DocumentRenderOptions = {},
): string {
  const { width, height } = getDocumentRenderDimensions(design, options);
  const markup = generateDocumentRenderMarkup(design, options);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${getDocumentRenderCss()}</style></head><body><div id="render-container" style="width:${width}px;height:${height}px">${markup}</div></body></html>`;
}

export async function renderDocument(
  design: DesignState,
  options: DocumentRenderOptions = {},
): Promise<DocumentRenderResult> {
  const dimensions = getDocumentRenderDimensions(design, options);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: dimensions,
      deviceScaleFactor: 1,
    });

    await page.setContent(generateDocumentRenderHtml(design, options), {
      waitUntil: 'domcontentloaded',
    });

    await page.evaluate(async () => {
      const doc = globalThis.document;
      await doc.fonts.ready;
      const images = Array.from(doc.images);
      await Promise.all(
        images.map((image) => {
          if (image.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          });
        }),
      );
    });

    const png = await page.locator('#render-container').screenshot({
      type: 'png',
      animations: 'disabled',
    });

    return {
      png: new Uint8Array(png),
      sha256: createHash('sha256').update(png).digest('hex'),
      engineFingerprint: `chromium-${browser.version()}`,
    };
  } finally {
    await browser.close();
  }
}
