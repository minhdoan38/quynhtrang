'use client';

import type * as React from 'react';
import type { CSSProperties } from 'react';
import type { CanvasElement, DesignState } from '@/lib/product-state';
import { getImageData, getStickerData, normalizeWrappingOptions } from '@/lib/product-state';
import { computePatternGrid, getWrappingPaperDimensions } from '@/lib/pattern-renderer';

export interface WrappingDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface WrappingPreviewProps {
  state: DesignState;
  view: 'flat' | 'box';
}

interface Motif {
  src?: string;
  text?: string;
  color?: string;
}

function getMotif(element: CanvasElement | undefined, state: DesignState): Motif {
  if (!element) {
    return state.image ? { src: state.image.src } : state.text ? { text: state.text, color: state.color } : {};
  }
  if (element.type === 'image') {
    const data = getImageData(element);
    return data?.src ? { src: data.src } : {};
  }
  if (element.type === 'sticker') {
    const data = getStickerData(element);
    return data?.src ? { src: data.src } : {};
  }
  if (element.type === 'text') {
    const data = element.data as { text?: unknown; color?: unknown } | undefined;
    return {
      text: typeof data?.text === 'string' ? data.text : state.text,
      color: typeof data?.color === 'string' ? data.color : state.color,
    };
  }
  return {};
}

function MotifPreview({ motif, className = '' }: { motif: Motif; className?: string }) {
  if (motif.src) {
    return <img src={motif.src} alt="" className={`h-full w-full object-contain ${className}`} />;
  }
  if (motif.text) {
    return (
      <span className={`block truncate text-center text-[clamp(8px,1.4vw,18px)] font-semibold ${className}`} style={{ color: motif.color }}>
        {motif.text}
      </span>
    );
  }
  return <span className={`block h-1/2 w-1/2 rounded-full bg-white/70 ${className}`} aria-hidden="true" />;
}

function SheetElement({ element, sheetWidth, sheetHeight, state }: {
  element: CanvasElement;
  sheetWidth: number;
  sheetHeight: number;
  state: DesignState;
}) {
  const motif = getMotif(element, state);
  const style: CSSProperties = {
    left: `${(element.x / sheetWidth) * 100}%`,
    top: `${(element.y / sheetHeight) * 100}%`,
    width: `${(element.width / sheetWidth) * 100}%`,
    height: `${(element.height / sheetHeight) * 100}%`,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
    transformOrigin: 'center',
  };
  return (
    <div className="absolute flex items-center justify-center overflow-hidden" style={style} data-preview-element={element.type}>
      {element.type === 'shape' ? <span className="h-full w-full rounded-md bg-current opacity-70" style={{ color: state.color }} /> : <MotifPreview motif={motif} />}
    </div>
  );
}

