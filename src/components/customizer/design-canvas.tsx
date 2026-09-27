'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  type ProductId,
  type ImageState,
  type CanvasElement,
  type TextElementData,
  createTextElement,
  getTextData,
  getImageData,
} from '@/lib/product-state';
import { evaluateImageQuality, type ImageQualityReport } from '@/lib/image-quality';
import {
  TAP_THRESHOLD_PX,
  isDoubleTap,
  computeAspectResize,
  computeRotationAngle,
  type TransformHandle,
  type TapPoint,
} from '@/lib/canvas-interaction';
import { SelectionOverlay } from './selection-overlay';
import { colorValueToCss, colorValueToTextStyle } from '@/lib/color';
import type { ColorValue } from '@/lib/color/color-types';
import { getMaskStyle, HEART_MASK_PATH } from '@/lib/image-mask';
import { getCropTransformStyle } from '@/lib/image-crop';
export interface TransformState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

const DEFAULT_IMAGE_TRANSFORM: TransformState = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
const DEFAULT_TEXT_TRANSFORM: TransformState = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
const DEFAULT_TEXT_TRANSFORMS: Record<string, TransformState> = Object.freeze({});

export interface DesignCanvasProps {
  productId: ProductId;
  text?: string;
  color?: string;
  backgroundColor: string;
  image?: ImageState | null;
  productOptions: Record<string, unknown>;
  isMockup?: boolean;
  selectedTarget?: 'image' | 'text' | 'group' | null;
  selectedTextId?: string | null;
  textElements?: CanvasElement[];
  elements?: CanvasElement[];
  onSelectTarget?: (target: 'image' | 'text' | 'group' | null) => void;
  onSelectText?: (id: string | null) => void;
  onDoubleTap?: (target: 'image' | 'text') => void;
  onDoubleTapText?: (id: string) => void;
  onMeasureText?: (id: string, height: number) => void;
  isLocked?: boolean;
  onLockedFeedback?: () => void;
  onQualityExplanation?: (message: string) => void;
  imageTransform?: TransformState;
  textTransform?: TransformState;
  textTransforms?: Record<string, TransformState>;
  onCommitTransform?: (
    target: 'image' | 'text',
    transform: TransformState,
    elementId?: string
  ) => void;
}

