/**
 * Hợp đồng dữ liệu và workflow cho Add / Insert Menu (Mobile Customizer)
 */

export type AddContentType =
 | 'image'
 | 'text'
 | 'sticker'
 | 'shape'
 | 'qr'
 | 'barcode';

export type AddVisualPriority = 'primary' | 'secondary' | 'utility';

export interface AddMenuItemConfig {
 id: AddContentType;
 label: string;
 priority: AddVisualPriority;
 description?: string;
}

export const ADD_MENU_ITEMS: readonly AddMenuItemConfig[] = [
 // Primary (Ảnh, Chữ)
 { id: 'image', label: 'Ảnh', priority: 'primary' },
 { id: 'text', label: 'Chữ', priority: 'primary' },
 // Secondary (Sticker, Hình dạng)
 { id: 'sticker', label: 'Sticker', priority: 'secondary' },
 { id: 'shape', label: 'Hình dạng', priority: 'secondary' },
 // Utility (QR, Mã vạch)
 { id: 'qr', label: 'QR', priority: 'utility' },
 { id: 'barcode', label: 'Mã vạch', priority: 'utility' },
] as const;

export type ImageSourceType = 'gallery' | 'camera' | 'file';

export type ImageSourceContext =
  | { mode: 'add' }
  | { mode: 'replace'; targetElementId: string };
export type TextStylePreset = 'heading' | 'body';

export type ShapePrimitiveType =
 | 'square'
 | 'rectangle'
 | 'rounded-rectangle'
 | 'circle'
 | 'oval'
 | 'triangle'
 | 'line';

export interface ShapeDefinition {
 type: ShapePrimitiveType;
 label: string;
 defaultWidth: number;
 defaultHeight: number;
}

export const SHAPE_DEFINITIONS: readonly ShapeDefinition[] = [
 { type: 'square', label: 'Vuông', defaultWidth: 40, defaultHeight: 40 },
 { type: 'rectangle', label: 'Chữ nhật', defaultWidth: 60, defaultHeight: 35 },
 { type: 'rounded-rectangle', label: 'Chữ nhật bo góc', defaultWidth: 60, defaultHeight: 35 },
 { type: 'circle', label: 'Tròn', defaultWidth: 40, defaultHeight: 40 },
 { type: 'oval', label: 'Oval', defaultWidth: 55, defaultHeight: 35 },
 { type: 'triangle', label: 'Tam giác', defaultWidth: 40, defaultHeight: 40 },
 { type: 'line', label: 'Đường thẳng', defaultWidth: 70, defaultHeight: 4 },
] as const;

export type AddSubflow =
 | { mode: 'root' }
 | { mode: 'image-source' }
 | { mode: 'text-style' }
 | { mode: 'sticker-browser' }
 | { mode: 'shape-browser' }
 | { mode: 'qr-generator' }
 | { mode: 'barcode-generator' };

export interface AddProviderStatus {
 available: boolean;
 message: string;
}

export function getProviderStatus(type: AddContentType): AddProviderStatus {
 switch (type) {
  case 'image':
  case 'text':
  case 'shape':
   return { available: true, message: 'Sẵn sàng sử dụng' };
  case 'sticker':
   return {
    available: false,
    message: 'Thư viện sticker đang được chuẩn bị.',
   };
  case 'qr':
   return {
    available: false,
    message: 'Bộ sinh mã QR đang được kết nối.',
   };
  case 'barcode':
   return {
    available: false,
    message: 'Bộ sinh mã vạch đang được kết nối.',
   };
 }
}

/**
 * Tính toán vị trí giữa màn hình hợp lệ cho element mới
 */
export function calculateCenteredPlacement(
 elementWidth: number,
 elementHeight: number,
 existingCount = 0
): { x: number; y: number } {
 // Tâm canvas là (50%, 50%). Khi có nhiều element, dịch nhẹ 2-4% để không đè khít hoàn toàn
 const offset = (existingCount % 4) * 2;
 const rawX = 50 + offset;
 const rawY = 50 + offset;

 // Giới hạn trong vùng an toàn (khoảng 10% đến 90%)
 const minX = Math.round(elementWidth / 2) + 5;
 const maxX = 100 - minX;
 const minY = Math.round(elementHeight / 2) + 5;
 const maxY = 100 - minY;

 const x = Math.max(minX, Math.min(maxX, rawX));
 const y = Math.max(minY, Math.min(maxY, rawY));

 return { x, y };
}
