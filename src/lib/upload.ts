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
function readFileAsDataUrl(file: File): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    const { promise, resolve, reject } = Promise.withResolvers<string>();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không đọc được dữ liệu ảnh.'));
      }
    };
    reader.onerror = () => reject(new Error('Không đọc được dữ liệu ảnh.'));
    reader.readAsDataURL(file);
    return promise;
  }
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then((buf) => {
      const base64 = Buffer.from(buf).toString('base64');
      const mime = file.type || 'image/png';
      return `data:${mime};base64,${base64}`;
    });
  }
  return Promise.reject(new Error('Môi trường không hỗ trợ đọc tệp ảnh.'));
}

export async function processImageUpload(file: File): Promise<ImageState> {
  const validation = validateImageFile(file);
  if (!validation.ok) {
    return Promise.reject(new Error(validation.error));
  }

  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error('Không đọc được ảnh. Hãy chọn tệp khác.'));
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
      src: objectUrl || dataUrl,
      width: img.naturalWidth || img.width || 0,
      height: img.naturalHeight || img.height || 0,
      data: dataUrl,
      payload: dataUrl,
    });
  };
  img.onerror = () => {
    if (objectUrl && typeof window !== 'undefined' && window.URL?.revokeObjectURL) {
      window.URL.revokeObjectURL(objectUrl);
    }
    reject(new Error('Không mở được ảnh. Hãy chọn tệp khác.'));
  };
  img.src = objectUrl || dataUrl;

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
