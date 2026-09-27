'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Eraser,
  RotateCcw,
  Eye,
  Brush,
} from 'lucide-react';
import {
  type BrushStroke,
  type StrokePoint,
} from '@/lib/background-removal/types';
import {
  createRefineSessionState,
  addBrushStroke,
  undoLastStroke,
  createNewStroke,
  appendPointToStroke,
  drawStrokeOnContext,
} from '@/lib/background-removal/mask-editor';

interface BackgroundRefineOverlayProps {
  originalSrc: string;
  currentSrc: string;
  onDone: (refinedSrc: string, maskData?: string) => void;
  onCancel: () => void;
}

export function BackgroundRefineOverlay({
  originalSrc,
  currentSrc,
  onDone,
  onCancel,
}: BackgroundRefineOverlayProps) {
  const [session, setSession] = useState(() => createRefineSessionState(24));
  const [showOriginal, setShowOriginal] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const currentImgRef = useRef<HTMLImageElement | null>(null);

  const activeStrokeRef = useRef<BrushStroke | null>(null);

  // Preload images
  useEffect(() => {
    const orig = new Image();
    orig.crossOrigin = 'anonymous';
    orig.src = originalSrc;
    originalImgRef.current = orig;

    const curr = new Image();
    curr.crossOrigin = 'anonymous';
    curr.onload = () => {
      setImageSize({ width: curr.naturalWidth || 600, height: curr.naturalHeight || 600 });
    };
    curr.src = currentSrc;
    currentImgRef.current = curr;
  }, [originalSrc, currentSrc]);

  // Redraw canvas whenever strokes change
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSize) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentImgRef.current && currentImgRef.current.complete) {
      ctx.drawImage(currentImgRef.current, 0, 0, canvas.width, canvas.height);
    }

    // Apply recorded brush strokes
    session.strokes.forEach((stroke) => {
      drawStrokeOnContext(ctx, stroke);
    });
  }, [imageSize, session.strokes]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const pt = getCanvasCoordinates(e);
    if (!pt) return;

    const newStroke = createNewStroke(session.currentMode, session.brushSize, pt);
    activeStrokeRef.current = newStroke;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      drawStrokeOnContext(ctx, newStroke);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current) return;
    const pt = getCanvasCoordinates(e);
    if (!pt) return;

    const updated = appendPointToStroke(activeStrokeRef.current, pt);
    activeStrokeRef.current = updated;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      drawStrokeOnContext(ctx, updated);
    }
  };

  const handlePointerUp = () => {
    if (activeStrokeRef.current) {
      const finished = activeStrokeRef.current;
      activeStrokeRef.current = null;
      setSession((prev) => addBrushStroke(prev, finished));
    }
  };

  const handleLocalUndo = () => {
    setSession((prev) => undoLastStroke(prev));
  };

  const handleCommit = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      onDone(currentSrc);
      return;
    }
    const refinedDataUrl = canvas.toDataURL('image/png');
    onDone(refinedDataUrl);
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Chỉnh vùng cắt ảnh thủ công"
      className="fixed inset-0 z-50 bg-[#1E2124] text-white flex flex-col select-none touch-none"
    >
      {/* Top Header */}
      <header className="h-[52px] px-3.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#282C30]">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-white/80 hover:text-white px-2.5 py-1.5 rounded-lg active:scale-95 transition-all"
        >
          Hủy
        </button>

        <span className="text-xs sm:text-sm font-semibold text-white">
          Chỉnh vùng cắt
        </span>

        <button
          type="button"
          onClick={handleCommit}
          className="text-xs font-semibold text-white bg-[#315F86] hover:bg-[#244A69] px-3.5 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all"
        >
          Xong
        </button>
      </header>

      {/* Main Canvas Workspace with subtle transparency checkerboard */}
      <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="relative max-h-[70vh] max-w-[90vw] rounded-xl overflow-hidden shadow-2xl bg-[linear-gradient(45deg,#2e3338_25%,transparent_25%),linear-gradient(-45deg,#2e3338_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#2e3338_75%),linear-gradient(-45deg,transparent_75%,#2e3338_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]">
          {/* Temporary Original Preview Overlay when toggled */}
          {showOriginal && (
            <img
              src={originalSrc}
              alt="Ảnh gốc để so sánh"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
            />
          )}

          {/* Interactive Mask Canvas */}
          <canvas
            ref={canvasRef}
            width={imageSize?.width || 600}
            height={imageSize?.height || 600}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="block max-h-[68vh] max-w-[88vw] object-contain cursor-crosshair touch-none"
          />
        </div>
      </div>

      {/* Bottom Correction Controls Bar */}
      <div className="shrink-0 bg-[#282C30] border-t border-white/10 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] space-y-3">
        {/* Brush Mode & Tool Selectors */}
        <div className="flex items-center justify-between gap-2 max-w-sm mx-auto">
          {/* Erase Mode Button */}
          <button
            type="button"
            onClick={() => setSession((prev) => ({ ...prev, currentMode: 'erase' }))}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${session.currentMode === 'erase'
              ? 'bg-[#B3535D] text-white shadow-xs'
              : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Xóa</span>
          </button>

          {/* Restore Mode Button */}
          <button
            type="button"
            onClick={() => setSession((prev) => ({ ...prev, currentMode: 'restore' }))}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${session.currentMode === 'restore'
              ? 'bg-[#315F86] text-white shadow-xs'
              : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
          >
            <Brush className="w-3.5 h-3.5" />
            <span>Khôi phục</span>
          </button>

          {/* Local Undo Button */}
          <button
            type="button"
            disabled={!session.canUndo}
            onClick={handleLocalUndo}
            title="Hoàn tác nét cọ"
            aria-label="Hoàn tác nét cọ"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 text-white/80 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* View Original Comparison Toggle */}
          <button
            type="button"
            onPointerDown={() => setShowOriginal(true)}
            onPointerUp={() => setShowOriginal(false)}
            onPointerLeave={() => setShowOriginal(false)}
            title="Nhấn giữ để xem ảnh gốc"
            aria-label="Nhấn giữ để xem ảnh gốc"
            className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all ${showOriginal
              ? 'bg-[#F2DFA0] text-[#2E3338]'
              : 'bg-white/5 text-white/80 hover:bg-white/10'
              }`}
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>

        {/* Brush Size Slider */}
        <div className="max-w-sm mx-auto flex items-center gap-3 text-xs text-white/70 px-1">
          <span className="shrink-0 font-medium">Cỡ cọ</span>
          <span className="text-[11px] text-white/50 shrink-0">Nhỏ</span>
          <input
            type="range"
            min="6"
            max="64"
            step="2"
            value={session.brushSize}
            onChange={(e) =>
              setSession((prev) => ({ ...prev, brushSize: Number(e.target.value) }))
            }
            className="flex-1 accent-[#315F86] cursor-pointer h-1.5 bg-white/20 rounded-lg"
          />
          <span className="text-[11px] text-white/50 shrink-0">Lớn</span>
        </div>
      </div>
    </div>
  );
}
