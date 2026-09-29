export type SafetyRisk = 'safe' | 'near-edge' | 'high-risk';

export type SafetyRegionType =
  | 'outer-edge'
  | 'card-fold'
  | 'notebook-binding'
  | 'sticker-boundary'
  | 'outside-bounds';

export interface SafetyReport {
  risk: SafetyRisk;
  regionType?: SafetyRegionType;
  badgeLabel?: string;
  description?: string;
  advice?: string;
  elementId?: string;
  surfaceId?: string;
}

export interface EvaluateSafetyParams {
  element: {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height?: number;
    surface?: string;
    rotation?: number;
  };
  canvasWidth?: number;
  canvasHeight?: number;
  productId: string;
  variantId?: string;
  surface?: string;
  cardOrientation?: 'horizontal' | 'vertical';
  stickerShape?: string;
}

const IMPORTANT_ELEMENT_TYPES: Record<string, true> = {
  text: true,
  qr: true,
  barcode: true,
  logo: true,
};

export function isElementImportant(type: string): boolean {
  return Boolean(IMPORTANT_ELEMENT_TYPES[type]);
}

export function evaluateElementSafety({
  element,
  canvasWidth = 100,
  canvasHeight = 100,
  productId,
  surface,
  cardOrientation = 'horizontal',
}: EvaluateSafetyParams): SafetyReport {
  const important = isElementImportant(element.type);
  const height = element.height ?? 0;
  const right = element.x + element.width;
  const bottom = element.y + height;
  const targetSurface = surface ?? element.surface;
  const outsideBounds =
    element.x < 0 || element.y < 0 || right > canvasWidth || bottom > canvasHeight;

  if (important && outsideBounds) {
    return {
      risk: 'high-risk',
      regionType: 'outside-bounds',
      badgeLabel: 'Một phần chi tiết nằm ngoài mép',
      description: 'Một phần chi tiết này nằm ngoài vùng thành phẩm.',
      advice: 'Hãy kéo chi tiết này vào trong để tránh bị mất.',
    };
  }

  if (!important) {
    return { risk: 'safe' };
  }

  if (productId === 'notebook' && element.x < canvasWidth * 0.12) {
    return {
      risk: 'near-edge',
      regionType: 'notebook-binding',
      badgeLabel: 'Khá gần gáy',
      description: 'Chi tiết này đang khá gần gáy.',
      advice: 'Di chuyển chữ hoặc chi tiết quan trọng vào trong một chút.',
    };
  }

  if (productId === 'card' && targetSurface === 'inside') {
    const rawFold = cardOrientation === 'vertical' ? 105 : 148;
    const spreadWidth = cardOrientation === 'vertical' ? 210 : 296;
    const foldPosition =
      Math.abs(canvasWidth - spreadWidth) < 1e-6
        ? rawFold
        : (rawFold / spreadWidth) * canvasWidth;
    const foldMargin = canvasWidth * 0.03;
    const intersectsFold =
      element.x < foldPosition + foldMargin && right > foldPosition - foldMargin;

    if (intersectsFold) {
      return {
        risk: 'near-edge',
        regionType: 'card-fold',
        badgeLabel: 'Quá gần nếp gấp',
        description: 'Chi tiết quan trọng đang nằm quá gần nếp gấp.',
        advice: 'Kéo chi tiết lệch khỏi đường gấp để tránh bị gãy nét chữ.',
      };
    }
  }

  const safeLeft = canvasWidth * 0.04;
  const safeTop = canvasHeight * 0.04;
  const safeRight = canvasWidth * 0.96;
  const safeBottom = canvasHeight * 0.96;
  const crossesSafeBox =
    element.x < safeLeft ||
    element.y < safeTop ||
    right > safeRight ||
    bottom > safeBottom;

  if (crossesSafeBox) {
    return {
      risk: 'near-edge',
      regionType: 'outer-edge',
      badgeLabel: 'Hơi sát mép',
      description: 'Chi tiết này hơi sát mép.',
      advice: 'Di chuyển vào trong một chút để tránh bị sát hoặc mất khi thành phẩm được cắt.',
    };
  }

  return { risk: 'safe' };
}
