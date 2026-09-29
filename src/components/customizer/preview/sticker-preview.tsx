'use client';

import type * as React from 'react';
import type { CSSProperties } from 'react';
import {
  FIXED_STICKER_SHAPES,
  getImageData,
  getTextData,
  type CanvasElement,
  type DesignState,
  type FixedStickerShape,
  type StickerOptions,
} from '@/lib/product-state';
import { computeStickerContour } from '@/lib/sticker-contour';

export interface StickerPreviewProps {
  state: DesignState;
}

function ElementPreview({ element, state }: { element: CanvasElement; state: DesignState }) {
  const style: CSSProperties = {
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    zIndex: element.zIndex ?? 0,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
  };

  if (element.type === 'image') {
    const data = getImageData(element);
    if (!data?.src) return null;
    return <img src={data.src} alt="" className="absolute object-contain" style={style} draggable={false} data-preview-element="image" />;
  }

  if (element.type === 'text') {
    const data = getTextData(element);
    if (!data?.text?.trim()) return null;
    return (
      <div
        className="absolute flex items-center justify-center overflow-hidden px-1 text-center"
        style={{
          ...style,
          color: data.color || state.color,
          fontFamily: data.fontFamily,
          fontSize: `${Math.max(8, data.fontSize || 20)}px`,
          fontStyle: data.fontStyle || 'normal',
          fontWeight: data.fontWeight === 'bold' ? 700 : data.fontWeight === 'medium' ? 500 : 400,
          lineHeight: data.lineHeight || 1.4,
          letterSpacing: `${data.letterSpacing || 0}px`,
          textAlign: data.align || 'center',
        }}
        data-preview-element="text"
      >
        {data.text}
      </div>
    );
  }

  if (element.type === 'shape' || element.type === 'sticker') {
    const color = typeof element.data?.color === 'string' ? element.data.color : state.color;
    return <div className="absolute overflow-hidden" style={style} data-preview-element={element.type}><span className="block h-full w-full rounded-md opacity-70" style={{ backgroundColor: color }} /></div>;
  }

  return null;
}

function Artwork({ state, clipPathId }: { state: DesignState; clipPathId?: string }) {
  const elements = (state.elements ?? []).toSorted((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  return (
    <div className="absolute inset-0 overflow-hidden" style={clipPathId ? { clipPath: `url(#${clipPathId})` } : undefined} data-preview-artwork>
      {elements.map((element) => <ElementPreview key={element.id} element={element} state={state} />)}
      {!elements.length && state.image?.src && <img src={state.image.src} alt="" className="absolute inset-[10%] h-[80%] w-[80%] object-contain" draggable={false} />}
      {!elements.length && state.text?.trim() && <div className="absolute inset-0 flex items-center justify-center p-5 text-center" style={{ color: state.color }}>{state.text}</div>}
    </div>
  );
}

function FixedShapePreview({ state, shape }: { state: DesignState; shape: FixedStickerShape }) {
  const borderRadius = shape === 'circle' || shape === 'oval' ? '9999px' : shape === 'rounded-rectangle' ? '16px' : '0px';
  const dimensions = shape === 'circle' || shape === 'square' ? 'aspect-square' : 'aspect-[1.4]';
  return (
    <div className="relative w-full max-w-[min(76vw,420px)]" data-preview="sticker" data-sticker-mode="fixed-shape" data-sticker-shape={shape}>
      <div className={`relative w-full ${dimensions} overflow-hidden border border-black/10 bg-white shadow-[0_18px_28px_-18px_rgba(35,35,35,0.6)]`} style={{ borderRadius }}>
        <div className="absolute inset-0" style={{ backgroundColor: state.backgroundColor }}><Artwork state={state} /></div>
      </div>
    </div>
  );
}

function DieCutPreview({ state }: { state: DesignState }) {
  const options = state.productOptions as StickerOptions;
  const contour = computeStickerContour(state.elements, options);
  const clipPathId = 'sticker-die-cut-contour';
  return (
    <div className="relative w-full max-w-[min(76vw,420px)]" data-preview="sticker" data-sticker-mode="die-cut">
      <div className="relative aspect-square w-full overflow-visible" style={{ filter: 'drop-shadow(0 16px 18px rgba(35,35,35,0.22))' }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" aria-hidden="true" data-sticker-border>
          <defs><clipPath id={clipPathId}><path d={contour.cutlineSvgPath || 'M2 2 H98 V98 H2 Z'} /></clipPath></defs>
          <path d={contour.borderSvgPath || 'M2 2 H98 V98 H2 Z'} fill="#fff" stroke="#fff" strokeWidth={Math.max(1, Number(options.borderWidth) || 2) * 0.8} strokeLinejoin="round" />
        </svg>
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `url(#${clipPathId})`, backgroundColor: state.backgroundColor }}>
          <Artwork state={state} />
        </div>
      </div>
    </div>
  );
}

export function StickerPreview({ state }: StickerPreviewProps): React.JSX.Element {
  const options = state.productOptions as StickerOptions;
  const shape = FIXED_STICKER_SHAPES.includes(options.shape as FixedStickerShape) ? options.shape as FixedStickerShape : undefined;
  return <div className="flex min-h-[min(70vh,560px)] w-full items-center justify-center px-3 py-6" data-sticker-preview-root>{shape ? <FixedShapePreview state={state} shape={shape} /> : <DieCutPreview state={state} />}</div>;
}
