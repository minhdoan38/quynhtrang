import type { ImageState } from './product-state';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function validateImageFile(file: File): { ok: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Ảnh không hỗ trợ. Hãy chọn PNG, JPG hoặc WebP.' };
  }
  if (!file.size || file.size <= 0) {
    return { ok: false, error: 'Không đọc được ảnh. Hãy chọn tệp khác.' };
  }
  return { ok: true };
}

export function processImageUpload(file: File): Promise<ImageState> {
  const validation = validateImageFile(file);
  if (!validation.ok) {
    return Promise.reject(new Error(validation.error));
  }

  const { promise, resolve, reject } = Promise.withResolvers<ImageState>();

  let objectUrl = '';
  try {
    if (typeof window !== 'undefined' && window.URL?.createObjectURL) {
      objectUrl = window.URL.createObjectURL(file);
    }
  } catch {
    objectUrl = '';
  }

  const img = new Image();
  img.onload = () => {
    resolve({
      name: file.name,
      type: file.type,
      size: file.size,
      src: objectUrl,
      width: img.naturalWidth || img.width || 0,
      height: img.naturalHeight || img.height || 0,
    });
  };
  img.onerror = () => {
    if (objectUrl && typeof window !== 'undefined' && window.URL?.revokeObjectURL) {
      window.URL.revokeObjectURL(objectUrl);
    }
    reject(new Error('Không mở được ảnh. Hãy chọn tệp khác.'));
  };
  img.src = objectUrl;

  return promise;
}

export function revokeImageUrl(url: string | null | undefined): void {
  if (
    typeof window !== 'undefined' &&
    typeof url === 'string' &&
    url.startsWith('blob:') &&
    window.URL?.revokeObjectURL
  ) {
    try {
      window.URL.revokeObjectURL(url);
    } catch {
      // Ignore cleanup error
    }
  }
}
