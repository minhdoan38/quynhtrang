import {
 groupElements,
 ungroupElement,
 duplicateSelectedElements,
 deleteSelectedElements,
} from './grouping.ts';
import { moveElements } from './multi-selection.ts';
import { computeStickerContour } from './sticker-contour.ts';
import { evaluateImageQuality } from './image-quality.ts';
import { evaluateElementSafety, isElementImportant } from './safe-area.ts';
import { canMutateElement, type DesignReviewMode } from './domain/design-revision.ts';
export type ProductId = 'wrapping' | 'card' | 'sticker' | 'notebook';
export type CardSurface = 'front' | 'inside' | 'back';
export type CardOrientation = 'horizontal' | 'vertical';
export const CARD_SURFACES: readonly CardSurface[] = ['front', 'inside', 'back'] as const;
export function getCardSurfaceLabel(surface: CardSurface): string {
 switch (surface) {
  case 'front': return 'Mặt trước';
  case 'inside': return 'Bên trong';
  case 'back': return 'Mặt sau';
 }
}
export function getCardSpreadDimensions(
 orientation: CardOrientation,
 surface: CardSurface
): { width: number; height: number; foldPosition: number } {
 if (orientation === 'horizontal') {
  return surface === 'inside'
   ? { width: 296, height: 105, foldPosition: 148 }
   : { width: 148, height: 105, foldPosition: 0 };
 }
 return surface === 'inside'
  ? { width: 210, height: 148, foldPosition: 105 }
  : { width: 105, height: 148, foldPosition: 0 };
}
export function isElementCrossingCardFold(
 element: CanvasElement,
 orientation: CardOrientation = 'horizontal'
): boolean {
 if (element.surface !== 'inside') return false;
 const foldPosition = orientation === 'horizontal' ? 148 : 105;
 return element.x < foldPosition && element.x + element.width > foldPosition;
}
export interface NotebookCoverDefinition {
 widthMm: number;
 heightMm: number;
 aspectRatio: number;
 bindingMarginMm: number;
 bindingMarginPct: number;
}

export const NOTEBOOK_COVER_DEFINITION: Readonly<NotebookCoverDefinition> = Object.freeze({
 widthMm: 148,
 heightMm: 210,
 aspectRatio: 148 / 210,
 bindingMarginMm: 18,
 bindingMarginPct: 12,
});

export function isElementInNotebookBindingZone(
 element: { x: number; width?: number },
 canvasWidth: number = 100
): boolean {
 return element.x < canvasWidth * 0.12;
}


export type FixedStickerShape = 'circle' | 'square' | 'rectangle' | 'oval' | 'rounded-rectangle';

export const FIXED_STICKER_SHAPES: readonly FixedStickerShape[] = [
 'circle',
 'square',
 'rectangle',
 'oval',
 'rounded-rectangle',
] as const;

export function getFixedStickerShapeLabel(shape: FixedStickerShape): string {
 switch (shape) {
  case 'circle': return 'Tròn';
  case 'square': return 'Vuông';
  case 'rectangle': return 'Chữ nhật';
  case 'oval': return 'Oval';
  case 'rounded-rectangle': return 'Bo góc';
 }
}

export interface FixedStickerDimensions {
 width: number;
 height: number;
 aspectRatio: number;
 borderRadiusCss: string;
 isEllipse?: boolean;
}

export function getFixedStickerDimensions(shape: FixedStickerShape): FixedStickerDimensions {
 switch (shape) {
  case 'circle':
   return { width: 50, height: 50, aspectRatio: 1, borderRadiusCss: '9999px' };
  case 'square':
   return { width: 50, height: 50, aspectRatio: 1, borderRadiusCss: '0px' };
  case 'rectangle':
   return { width: 70, height: 50, aspectRatio: 1.4, borderRadiusCss: '0px' };
  case 'oval':
   return { width: 70, height: 50, aspectRatio: 1.4, borderRadiusCss: '50%', isEllipse: true };
  case 'rounded-rectangle':
   return { width: 70, height: 50, aspectRatio: 1.4, borderRadiusCss: '16px' };
 }
}


export interface ProductVariant {
 readonly id: string;
 readonly name: string;
 readonly price: number;
}

export type WrappingPaperMode = 'pattern' | 'full-sheet';
export type PatternRepeatMode = 'basic' | 'half-drop' | 'half-brick' | 'mirror';
export type PatternWorkspaceView = 'edit-pattern' | 'full-sheet-preview';

export interface PatternConfig {
 enabled: boolean;
 repeatMode: PatternRepeatMode;
 scale: number;
 spacingX: number;
 spacingY: number;
 rotation: number;
 backgroundColor: string;
}

export interface WrappingOptions {
 mode: WrappingPaperMode;
 patternConfig: PatternConfig;
 repeatStyle?: 'regular' | 'scattered' | 'brick' | 'half-drop';
 patternScale?: number;
 spacingX?: number;
 spacingY?: number;
 rotation?: number;
 [key: string]: unknown;
}

export interface CardOptions {
 surface: CardSurface;
 fold?: 'half' | 'flat';
 orientation?: CardOrientation;
 [key: string]: unknown;
}

export interface StickerOptions {
 borderWidth: number;
 minBorderWidth?: number;
 maxBorderWidth?: number;
 hasWhiteBorder: boolean;
 showCutline?: boolean;
 cutLineMode?: 'die-cut' | 'fixed-shape' | 'phone';
 shape?: FixedStickerShape;
 [key: string]: unknown;
}

export interface NotebookOptions {
 finish?: 'matte' | 'glossy';
 backgroundColor?: string;
 [key: string]: unknown;
}

export type ProductOptions = WrappingOptions | CardOptions | StickerOptions | NotebookOptions | Record<string, unknown>;

export interface ProductConfig {
 readonly id: ProductId;
 readonly name: string;
 readonly defaultVariant: string;
 readonly variants: readonly ProductVariant[];
 readonly defaultOptions: Readonly<Record<string, unknown>>;
}

export interface ImageState {
 name: string;
 type?: string;
 size?: number;
 src: string;
 width?: number;
 height?: number;
 data?: string;
 payload?: string | Uint8Array;
}
export type ElementType = 'image' | 'text' | 'shape' | 'sticker' | 'group';

export type TextPreset = 'heading' | 'body';
export type TextAlign = 'left' | 'center' | 'right';
export type TextWeight = 'regular' | 'medium' | 'bold';

export interface TextElementData {
 text: string;
 color: string;
 fontFamily: string;
 fontSize: number;
 fontWeight: TextWeight;
 fontStyle: 'normal' | 'italic';
 align: TextAlign;
 lineHeight: number;
 letterSpacing: number;
 placeholder?: boolean;
 fontFamilyId?: string;
 fontFaceId?: string;
 fontChecksum?: string;
}

export interface CreateTextElementParams {
 id: string;
 preset: TextPreset;
 text?: string;
 canvasWidthPercent?: number;
 x?: number;
 y?: number;
 color?: string;
 fontFamily?: string;
 surface?: CardSurface;
}
export interface ImageAsset {
 id: string;
 originalSrc: string;
 previewSrc?: string;
 removedBackgroundSrc?: string;
 name?: string;
 type?: string;
 size?: number;
 width?: number;
 height?: number;
}

export interface ImageCropData {
 scale?: number;
 offsetX?: number;
 offsetY?: number;
 rotation?: number;
 x?: number;
 y?: number;
 width?: number;
 height?: number;
}

export interface ImageObjectData {
 assetId?: string;
 src: string;
 originalSrc?: string;
 removedBackgroundSrc?: string;
 name?: string;
 opacity?: number;
 scale?: number;
 crop?: ImageCropData;
 mask?: string | null;
 placeholder?: boolean;
 sourceWidth?: number;
 sourceHeight?: number;
 refineMaskData?: string;
}
export function getImageData(element: CanvasElement): ImageObjectData | null {
 if (element.type !== 'image' || !element.data) return null;
 return element.data as unknown as ImageObjectData;
}
export interface StickerElementData {
 libraryAssetId?: string;
 assetChecksum?: string;
 src: string;
 title: string;
 storagePath: string;
 width?: number;
 height?: number;
}

export function getStickerData(element: CanvasElement): StickerElementData | null {
 if (element.type !== 'sticker' || !element.data) return null;
 return element.data as unknown as StickerElementData;
}

export function createStickerElement(params: {
 id: string;
 stickerId: string;
 storagePath: string;
 src: string;
 title: string;
 checksum?: string;
 x?: number;
 y?: number;
 width?: number;
 height?: number;
 surface?: CardSurface;
}): CanvasElement {
 const width = params.width ?? 20;
 const height = params.height ?? 20;
 const data: StickerElementData = {
  libraryAssetId: params.stickerId,
  ...(params.checksum ? { assetChecksum: params.checksum } : {}),
  src: params.src,
  title: params.title,
  storagePath: params.storagePath,
  ...(params.width !== undefined ? { width: params.width } : {}),
  ...(params.height !== undefined ? { height: params.height } : {}),
 };
 return {
  id: params.id,
  type: 'sticker',
  name: params.title,
  x: params.x ?? 50,
  y: params.y ?? 50,
  width,
  height,
  rotation: 0,
  locked: false,
  zIndex: 1,
  ...(params.surface ? { surface: params.surface } : {}),
  data: data as unknown as Record<string, unknown>,
 };
}
export interface CanvasElement {
 id: string;
 type: ElementType;
 name?: string;
 x: number;
 y: number;
 width: number;
 height: number;
 rotation: number;
 locked?: boolean;
 zIndex?: number;
 parentGroupId?: string;
 surface?: CardSurface;

