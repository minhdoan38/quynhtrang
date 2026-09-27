import type {
  ImageCropData,
  DesignState,
  CanvasElement,
  ImageObjectData,
} from './product-state';

export interface CalculateCoverCropParams {
  frameWidth: number;
  frameHeight: number;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Calculates uniform cover scale and centered crop rect for an image inside a frame.
 * Does not distort or stretch image.
 */
export function calculateCoverCrop({
  frameWidth,
  frameHeight,
  imageWidth,
  imageHeight,
}: CalculateCoverCropParams): ImageCropData {
  const safeFrameW = Math.max(1, frameWidth);
  const safeFrameH = Math.max(1, frameHeight);
  const safeImgW = Math.max(1, imageWidth);
  const safeImgH = Math.max(1, imageHeight);

  const frameAspect = safeFrameW / safeFrameH;
  const imageAspect = safeImgW / safeImgH;

  let cropW: number;
  let cropH: number;

  if (imageAspect > frameAspect) {
    // Image is wider than frame -> height matches, crop left/right
    cropH = safeImgH;
    cropW = Math.round(safeImgH * frameAspect);
  } else {
    // Image is taller than frame -> width matches, crop top/bottom
    cropW = safeImgW;
    cropH = Math.round(safeImgW / frameAspect);
  }

  const cropX = Math.max(0, Math.round((safeImgW - cropW) / 2));
  const cropY = Math.max(0, Math.round((safeImgH - cropH) / 2));

  return {
    x: cropX,
    y: cropY,
    width: cropW,
    height: cropH,
  };
}

export interface ReplaceImageNewAsset {
  id?: string;
  src: string;
  originalSrc?: string;
  name?: string;
  width?: number;
  height?: number;
  size?: number;
}

/**
 * Replaces image content while strictly preserving frame geometry, layout,
 * mask, rotation, opacity, and layer order. Resets asset-specific processing.
 */
export function replaceImageInState(
  state: DesignState,
  targetId: string,
  newAsset: ReplaceImageNewAsset
): DesignState {
  const elements = state.elements ?? [];
  const target = elements.find((el) => el.id === targetId && el.type === 'image');
  if (!target) return state;

  const existingData = ((target.data ?? {}) as unknown) as Partial<ImageObjectData>;
  const frameWidth = target.width || 60;
  const frameHeight = target.height || 60;
  const imgWidth = newAsset.width || 800;
  const imgHeight = newAsset.height || 800;

  const defaultCrop = calculateCoverCrop({
    frameWidth,
    frameHeight,
    imageWidth: imgWidth,
    imageHeight: imgHeight,
  });

  const updatedData: ImageObjectData = {
    ...existingData,
    src: newAsset.src,
    originalSrc: newAsset.originalSrc ?? newAsset.src,
    removedBackgroundSrc: undefined, // Strictly reset background removal on new asset
    name: newAsset.name ?? existingData.name ?? 'Ảnh đã thay thế',
    assetId: newAsset.id ?? existingData.assetId,
    sourceWidth: newAsset.width,
    sourceHeight: newAsset.height,
    crop: defaultCrop,
    placeholder: false,
  };

  const nextElements = elements.map((el) =>
    el.id === targetId ? { ...el, data: updatedData as unknown as Record<string, unknown> } : el
  );

  return {
    ...state,
    image: {
      name: newAsset.name ?? state.image?.name ?? 'Ảnh đã thay thế',
      src: newAsset.src,
      width: newAsset.width ?? state.image?.width,
      height: newAsset.height ?? state.image?.height,
      size: newAsset.size ?? state.image?.size,
    },
    elements: nextElements,
  };
}
