import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { chromium } from 'playwright';

import {
  DocumentRenderSurface,
  getDocumentRenderDimensions,
  resolveDocumentRenderSurface,
  type DocumentFontOption,
  type DocumentRenderDimensions,
  type DocumentRenderOptions,
} from '../../components/customizer/document-render-surface.ts';
import type { DesignState } from '../product-state.ts';
import { verifyCdpFontMatch } from './library-render-probe.ts';

export {
  getDocumentRenderDimensions,
  resolveDocumentRenderSurface,
  type DocumentFontOption,
  type DocumentRenderDimensions,
  type DocumentRenderOptions,
};

export interface DocumentRenderResult {
  png: Uint8Array;
  sha256: string;
  engineFingerprint: string;
}


export async function generateDocumentRenderMarkup(
  design: DesignState,
  options: DocumentRenderOptions = {},
): Promise<string> {
  const dimensions = getDocumentRenderDimensions(design, options);
  const { renderToStaticMarkup } = await import('react-dom/server');
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

export async function generateDocumentRenderHtml(
  design: DesignState,
  options: DocumentRenderOptions = {},
): Promise<string> {
  const { width, height } = getDocumentRenderDimensions(design, options);
  const markup = await generateDocumentRenderMarkup(design, options);
  let fontCss = options.fontFaceCss ?? '';
  if (options.fonts?.length) {
    for (const f of options.fonts) {
      const srcUrl = f.dataUrl ?? f.url;
      if (srcUrl) {
        const formatStr = f.format ? ` format("${f.format}")` : '';
        const weightStr = f.weight ? `font-weight: ${f.weight};` : '';
        const styleStr = f.style ? `font-style: ${f.style};` : '';
        fontCss += `
@font-face {
  font-family: '${f.family}';
  src: url("${srcUrl}")${formatStr};
  font-display: block;
  ${weightStr}
  ${styleStr}
}`;
      }
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${getDocumentRenderCss()}${fontCss}</style></head><body><div id="render-container" style="width:${width}px;height:${height}px">${markup}</div></body></html>`;
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

    if (options.denyExternalNetwork) {
      await page.route('**', (route) => {
        const url = route.request().url();
        if (
          url.startsWith('data:')
          || url.startsWith('about:')
          || url.startsWith('http://localhost')
          || url.startsWith('http://127.0.0.1')
        ) {
          void route.continue();
        } else {
          void route.abort('blockedbyclient');
        }
      });
    }

    const html = await generateDocumentRenderHtml(design, options);
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
    });

    const failOnImage = Boolean(options.failOnImageError);
    const evalResult = await page.evaluate(async (failOnImageParam) => {
      const doc = globalThis.document;
      await doc.fonts.ready;
      const images = Array.from(doc.images);
      const imageErrors: string[] = [];
      await Promise.all(
        images.map((image) => {
          if (image.complete) {
            if (image.naturalWidth === 0 && failOnImageParam) {
              imageErrors.push(image.src);
            }
            return Promise.resolve();
          }
          return new Promise<void>((resolve) => {
            image.addEventListener('load', () => {
              if (image.naturalWidth === 0 && failOnImageParam) {
                imageErrors.push(image.src);
              }
              resolve();
            }, { once: true });
            image.addEventListener('error', () => {
              if (failOnImageParam) {
                imageErrors.push(image.src);
              }
              resolve();
            }, { once: true });
          });
        }),
      );
      return { imageErrors };
    }, failOnImage);

    if (failOnImage && evalResult.imageErrors.length > 0) {
      throw new Error(`Failed to load image(s): ${evalResult.imageErrors.join(', ')}`);
    }

    if (options.verifyCdpFonts) {
      const cdpCheck = await verifyCdpFontMatch(page, {
        selector: '#render-container',
        expectedFamilyNames: options.expectedFamilyNames,
      });
      if (!cdpCheck.passed) {
        throw new Error(cdpCheck.detail ?? 'Platform font fallback detected');
      }
    }
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