 data?: Record<string, unknown>;
}
export function filterElementsBySurface(
 elements: readonly CanvasElement[] | undefined,
 surface: CardSurface
): CanvasElement[] {
 if (!elements) return [];
 return elements.filter((el) => {
  const elSurface = el.surface ?? 'front';
  return elSurface === surface;
 });
}

export interface DesignState {
 productId: ProductId;
 variantId: string;
 templateId: string | null;
 text: string;
 color: string;
 backgroundColor: string;
 image: ImageState | null;
 quantity: number;
 productOptions: Record<string, unknown>;
 elements?: CanvasElement[];
}

export type DesignAction =
 | { type: 'SET_PRODUCT'; value: ProductId }
 | { type: 'SET_VARIANT'; value: string }
 | { type: 'SET_TEMPLATE'; value: string }
 | { type: 'SET_TEXT'; value: string }
 | { type: 'SET_COLOR'; value: string }
 | { type: 'SET_BACKGROUND_COLOR'; value: string }
 | { type: 'SET_IMAGE'; value: ImageState | null }
 | { type: 'SET_QUANTITY'; value: number | string }
 | { type: 'SET_PRODUCT_OPTION'; key: string; value: unknown }
 | { type: 'MOVE_ELEMENT'; id: string; x: number; y: number }
 | { type: 'RESIZE_ELEMENT'; id: string; width: number; height: number; x?: number; y?: number }
 | { type: 'ROTATE_ELEMENT'; id: string; rotation: number }
 | { type: 'LOCK_ELEMENT'; id: string; locked: boolean }
 | { type: 'SET_ELEMENTS'; value: CanvasElement[] }
 | { type: 'UPDATE_ELEMENT'; id: string; patch: Partial<CanvasElement> }
 | { type: 'ADD_CANVAS_ELEMENT'; element: CanvasElement }
 | { type: 'REMOVE_CANVAS_ELEMENT'; id: string }
 | { type: 'REORDER_ELEMENTS'; orderedIds: string[] }
 | { type: 'DUPLICATE_ELEMENT'; id: string }
 | { type: 'DELETE_ELEMENT'; id: string }
 | { type: 'BRING_FORWARD'; id: string }
 | { type: 'SEND_BACKWARD'; id: string }
 | { type: 'ADD_TEXT_ELEMENT'; preset: TextPreset; id?: string; text?: string; color?: string; surface?: CardSurface }
 | { type: 'COMMIT_TEXT_EDIT'; id: string; text: string }
 | { type: 'UPDATE_TEXT_STYLE'; id: string; patch: Partial<TextElementData> }
 | { type: 'REPLACE_IMAGE_ASSET'; id?: string; asset: Partial<ImageAsset> & { src: string; name?: string } }
 | { type: 'SET_IMAGE_OPACITY'; id?: string; opacity: number }
 | { type: 'APPLY_REMOVE_BACKGROUND'; id?: string; derivedSrc: string }
 | { type: 'RESTORE_ORIGINAL_IMAGE'; id?: string }
 | { type: 'COMMIT_REFINE_MASK'; id?: string; refinedSrc: string; maskData?: string }
 | { type: 'COMMIT_IMAGE_CROP'; id?: string; crop: ImageCropData }
 | { type: 'RESET_IMAGE_CROP'; id?: string }
 | { type: 'SET_IMAGE_MASK'; id?: string; mask: string | null }
 | { type: 'GROUP_ELEMENTS'; ids: string[] }
 | { type: 'UNGROUP_ELEMENT'; groupId: string }
 | { type: 'MOVE_ELEMENTS'; ids: string[]; dx: number; dy: number }
 | { type: 'DUPLICATE_ELEMENTS'; ids: string[] }
 | { type: 'DELETE_ELEMENTS'; ids: string[] };
export interface DesignSummary {
 product: string;
 variant: string;
 quantity: number;
 unitPrice: number;
 totalPrice: number;
 priceLabel: string;
}

export type PreflightSeverity = 'pass' | 'warning' | 'error';
export type PreflightCategory = 'image' | 'safe-area' | 'sticker' | 'notebook' | 'card' | 'general';

export interface PreflightCheck {
 id: string;
 level: PreflightSeverity;
 label: string;
 type?: PreflightSeverity;
 category?: PreflightCategory;
 description?: string;
 advice?: string;
 elementId?: string;
 surfaceId?: string;
 canContinue?: boolean;
}

export interface PreflightResult {
 level: PreflightSeverity;
 checks: PreflightCheck[];
 hasErrors: boolean;
 hasWarnings: boolean;
 passCount: number;
 warningCount: number;
 errorCount: number;
}

export const PRODUCTS: Readonly<Record<ProductId, ProductConfig>> = Object.freeze({
 wrapping: Object.freeze({
  id: 'wrapping' as const,
  name: 'Giấy gói quà',
  defaultVariant: 'a1',
  variants: Object.freeze([
   Object.freeze({ id: 'a1', name: 'Khổ A1', price: 69000 }),
   Object.freeze({ id: 'a2', name: 'Khổ A2', price: 49000 }),
  ]),
  defaultOptions: Object.freeze({
   mode: 'pattern' as WrappingPaperMode,
   patternConfig: Object.freeze({
    enabled: true,
    repeatMode: 'basic' as PatternRepeatMode,
    scale: 100,
    spacingX: 0,
    spacingY: 0,
    rotation: 0,
    backgroundColor: '#ffffff',
   }),
   repeatStyle: 'regular' as const,
   patternScale: 100,
   spacingX: 0,
   spacingY: 0,
   rotation: 0,
  }),
 }),
 card: Object.freeze({
  id: 'card' as const,
  name: 'Thiệp chúc mừng',
  defaultVariant: 'horizontal',
  variants: Object.freeze([
   Object.freeze({ id: 'horizontal', name: 'Thiệp ngang', price: 29000 }),
   Object.freeze({ id: 'vertical', name: 'Thiệp đứng', price: 29000 }),
  ]),
  defaultOptions: Object.freeze({
   surface: 'front',
  }),
 }),
 sticker: Object.freeze({
  id: 'sticker' as const,
  name: 'Sticker cắt rời',
  defaultVariant: 'die-cut',
  variants: Object.freeze([
   Object.freeze({ id: 'die-cut', name: 'Cắt theo hình (Die-cut)', price: 19000 }),
   Object.freeze({ id: 'fixed-shape', name: 'Hình cố định (Fixed Shape)', price: 19000 }),
   Object.freeze({ id: 'phone', name: 'Sticker điện thoại (Phone Sticker)', price: 25000 }),
  ]),
  defaultOptions: Object.freeze({
   borderWidth: 2,
   minBorderWidth: 0,
   maxBorderWidth: 6,
   hasWhiteBorder: true,
   showCutline: false,
  }),
 }),
 notebook: Object.freeze({
  id: 'notebook' as const,
  name: 'Bìa sổ tay',
  defaultVariant: 'standard',
  variants: Object.freeze([
   Object.freeze({ id: 'standard', name: 'Tiêu chuẩn', price: 49000 }),
  ]),
  defaultOptions: Object.freeze({
   finish: 'matte',
  }),
 }),
});

export type TemplateCategory = 'all' | 'birthday' | 'cute' | 'floral' | 'minimal' | 'love' | 'thanks';

export interface TemplateConfig {
 name: string;
 category: TemplateCategory;
 productIds?: readonly ProductId[];
 variantIds?: readonly string[];
 mode?: WrappingPaperMode;
 text: string;
 color: string;
 backgroundColor: string;
 previewHint?: string;
 productOptions: Readonly<Partial<Record<ProductId, Readonly<Record<string, unknown>>>>>;
 elements?: readonly CanvasElement[];
}

