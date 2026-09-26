'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ProductId, ImageState } from '@/lib/product-state';
import {
  TAP_THRESHOLD_PX,
  isDoubleTap,
  computeAspectResize,
  computeRotationAngle,
  type TransformHandle,
  type TapPoint,
} from '@/lib/canvas-interaction';
import { SelectionOverlay } from './selection-overlay';

export interface TransformState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface DesignCanvasProps {
  productId: ProductId;
  text: string;
  color: string;
  backgroundColor: string;
  image: ImageState | null;
  productOptions: Record<string, unknown>;
  isMockup?: boolean;
  selectedTarget?: 'image' | 'text' | null;
  onSelectTarget?: (target: 'image' | 'text' | null) => void;
  onDoubleTap?: (target: 'image' | 'text') => void;
  isLocked?: boolean;
  onLockedFeedback?: () => void;
  imageTransform?: TransformState;
  textTransform?: TransformState;
  onCommitTransform?: (target: 'image' | 'text', transform: TransformState) => void;
}

export function DesignCanvas({
  productId,
  text,
  color,
  backgroundColor,
  image,
  productOptions,
  isMockup = false,
  selectedTarget = null,
  onSelectTarget,
  onDoubleTap,
  isLocked = false,
  onLockedFeedback,
  imageTransform = { x: 0, y: 0, scale: 1, rotation: 0 },
  textTransform = { x: 0, y: 0, scale: 1, rotation: 0 },
  onCommitTransform,
}: DesignCanvasProps) {
  const styles: React.CSSProperties & Record<string, string | number | undefined> = {
    backgroundColor,
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

  // Active live transform tracking (transient during drag/resize/rotate)
  const [liveImageTransform, setLiveImageTransform] = useState<TransformState>(imageTransform);
  const [liveTextTransform, setLiveTextTransform] = useState<TransformState>(textTransform);

  useEffect(() => {
    setLiveImageTransform(imageTransform);
  }, [imageTransform]);

  useEffect(() => {
    setLiveTextTransform(textTransform);
  }, [textTransform]);

  // Gesture state tracking
  const activeGestureRef = useRef<{
    target: 'image' | 'text';
    action: 'move' | 'resize' | 'rotate';
    handle?: TransformHandle;
    startX: number;
    startY: number;
    initialTransform: TransformState;
    hasExceededThreshold: boolean;
    centerScreenX: number;
    centerScreenY: number;
  } | null>(null);

  const lastTapRef = useRef<Record<'image' | 'text', TapPoint | null>>({
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

    const { target, action, handle, initialTransform } = gesture;

    if (action === 'move') {
      const nextTransform = {
        ...initialTransform,
        x: Math.round(initialTransform.x + dx),
        y: Math.round(initialTransform.y + dy),
      };
      if (target === 'image') setLiveImageTransform(nextTransform);
      else setLiveTextTransform(nextTransform);
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
      if (target === 'image') setLiveImageTransform(nextTransform);
      else setLiveTextTransform(nextTransform);
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
      setIsRotating(true);
      if (target === 'image') setLiveImageTransform(nextTransform);
      else setLiveTextTransform(nextTransform);
    }
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const gesture = activeGestureRef.current;
    if (!gesture) return;

    activeGestureRef.current = null;
    setIsRotating(false);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);

    // If gesture exceeded threshold, commit single semantic history step
    if (gesture.hasExceededThreshold) {
      const finalTransform =
        gesture.target === 'image' ? liveImageTransform : liveTextTransform;
      onCommitTransform?.(gesture.target, finalTransform);
    } else {
      // Tap detected
      const now = Date.now();
      const currTap: TapPoint = { x: e.clientX, y: e.clientY, time: now };
      const prevTap = lastTapRef.current[gesture.target];

      if (prevTap && isDoubleTap(prevTap, currTap)) {
        lastTapRef.current[gesture.target] = null;
        onDoubleTap?.(gesture.target);
      } else {
        lastTapRef.current[gesture.target] = currTap;
        onSelectTarget?.(gesture.target);
      }
    }
  }, [liveImageTransform, liveTextTransform, onCommitTransform, onDoubleTap, onSelectTarget, handlePointerMove]);

  const startGesture = (
    target: 'image' | 'text',
    action: 'move' | 'resize' | 'rotate',
    handle: TransformHandle | undefined,
    e: React.PointerEvent
  ) => {
    if (isMockup) return;

    if (action === 'move' && isLocked) {
      onLockedFeedback?.();
      onSelectTarget?.(target);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const currentTransform = target === 'image' ? liveImageTransform : liveTextTransform;

    activeGestureRef.current = {
      target,
      action,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialTransform: currentTransform,
      hasExceededThreshold: false,
      centerScreenX: rect.left + rect.width / 2,
      centerScreenY: rect.top + rect.height / 2,
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const isImageSelected = !isMockup && selectedTarget === 'image';
  const isTextSelected = !isMockup && selectedTarget === 'text';

  const imageOpacity = typeof productOptions.imageOpacity === 'number'
    ? productOptions.imageOpacity / 100
    : 1;

  const fontStyle = typeof productOptions.fontFamily === 'string'
    ? { fontFamily: productOptions.fontFamily }
    : undefined;

  return (
    <div
      id={isMockup ? 'mockup-canvas' : 'design-canvas'}
      className={classes.join(' ')}
      style={styles}
      onClick={(e) => {
        if (isMockup) return;
        if (e.target === e.currentTarget) {
          onSelectTarget?.(null);
        }
      }}
    >
      {/* Uploaded Image element */}
      {image?.src && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Đối tượng ảnh"
          className="relative max-h-[70%] max-w-[70%] inline-flex items-center justify-center select-none touch-none"
          style={{
            transform: `translate3d(${liveImageTransform.x}px, ${liveImageTransform.y}px, 0) rotate(${liveImageTransform.rotation}deg) scale(${liveImageTransform.scale})`,
            transformOrigin: 'center center',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            startGesture('image', 'move', undefined, e);
          }}
        >
          <img
            src={image.src}
            alt={image.name || 'Ảnh đã tải lên'}
            className="design-image max-h-full max-w-full object-contain pointer-events-none select-none"
            style={{ opacity: imageOpacity }}
          />

          {isImageSelected && (
            <SelectionOverlay
              isLocked={isLocked}
              isRotating={isRotating}
              rotationAngle={liveImageTransform.rotation}
              onHandlePointerDown={(handle, e) => {
                if (handle === 'rotate') {
                  startGesture('image', 'rotate', 'rotate', e);
                } else {
                  startGesture('image', 'resize', handle, e);
                }
              }}
            />
          )}
        </div>
      )}

      {/* Text element */}
      {text ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Đối tượng chữ"
          className="relative inline-block max-w-[90%] select-none touch-none"
          style={{
            transform: `translate3d(${liveTextTransform.x}px, ${liveTextTransform.y}px, 0) rotate(${liveTextTransform.rotation}deg) scale(${liveTextTransform.scale})`,
            transformOrigin: 'center center',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            startGesture('text', 'move', undefined, e);
          }}
        >
          <p
            className="design-text px-4 text-center font-bold tracking-tight text-lg md:text-xl break-words pointer-events-none"
            style={{ color, ...fontStyle }}
          >
            {text}
          </p>

          {isTextSelected && (
            <SelectionOverlay
              isLocked={isLocked}
              isRotating={isRotating}
              rotationAngle={liveTextTransform.rotation}
              onHandlePointerDown={(handle, e) => {
                if (handle === 'rotate') {
                  startGesture('text', 'rotate', 'rotate', e);
                } else {
                  startGesture('text', 'resize', handle, e);
                }
              }}
            />
          )}
        </div>
      ) : (
        !image?.src && (
          <p
            className="text-xs text-[#666A6D] font-medium select-none text-center px-4"
            onClick={(e) => {
              if (isMockup) return;
              e.stopPropagation();
              onSelectTarget?.(null);
            }}
          >
            Thêm ảnh, chữ hoặc sticker để bắt đầu
          </p>
        )
      )}
    </div>
  );
}
