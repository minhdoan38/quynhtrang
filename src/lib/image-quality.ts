export type QualityLevel = 'good' | 'warning' | 'critical';

export interface ImageQualityReport {
 level: QualityLevel;
 badgeLabel: string;
 description: string;
 advice: string;
 effectivePixels: number;
}

export interface EvaluateQualityParams {
 sourceWidth?: number;
 sourceHeight?: number;
 scale?: number;
 cropFraction?: number;
 productId?: string;
 patternScale?: number;
}

/**
 * Evaluates print image quality dynamically based on source resolution,
 * user scaling, and cropping fraction.
 */
export function evaluateImageQuality({
 sourceWidth = 1200,
 sourceHeight = 1200,
 scale = 1,
 cropFraction = 1,
 productId,
 patternScale,
}: EvaluateQualityParams = {}): ImageQualityReport {
 // Normalize parameters
 const safeWidth = Math.max(1, sourceWidth);
 const safeHeight = Math.max(1, sourceHeight);
 const safeScale = Math.max(0.1, scale);
 const effectiveScale = productId === 'wrapping' && typeof patternScale === 'number'
  ? safeScale * (Math.max(10, patternScale) / 100)
  : safeScale;
 const safeCrop = Math.max(0.05, Math.min(1, cropFraction));

 const minSourceDim = Math.min(safeWidth, safeHeight);
 const effectivePixels = Math.round((minSourceDim * safeCrop) / effectiveScale);

 if (effectivePixels >= 600) {
  return {
   level: 'good',
   badgeLabel: 'Ảnh đẹp',
   description: 'Độ nét tối ưu cho in ấn vật lý chất lượng cao.',
   advice: 'Hình ảnh sẵn sàng cho bản in rõ nét.',
   effectivePixels,
  };
 }

 if (effectivePixels >= 320) {
  return {
   level: 'warning',
   badgeLabel: 'Có thể hơi mờ',
   description: 'Ảnh này đang được phóng khá lớn và có thể kém nét khi in.',
   advice: 'Hãy dùng ảnh chất lượng cao hơn hoặc thu nhỏ ảnh.',
   effectivePixels,
  };
 }

 return {
  level: 'critical',
  badgeLabel: 'Ảnh quá nhỏ',
  description: 'Độ phân giải ảnh rất thấp, dễ bị vỡ hạt hoặc nhòe khi in.',
  advice: 'Nên thay bằng ảnh gốc rõ nét hơn để sản phẩm đạt thẩm mỹ tốt nhất.',
  effectivePixels,
 };
}