export const TEMPLATES: Readonly<Record<string, TemplateConfig>> = Object.freeze({
 blank: Object.freeze({
  name: 'Trống',
  category: 'minimal',
  text: '',
  color: '#111827',
  backgroundColor: '#ffffff',
  previewHint: 'Bắt đầu từ trang trắng',
  productOptions: Object.freeze({}),
 }),
 minimal: Object.freeze({
  name: 'Tối giản',
  category: 'minimal',
  text: 'Dành riêng cho bạn',
  color: '#243447',
  backgroundColor: '#f5f1e8',
  previewHint: 'Đường nét thanh lịch, gam màu trung tính',
  productOptions: Object.freeze({
   wrapping: Object.freeze({
    mode: 'full-sheet' as WrappingPaperMode,
    patternConfig: Object.freeze({
     enabled: false,
     repeatMode: 'basic' as PatternRepeatMode,
     scale: 90,
     spacingX: 0,
     spacingY: 0,
     rotation: 0,
     backgroundColor: '#f5f1e8',
    }),
    repeatStyle: 'regular',
    patternScale: 90,
   }),
   card: Object.freeze({ surface: 'front', fold: 'half' }),
   sticker: Object.freeze({ hasWhiteBorder: true, borderWidth: 6 }),
   notebook: Object.freeze({ finish: 'matte' }),
  }),
 }),
 celebrate: Object.freeze({
  name: 'Tiệc tùng',
  category: 'birthday',
  text: 'Chúc mừng!',
  color: '#7c2d12',
  backgroundColor: '#fef3c7',
  previewHint: 'Rực rỡ cho các dịp sinh nhật và kỷ niệm',
  productOptions: Object.freeze({
   wrapping: Object.freeze({
    mode: 'pattern' as WrappingPaperMode,
    patternConfig: Object.freeze({
     enabled: true,
     repeatMode: 'half-brick' as PatternRepeatMode,
     scale: 125,
     spacingX: 0,
     spacingY: 0,
     rotation: 0,
     backgroundColor: '#ffffff',
    }),
    repeatStyle: 'brick',
    patternScale: 125,
   }),
   card: Object.freeze({ surface: 'inside', fold: 'half' }),
   sticker: Object.freeze({ hasWhiteBorder: true, borderWidth: 10 }),
   notebook: Object.freeze({ finish: 'glossy' }),
  }),
 }),
 'card-h-birthday': Object.freeze({
  name: 'Sinh nhật ấm áp',
  category: 'birthday',
  productIds: ['card'] as const,
  variantIds: ['horizontal'] as const,
  text: 'Happy Birthday to You',
  color: '#B86C84',
  backgroundColor: '#FFFDF8',
  previewHint: 'Thiết kế thiệp ngang nhẹ nhàng',
  productOptions: Object.freeze({
   card: Object.freeze({ surface: 'front', fold: 'half' }),
  }),
  elements: Object.freeze([
   createTextElement({
    id: 'card-h-birthday-front-text',
    preset: 'heading',
    text: 'Happy Birthday to You',
    color: '#B86C84',
    y: 50,
    surface: 'front',
   }),
   createTextElement({
    id: 'card-h-birthday-inside-text',
    preset: 'body',
    text: 'Chúc bạn một tuổi mới ngập tràn niềm vui và hạnh phúc!',
    color: '#2E3338',
    y: 50,
    surface: 'inside',
   }),
  ]),
 }),
 'card-h-cute': Object.freeze({
  name: 'Gấu con đáng yêu',
  category: 'cute',
  productIds: ['card'] as const,
  variantIds: ['horizontal'] as const,
  text: 'You are so special!',
  color: '#315F86',
  backgroundColor: '#F8F3E8',
  previewHint: 'Hình vẽ ngọt ngào cho người thương',
  productOptions: Object.freeze({
   card: Object.freeze({ surface: 'front', fold: 'half' }),
  }),
  elements: Object.freeze([
   createTextElement({
    id: 'card-h-cute-front-text',
    preset: 'heading',
    text: 'You are so special!',
    color: '#315F86',
    y: 45,
    surface: 'front',
   }),
   createTextElement({
    id: 'card-h-cute-inside-text',
    preset: 'body',
    text: 'Gửi đến bạn những cái ôm ấm áp nhất hôm nay.',
    color: '#2E3338',
    y: 50,
    surface: 'inside',
   }),
  ]),
 }),
 'card-h-love': Object.freeze({
  name: 'Tình yêu dịu êm',
  category: 'love',
  productIds: ['card'] as const,
  variantIds: ['horizontal'] as const,
  text: 'Forever & Always',
  color: '#B3535D',
  backgroundColor: '#FFF8F8',
  previewHint: 'Tông hoa hồng lãng mạn',
  productOptions: Object.freeze({
   card: Object.freeze({ surface: 'front', fold: 'half' }),
  }),
  elements: Object.freeze([
   createTextElement({
    id: 'card-h-love-front-text',
    preset: 'heading',
    text: 'Forever & Always',
    color: '#B3535D',
    y: 48,
    surface: 'front',
   }),
   createTextElement({
    id: 'card-h-love-inside-text',
    preset: 'body',
    text: 'Cảm ơn vì đã luôn đồng hành và yêu thương.',
    color: '#2E3338',
    y: 50,
    surface: 'inside',
   }),
  ]),
 }),
 'card-v-floral': Object.freeze({
  name: 'Nhành hoa nhỏ',
  category: 'floral',
  productIds: ['card'] as const,
  variantIds: ['vertical'] as const,
  text: 'Lời chúc yêu thương',
  color: '#2E3338',
  backgroundColor: '#FAF7F0',
  previewHint: 'Thiệp đứng họa tiết thực vật tinh tế',
  productOptions: Object.freeze({
   card: Object.freeze({ surface: 'front', fold: 'half' }),
  }),
  elements: Object.freeze([
   createTextElement({
    id: 'card-v-floral-front-text',
    preset: 'heading',
    text: 'Lời chúc yêu thương',
    color: '#2E3338',
    y: 42,
    surface: 'front',
   }),
   createTextElement({
    id: 'card-v-floral-inside-text',
    preset: 'body',
    text: 'Mong mỗi ngày của bạn đều dịu dàng như hoa nở.',
    color: '#2E3338',
    y: 50,
    surface: 'inside',
   }),
  ]),
 }),
 'card-thanks': Object.freeze({
  name: 'Lời cảm ơn',
  category: 'thanks',
  productIds: ['card'] as const,
  text: 'Thank you so much',
  color: '#5F7E67',
  backgroundColor: '#F3F6F3',
  previewHint: 'Gam xanh xô thơm trang nhã',
  productOptions: Object.freeze({
   card: Object.freeze({ surface: 'front', fold: 'half' }),
  }),
  elements: Object.freeze([
   createTextElement({
    id: 'card-thanks-front-text',
    preset: 'heading',
    text: 'Thank you so much',
    color: '#5F7E67',
    y: 45,
    surface: 'front',
   }),
   createTextElement({
    id: 'card-thanks-inside-text',
    preset: 'body',
    text: 'Biết ơn tất cả sự giúp đỡ và quan tâm từ bạn.',
    color: '#2E3338',
    y: 50,
    surface: 'inside',
   }),
  ]),
 }),
 'wrapping-a1-cute': Object.freeze({
  name: 'Họa tiết Cute A1',
  category: 'cute',
  productIds: ['wrapping'] as const,
  variantIds: ['a1'] as const,
  text: 'Sweet Gift',
  color: '#315F86',
  backgroundColor: '#F4EAE1',
  previewHint: 'Lưới hoa văn nhỏ xinh vừa khổ A1',
  productOptions: Object.freeze({
   wrapping: Object.freeze({
    mode: 'pattern' as WrappingPaperMode,
    patternConfig: Object.freeze({
     enabled: true,
     repeatMode: 'half-drop' as PatternRepeatMode,
     scale: 110,
     spacingX: 0,
     spacingY: 0,
     rotation: 0,
     backgroundColor: '#ffffff',
    }),
    repeatStyle: 'half-drop',
    patternScale: 110,
   }),
  }),
 }),
 'wrapping-a1-floral': Object.freeze({
  name: 'Vườn hoa Pastel A1',
  category: 'floral',
  productIds: ['wrapping'] as const,
  variantIds: ['a1'] as const,
  text: 'For You',
  color: '#7c2d12',
  backgroundColor: '#F9F4EE',
  previewHint: 'Họa tiết hoa rải đều khổ A1',
  productOptions: Object.freeze({
   wrapping: Object.freeze({
    mode: 'pattern' as WrappingPaperMode,
    patternConfig: Object.freeze({
     enabled: true,
     repeatMode: 'half-brick' as PatternRepeatMode,
     scale: 130,
     spacingX: 0,
     spacingY: 0,
     rotation: 0,
     backgroundColor: '#ffffff',
    }),
    repeatStyle: 'brick',
    patternScale: 130,
   }),
  }),
 }),
 'wrapping-a2-minimal': Object.freeze({
  name: 'Kẻ sọc Minimal A2',
  category: 'minimal',
  productIds: ['wrapping'] as const,
  variantIds: ['a2'] as const,
  text: 'Simple Joy',
  color: '#2E3338',
  backgroundColor: '#EFECE6',
  previewHint: 'Họa tiết kẻ sọc tối giản vừa vặn khổ A2',
  productOptions: Object.freeze({
   wrapping: Object.freeze({
    mode: 'pattern' as WrappingPaperMode,
    patternConfig: Object.freeze({
     enabled: true,
     repeatMode: 'basic' as PatternRepeatMode,
     scale: 85,
     spacingX: 0,
     spacingY: 0,
     rotation: 0,
     backgroundColor: '#ffffff',
    }),
    repeatStyle: 'regular',
    patternScale: 85,
   }),
  }),
 }),
 'sticker-diecut-love': Object.freeze({
  name: 'Trái tim viền trắng',
  category: 'love',
  productIds: ['sticker'] as const,
  variantIds: ['die-cut'] as const,
  text: 'Love',
  color: '#B3535D',
  backgroundColor: '#FFFFFF',
  previewHint: 'Tạo đường cắt die-cut ôm sát hình',
  productOptions: Object.freeze({
   sticker: Object.freeze({ hasWhiteBorder: true, borderWidth: 8, cutLineMode: 'die-cut' }),
  }),
 }),
 'sticker-cute-pack': Object.freeze({
  name: 'Sticker Mèo con',
  category: 'cute',
  productIds: ['sticker'] as const,
  text: 'Meow',
  color: '#2E3338',
  backgroundColor: '#FFFFFF',
  previewHint: 'Họa tiết nhí nhảnh dán điện thoại & vở',
  productOptions: Object.freeze({
   sticker: Object.freeze({ shape: 'circle' as FixedStickerShape, hasWhiteBorder: true, borderWidth: 6 }),
  }),
 }),
 'notebook-floral': Object.freeze({
  name: 'Khu vườn bí mật',
  category: 'floral',
  productIds: ['notebook'] as const,
  text: 'My Daily Journal',
  color: '#2E3338',
  backgroundColor: '#EDE8DF',
  previewHint: 'Bìa sổ tay họa tiết thực vật nhã nhặn',
  productOptions: Object.freeze({
   notebook: Object.freeze({ finish: 'matte' }),
  }),
 }),
 'notebook-minimal': Object.freeze({
  name: 'Ghi chú Tối giản',
  category: 'minimal',
  productIds: ['notebook'] as const,
  text: 'Thoughts & Ideas',
  color: '#344E66',
  backgroundColor: '#F3F5F7',
  previewHint: 'Bìa sổ phong cách typography hiện đại',
  productOptions: Object.freeze({
   notebook: Object.freeze({ finish: 'matte' }),
  }),
 }),
 'wrapping-birthday-balloons': Object.freeze({
  name: 'Bóng bay Sinh nhật',
  category: 'birthday',
  productIds: ['wrapping'] as const,
  text: 'Happy Birthday',
  color: '#8C3B2F',
  backgroundColor: '#FFF2EB',
  previewHint: 'Họa tiết bóng bay rực rỡ vui tươi',
  productOptions: Object.freeze({
   wrapping: Object.freeze({
    mode: 'pattern' as WrappingPaperMode,
    patternConfig: Object.freeze({
     enabled: true,
     repeatMode: 'half-brick' as PatternRepeatMode,
     scale: 110,
     spacingX: 0,
     spacingY: 0,
     rotation: 0,
     backgroundColor: '#ffffff',
    }),
    repeatStyle: 'brick',
    patternScale: 110,
   }),
  }),
 }),
 'sticker-coffee-cozy': Object.freeze({
  name: 'Tách cà phê Ấm',
  category: 'minimal',
  productIds: ['sticker'] as const,
  variantIds: ['fixed-shape', 'die-cut'] as const,
  text: 'Warm Coffee & Book',
  color: '#5C381E',
  backgroundColor: '#FDF7EE',
  previewHint: 'Sticker góc chill cà phê cho sổ và laptop',
  productOptions: Object.freeze({
   sticker: Object.freeze({ shape: 'rounded-rectangle' as FixedStickerShape, hasWhiteBorder: true, borderWidth: 5 }),
  }),
 }),
 'sticker-cozy-coffee': Object.freeze({
  name: 'Tách cà phê Ấm',
  category: 'minimal',
  productIds: ['sticker'] as const,
  variantIds: ['fixed-shape', 'die-cut'] as const,
  text: 'Warm Coffee & Book',
  color: '#5C381E',
  backgroundColor: '#FDF7EE',
  previewHint: 'Sticker góc chill cà phê cho sổ và laptop',
  productOptions: Object.freeze({
   sticker: Object.freeze({ shape: 'rounded-rectangle' as FixedStickerShape, hasWhiteBorder: true, borderWidth: 5 }),
  }),
 }),
});

