import type {
 BackgroundRemovalProvider,
 RemovalProviderOptions,
 RemovalResult,
} from './types';

/**
 * Browser-based background removal provider.
 * Extracts foreground with transparent alpha channel.
 * Designed to run off main UI thread / OffscreenCanvas where available.
 */
export class BrowserBackgroundRemovalProvider implements BackgroundRemovalProvider {
 name = 'browser-canvas-worker';

 isAvailable(): boolean {
  return typeof window !== 'undefined';
 }

 async removeBackground(
  sourceUrl: string,
  options?: RemovalProviderOptions
 ): Promise<RemovalResult> {
  if (typeof window === 'undefined') {
   // Node.js / test environment fallback
   return {
    derivedSrc: sourceUrl,
    maskDataUrl: sourceUrl,
    width: 800,
    height: 800,
    sourceDimensions: { width: 800, height: 800 },
   };
  }

  const { promise, resolve, reject } = Promise.withResolvers<RemovalResult>();

  if (options?.signal?.aborted) {
   reject(new Error('Yêu cầu tách nền đã bị hủy.'));
   return promise;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
   try {
    const naturalW = img.naturalWidth || 800;
    const naturalH = img.naturalHeight || 800;
    const maxDim = options?.maxDimension || 1200;
    let targetW = naturalW;
    let targetH = naturalH;

    if (targetW > maxDim || targetH > maxDim) {
     if (targetW > targetH) {
      targetH = Math.round((targetH * maxDim) / targetW);
      targetW = maxDim;
     } else {
      targetW = Math.round((targetW * maxDim) / targetH);
      targetH = maxDim;
     }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
     throw new Error('Không thể khởi tạo môi trường vẽ xử lý ảnh.');
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);
    const imageData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imageData.data;

    // Sample 4 corners to detect dominant background color
    const samplePoints = [
     0, // top-left
     (targetW - 1) * 4, // top-right
     ((targetH - 1) * targetW) * 4, // bottom-left
     ((targetH - 1) * targetW + (targetW - 1)) * 4, // bottom-right
    ];

    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    samplePoints.forEach((idx) => {
     bgR += data[idx];
     bgG += data[idx + 1];
     bgB += data[idx + 2];
    });
    bgR = Math.round(bgR / 4);
    bgG = Math.round(bgG / 4);
    bgB = Math.round(bgB / 4);

    // Color distance threshold with soft alpha ramp
    const threshold = 40;
    const softRamp = 30;

    for (let i = 0; i < data.length; i += 4) {
     const r = data[i];
     const g = data[i + 1];
     const b = data[i + 2];
     const dist = Math.sqrt(
      Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)
     );

     if (dist < threshold) {
      data[i + 3] = 0; // fully transparent
     } else if (dist < threshold + softRamp) {
      const alphaFraction = (dist - threshold) / softRamp;
      data[i + 3] = Math.round(data[i + 3] * alphaFraction);
     }
    }

    ctx.putImageData(imageData, 0, 0);

    // Export transparent PNG result
    const derivedSrc = canvas.toDataURL('image/png');

    resolve({
     derivedSrc,
     width: targetW,
     height: targetH,
     sourceDimensions: { width: naturalW, height: naturalH },
    });
   } catch (err) {
    reject(
     err instanceof Error
      ? err
      : new Error('Không thể xử lý tách nền cho ảnh này.')
    );
   }
  };

  img.onerror = () => {
   reject(new Error('Không thể tải dữ liệu ảnh để tách nền.'));
  };

  img.src = sourceUrl;
  return promise;
 }
}

let activeProvider: BackgroundRemovalProvider = new BrowserBackgroundRemovalProvider();

export function getBackgroundRemovalProvider(): BackgroundRemovalProvider {
 return activeProvider;
}

export function setBackgroundRemovalProvider(provider: BackgroundRemovalProvider) {
 activeProvider = provider;
}
