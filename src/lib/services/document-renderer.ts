import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

import { DocumentRenderSurface } from '../../components/customizer/document-render-surface.ts';
import type { CardSurface, DesignState } from '../product-state.ts';

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
  const dimensions = getDocumentRenderDimensions(design, options);
  return renderToStaticMarkup(
    createElement(DocumentRenderSurface, {
      document: design,
      surface: options.surface,
      widthPx: dimensions.width,
      heightPx: dimensions.height,
    }),
  );
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