export interface FilterTemplatesParams {
 productId: ProductId;
 variantId: string;
 category?: string;
 searchQuery?: string;
}

export function getCompatibleTemplates({
 productId,
 variantId,
 category = 'all',
 searchQuery = '',
}: FilterTemplatesParams): Array<{ id: string; template: TemplateConfig }> {
 const query = searchQuery.trim().toLowerCase();

 return Object.entries(TEMPLATES)
  .filter(([, tpl]) => {
   // Product compatibility
   if (tpl.productIds && !tpl.productIds.includes(productId)) {
    return false;
   }
   // Variant compatibility: if variantId is 'all' or empty, show all variants for product
   if (variantId && variantId !== 'all' && tpl.variantIds && !tpl.variantIds.includes(variantId)) {
    return false;
   }
   // Category filter
   if (category && category !== 'all' && tpl.category !== category) {
    return false;
   }
   // Search query filter
   if (query) {
    const matchName = tpl.name.toLowerCase().includes(query);
    const matchText = tpl.text.toLowerCase().includes(query);
    const matchHint = (tpl.previewHint || '').toLowerCase().includes(query);
    if (!matchName && !matchText && !matchHint) {
     return false;
    }
   }
   return true;
  })
  .map(([id, template]) => ({ id, template }));
}

export function normalizeQuantity(value: unknown, fallback = 1): number {
 const quantity = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value), 10);
 const safeFallback = Number.isFinite(fallback) ? Math.min(999, Math.max(1, Math.trunc(fallback))) : 1;
 return Number.isFinite(quantity) ? Math.min(999, Math.max(1, quantity)) : safeFallback;
}

export function normalizeWrappingOptions(
 raw: Partial<WrappingOptions> | Record<string, unknown> | null | undefined
): WrappingOptions {
 const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
 const rawPattern =
  source.patternConfig && typeof source.patternConfig === 'object'
   ? (source.patternConfig as Record<string, unknown>)
   : {};

 const rawMode = source.mode;
 const mode: WrappingPaperMode =
  rawMode === 'full-sheet' || rawMode === 'single'
   ? 'full-sheet'
   : 'pattern';

 const rawRepeat =
  rawPattern.repeatMode !== undefined
   ? rawPattern.repeatMode
   : source.repeatStyle;
 const repeatMode: PatternRepeatMode =
  rawRepeat === 'mirror'
   ? 'mirror'
   : rawRepeat === 'half-drop' || rawRepeat === 'scattered'
    ? 'half-drop'
    : rawRepeat === 'half-brick' || rawRepeat === 'brick'
     ? 'half-brick'
     : 'basic';

 const scaleNum = Number(
  rawPattern.scale !== undefined ? rawPattern.scale : source.patternScale
 );
 const scale = Number.isFinite(scaleNum) && scaleNum > 0 ? scaleNum : 100;

 const spacingXNum = Number(
  rawPattern.spacingX !== undefined ? rawPattern.spacingX : source.spacingX
 );
 const spacingX = Number.isFinite(spacingXNum) ? spacingXNum : 0;

 const spacingYNum = Number(
  rawPattern.spacingY !== undefined ? rawPattern.spacingY : source.spacingY
 );
 const spacingY = Number.isFinite(spacingYNum) ? spacingYNum : 0;

 const rotationNum = Number(
  rawPattern.rotation !== undefined ? rawPattern.rotation : source.rotation
 );
 const rotation = Number.isFinite(rotationNum) ? ((rotationNum % 360) + 360) % 360 : 0;

 const bg = typeof rawPattern.backgroundColor === 'string' && rawPattern.backgroundColor.trim()
  ? rawPattern.backgroundColor.trim()
  : '#ffffff';

 const enabled =
  typeof rawPattern.enabled === 'boolean'
   ? rawPattern.enabled
   : mode === 'pattern';

 const repeatStyle: 'regular' | 'scattered' | 'brick' | 'half-drop' =
  source.repeatStyle === 'scattered'
   ? 'scattered'
   : repeatMode === 'half-brick'
    ? 'brick'
    : repeatMode === 'half-drop'
     ? 'half-drop'
     : 'regular';
 const normalized: WrappingOptions = {
  ...source,
  mode,
  patternConfig: {
   enabled,
   repeatMode,
   scale,
   spacingX,
   spacingY,
   rotation,
   backgroundColor: bg,
  },
  repeatStyle,
  patternScale: scale,
  spacingX,
  spacingY,
  rotation,
 };

 return normalized;
}

function cloneOptions(productId: ProductId): Record<string, unknown> {
 const prod = PRODUCTS[productId] ?? PRODUCTS.wrapping;
 if (productId === 'wrapping') {
  return normalizeWrappingOptions(prod.defaultOptions);
 }
 return { ...prod.defaultOptions };
}

export function getTextData(element: CanvasElement): TextElementData | null {
 if (element.type !== 'text' || !element.data) return null;
 return element.data as unknown as TextElementData;
}

