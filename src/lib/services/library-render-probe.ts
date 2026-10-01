import { createHash, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

import type {
  LibraryKind,
  LibraryRef,
  ValidationReceipt,
} from '../domain/asset-library.ts';
import { validateFont, validateSticker } from './library-validation.ts';

const VALIDATOR_VERSION = '1.0.0';

export async function probeLibraryBinary(
  ref: LibraryRef,
  bytes: Uint8Array,
  kind: LibraryKind,
): Promise<ValidationReceipt> {
  const failures: { code: string; detail: string }[] = [];
  let missingCodepoints: number[] = [];
  let browserProofHash: string | null = null;
  let productionProofHash: string | null = null;
  let engineFingerprint = 'chromium-headless';

  if (kind === 'font-face') {
    let validatedFont;
    try {
      validatedFont = await validateFont(bytes);
    } catch (error) {
      failures.push({
        code: 'FONT_VALIDATION_FAILED',
        detail: error instanceof Error ? error.message : String(error),
      });
      return {
        id: randomUUID(),
        ref,
        revision: 1,
        validatorVersion: VALIDATOR_VERSION,
        engineFingerprint,
        passed: false,
        failures,
        missingCodepoints: [],
        browserProofHash: null,
        productionProofHash: null,
      };
    }

    missingCodepoints = validatedFont.missingCodepoints;
    productionProofHash = validatedFont.checksum;

    if (validatedFont.embeddingRestricted) {
      failures.push({
        code: 'EMBEDDING_RESTRICTED',
        detail: 'Font embedding is restricted by fsType license flag',
      });
    }

    const browser = await chromium.launch({ headless: true });
    engineFingerprint = `chromium-${browser.version()}`;

    try {
      const page = await browser.newPage({
        viewport: { width: 800, height: 400 },
        deviceScaleFactor: 1,
      });

      await page.route('**', (route) => {
        const url = route.request().url();
        if (url.startsWith('data:') || url.startsWith('about:')) {
          void route.continue();
        } else {
          void route.abort();
        }
      });

      const fontFormat =
        validatedFont.format === 'ttf'
          ? 'truetype'
          : validatedFont.format === 'otf'
            ? 'opentype'
            : validatedFont.format;
      const mimeType =
        validatedFont.format === 'woff2'
          ? 'font/woff2'
          : validatedFont.format === 'woff'
            ? 'font/woff'
            : validatedFont.format === 'otf'
              ? 'font/otf'
              : 'font/ttf';

      const base64Font = Buffer.from(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      ).toString('base64');
      const fontDataUrl = `data:${mimeType};base64,${base64Font}`;

      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      @font-face {
        font-family: 'ProbeFace';
        src: url("${fontDataUrl}") format("${fontFormat}");
        font-display: block;
      }
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        font-synthesis: none;
      }
      #probe-canvas {
        display: block;
      }
    </style>
  </head>
  <body>
    <canvas id="probe-canvas" width="600" height="200"></canvas>
  </body>
</html>`;

      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const renderSuccessful = await page.evaluate(async () => {
        const doc = globalThis.document;
        await doc.fonts.load('32px ProbeFace');
        await doc.fonts.ready;
        const canvas = doc.getElementById('probe-canvas') as HTMLCanvasElement | null;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.font = '32px ProbeFace';
        const sampleText = 'Tiếng Việt: Thử nghiệm phông chữ sắc nét ă â đ ê ô ơ ư 123';
        const metrics = ctx.measureText(sampleText);
        if (metrics.width <= 0) return false;
        ctx.fillText(sampleText, 20, 60);
        return true;
      });

      if (!renderSuccessful) {
        failures.push({
          code: 'FONT_RENDER_FAILED',
          detail: 'Font failed to render visible glyphs on canvas',
        });
      }

      const screenshot = await page.locator('#probe-canvas').screenshot({
        type: 'png',
        animations: 'disabled',
      });
      browserProofHash = createHash('sha256').update(screenshot).digest('hex');
    } catch (error) {
      failures.push({
        code: 'BROWSER_PROBE_ERROR',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await browser.close();
    }
  } else {
    let validatedSticker;
    try {
      validatedSticker = await validateSticker(bytes);
    } catch (error) {
      failures.push({
        code: 'STICKER_VALIDATION_FAILED',
        detail: error instanceof Error ? error.message : String(error),
      });
      return {
        id: randomUUID(),
        ref,
        revision: 1,
        validatorVersion: VALIDATOR_VERSION,
        engineFingerprint,
        passed: false,
        failures,
        missingCodepoints: [],
        browserProofHash: null,
        productionProofHash: null,
      };
    }

    productionProofHash = validatedSticker.checksum;

    const browser = await chromium.launch({ headless: true });
    engineFingerprint = `chromium-${browser.version()}`;

    try {
      const page = await browser.newPage({
        viewport: { width: 800, height: 600 },
        deviceScaleFactor: 1,
      });

      await page.route('**', (route) => {
        const url = route.request().url();
        if (url.startsWith('data:') || url.startsWith('about:')) {
          void route.continue();
        } else {
          void route.abort();
        }
      });

      const mimeType =
        validatedSticker.format === 'svg'
          ? 'image/svg+xml'
          : validatedSticker.format === 'png'
            ? 'image/png'
            : validatedSticker.format === 'webp'
              ? 'image/webp'
              : 'image/jpeg';

      const base64Data = Buffer.from(
        validatedSticker.canonicalBytes.buffer,
        validatedSticker.canonicalBytes.byteOffset,
        validatedSticker.canonicalBytes.byteLength,
      ).toString('base64');
      const stickerDataUrl = `data:${mimeType};base64,${base64Data}`;

      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        overflow: hidden;
      }
      #probe-stage {
        display: inline-block;
      }
      img {
        display: block;
        max-width: 400px;
        max-height: 400px;
      }
    </style>
  </head>
  <body>
    <div id="probe-stage">
      <img id="probe-img" src="${stickerDataUrl}" />
    </div>
  </body>
</html>`;

      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const renderSuccessful = await page.evaluate(async () => {
        const doc = globalThis.document;
        const img = doc.getElementById('probe-img') as HTMLImageElement | null;
        if (!img) return false;
        if (!img.complete) {
          await new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
        }
        return img.naturalWidth > 0 && img.naturalHeight > 0;
      });

      if (!renderSuccessful) {
        failures.push({
          code: 'STICKER_RENDER_FAILED',
          detail: 'Sticker failed to render or natural dimensions are 0',
        });
      }

      const screenshot = await page.locator('#probe-stage').screenshot({
        type: 'png',
        animations: 'disabled',
      });
      browserProofHash = createHash('sha256').update(screenshot).digest('hex');
    } catch (error) {
      failures.push({
        code: 'BROWSER_PROBE_ERROR',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await browser.close();
    }
  }

  const passed = failures.length === 0;

  return {
    id: randomUUID(),
    ref,
    revision: 1,
    validatorVersion: VALIDATOR_VERSION,
    engineFingerprint,
    passed,
    failures,
    missingCodepoints,
    browserProofHash,
    productionProofHash,
  };
}
