'use client';

import React, { useState, useRef, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  type ImageCropData,
  createDefaultCrop,
  applyCropPan,
  applyCropPinch,
  getCropTransformStyle,
} from '@/lib/image-crop';
import { getMaskStyle, HEART_MASK_PATH } from '@/lib/image-mask';

interface CropFocusModeProps {
  src: string;
  frameWidth?: number;
  frameHeight?: number;
  initialCrop?: ImageCropData | null;
  mask?: string | null;
  onDone: (crop: ImageCropData) => void;
  onCancel: () => void;
}

export function CropFocusMode({
  src,
  frameWidth = 260,
  frameHeight = 260,
  initialCrop = null,
  mask = null,
  onDone,
  onCancel,
}: CropFocusModeProps) {
  const [crop, setCrop] = useState<ImageCropData>(() => initialCrop ?? createDefaultCrop());
  const [showHint, setShowHint] = useState(true);

  // Maintain natural frame aspect ratio within viewport limits
  const aspect = Math.max(0.1, frameWidth / Math.max(1, frameHeight));
  const baseBoxSize = 260;
  let displayW = baseBoxSize;
  let displayH = baseBoxSize;
  if (aspect > 1) {
    displayW = Math.min(300, baseBoxSize * aspect);
    displayH = displayW / aspect;
  } else {
    displayH = Math.min(300, baseBoxSize / aspect);
    displayW = displayH * aspect;
  }

  // Active touch/pointer gesture refs
  const gestureRef = useRef<{
    type: 'pan' | 'pinch';
    startX: number;
    startY: number;
    initialCrop: ImageCropData;
    initialDistance: number;
    initialScale: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only capture primary mouse/single-touch down if not multi-touch
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    setShowHint(false);

    gestureRef.current = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: crop,
      initialDistance: 0,
      initialScale: crop.scale || 1,
    };

    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [crop]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.type !== 'pan') return;

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;

    setCrop(() =>
      applyCropPan(gesture.initialCrop, dx, dy, displayW, displayH, displayW, displayH)
    );
  }, [displayW, displayH]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    gestureRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // Multi-touch pinch handling for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    setShowHint(false);
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      gestureRef.current = {
        type: 'pinch',
        startX: (t1.clientX + t2.clientX) / 2,
        startY: (t1.clientY + t2.clientY) / 2,
        initialCrop: crop,
        initialDistance: Math.max(1, dist),
        initialScale: crop.scale || 1,
      };
    }
  }, [crop]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (e.touches.length === 2 && gesture.type === 'pinch') {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / gesture.initialDistance;

      setCrop(() =>
        applyCropPinch(gesture.initialCrop, ratio, displayW, displayH, displayW, displayH)
      );
    }
  }, [displayW, displayH]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2 && gestureRef.current?.type === 'pinch') {
      gestureRef.current = null;
    }
  }, []);

  const handleReset = useCallback(() => {
    setCrop(createDefaultCrop());
  }, []);

  const maskStyle = getMaskStyle(mask);
  const cropStyle = getCropTransformStyle(crop);

  return (
    <div id="crop-focus-container" className="fixed inset-0 z-50 bg-[#2E3338] text-white flex flex-col select-none touch-none">
      {/* Global SVG clipPath definitions for heart mask */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <clipPath id="mask-heart" clipPathUnits="objectBoundingBox">
            <path d={HEART_MASK_PATH} />
          </clipPath>
        </defs>
      </svg>

      {/* Header with Cancel, Title, Done */}
      <header className="h-[52px] px-3 border-b border-white/10 flex items-center justify-between z-10 shrink-0 bg-[#2E3338]/90 backdrop-blur-sm">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-white/80 hover:text-white px-3 py-1.5 rounded-lg active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          Hủy
        </button>
        <span className="text-xs sm:text-sm font-semibold text-white">
          Cắt & Căn chỉnh ảnh
        </span>
        <button
          type="button"
          onClick={() => onDone(crop)}
          className="text-xs font-semibold text-white bg-[#315F86] hover:bg-[#244A69] px-3.5 py-1.5 rounded-lg active:scale-95 transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
          Xong
        </button>
      </header>

      {/* Main Focus Workspace */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden"
      >
        {/* Subtle dim backdrop around frame */}
        <div className="relative flex items-center justify-center">
          {/* Subtle Outer Frame guideline */}
          <div
            className="absolute rounded-xl border border-dashed border-white/40 pointer-events-none shadow-2xl"
            style={{
              width: displayW + 16,
              height: displayH + 16,
            }}
          />

          {/* Fixed Frame Box */}
          <div
            style={{
              width: displayW,
              height: displayH,
              ...maskStyle,
            }}
            className="relative overflow-hidden bg-black/40 ring-2 ring-white/60 shadow-2xl cursor-grab active:cursor-grabbing"
          >
            {/* The Image Content Moving Inside Fixed Frame */}
            <img
              src={src}
              alt="Ảnh đang căn chỉnh cắt"
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none origin-center will-change-transform"
              style={cropStyle}
            />
          </div>
        </div>

        {/* Minimal Contextual Hint & Reset Control */}
        <div className="mt-8 flex flex-col items-center gap-3">
          {showHint ? (
            <p className="text-xs text-white/80 bg-white/10 px-3.5 py-1.5 rounded-full backdrop-blur-xs text-center animate-fade-in">
              Kéo để di chuyển ảnh. Chụm hai ngón để phóng to.
            </p>
          ) : (
            <p className="text-xs text-white/50 text-center">
              Khung cố định. Ảnh di chuyển bên trong.
            </p>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 text-white/90 hover:bg-white/20 active:scale-95 transition-all text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt lại</span>
          </button>
        </div>
      </div>
    </div>
  );
}
