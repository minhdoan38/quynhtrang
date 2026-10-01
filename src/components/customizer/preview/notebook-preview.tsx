'use client';

import type * as React from 'react';
import type { CSSProperties } from 'react';
import {
  NOTEBOOK_COVER_DEFINITION,
  getImageData,
  getTextData,
  getStickerData,
  type CanvasElement,
  type DesignState,
} from '@/lib/product-state';

export interface NotebookPreviewProps {
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
    return (
      <img
        src={data.src}
        alt=""
        className="absolute object-contain"
        style={style}
        draggable={false}
        data-preview-element="image"
      />
    );
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

  if (element.type === 'sticker') {
    const data = getStickerData(element);
    if (!data?.src) return null;
    return <img src={data.src} alt={data.title} className="absolute object-contain" style={style} draggable={false} data-preview-element="sticker" />;
  }

  if (element.type === 'shape') {
    const color = typeof element.data?.color === 'string' ? element.data.color : state.color;
    return <div className="absolute overflow-hidden" style={style} data-preview-element="shape"><span className="block h-full w-full rounded-md opacity-70" style={{ backgroundColor: color }} /></div>;
  }

  return null;
}

export function NotebookPreview({ state }: NotebookPreviewProps): React.JSX.Element {
  const elements = (state.elements ?? []).toSorted((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const rings = Array.from({ length: 18 });

  return (
    <div className="flex min-h-[min(70vh,560px)] w-full items-center justify-center px-3 py-6" data-notebook-preview-root>
      <div
        className="relative w-full max-w-[min(76vw,440px)] select-none [transform:perspective(1200px)_rotateY(-4deg)] shadow-[0_24px_36px_-16px_rgba(25,28,32,0.45)]"
        style={{ aspectRatio: `${NOTEBOOK_COVER_DEFINITION.widthMm} / ${NOTEBOOK_COVER_DEFINITION.heightMm}` }}
        data-preview="notebook"
      >
        {/* Stacked paper page depth beneath cover on right/bottom edges */}
        <div
          className="absolute inset-y-1.5 -right-3 left-3 rounded-r-lg border border-black/10 bg-[#f4efe4] shadow-[0_12px_22px_-10px_rgba(20,24,28,0.35)]"
          aria-hidden="true"
          data-notebook-paper-depth="base"
        />
        <div
          className="absolute inset-y-1 -right-1.5 left-2 rounded-r-lg border border-black/10 bg-[#FAF7F0]"
          aria-hidden="true"
          data-notebook-paper-depth="top"
        />

        {/* Front cover artwork */}
        <div
          className="absolute inset-0 overflow-hidden rounded-r-xl rounded-l-xs border border-black/15 bg-white shadow-inner"
          style={{ backgroundColor: state.backgroundColor }}
          data-notebook-cover
        >
          {elements.map((element) => (
            <ElementPreview key={element.id} element={element} state={state} />
          ))}

          {!elements.length && state.image?.src && (
            <img
              src={state.image.src}
              alt=""
              className="absolute inset-[15%] h-[70%] w-[70%] object-contain"
              draggable={false}
            />
          )}

          {!elements.length && state.text?.trim() && (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center" style={{ color: state.color }}>
              {state.text}
            </div>
          )}

          {/* Left subtle spine shadow gradient across front cover */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-black/25 via-black/10 to-transparent"
            aria-hidden="true"
          />
        </div>

        {/* Physical spiral binding styling along left edge */}
        <div
          className="pointer-events-none absolute -left-3 inset-y-3 flex w-7 flex-col justify-between py-2 z-20"
          aria-hidden="true"
          data-notebook-binding="spiral"
        >
          {rings.map((_, index) => (
            <div key={index} className="relative h-2.5 w-7">
              {/* Hole punch cutout behind ring */}
              <span className="absolute left-2.5 top-0.5 h-1.5 w-1.5 rounded-full bg-black/40 shadow-inner" />
              {/* Metallic binding ring segment */}
              <span className="absolute inset-x-0 top-0 h-2 rounded-full border border-black/25 bg-gradient-to-r from-zinc-300 via-zinc-100 to-zinc-400 shadow-xs" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
