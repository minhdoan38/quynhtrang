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
import { computeCombinedBounds } from '@/lib/multi-selection';
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
  selectedElementId?: string | null;
  selectedTextId?: string | null;
  selectionMode?: 'default' | 'multi-select' | 'group-edit';
  selectedElementIds?: string[];
  activeGroupId?: string | null;
  textElements?: CanvasElement[];
  elements?: CanvasElement[];
  onSelectTarget?: (target: 'image' | 'text' | 'group' | null) => void;
  onSelectElement?: (id: string | null) => void;
  onSelectText?: (id: string | null) => void;
  onToggleSelectElement?: (id: string) => void;
  onDoubleTap?: (target: 'image' | 'text') => void;
  onDoubleTapText?: (id: string) => void;
  onDoubleTapGroup?: (groupId: string) => void;
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
  onCommitMultiTransform?: (
    action: 'move' | 'resize' | 'rotate',
    dx: number,
    dy: number,
    scaleRatio: number,
    deltaDegrees: number
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
  selectedElementId = null,
  selectedTextId = null,
  selectionMode = 'default',
  selectedElementIds = [],
  activeGroupId = null,
  textElements,
  elements,
  onSelectTarget,
  onSelectElement,
  onSelectText,
  onToggleSelectElement,
  onDoubleTap,
  onDoubleTapText,
  onDoubleTapGroup,
  onMeasureText,
  isLocked = false,
  onLockedFeedback,
  onQualityExplanation,
  imageTransform = DEFAULT_IMAGE_TRANSFORM,
  textTransform = DEFAULT_TEXT_TRANSFORM,
  textTransforms = DEFAULT_TEXT_TRANSFORMS,
  onCommitTransform,
  onCommitMultiTransform,
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
  const selectedElements = useMemo(() => {
    if (selectionMode !== 'multi-select' || selectedElementIds.length === 0) return [];
    const list = elements && elements.length > 0 ? elements : (textElements ?? []);
    return list.filter((el) => selectedElementIds.includes(el.id));
  }, [selectionMode, selectedElementIds, elements, textElements]);

  const combinedBounds = useMemo(() => {
    return computeCombinedBounds(selectedElements);
  }, [selectedElements]);

  const [liveMultiGesture, setLiveMultiGesture] = useState<{
    dx: number;
    dy: number;
    scale: number;
    rotation: number;
  }>({ dx: 0, dy: 0, scale: 1, rotation: 0 });

  const activeMultiGestureRef = useRef<{
    action: 'move' | 'resize' | 'rotate';
    handle?: TransformHandle;
    startX: number;
    startY: number;
    hasExceededThreshold: boolean;
    centerScreenX: number;
    centerScreenY: number;
  } | null>(null);

  const handleMultiPointerMove = useCallback((e: PointerEvent) => {
    const gesture = activeMultiGestureRef.current;
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

    if (gesture.action === 'move') {
      setLiveMultiGesture({ dx, dy, scale: 1, rotation: 0 });
    } else if (gesture.action === 'resize') {
      const diag = Math.hypot(dx, dy);
      const sign = (dx + dy) >= 0 ? 1 : -1;
      const scale = Math.max(0.2, Math.min(3.5, 1 + (sign * diag) / 150));
      setLiveMultiGesture({ dx: 0, dy: 0, scale, rotation: 0 });
    } else if (gesture.action === 'rotate') {
      const angle = computeRotationAngle(
        gesture.centerScreenX,
        gesture.centerScreenY,
        e.clientX,
        e.clientY
      );
      setLiveMultiGesture({ dx: 0, dy: 0, scale: 1, rotation: angle });
    }
  }, []);

  const handleMultiPointerUp = useCallback((e: PointerEvent) => {
    const gesture = activeMultiGestureRef.current;
    if (!gesture) return;

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    const hasMoved = gesture.hasExceededThreshold;

    activeMultiGestureRef.current = null;
    window.removeEventListener('pointermove', handleMultiPointerMove);
    window.removeEventListener('pointerup', handleMultiPointerUp);

    if (hasMoved) {
      if (gesture.action === 'move') {
        onCommitMultiTransform?.('move', Math.round(dx / 5), Math.round(dy / 5), 1, 0);
      } else if (gesture.action === 'resize') {
        const diag = Math.hypot(dx, dy);
        const sign = (dx + dy) >= 0 ? 1 : -1;
        const scale = Math.max(0.2, Math.min(3.5, 1 + (sign * diag) / 150));
        onCommitMultiTransform?.('resize', 0, 0, scale, 0);
      } else if (gesture.action === 'rotate') {
        const angle = computeRotationAngle(
          gesture.centerScreenX,
          gesture.centerScreenY,
          e.clientX,
          e.clientY
        );
        onCommitMultiTransform?.('rotate', 0, 0, 1, angle);
      }
    } else {
      const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);
      const targetDom = elementsUnder.find((el) => el.getAttribute('data-element-id'));
      const targetId = targetDom?.getAttribute('data-element-id');
      if (targetId) {
        onToggleSelectElement?.(targetId);
      }
    }

    setLiveMultiGesture({ dx: 0, dy: 0, scale: 1, rotation: 0 });
  }, [handleMultiPointerMove, onCommitMultiTransform, onToggleSelectElement]);

  const startMultiGesture = (
    action: 'move' | 'resize' | 'rotate',
    handle: TransformHandle | undefined,
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    activeMultiGestureRef.current = {
      action,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      hasExceededThreshold: false,
      centerScreenX: rect.left + rect.width / 2,
      centerScreenY: rect.top + rect.height / 2,
    };
    window.addEventListener('pointermove', handleMultiPointerMove);
    window.addEventListener('pointerup', handleMultiPointerUp);
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
          data-element-id={imgElement?.id || 'image-1'}
          aria-label="Đối tượng ảnh"
          className={`relative max-h-[70%] max-w-[70%] inline-flex items-center justify-center select-none touch-none ${
            selectionMode === 'multi-select' && selectedElementIds.includes(imgElement?.id || 'image-1')
              ? 'ring-2 ring-[#315F86]/80 ring-offset-2 rounded-xs'
              : ''
          } ${
            selectionMode === 'group-edit' && activeGroupId && imgElement?.parentGroupId !== activeGroupId
              ? 'opacity-40 pointer-events-none'
              : ''
          }`}
          style={{
            transform: `translate3d(${effectiveImageTransform.x}px, ${effectiveImageTransform.y}px, 0) rotate(${effectiveImageTransform.rotation}deg) scale(${effectiveImageTransform.scale})`,
            transformOrigin: 'center center',
          }}
          onClick={(e) => {
            if (selectionMode === 'multi-select') {
              e.stopPropagation();
              onToggleSelectElement?.(imgElement?.id || 'image-1');
            }
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (selectionMode !== 'multi-select') {
              startGesture('image', undefined, 'move', undefined, e);
            }
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
            isMultiSelected={selectionMode === 'multi-select' && selectedElementIds.includes(el.id)}
            isDimmed={selectionMode === 'group-edit' && Boolean(activeGroupId) && el.parentGroupId !== activeGroupId}
            onClick={(e: React.MouseEvent) => {
              if (selectionMode === 'multi-select') {
                e.stopPropagation();
                if (el.locked) onLockedFeedback?.();
                else onToggleSelectElement?.(el.id);
              }
            }}
          />
        );
      })}
      {/* Group Elements */}
      {elements?.filter((el) => el.type === 'group').map((grp) => {
        const isSelected = !isMockup && selectedElementId === grp.id;
        const isMultiSelected = selectionMode === 'multi-select' && selectedElementIds.includes(grp.id);
        return (
          <div
            key={grp.id}
            data-element-id={grp.id}
            role="button"
            tabIndex={0}
            aria-label={`Nhóm: ${grp.name || 'Nhóm'}`}
            className={`absolute select-none touch-none ${
              isMultiSelected ? 'ring-2 ring-[#315F86]/80 ring-offset-2 rounded-xs' : ''
            }`}
            style={{
              left: `${grp.x - (grp.width || 20) / 2}%`,
              top: `${grp.y - (grp.height || 20) / 2}%`,
              width: `${grp.width || 20}%`,
              height: `${grp.height || 20}%`,
              transform: `rotate(${grp.rotation || 0}deg)`,
              transformOrigin: 'center center',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (selectionMode === 'multi-select') {
                if (grp.locked) onLockedFeedback?.();
                else onToggleSelectElement?.(grp.id);
              } else {
                onSelectTarget?.('group');
                onSelectElement?.(grp.id);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (selectionMode !== 'multi-select') {
                onDoubleTapGroup?.(grp.id);
              }
            }}
          >
            {isSelected && selectionMode !== 'multi-select' && (
              <SelectionOverlay
                mode="group"
                isLocked={Boolean(grp.locked)}
                onHandlePointerDown={() => {}}
              />
            )}
          </div>
        );
      })}

      {/* Combined Multi-selection Bounding Box */}
      {selectionMode === 'multi-select' && combinedBounds && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{
            top: `${combinedBounds.minY}%`,
            width: `${combinedBounds.width}%`,
            height: `${combinedBounds.height}%`,
            transform: `translate3d(${liveMultiGesture.dx}px, ${liveMultiGesture.dy}px, 0) scale(${liveMultiGesture.scale}) rotate(${liveMultiGesture.rotation}deg)`,
            transformOrigin: 'center center',
          }}
        >
          <SelectionOverlay
            mode="multi"
            selectionCount={selectedElementIds.length}
            isRotating={activeMultiGestureRef.current?.action === 'rotate'}
            rotationAngle={liveMultiGesture.rotation}
            onBoxPointerDown={(e) => startMultiGesture('move', undefined, e)}
            onHandlePointerDown={(handle, e) => {
              if (handle === 'rotate') {
                startMultiGesture('rotate', handle, e);
              } else {
                startMultiGesture('resize', handle, e);
              }
            }}
          />
        </div>
      )}

      {/* Group Edit floating mode banner */}
      {selectionMode === 'group-edit' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-[#2E3338]/90 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-md flex items-center gap-2 pointer-events-auto">
          <span>Đang chỉnh nhóm</span>
        </div>
      )}

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
  isMultiSelected?: boolean;
  isDimmed?: boolean;
  onClick?: (e: React.MouseEvent) => void;
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
  isMultiSelected = false,
  isDimmed = false,
  onClick,
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
      className={`relative select-none touch-none inline-block max-w-[85%] ${
        isMultiSelected ? 'ring-2 ring-[#315F86]/80 ring-offset-2 rounded-xs' : ''
      } ${isDimmed ? 'opacity-40 pointer-events-none' : ''}`}
      style={{
        width: `${element.width || 70}%`,
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(${transform.rotation}deg) scale(${transform.scale})`,
        transformOrigin: 'center center',
      }}
      onClick={onClick}
      onPointerDown={(e) => {
        if (!isMultiSelected) onPointerDown(e);
      }}
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
