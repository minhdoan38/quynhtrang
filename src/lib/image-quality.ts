export type QualityLevel = 'good' | 'warning' | 'critical';
export type QualityBadgeLabel = 'Tốt' | 'Có thể hơi mờ' | 'Ảnh quá nhỏ';

export interface ProductQualityThreshold {
 goodMinPpi: number;
 warningMinPpi: number;
}

export const PRODUCT_QUALITY_THRESHOLDS: Record<string, ProductQualityThreshold> = {
 card: { goodMinPpi: 220, warningMinPpi: 150 },
 sticker: { goodMinPpi: 220, warningMinPpi: 150 },
 notebook: { goodMinPpi: 200, warningMinPpi: 140 },
 wrapping: { goodMinPpi: 180, warningMinPpi: 120 },
};

export const PRODUCT_PHYSICAL_WIDTH_INCHES: Record<string, number> = {
 card: 5.83,
 sticker: 1.97,
 notebook: 5.83,
 wrapping: 33.11,
};

const DEFAULT_PRODUCT_PHYSICAL_WIDTH_INCHES = 5;
const WRAPPING_MOTIF_WIDTH_INCHES = 2.68;

export interface ImageQualityReport {
 level: QualityLevel;
 badgeLabel: QualityBadgeLabel;
 title: string;
 description: string;
 advice: string;
 effectivePpi: number;
 effectivePixels?: number; // for backward compatibility
 canScaleDown?: boolean;
 recommendedScale?: number;
 elementId?: string;
 surfaceId?: string;
}

export interface EvaluateQualityParams {
 sourceWidth?: number;
 sourceHeight?: number;
 scale?: number;
 cropFraction?: number;
 productId?: string;
 variantId?: string;
 patternScale?: number;
 elementWidthPct?: number;
 elementId?: string;
 surfaceId?: string;
}

/**
 * Evaluates print image quality dynamically based on source resolution,
 * user scaling, cropping fraction, and physical product size.
 */
export function evaluateImageQuality({
 sourceWidth = 1200,
 sourceHeight = 1200,
 scale = 1,
 cropFraction = 1,
 productId,
 patternScale,
 elementWidthPct = 100,
 elementId,
 surfaceId,
}: EvaluateQualityParams = {}): ImageQualityReport {
 const safeWidth = Math.max(1, sourceWidth);
 const safeHeight = Math.max(1, sourceHeight);
 const safeScale = Math.max(0.01, scale);
 const safeCrop = Math.max(0.05, Math.min(1, cropFraction));
 const safeElementWidthPct = Math.max(1, Math.min(100, elementWidthPct));

 const isWrappingPattern = productId === 'wrapping' && typeof patternScale === 'number';
 const canvasPhysicalWidth = productId
  ? PRODUCT_PHYSICAL_WIDTH_INCHES[productId] ?? DEFAULT_PRODUCT_PHYSICAL_WIDTH_INCHES
  : DEFAULT_PRODUCT_PHYSICAL_WIDTH_INCHES;

 const physicalElementWidth = isWrappingPattern
  ? WRAPPING_MOTIF_WIDTH_INCHES * (Math.max(10, patternScale) / 100) * safeScale
  : canvasPhysicalWidth * (safeElementWidthPct / 100) * safeScale;

 const usablePixels = Math.min(safeWidth, safeHeight) * safeCrop;
 const effectivePpi = Math.round(usablePixels / Math.max(0.5, physicalElementWidth));

 // Backward compatibility: match earlier pixel proxy when element fits canvas
 const effectivePixels = Math.round(usablePixels / (isWrappingPattern ? safeScale * (Math.max(10, patternScale) / 100) : safeScale));

 const thresholds = (productId && PRODUCT_QUALITY_THRESHOLDS[productId]) || {
  goodMinPpi: 120,
  warningMinPpi: 64,
 };

 const baseReport = {
  effectivePpi,
  effectivePixels,
  elementId,
  surfaceId,
 };

 if (effectivePpi >= thresholds.goodMinPpi) {
  return {
   ...baseReport,
   level: 'good',
   badgeLabel: 'Tốt',
   title: 'Chất lượng ảnh tốt',
   description: 'Độ nét tối ưu cho in ấn vật lý chất lượng cao.',
   advice: 'Hình ảnh sẵn sàng cho bản in rõ nét.',
  };
 }

 // Calculate scale required to reach good quality threshold
 const targetWidthForGood = usablePixels / thresholds.goodMinPpi;
 const baseWidthWithoutScale = isWrappingPattern
  ? WRAPPING_MOTIF_WIDTH_INCHES * (Math.max(10, patternScale) / 100)
  : canvasPhysicalWidth * (safeElementWidthPct / 100);
 const recommendedScale = targetWidthForGood / Math.max(0.01, baseWidthWithoutScale);

 if (effectivePpi >= thresholds.warningMinPpi) {
  return {
   ...baseReport,
   level: 'warning',
   badgeLabel: 'Có thể hơi mờ',
   title: 'Ảnh có thể hơi mờ khi in',
   description: 'Ảnh này đang được phóng khá lớn. Thành phẩm có thể kém nét khi in.',
   advice: 'Hãy dùng ảnh chất lượng cao hơn hoặc thu nhỏ ảnh.',
   canScaleDown: true,
   recommendedScale,
  };
 }

 return {
  ...baseReport,
  level: 'critical',
  badgeLabel: 'Ảnh quá nhỏ',
  title: 'Ảnh quá nhỏ để in rõ',
  description: 'Ảnh này quá nhỏ để in rõ ở kích thước hiện tại. Dễ bị vỡ hạt hoặc nhòe khi in.',
  advice: 'Nên thay bằng ảnh gốc rõ nét hơn hoặc thu nhỏ ảnh lại.',
  canScaleDown: true,
  recommendedScale,
 };
}