function FlatSheet({ state, dimensions }: { state: DesignState; dimensions: WrappingDimensions }) {
  const options = normalizeWrappingOptions(state.productOptions);
  const config = options.patternConfig;
  const elements = state.elements ?? [];
  const grid = computePatternGrid({
    sheetWidth: dimensions.width,
    sheetHeight: dimensions.height,
    config,
  });
  const motif = getMotif(elements[0], state);
  const cellStyle = (cell: (typeof grid.cells)[number]): CSSProperties => ({
    left: `${(cell.x / dimensions.width) * 100}%`,
    top: `${(cell.y / dimensions.height) * 100}%`,
    width: `${(cell.width / dimensions.width) * 100}%`,
    height: `${(cell.height / dimensions.height) * 100}%`,
    transform: `rotate(${cell.rotation}deg) scaleX(${cell.mirrorX ? -1 : 1}) scaleY(${cell.mirrorY ? -1 : 1})`,
    transformOrigin: 'center',
  });

  return (
    <div
      className="relative w-full max-w-[min(92vw,620px)] overflow-hidden rounded-sm border border-black/10 bg-white shadow-xl"
      style={{ aspectRatio: dimensions.aspectRatio }}
      data-preview="flat-sheet"
      data-sheet-variant={state.variantId}
    >
      <div className="absolute inset-0" style={{ backgroundColor: config.backgroundColor }} data-preview-background="pattern">
        {options.mode === 'pattern' && config.enabled ? (
          <div className="absolute inset-0 overflow-hidden" data-preview-pattern-grid data-cell-count={grid.totalCount}>
            {grid.cells.map((cell) => (
              <div key={`${cell.col}:${cell.row}`} className="absolute flex items-center justify-center" style={cellStyle(cell)} data-pattern-cell>
                <MotifPreview motif={motif} />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0" data-preview-full-sheet>
            {elements.map((element) => (
              <SheetElement key={element.id} element={element} sheetWidth={dimensions.width} sheetHeight={dimensions.height} state={state} />
            ))}
            {!elements.length && <MotifPreview motif={motif} className="absolute left-1/2 top-1/2 h-1/4 w-1/4 -translate-x-1/2 -translate-y-1/2" />}
          </div>
        )}
      </div>
    </div>
  );
}

function GiftBox({ state }: { state: DesignState }) {
  const options = normalizeWrappingOptions(state.productOptions);
  const motif = getMotif(state.elements?.[0], state);
  const faceStyle: CSSProperties = { backgroundColor: options.patternConfig.backgroundColor };

  return (
    <div className="flex min-h-[min(70vh,560px)] w-full items-center justify-center [perspective:1000px]" data-preview="box" aria-label="Hộp quà bọc giấy">
      <div className="relative h-64 w-64 [transform-style:preserve-3d] sm:h-80 sm:w-80">
        <div className="absolute inset-x-0 bottom-0 top-[15%] flex items-center justify-center overflow-hidden rounded-sm border border-black/10 shadow-[0_24px_28px_-14px_rgba(35,35,35,0.55)] [transform:rotateY(-25deg)_rotateX(15deg)]" style={faceStyle} data-box-face="front">
          <MotifPreview motif={motif} className="h-2/3 w-2/3 opacity-90" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" data-box-shading="front" />
          <div className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 bg-[#d6a34a]/80 shadow-sm" data-box-ribbon="vertical" />
          <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 bg-[#d6a34a]/75 shadow-sm" data-box-ribbon="horizontal" />
        </div>
        <div className="absolute left-[7%] right-[-4%] top-0 h-[23%] origin-bottom overflow-hidden rounded-sm border border-black/10 [transform:rotateX(60deg)_skewX(-12deg)]" style={faceStyle} data-box-face="top">
          <MotifPreview motif={motif} className="h-full w-full opacity-70" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/45 via-white/10 to-transparent" data-box-shading="top" />
        </div>
        <div className="absolute bottom-[1%] right-[-11%] top-[15%] w-[23%] origin-left overflow-hidden rounded-sm border border-black/10 [transform:rotateY(55deg)_skewY(-12deg)]" style={faceStyle} data-box-face="side">
          <MotifPreview motif={motif} className="h-full w-full opacity-65" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-black/30 via-black/10 to-transparent" data-box-shading="side" />
        </div>
        <div className="absolute left-1/2 top-[1%] z-20 h-12 w-12 -translate-x-1/2" aria-hidden="true" data-box-bow>
          <span className="absolute left-0 top-2 h-7 w-7 -rotate-35 rounded-full border-4 border-[#c78e36] bg-[#e3b45f]" />
          <span className="absolute right-0 top-2 h-7 w-7 rotate-35 rounded-full border-4 border-[#c78e36] bg-[#e3b45f]" />
          <span className="absolute left-1/2 top-3 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-[#b27a29] bg-[#d99d42]" />
        </div>
      </div>
    </div>
  );
}

export function WrappingPreview({ state, view }: WrappingPreviewProps): React.JSX.Element {
  const dimensions = getWrappingPaperDimensions(state.variantId);
  return view === 'box' ? <GiftBox state={state} /> : <FlatSheet state={state} dimensions={dimensions} />;
}