export function DesignCanvas({
  productId,
  text = '',
  color = '#111827',
  backgroundColor,
  image = null,
  productOptions,
  isMockup = false,
  selectedTarget = null,
  selectedTextId = null,
  textElements,
  elements,
  onSelectTarget,
  onSelectText,
  onDoubleTap,
  onDoubleTapText,
  onMeasureText,
  isLocked = false,
  onLockedFeedback,
  onQualityExplanation,
  imageTransform = DEFAULT_IMAGE_TRANSFORM,
  textTransform = DEFAULT_TEXT_TRANSFORM,
  textTransforms = DEFAULT_TEXT_TRANSFORMS,
  onCommitTransform,
}: DesignCanvasProps) {
  const backgroundCss = productOptions.backgroundColorValue
    ? colorValueToCss(productOptions.backgroundColorValue as ColorValue)
    : backgroundColor;
  const styles: React.CSSProperties & Record<string, string | number | undefined> = {
    background: backgroundCss,
  };

  const classes: string[] = [
    isMockup ? `mockup mockup--${productId}` : `design-canvas design-canvas--${productId}`,
  ];

  if (productId === 'wrapping') {
    const scale = Number(productOptions.patternScale) || 100;
    const size = Math.round((68 * scale) / 100);
    (styles as Record<string, string | number>)['--pattern-size'] = `${size}px`;
    if (productOptions.mode === 'repeat') classes.push('is-mode-repeat');
  } else if (productId === 'card') {
    if (productOptions.surface === 'inside') classes.push('is-surface-inside');
    if (productOptions.fold === 'flat') classes.push('is-fold-flat');
  } else if (productId === 'sticker') {
    const border = productOptions.hasWhiteBorder
      ? Number.isFinite(Number(productOptions.borderWidth))
        ? Math.max(0, Number(productOptions.borderWidth))
        : 4
      : 0;
    (styles as Record<string, string | number>)['--sticker-border-width'] = `${border}px`;
  } else if (productId === 'notebook') {
    if (productOptions.finish === 'glossy') classes.push('is-finish-glossy');
    else classes.push('is-finish-matte');
  }

  // Active live gesture transform tracking (only non-null during active drag/resize/rotate)
  const [activeGestureTransform, setActiveGestureTransform] = useState<{
    target: 'image' | 'text';
    elementId?: string;
    transform: TransformState;
  } | null>(null);

  const effectiveImageTransform =
    activeGestureTransform?.target === 'image'
      ? activeGestureTransform.transform
      : imageTransform;

  const getEffectiveTextTransform = useCallback(
    (id: string): TransformState => {
      if (activeGestureTransform?.target === 'text' && activeGestureTransform.elementId === id) {
        return activeGestureTransform.transform;
      }
      return textTransforms[id] ?? textTransform;
    },
    [activeGestureTransform, textTransforms, textTransform]
  );

  // Gesture state tracking
  const activeGestureRef = useRef<{
    target: 'image' | 'text';
    elementId?: string;
    action: 'move' | 'resize' | 'rotate';
    handle?: TransformHandle;
    startX: number;
    startY: number;
    initialTransform: TransformState;
    latestTransform: TransformState;
    hasExceededThreshold: boolean;
    centerScreenX: number;
    centerScreenY: number;
  } | null>(null);

  const lastTapRef = useRef<Record<string, TapPoint | null>>({
    image: null,
    text: null,
  });

  const [isRotating, setIsRotating] = useState(false);

  // Global pointer move and up handlers during active gesture
  const handlePointerMove = useCallback((e: PointerEvent) => {
    const gesture = activeGestureRef.current;
    if (!gesture) return;

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;

    if (!gesture.hasExceededThreshold) {
      if (Math.hypot(dx, dy) > TAP_THRESHOLD_PX) {
        gesture.hasExceededThreshold = true;
      } else {
        return;
      }
    }

    const { target, elementId, action, handle, initialTransform } = gesture;

    if (action === 'move') {
      const nextTransform = {
        ...initialTransform,
        x: Math.round(initialTransform.x + dx),
        y: Math.round(initialTransform.y + dy),
      };
      gesture.latestTransform = nextTransform;
      setActiveGestureTransform({ target, elementId, transform: nextTransform });
    } else if (action === 'resize' && handle) {
      const initialBounds = {
        x: initialTransform.x,
        y: initialTransform.y,
        width: 100 * initialTransform.scale,
        height: 100 * initialTransform.scale,
      };
      const resized = computeAspectResize(initialBounds, handle, dx, dy, true, 20);
      const nextScale = Number((resized.width / 100).toFixed(2));
      const nextTransform = {
        ...initialTransform,
        scale: Math.max(0.2, Math.min(3.5, nextScale)),
      };
      gesture.latestTransform = nextTransform;
      setActiveGestureTransform({ target, elementId, transform: nextTransform });
    } else if (action === 'rotate') {
      const angle = computeRotationAngle(
        gesture.centerScreenX,
        gesture.centerScreenY,
        e.clientX,
        e.clientY
      );
      const nextTransform = {
        ...initialTransform,
        rotation: angle,
      };
      gesture.latestTransform = nextTransform;
      setIsRotating(true);
      setActiveGestureTransform({ target, elementId, transform: nextTransform });
    }
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const gesture = activeGestureRef.current;
    if (!gesture) return;

    const finalTransform = gesture.latestTransform || gesture.initialTransform;
    activeGestureRef.current = null;
    setIsRotating(false);
    setActiveGestureTransform(null);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);

    // If gesture exceeded threshold, commit single semantic history step
    if (gesture.hasExceededThreshold) {
      onCommitTransform?.(gesture.target, finalTransform, gesture.elementId);
    } else {
      // Tap detected
      const now = Date.now();
      const currTap: TapPoint = { x: e.clientX, y: e.clientY, time: now };
      const tapKey = gesture.elementId ?? gesture.target;
      const prevTap = lastTapRef.current[tapKey];

      if (prevTap && isDoubleTap(prevTap, currTap)) {
        lastTapRef.current[tapKey] = null;
        if (gesture.target === 'text' && gesture.elementId) {
          onDoubleTapText?.(gesture.elementId);
        }
        onDoubleTap?.(gesture.target);
      } else {
        lastTapRef.current[tapKey] = currTap;
        if (gesture.target === 'text' && gesture.elementId) {
          onSelectText?.(gesture.elementId);
        }
        onSelectTarget?.(gesture.target);
      }
    }
  }, [textTransform, onCommitTransform, onDoubleTap, onDoubleTapText, onSelectTarget, onSelectText, handlePointerMove]);

  const startGesture = (
    target: 'image' | 'text',
    elementId: string | undefined,
    action: 'move' | 'resize' | 'rotate',
    handle: TransformHandle | undefined,
    e: React.PointerEvent,
    itemLocked = false
  ) => {
    if (isMockup) return;

    if (action === 'move' && (isLocked || itemLocked)) {
      onLockedFeedback?.();
      if (target === 'text' && elementId) onSelectText?.(elementId);
      onSelectTarget?.(target);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const currentTransform =
      target === 'image'
        ? effectiveImageTransform
        : (elementId ? getEffectiveTextTransform(elementId) : textTransform);
    activeGestureRef.current = {
      target,
      elementId,
      action,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialTransform: currentTransform,
      latestTransform: currentTransform,
      hasExceededThreshold: false,
      centerScreenX: rect.left + rect.width / 2,
      centerScreenY: rect.top + rect.height / 2,
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const isImageSelected = !isMockup && selectedTarget === 'image';

  const imgElement = useMemo(() => {
    const list = elements && elements.length > 0 ? elements : (textElements ?? []);
    return list.find((e) => e.type === 'image');
  }, [elements, textElements]);

  const imgData = useMemo(() => {
    return imgElement ? getImageData(imgElement) : null;
  }, [imgElement]);

  const imageQuality = useMemo<ImageQualityReport | null>(() => {
    if (!image?.src) return null;
    const cropFraction = imgData?.crop
      ? imgData.crop.scale && imgData.crop.scale > 1
        ? 1 / (imgData.crop.scale * imgData.crop.scale)
        : (imgData.crop.width && imgData.crop.height)
          ? (imgData.crop.width * imgData.crop.height) /
          ((imgData.sourceWidth || image.width || 800) * (imgData.sourceHeight || image.height || 800))
          : 1
      : 1;

    return evaluateImageQuality({
      sourceWidth: imgData?.sourceWidth ?? image.width ?? 1200,
      sourceHeight: imgData?.sourceHeight ?? image.height ?? 1200,
      scale: effectiveImageTransform.scale,
      cropFraction: Math.max(0.05, Math.min(1, cropFraction)),
      productId,
    });
  }, [image?.src, image?.width, image?.height, imgData, effectiveImageTransform.scale, productId]);
  const imageOpacity = typeof productOptions.imageOpacity === 'number'
    ? productOptions.imageOpacity / 100
    : 1;
  // Resolve effective text elements
  const resolvedTextElements: CanvasElement[] = React.useMemo(() => {
    if (textElements && textElements.length > 0) {
      return textElements.filter((el) => {
        if (el.type !== 'text') return false;
        const data = getTextData(el);
        return Boolean(data?.text && data.text.trim().length > 0);
      });
    }
    if (text && text.trim().length > 0) {
      const previewEl = createTextElement({
        id: 'text-1',
        preset: 'body',
        text,
        color,
        fontFamily: typeof productOptions.fontFamily === 'string' ? productOptions.fontFamily : undefined,
      });
      return [previewEl];
    }
    return [];
  }, [textElements, text, color, productOptions.fontFamily]);
  return (
    <div
      id={isMockup ? 'mockup-canvas' : 'design-canvas'}
      className={classes.join(' ')}
      style={styles}
      onClick={(e) => {
        if (isMockup) return;
        if (e.target === e.currentTarget) {
          onSelectTarget?.(null);
          onSelectText?.(null);
        }
      }}
    >
      {/* Global SVG clipPath definitions for heart mask */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <clipPath id="mask-heart" clipPathUnits="objectBoundingBox">
            <path d={HEART_MASK_PATH} />
          </clipPath>
        </defs>
      </svg>

      {/* Uploaded Image element */}
      {image?.src && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Đối tượng ảnh"
          className="relative max-h-[70%] max-w-[70%] inline-flex items-center justify-center select-none touch-none"
          style={{
            transform: `translate3d(${effectiveImageTransform.x}px, ${effectiveImageTransform.y}px, 0) rotate(${effectiveImageTransform.rotation}deg) scale(${effectiveImageTransform.scale})`,
            transformOrigin: 'center center',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            startGesture('image', undefined, 'move', undefined, e);
          }}
        >
          {/* Fixed Frame with Mask */}
          <div
            className="w-full h-full relative overflow-hidden"
            style={{
              ...getMaskStyle(imgData?.mask),
              opacity: imageOpacity,
            }}
          >
            <img
              src={image.src}
              alt={image.name || 'Ảnh đã tải lên'}
              className="design-image w-full h-full object-cover pointer-events-none select-none origin-center will-change-transform"
              style={getCropTransformStyle(imgData?.crop)}
            />
          </div>

          {isImageSelected && (
            <SelectionOverlay
              isLocked={isLocked}
              isRotating={isRotating}
              rotationAngle={effectiveImageTransform.rotation}
              qualityReport={imageQuality}
              onQualityClick={() => {
                if (imageQuality) {
                  onQualityExplanation?.(`${imageQuality.description} ${imageQuality.advice}`);
                }
              }}
              onHandlePointerDown={(handle, e) => {
                if (handle === 'rotate') {
                  startGesture('image', undefined, 'rotate', 'rotate', e);
                } else {
                  startGesture('image', undefined, 'resize', handle, e);
                }
              }}
            />
          )}
        </div>
      )}

      {/* Render Text elements */}
      {resolvedTextElements.map((el) => {
        const data = getTextData(el);
        if (!data || !data.text || !data.text.trim()) return null;

        const isThisTextSelected =
          !isMockup &&
          (selectedTextId === el.id ||
            (selectedTarget === 'text' && (!selectedTextId || resolvedTextElements.length === 1)));
        const transform = getEffectiveTextTransform(el.id);

        const effectiveColorValue = (el.data as Record<string, unknown> | undefined)?.colorValue as ColorValue | undefined;
        const colorStyles: React.CSSProperties = effectiveColorValue
          ? colorValueToTextStyle(effectiveColorValue)
          : { color: data.color || color };

        const textStyle: React.CSSProperties = {
          fontFamily: data.fontFamily || (typeof productOptions.fontFamily === 'string' ? productOptions.fontFamily : undefined),
          fontSize: `${data.fontSize || 20}px`,
          fontWeight: data.fontWeight === 'bold' ? 700 : data.fontWeight === 'medium' ? 500 : 400,
          fontStyle: data.fontStyle || 'normal',
          textAlign: data.align || 'center',
          lineHeight: data.lineHeight || 1.4,
          letterSpacing: `${data.letterSpacing || 0}px`,
          ...colorStyles,
        };

        return (
          <TextElementItem
            key={el.id}
            element={el}
            data={data}
            textStyle={textStyle}
            transform={transform}
            isSelected={isThisTextSelected}
            isLocked={isLocked || Boolean(el.locked)}
            isRotating={isRotating}
            onPointerDown={(e: React.PointerEvent) => {
              e.stopPropagation();
              startGesture('text', el.id, 'move', undefined, e, Boolean(el.locked));
            }}
            onHandlePointerDown={(handle: TransformHandle, e: React.PointerEvent) => {
              if (handle === 'rotate') {
                startGesture('text', el.id, 'rotate', 'rotate', e, Boolean(el.locked));
              } else {
                startGesture('text', el.id, 'resize', handle, e, Boolean(el.locked));
              }
            }}
            onMeasureText={onMeasureText}
          />
        );
      })}

      {!image?.src && resolvedTextElements.length === 0 && (
        <p
          className="text-xs text-[#666A6D] font-medium select-none text-center px-4"
          onClick={(e) => {
            if (isMockup) return;
            e.stopPropagation();
            onSelectTarget?.(null);
            onSelectText?.(null);
          }}
        >
          Thêm ảnh, chữ hoặc sticker để bắt đầu
        </p>
      )}
    </div>
  );
}

interface TextElementItemProps {
  element: CanvasElement;
  data: TextElementData;
  textStyle: React.CSSProperties;
  transform: TransformState;
  isSelected: boolean;
  isLocked: boolean;
  isRotating: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onHandlePointerDown: (handle: TransformHandle, e: React.PointerEvent) => void;
  onMeasureText?: (id: string, height: number) => void;
}

function TextElementItem({
  element,
  data,
  textStyle,
  transform,
  isSelected,
  isLocked,
  isRotating,
  onPointerDown,
  onHandlePointerDown,
  onMeasureText,
}: TextElementItemProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number | null>(null);

  useEffect(() => {
    if (!nodeRef.current || !onMeasureText) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const measured = Math.round(entry.contentRect.height);
        if (measured > 0 && measured !== lastHeightRef.current) {
          lastHeightRef.current = measured;
          onMeasureText(element.id, measured);
        }
      }
    });
    observer.observe(nodeRef.current);
    return () => observer.disconnect();
  }, [element.id, onMeasureText]);

  return (
    <div
      ref={nodeRef}
      role="button"
      tabIndex={0}
      data-element-id={element.id}
      aria-label={`Đối tượng chữ: ${data.text}`}
      className="relative select-none touch-none inline-block max-w-[85%]"
      style={{
        width: `${element.width || 70}%`,
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(${transform.rotation}deg) scale(${transform.scale})`,
        transformOrigin: 'center center',
      }}
      onPointerDown={onPointerDown}
    >
      <p
        className="design-text px-3 break-words pointer-events-none whitespace-pre-wrap"
        style={textStyle}
      >
        {data.text}
      </p>

      {isSelected && (
        <SelectionOverlay
          isLocked={isLocked}
          isRotating={isRotating}
          rotationAngle={transform.rotation}
          onHandlePointerDown={onHandlePointerDown}
        />
      )}
    </div>
  );
}