export function getTextLayerName(element: CanvasElement): string {
 const data = getTextData(element);
 const raw = data?.text ?? element.name ?? 'Văn bản';
 const clean = raw.trim();
 if (!clean) return 'Văn bản';
 const max = 31;
 return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

export function createTextElement(params: CreateTextElementParams): CanvasElement {
 const isHeading = params.preset === 'heading';
 const defaultText = isHeading ? 'Nhập tiêu đề' : 'Nhập nội dung';
 const text = params.text !== undefined ? params.text : defaultText;
 const isPlaceholder = params.text === undefined;

 const data: TextElementData = {
  text,
  color: params.color ?? '#111827',
  fontFamily: params.fontFamily ?? 'Be Vietnam Pro',
  fontSize: isHeading ? 28 : 20,
  fontWeight: isHeading ? 'bold' : 'regular',
  fontStyle: 'normal',
  align: 'center',
  lineHeight: isHeading ? 1.2 : 1.4,
  letterSpacing: 0,
  placeholder: isPlaceholder,
 };

 const element: CanvasElement = {
  id: params.id,
  type: 'text',
  name: getTextLayerName({ id: params.id, type: 'text', x: 0, y: 0, width: 0, height: 0, rotation: 0, data: data as unknown as Record<string, unknown> }),
  x: params.x ?? 50,
  y: params.y ?? 50,
  width: params.canvasWidthPercent ?? 70,
  height: isHeading ? 16 : 14,
  rotation: 0,
  locked: false,
  zIndex: 1,
  ...(params.surface ? { surface: params.surface } : {}),
  data: data as unknown as Record<string, unknown>,
 };
 return element;
}

export function getTextElement(state: DesignState, id: string): CanvasElement | null {
 const elements = state.elements ?? getDefaultElements(state);
 return elements.find((el) => el.id === id && el.type === 'text') ?? null;
}

export function migrateLegacyText(state: DesignState): DesignState {
 if (!state) return state;
 const elements = state.elements ?? getDefaultElements(state);
 const hasText = elements.some((el) => el.type === 'text');
 if (hasText) {
  return {
   ...state,
   elements,
  };
 }
 if (state.text && state.text.trim()) {
  const textEl = createTextElement({
   id: 'text-1',
   preset: 'body',
   text: state.text,
   color: state.color,
   y: 75,
  });
  textEl.zIndex = (elements.reduce((max, el) => Math.max(max, el.zIndex ?? 1), 0)) + 1;
  return {
   ...state,
   elements: [...elements, textEl],
  };
 }
 return {
  ...state,
  elements,
 };
}

export function getDefaultElements(state: DesignState): CanvasElement[] {
 const elements: CanvasElement[] = [];
 if (state.image) {
  elements.push({
   id: 'image-1',
   type: 'image',
   x: 50,
   y: 45,
   width: 60,
   height: 60,
   rotation: 0,
   locked: Boolean(state.productOptions.isLocked),
   zIndex: 1,
   data: { src: state.image.src, name: state.image.name },
  });
 }
 if (state.text) {
  const textEl = createTextElement({
   id: 'text-1',
   preset: 'body',
   text: state.text,
   color: state.color,
   y: 75,
  });
  textEl.zIndex = 2;
  elements.push(textEl);
 }
 return elements;
}

export function createInitialState(productId: ProductId = 'wrapping'): DesignState {
 const prod = PRODUCTS[productId] ?? PRODUCTS.wrapping;
 return {
  productId: prod.id,
  variantId: prod.defaultVariant,
  templateId: null,
  text: '',
  color: '#111827',
  backgroundColor: '#ffffff',
  image: null,
  quantity: 1,
  productOptions: cloneOptions(prod.id),
 };
}

export function transitionState(
 state: DesignState,
 action: DesignAction,
 mode?: DesignReviewMode | 'guest'
): DesignState {
 if (!state || !action) {
  return state;
 }

 if (mode === 'review' || mode === 'preflight' || mode === 'review-changes') {
  return state;
 }

 if (mode === 'staff-edit') {
  if (action.type === 'SET_PRODUCT' || action.type === 'SET_VARIANT' || action.type === 'SET_QUANTITY') {
   return state;
  }
  if (action.type === 'SET_PRODUCT_OPTION') {
   const frozenCard: Record<string, true> = { fold: true, orientation: true };
   const frozenSticker: Record<string, true> = { shape: true, size: true, width: true, height: true };
   const frozenNotebook: Record<string, true> = { finish: true, binding: true, size: true };
   if (state.productId === 'card' && frozenCard[action.key]) return state;
   if (state.productId === 'sticker' && frozenSticker[action.key]) return state;
   if (state.productId === 'notebook' && frozenNotebook[action.key]) return state;
  }
 }

 switch (action.type) {
  case 'SET_PRODUCT': {
   const nextProduct = PRODUCTS[action.value] ?? PRODUCTS.wrapping;
   return {
    ...state,
    productId: nextProduct.id,
    variantId: nextProduct.defaultVariant,
    templateId: null,
    productOptions: cloneOptions(nextProduct.id),
   };
  }

  case 'SET_VARIANT': {
   const currentProduct = PRODUCTS[state.productId] ?? PRODUCTS.wrapping;
   const hasVariant = currentProduct.variants.some((v) => v.id === action.value);
   return {
    ...state,
    variantId: hasVariant ? action.value : state.variantId,
   };
  }

  case 'SET_TEMPLATE': {
   const template = TEMPLATES[action.value];
   if (!template) return state;
   const nextElements: CanvasElement[] | undefined = template.elements
    ? template.elements.map((el) => ({ ...el, data: el.data ? { ...el.data } : undefined }))
    : state.elements;
   return {
    ...state,
    templateId: action.value,
    text: template.text,
    color: template.color,
    backgroundColor: template.backgroundColor,
    image: null,
    elements: nextElements,
    productOptions:
     state.productId === 'wrapping'
      ? normalizeWrappingOptions({
       ...cloneOptions(state.productId),
       ...(template.mode ? { mode: template.mode } : {}),
       ...(template.productOptions[state.productId] || {}),
      })
      : {
       ...cloneOptions(state.productId),
       ...(template.productOptions[state.productId] || {}),
      },
   };
  }

  case 'SET_TEXT':
   return {
    ...state,
    text: String(action.value ?? ''),
   };

  case 'SET_COLOR':
   return {
    ...state,
    color: action.value ?? state.color,
   };

  case 'SET_BACKGROUND_COLOR':
   return {
    ...state,
    backgroundColor: action.value ?? state.backgroundColor,
   };

  case 'SET_IMAGE':
   return {
    ...state,
    image: action.value ?? null,
   };

  case 'SET_QUANTITY':
   return {
    ...state,
    quantity: normalizeQuantity(action.value, state.quantity),
   };

  case 'SET_PRODUCT_OPTION': {
   if (!action.key) {
    return state;
   }
   if (state.productId === 'wrapping') {
    const currentWrapping = normalizeWrappingOptions(state.productOptions);
    let nextWrappingOptions: Record<string, unknown>;
    if (action.key === 'patternConfig' && action.value && typeof action.value === 'object') {
     const patchedPatternConfig = {
      ...currentWrapping.patternConfig,
      ...(action.value as Record<string, unknown>),
     };
     nextWrappingOptions = normalizeWrappingOptions({
      ...currentWrapping,
      patternConfig: patchedPatternConfig,
      repeatStyle: undefined,
      patternScale: undefined,
      spacingX: undefined,
      spacingY: undefined,
      rotation: undefined,
     });
    } else if (action.key === 'mode') {
     const nextMode = action.value === 'full-sheet' ? 'full-sheet' : 'pattern';
     nextWrappingOptions = normalizeWrappingOptions({
      ...currentWrapping,
      mode: nextMode,
     });
    } else if (action.key === 'repeatStyle') {
     const repeatVal = action.value;
     const nextRepeatMode: PatternRepeatMode =
      repeatVal === 'half-brick' || repeatVal === 'brick'
       ? 'half-brick'
       : repeatVal === 'half-drop' || repeatVal === 'scattered'
        ? 'half-drop'
        : repeatVal === 'mirror'
         ? 'mirror'
         : 'basic';
     nextWrappingOptions = normalizeWrappingOptions({
      ...currentWrapping,
      repeatStyle: action.value as 'regular' | 'scattered' | 'brick' | 'half-drop',
      patternConfig: {
       ...currentWrapping.patternConfig,
       repeatMode: nextRepeatMode,
      },
     });
    } else if (action.key === 'patternScale') {
     const scaleVal = Number(action.value);
     nextWrappingOptions = normalizeWrappingOptions({
      ...currentWrapping,
      patternScale: scaleVal,
      patternConfig: {
       ...currentWrapping.patternConfig,
       scale: Number.isFinite(scaleVal) && scaleVal > 0 ? scaleVal : currentWrapping.patternConfig.scale,
      },
     });
    } else if (action.key === 'spacingX' || action.key === 'spacingY' || action.key === 'rotation') {
     const numVal = Number(action.value);
     nextWrappingOptions = normalizeWrappingOptions({
      ...currentWrapping,
      [action.key]: action.value,
      patternConfig: {
       ...currentWrapping.patternConfig,
       [action.key]: Number.isFinite(numVal) ? numVal : currentWrapping.patternConfig[action.key],
      },
     });
    } else {
     nextWrappingOptions = normalizeWrappingOptions({
      ...state.productOptions,
      [action.key]: action.value,
     });
    }
    return {
     ...state,
     productOptions: nextWrappingOptions,
    };
   }
   return {
    ...state,
    productOptions: {
     ...state.productOptions,
     [action.key]: action.value,
    },
   };
  }
  case 'MOVE_ELEMENT': {
   const list = state.elements ?? getDefaultElements(state);
   const target = list.find((el) => el.id === action.id);
   if (!target || !canMutateElement(mode, target)) return state;
   return {
    ...state,
    elements: list.map((el) => (el.id === action.id ? { ...el, x: action.x, y: action.y } : el)),
   };
  }

  case 'RESIZE_ELEMENT': {
   const list = state.elements ?? getDefaultElements(state);
   const target = list.find((el) => el.id === action.id);
   if (!target || !canMutateElement(mode, target)) return state;
   return {
    ...state,
    elements: list.map((el) =>
     el.id === action.id
      ? {
       ...el,
       width: action.width,
       height: action.height,
       ...(action.x !== undefined ? { x: action.x } : {}),
       ...(action.y !== undefined ? { y: action.y } : {}),
      }
      : el
    ),
   };
  }

  case 'ROTATE_ELEMENT': {
   const list = state.elements ?? getDefaultElements(state);
   const target = list.find((el) => el.id === action.id);
   if (!target || !canMutateElement(mode, target)) return state;
   return {
    ...state,
    elements: list.map((el) =>
     el.id === action.id ? { ...el, rotation: ((action.rotation % 360) + 360) % 360 } : el
    ),
   };
  }

  case 'LOCK_ELEMENT': {
   const list = state.elements ?? getDefaultElements(state);
   return {
    ...state,
    elements: list.map((el) => (el.id === action.id ? { ...el, locked: action.locked } : el)),
   };
  }

  case 'SET_ELEMENTS': {
   return {
    ...state,
    elements: action.value,
   };
  }

  case 'UPDATE_ELEMENT': {
   const list = state.elements ?? getDefaultElements(state);
   return {
    ...state,
    elements: list.map((el) => (el.id === action.id ? { ...el, ...action.patch } : el)),
   };
  }

  case 'ADD_CANVAS_ELEMENT': {
   const currentList = state.elements ?? getDefaultElements(state);
   const maxZ = currentList.reduce((max, el) => Math.max(max, el.zIndex ?? 1), 0);
   const newElement: CanvasElement = {
    ...action.element,
    zIndex: action.element.zIndex ?? (maxZ + 1),
   };

   // Đồng bộ vào legacy top-level properties nếu đây là image hoặc text đầu tiên
   const syncPatch: Partial<DesignState> = {};
   if (newElement.type === 'text' && !state.text) {
    syncPatch.text = String(newElement.data?.text || '');
   }

   return {
    ...state,
    ...syncPatch,
    elements: [...currentList, newElement],
   };
  }

  case 'REMOVE_CANVAS_ELEMENT': {
   const currentList = state.elements ?? getDefaultElements(state);
   const target = currentList.find((el) => el.id === action.id);
   const nextList = currentList.filter((el) => el.id !== action.id);
   const syncPatch: Partial<DesignState> = {};
   if (target?.type === 'text') {
    const remainingText = nextList.find((el) => el.type === 'text');
    syncPatch.text = remainingText ? (getTextData(remainingText)?.text ?? '') : '';
   }
   return {
    ...state,
    ...syncPatch,
    elements: nextList,
   };
  }

  case 'REORDER_ELEMENTS': {
   const currentList = state.elements ?? getDefaultElements(state);
   const total = action.orderedIds.length;
   const zIndexMap = new Map<string, number>();
   action.orderedIds.forEach((id, index) => {
    zIndexMap.set(id, total - index);
   });
   const nextList = currentList.map((el) => {
    const newZ = zIndexMap.get(el.id);
    return newZ !== undefined ? { ...el, zIndex: newZ } : el;
   });
   nextList.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
   return {
    ...state,
    elements: nextList,
   };
  }

  case 'DUPLICATE_ELEMENT': {
   const currentList = state.elements ?? getDefaultElements(state);
   const target = currentList.find((el) => el.id === action.id);
   if (!target) return state;

   const newId = `${target.id}-copy-${Date.now()}`;
   const newZ = (target.zIndex ?? 1) + 1;
   const clone: CanvasElement = {
    ...target,
    id: newId,
    name: target.name ? `${target.name} (Bản sao)` : undefined,
    x: Math.min(80, target.x + 4),
    y: Math.min(80, target.y + 4),
    zIndex: newZ,
    locked: false,
   };
   if (clone.type === 'text' && clone.data) {
    clone.data = {
     ...clone.data,
     placeholder: false,
    };
   }

   const updated = currentList.map((el) => {
    if ((el.zIndex ?? 1) >= newZ && el.id !== target.id) {
     return { ...el, zIndex: (el.zIndex ?? 1) + 1 };
    }
    return el;
   });

   return {
    ...state,
    elements: [...updated, clone].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
   };
  }

  case 'DELETE_ELEMENT': {
   const currentList = state.elements ?? getDefaultElements(state);
   const target = currentList.find((el) => el.id === action.id);
   if (!target || !canMutateElement(mode, target)) return state;

   const nextList = currentList.filter((el) => el.id !== action.id);
   const syncPatch: Partial<DesignState> = {};
   if (target.type === 'image' && state.image) {
    syncPatch.image = null;
   } else if (target.type === 'text') {
    const remainingText = nextList.find((el) => el.type === 'text');
    syncPatch.text = remainingText ? (getTextData(remainingText)?.text ?? '') : '';
   }

   return {
    ...state,
    ...syncPatch,
    elements: nextList,
   };
  }
  case 'GROUP_ELEMENTS': {
   const currentList = state.elements ?? getDefaultElements(state);
   const selectedElements = currentList.filter((el) => action.ids.includes(el.id));
   const surfaces = new Set(selectedElements.map((el) => el.surface ?? 'front'));
   if (surfaces.size > 1) {
    // Disallow cross-surface grouping
    return state;
   }
   const result = groupElements(state, action.ids);
   return result.state;
  }

  case 'UNGROUP_ELEMENT': {
   return ungroupElement(state, action.groupId);
  }

  case 'MOVE_ELEMENTS': {
   const currentList = state.elements ?? getDefaultElements(state);
   return {
    ...state,
    elements: moveElements(currentList, action.ids, action.dx, action.dy),
   };
  }

  case 'DUPLICATE_ELEMENTS': {
   const result = duplicateSelectedElements(state, action.ids);
   return result.state;
  }

  case 'DELETE_ELEMENTS': {
   return deleteSelectedElements(state, action.ids);
  }

  case 'ADD_TEXT_ELEMENT': {
   const currentList = state.elements ?? getDefaultElements(state);
   const maxZ = currentList.reduce((max, el) => Math.max(max, el.zIndex ?? 1), 0);
   const newElement = createTextElement({
    id: action.id ?? `text-${Date.now()}`,
    preset: action.preset,
    text: action.text,
    color: action.color ?? state.color,
   });
   newElement.surface = action.surface ?? (state.productId === 'card' ? (state.productOptions.surface as CardSurface) ?? 'front' : undefined);
   newElement.zIndex = maxZ + 1;
   const syncPatch: Partial<DesignState> = {};
   const data = getTextData(newElement);
   if (!state.text && data?.text) {
    syncPatch.text = data.text;
   }
   return {
    ...state,
    ...syncPatch,
    elements: [...currentList, newElement],
   };
  }

  case 'COMMIT_TEXT_EDIT': {
   const currentList = state.elements ?? getDefaultElements(state);
   const targetIndex = currentList.findIndex((el) => el.id === action.id && el.type === 'text');
   if (targetIndex === -1) return state;

   const trimmed = action.text.trim();
   if (!trimmed) {
    const filtered = currentList.filter((el) => el.id !== action.id);
    const syncPatch: Partial<DesignState> = {};
    const remainingFirstText = filtered.find((el) => el.type === 'text');
    syncPatch.text = remainingFirstText ? (getTextData(remainingFirstText)?.text ?? '') : '';
    return {
     ...state,
     ...syncPatch,
     elements: filtered,
    };
   }

   const target = currentList[targetIndex];
   const oldData = getTextData(target) ?? {
    text: '',
    color: '#111827',
    fontFamily: 'Be Vietnam Pro',
    fontSize: 20,
    fontWeight: 'regular',
    fontStyle: 'normal',
    align: 'center',
    lineHeight: 1.4,
    letterSpacing: 0,
   };

   const updatedData: TextElementData = {
    ...oldData,
    text: action.text,
    placeholder: false,
   };

   const updatedElement: CanvasElement = {
    ...target,
    name: getTextLayerName({ ...target, data: updatedData as unknown as Record<string, unknown> }),
    data: updatedData as unknown as Record<string, unknown>,
   };

   const nextList = [...currentList];
   nextList[targetIndex] = updatedElement;

   const syncPatch: Partial<DesignState> = {};
   const firstText = nextList.find((el) => el.type === 'text');
   if (firstText?.id === action.id) {
    syncPatch.text = action.text;
   }

   return {
    ...state,
    ...syncPatch,
    elements: nextList,
   };
  }

  case 'UPDATE_TEXT_STYLE': {
   const currentList = state.elements ?? getDefaultElements(state);
   const targetIndex = currentList.findIndex((el) => el.id === action.id && el.type === 'text');
   if (targetIndex === -1) return state;

   const target = currentList[targetIndex];
   if (!canMutateElement(mode, target)) return state;

   const oldData = getTextData(target) ?? {
    text: '',
    color: '#111827',
    fontFamily: 'Be Vietnam Pro',
    fontSize: 20,
    fontWeight: 'regular',
    fontStyle: 'normal',
    align: 'center',
    lineHeight: 1.4,
    letterSpacing: 0,
   };

   const updatedData: TextElementData = {
    ...oldData,
    ...action.patch,
   };

   const updatedElement: CanvasElement = {
    ...target,
    name: getTextLayerName({ ...target, data: updatedData as unknown as Record<string, unknown> }),
    data: updatedData as unknown as Record<string, unknown>,
   };

   const nextList = [...currentList];
   nextList[targetIndex] = updatedElement;

   const syncPatch: Partial<DesignState> = {};
   const firstText = nextList.find((el) => el.type === 'text');
   if (firstText?.id === action.id) {
    if (updatedData.color) syncPatch.color = updatedData.color;
    if (updatedData.text) syncPatch.text = updatedData.text;
   }

   return {
    ...state,
    ...syncPatch,
    elements: nextList,
   };
  }

  case 'BRING_FORWARD': {
   const currentList = state.elements ?? getDefaultElements(state);
   const sorted = [...currentList].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
   const idx = sorted.findIndex((el) => el.id === action.id);
   if (idx === -1 || idx === sorted.length - 1) return state;
   const current = sorted[idx];
   const next = sorted[idx + 1];
   if (!current || !next) return state;
   const tempZ = current.zIndex ?? 0;
   current.zIndex = next.zIndex ?? tempZ + 1;
   next.zIndex = tempZ;
   sorted.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
   return { ...state, elements: sorted };
  }

  case 'SEND_BACKWARD': {
   const currentList = state.elements ?? getDefaultElements(state);
   const sorted = [...currentList].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
   const idx = sorted.findIndex((el) => el.id === action.id);
   if (idx <= 0) return state;
   const current = sorted[idx];
   const prev = sorted[idx - 1];
   if (!current || !prev) return state;
   const tempZ = current.zIndex ?? 0;
   current.zIndex = prev.zIndex ?? 0;
   prev.zIndex = tempZ;
   sorted.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
   return { ...state, elements: sorted };
  }

  case 'REPLACE_IMAGE_ASSET': {
   let currentList = state.elements && state.elements.length > 0
    ? state.elements
    : getDefaultElements(state);

   let target = action.id
    ? currentList.find((el) => el.id === action.id && el.type === 'image')
    : currentList.find((el) => el.type === 'image');

   if (!target && !action.id && state.image) {
    target = {
     id: 'image-1',
     type: 'image',
     x: 50,
     y: 45,
     width: 60,
     height: 60,
     rotation: 0,
     locked: false,
     zIndex: 1,
     data: {
      src: state.image.src,
      name: state.image.name,
     },
    };
    currentList = [...currentList, target];
   }

   if (!target) return state;

   const existingData = target.data ? (target.data as Record<string, unknown>) : {};
   const frameWidth = target.width || 60;
   const frameHeight = target.height || 60;
   const imgWidth = action.asset.width || (state.image?.width ?? 800);
   const imgHeight = action.asset.height || (state.image?.height ?? 800);

   // Uniform cover scale and centered crop
   const frameAspect = Math.max(1, frameWidth) / Math.max(1, frameHeight);
   const imageAspect = Math.max(1, imgWidth) / Math.max(1, imgHeight);
   let cropW: number;
   let cropH: number;
   if (imageAspect > frameAspect) {
    cropH = imgHeight;
    cropW = Math.round(imgHeight * frameAspect);
   } else {
    cropW = imgWidth;
    cropH = Math.round(imgWidth / frameAspect);
   }
   const cropX = Math.max(0, Math.round((imgWidth - cropW) / 2));
   const cropY = Math.max(0, Math.round((imgHeight - cropH) / 2));

   const updatedData: Record<string, unknown> = {
    ...existingData,
    src: action.asset.src,
    name: action.asset.name ?? (existingData.name as string | undefined) ?? 'Ảnh đã thay thế',
    originalSrc: action.asset.originalSrc ?? action.asset.src,
    removedBackgroundSrc: undefined, // Strictly reset background removal on replace
    sourceWidth: action.asset.width ?? (existingData.sourceWidth as number | undefined),
    sourceHeight: action.asset.height ?? (existingData.sourceHeight as number | undefined),
    crop: {
     scale: 1,
     offsetX: 0,
     offsetY: 0,
     rotation: 0,
     x: cropX,
     y: cropY,
     width: cropW,
     height: cropH,
    },
    placeholder: false,
   };

   const nextList = currentList.map((el) =>
    el.id === target.id ? { ...el, data: updatedData } : el
   );

   const nextImage: ImageState = {
    name: action.asset.name ?? state.image?.name ?? 'Ảnh đã thay thế',
    src: action.asset.src,
    width: action.asset.width ?? state.image?.width,
    height: action.asset.height ?? state.image?.height,
    size: action.asset.size ?? state.image?.size,
   };

   return {
    ...state,
    image: nextImage,
    elements: nextList,
   };
  }

  case 'SET_IMAGE_OPACITY': {
   const currentList = state.elements ?? getDefaultElements(state);
   const safeOpacity = Math.max(0, Math.min(100, action.opacity));
   const targetId = action.id;

   const nextList = currentList.map((el) => {
    if (el.type !== 'image') return el;
    if (!targetId || el.id === targetId) {
     return {
      ...el,
      data: {
       ...(el.data ?? {}),
       opacity: safeOpacity,
      },
     };
    }
    return el;
   });

   return {
    ...state,
    elements: nextList,
    productOptions: {
     ...state.productOptions,
     imageOpacity: safeOpacity,
    },
   };
  }

  case 'APPLY_REMOVE_BACKGROUND': {
   const currentList = state.elements ?? getDefaultElements(state);
   const target = action.id
    ? currentList.find((el) => el.id === action.id && el.type === 'image')
    : currentList.find((el) => el.type === 'image');

   if (!target) return state;

   const existingData = (target.data ?? {}) as Record<string, unknown>;
   const originalSrc = (existingData.originalSrc as string | undefined) ?? (existingData.src as string) ?? state.image?.src ?? '';

   const updatedData: Record<string, unknown> = {
    ...existingData,
    originalSrc,
    removedBackgroundSrc: action.derivedSrc,
    src: action.derivedSrc,
   };

   const nextList = currentList.map((el) =>
    el.id === target.id ? { ...el, data: updatedData } : el
   );

   return {
    ...state,
    image: state.image ? { ...state.image, src: action.derivedSrc } : null,
    elements: nextList,
   };
  }

  case 'COMMIT_REFINE_MASK': {
   const currentList = state.elements ?? getDefaultElements(state);
   const target = action.id
    ? currentList.find((el) => el.id === action.id && el.type === 'image')
    : currentList.find((el) => el.type === 'image');

   if (!target) return state;

   const existingData = (target.data ?? {}) as Record<string, unknown>;
   const originalSrc = (existingData.originalSrc as string | undefined) ?? (existingData.src as string) ?? state.image?.src ?? '';

   const updatedData: Record<string, unknown> = {
    ...existingData,
    originalSrc,
    removedBackgroundSrc: action.refinedSrc,
    src: action.refinedSrc,
    refineMaskData: action.maskData ?? (existingData.refineMaskData as string | undefined),
   };

   const nextList = currentList.map((el) =>
    el.id === target.id ? { ...el, data: updatedData } : el
   );

   return {
    ...state,
    image: state.image ? { ...state.image, src: action.refinedSrc } : null,
    elements: nextList,
   };
  }
  case 'COMMIT_IMAGE_CROP': {
   const currentList = state.elements ?? getDefaultElements(state);
   const target = action.id
    ? currentList.find((el) => el.id === action.id && el.type === 'image')
    : currentList.find((el) => el.type === 'image');

   if (!target) return state;

   const existingData = (target.data ?? {}) as Record<string, unknown>;
   const nextList = currentList.map((el) =>
    el.id === target.id
     ? {
      ...el,
      data: {
       ...existingData,
       crop: {
        ...((existingData.crop as Record<string, unknown> | undefined) ?? {}),
        ...action.crop,
       },
      },
     }
     : el
   );

   return {
    ...state,
    elements: nextList,
   };
  }

  case 'RESET_IMAGE_CROP': {
   const currentList = state.elements ?? getDefaultElements(state);
   const target = action.id
    ? currentList.find((el) => el.id === action.id && el.type === 'image')
    : currentList.find((el) => el.type === 'image');

   if (!target) return state;

   const existingData = (target.data ?? {}) as Record<string, unknown>;
   const nextList = currentList.map((el) =>
    el.id === target.id
     ? {
      ...el,
      data: {
       ...existingData,
       crop: {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
       },
      },
     }
     : el
   );

   return {
    ...state,
    elements: nextList,
   };
  }

  case 'SET_IMAGE_MASK': {
   const currentList = state.elements ?? getDefaultElements(state);
   const target = action.id
    ? currentList.find((el) => el.id === action.id && el.type === 'image')
    : currentList.find((el) => el.type === 'image');

   if (!target) return state;

   const existingData = (target.data ?? {}) as Record<string, unknown>;
   const normalizedMask = action.mask === 'none' ? null : action.mask;

   const nextList = currentList.map((el) =>
    el.id === target.id
     ? {
      ...el,
      data: {
       ...existingData,
       mask: normalizedMask,
      },
     }
     : el
   );

   return {
    ...state,
    elements: nextList,
   };
  }
  case 'RESTORE_ORIGINAL_IMAGE': {
   const currentList = state.elements ?? getDefaultElements(state);
   const target = action.id
    ? currentList.find((el) => el.id === action.id && el.type === 'image')
    : currentList.find((el) => el.type === 'image');

   if (!target) return state;

   const existingData = (target.data ?? {}) as Record<string, unknown>;
   const originalSrc = (existingData.originalSrc as string | undefined) ?? (existingData.src as string) ?? state.image?.src;
   if (!originalSrc) return state;

   const updatedData: Record<string, unknown> = {
    ...existingData,
    src: originalSrc,
   };

   const nextList = currentList.map((el) =>
    el.id === target.id ? { ...el, data: updatedData } : el
   );

   return {
    ...state,
    image: state.image ? { ...state.image, src: originalSrc } : null,
    elements: nextList,
   };
  }
  default:
   return state;
 }
}

export function getDesignSummary(state: DesignState): DesignSummary {
 const prod = PRODUCTS[state.productId] ?? PRODUCTS.wrapping;
 const variant = prod.variants.find((v) => v.id === state.variantId) ?? prod.variants[0];
 const quantity = normalizeQuantity(state.quantity);
 const unitPrice = variant.price;
 const totalPrice = unitPrice * quantity;

 return {
  product: prod.name,
  variant: variant.name,
  quantity,
  unitPrice,
  totalPrice,
  priceLabel: `${new Intl.NumberFormat('vi-VN').format(totalPrice)}\u00a0₫`,
 };
}

export function getPreflight(state: DesignState): PreflightResult {
 const checks: PreflightCheck[] = [];

 // Sticker-specific rules: contour analysis for die-cut and empty content check
 if (state.productId === 'sticker') {
  if (!state.elements || state.elements.length === 0) {
   checks.push({
    id: 'sticker-content',
    level: 'error',
    type: 'error',
    category: 'sticker',
    label: 'Chưa có nội dung sticker',
    description: 'Vui lòng thêm hình ảnh hoặc chữ vào sticker.',
   });
  } else {
   const isDieCut = state.variantId === 'die-cut' || (!state.variantId && !state.productOptions.shape);
   if (isDieCut) {
    const contour = computeStickerContour(state.elements, state.productOptions as StickerOptions);
    if (contour.status === 'disconnected') {
     checks.push({
      id: 'sticker-contour',
      level: 'warning',
      type: 'warning',
      category: 'sticker',
      label: 'Một số chi tiết đang tách rời',
      description: 'Di chuyển chúng gần nhau hơn hoặc tăng viền để tạo thành một sticker.',
     });
    } else if (contour.status === 'tiny-details') {
     checks.push({
      id: 'sticker-contour',
      level: 'warning',
      type: 'warning',
      category: 'sticker',
      label: 'Một số chi tiết quá nhỏ để cắt đẹp',
      description: 'Tăng viền hoặc đơn giản thiết kế.',
     });
    } else if (contour.status === 'valid') {
     checks.push({
      id: 'sticker-contour',
      level: 'pass',
      type: 'pass',
      category: 'sticker',
      label: 'Đường cắt sticker hợp lệ',
      description: 'Các chi tiết đã được nối liền tạo thành một khối cắt duy nhất.',
     });
    }
   }
  }
 }

 // Card-specific rules: blank inside or back is valid and not an error
 if (state.productId === 'card') {
  // Intentionally omit missing-content errors for inside or back surfaces
 }

 if (state.productId === 'notebook') {
  const hasElements = state.elements && state.elements.length > 0;
  const hasCustomBg = state.backgroundColor &&
   state.backgroundColor.toLowerCase() !== '#ffffff';
  if (!hasElements && !hasCustomBg) {
   checks.push({
    id: 'notebook-content',
    level: 'warning',
    type: 'warning',
    category: 'notebook',
    label: 'Bìa vở chưa có nội dung',
    description: 'Thêm hình ảnh, chữ hoặc sticker để bìa sổ sinh động hơn.',
   });
  }
  if (hasElements) {
   const textInBindingZone = state.elements?.some(
    (e) => e.type === 'text' && isElementInNotebookBindingZone(e, 100)
   );
   if (textInBindingZone) {
    checks.push({
     id: 'notebook-binding-zone',
     level: 'warning',
     type: 'warning',
     category: 'notebook',
     label: 'Văn bản nằm gần mép gáy sổ',
     description: 'Giữ chữ quan trọng cách mép này một chút để không bị che bởi gáy hoặc lỗ lò xo.',
    });
   }
  }
 }

 const elements = state.elements ?? getDefaultElements(state);
 for (const element of elements) {
  if (!isElementImportant(element.type)) continue;

  const safety = evaluateElementSafety({
   element: {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    surface: element.surface,
    rotation: element.rotation,
   },
   productId: state.productId,
   variantId: state.variantId,
   surface: element.surface,
   cardOrientation: (state.productOptions as CardOptions)?.orientation,
  });

  if (safety.risk === 'near-edge') {
   checks.push({
    id: `safe-area-${element.id}`,
    level: 'warning',
    type: 'warning',
    category: 'safe-area',
    label: safety.badgeLabel || 'Chi tiết này hơi sát mép',
    description: safety.description,
    elementId: element.id,
    surfaceId: element.surface ?? 'front',
   });
  } else if (safety.risk === 'high-risk') {
   checks.push({
    id: `safe-area-${element.id}`,
    level: 'error',
    type: 'error',
    category: 'safe-area',
    label: safety.badgeLabel || 'Chi tiết này có thể bị cắt mất',
    description: safety.description,
    elementId: element.id,
    surfaceId: element.surface ?? 'front',
   });
  }
 }


 const rawImageElements = state.elements?.filter((e) => e.type === 'image');
 const hasExplicitElements = Boolean(state.elements);
 const imageElements = (hasExplicitElements && rawImageElements ? rawImageElements : (state.elements ?? getDefaultElements(state)).filter((e) => e.type === 'image'));

 if (hasExplicitElements ? imageElements.length > 0 : false) {
  const options = state.productOptions as Record<string, unknown>;
  const patternConfig = options.patternConfig as { enabled?: unknown; scale?: unknown } | undefined;
  const isPatternWrapping = state.productId === 'wrapping' &&
   (options.mode === 'pattern' || patternConfig?.enabled === true);
  const configuredPatternScale = Number(options.patternScale);
  const patternScale = isPatternWrapping
   ? (Number.isFinite(configuredPatternScale) && configuredPatternScale > 0
    ? configuredPatternScale
    : (Number.isFinite(Number(patternConfig?.scale)) ? Number(patternConfig?.scale) : undefined))
   : undefined;

  for (const imageElement of imageElements) {
   const imageData = getImageData(imageElement);
   const crop = imageData?.crop;
   const cropFraction = crop
    ? crop.scale && crop.scale > 1
     ? 1 / (crop.scale * crop.scale)
     : crop.width && crop.height && imageData?.sourceWidth && imageData?.sourceHeight
      ? (crop.width * crop.height) / (imageData.sourceWidth * imageData.sourceHeight)
      : 1
    : 1;

   const report = evaluateImageQuality({
    sourceWidth: imageData?.sourceWidth ?? 1200,
    sourceHeight: imageData?.sourceHeight ?? 1200,
    scale: imageData?.scale ?? 1,
    cropFraction,
    productId: state.productId,
    variantId: state.variantId,
    patternScale,
    elementWidthPct: imageElement.width,
    elementId: imageElement.id,
    surfaceId: imageElement.surface ?? 'front',
   });

   const checkId = `image-quality-${imageElement.id}`;
   const surfaceId = imageElement.surface ?? 'front';

   if (report.level === 'warning') {
    checks.push({
     id: checkId,
     level: 'warning',
     type: 'warning',
     category: 'image',
     label: 'Ảnh có thể hơi mờ khi in',
     description: report.description,
     elementId: imageElement.id,
     surfaceId,
    });
   } else if (report.level === 'critical') {
    checks.push({
     id: checkId,
     level: 'error',
     type: 'error',
     category: 'image',
     label: 'Ảnh quá nhỏ để in rõ',
     description: report.description,
     elementId: imageElement.id,
     surfaceId,
    });
   } else {
    checks.push({
     id: checkId,
     level: 'pass',
     type: 'pass',
     category: 'image',
     label: 'Chất lượng ảnh đạt chuẩn',
     description: report.description,
     elementId: imageElement.id,
     surfaceId,
    });
   }
  }
 } else if (state.image) {
  const options = state.productOptions as Record<string, unknown>;
  const patternConfig = options.patternConfig as { enabled?: unknown; scale?: unknown } | undefined;
  const isPatternWrapping = state.productId === 'wrapping' &&
   (options.mode === 'pattern' || patternConfig?.enabled === true);
  const configuredPatternScale = Number(options.patternScale);
  const patternScale = Number.isFinite(configuredPatternScale) && configuredPatternScale > 0
   ? configuredPatternScale
   : Number(patternConfig?.scale);
  const scaleFactor = isPatternWrapping && Number.isFinite(patternScale) && patternScale > 0
   ? patternScale / 100
   : 1;
  const sourceWidth = state.image.width;
  const sourceHeight = state.image.height;
  const effectiveWidth = sourceWidth !== undefined ? sourceWidth / scaleFactor : undefined;
  const effectiveHeight = sourceHeight !== undefined ? sourceHeight / scaleFactor : undefined;
  const isSmall = (effectiveWidth !== undefined && effectiveWidth < 1200) ||
   (effectiveHeight !== undefined && effectiveHeight < 1200);

  if (isSmall) {
   checks.push({
    id: 'image-quality',
    level: 'warning',
    label: 'Ảnh có thể hơi mờ khi in',
   });
  } else {
   checks.push({
    id: 'image-quality',
    level: 'pass',
    label: 'Độ nét ảnh đạt chuẩn',
   });
  }
 } else {
  checks.push({
   id: 'image-quality',
   level: 'pass',
   label: 'Chưa có ảnh cần kiểm tra',
  });
 }

 const errorCount = checks.filter((c) => c.level === 'error').length;
 const warningCount = checks.filter((c) => c.level === 'warning').length;
 const passCount = checks.filter((c) => c.level === 'pass').length;
 const hasErrors = errorCount > 0;
 const hasWarnings = warningCount > 0;
 const overallLevel: PreflightSeverity = hasErrors ? 'error' : hasWarnings ? 'warning' : 'pass';

 return {
  level: overallLevel,
  checks,
  hasErrors,
  hasWarnings,
  passCount,
  warningCount,
  errorCount,
 };
}
