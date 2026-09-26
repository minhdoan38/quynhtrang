'use client';

import React from 'react';
import { RotateCw, Lock } from 'lucide-react';
import type { TransformHandle } from '@/lib/canvas-interaction';

interface SelectionOverlayProps {
  isLocked?: boolean;
  isRotating?: boolean;
  rotationAngle?: number;
  onHandlePointerDown: (handle: TransformHandle, e: React.PointerEvent) => void;
}

export function SelectionOverlay({
  isLocked = false,
  isRotating = false,
  rotationAngle = 0,
  onHandlePointerDown,
}: SelectionOverlayProps) {
  if (isLocked) {
    return (
      <div className="absolute inset-0 pointer-events-none border border-dashed border-[#666A6D]/60 rounded-sm">
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#2E3338]/90 text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm whitespace-nowrap">
          <Lock className="w-3 h-3 text-[#F2DFA0]" />
          <span>Đã khóa trong mẫu</span>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none border-2 border-[#315F86] rounded-sm">
      {/* Rotation Stem and Handle */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-[1.5px] h-6 bg-[#315F86]" />
      <div
        role="button"
        tabIndex={0}
        aria-label="Xoay đối tượng"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandlePointerDown('rotate', e);
        }}
        className="absolute -top-11 left-1/2 -translate-x-1/2 w-11 h-11 pointer-events-auto cursor-grab active:cursor-grabbing flex items-center justify-center touch-none select-none z-20"
      >
        <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-[#315F86] shadow-sm flex items-center justify-center">
          <RotateCw className="w-2 h-2 text-[#315F86]" />
        </div>
      </div>

      {/* Floating angle feedback during active rotation */}
      {isRotating && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-[#2E3338] text-white text-[11px] font-semibold px-2 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-30">
          {Math.round(rotationAngle)}°
        </div>
      )}

      {/* 4 Corner Resize Handles with generous 44x44px touch areas */}
      {/* Top-Left */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Thay đổi kích thước góc trên trái"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandlePointerDown('nw', e);
        }}
        className="absolute -top-[22px] -left-[22px] w-11 h-11 pointer-events-auto cursor-nwse-resize flex items-center justify-center touch-none select-none z-20"
      >
        <div className="w-3 h-3 rounded-full bg-white border-2 border-[#315F86] shadow-sm" />
      </div>

      {/* Top-Right */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Thay đổi kích thước góc trên phải"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandlePointerDown('ne', e);
        }}
        className="absolute -top-[22px] -right-[22px] w-11 h-11 pointer-events-auto cursor-nesw-resize flex items-center justify-center touch-none select-none z-20"
      >
        <div className="w-3 h-3 rounded-full bg-white border-2 border-[#315F86] shadow-sm" />
      </div>

      {/* Bottom-Right */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Thay đổi kích thước góc dưới phải"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandlePointerDown('se', e);
        }}
        className="absolute -bottom-[22px] -right-[22px] w-11 h-11 pointer-events-auto cursor-nwse-resize flex items-center justify-center touch-none select-none z-20"
      >
        <div className="w-3 h-3 rounded-full bg-white border-2 border-[#315F86] shadow-sm" />
      </div>

      {/* Bottom-Left */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Thay đổi kích thước góc dưới trái"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandlePointerDown('sw', e);
        }}
        className="absolute -bottom-[22px] -left-[22px] w-11 h-11 pointer-events-auto cursor-nesw-resize flex items-center justify-center touch-none select-none z-20"
      >
        <div className="w-3 h-3 rounded-full bg-white border-2 border-[#315F86] shadow-sm" />
      </div>
    </div>
  );
}
