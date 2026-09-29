'use client';

import type * as React from 'react';
import type { CSSProperties } from 'react';
import type { CardOptions, CanvasElement, DesignState } from '@/lib/product-state';
import { getImageData, getTextData } from '@/lib/product-state';

export interface CardPreviewProps {
  state: DesignState;
  view: 'card-closed' | 'card-open' | 'card-back';
}

type CardView = CardPreviewProps['view'];

type CardDimensions = {
  width: number;
  height: number;
};

function getDimensions(orientation: CardOptions['orientation'], view: CardView): CardDimensions {
  const isVertical = orientation === 'vertical';
  if (view === 'card-open') {
    return isVertical ? { width: 210, height: 148 } : { width: 296, height: 105 };
  }
  return isVertical ? { width: 105, height: 148 } : { width: 148, height: 105 };
}

function getSurface(view: CardView): 'front' | 'inside' | 'back' {
  if (view === 'card-open') return 'inside';
  return view === 'card-back' ? 'back' : 'front';
}

function getElements(state: DesignState, view: CardView): CanvasElement[] {
  const surface = getSurface(view);
  return (state.elements ?? []).filter((element) => (element.surface ?? 'front') === surface);
}

function ElementPreview({ element, state }: { element: CanvasElement; state: DesignState }) {
  const style: CSSProperties = {
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    zIndex: element.zIndex ?? 0,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
    transformOrigin: 'center',
  };

  if (element.type === 'image') {
    const data = getImageData(element);
    if (!data?.src) return null;
    return (
      <div className="absolute flex items-center justify-center overflow-hidden" style={style} data-preview-element="image">
        <img src={data.src} alt="" className="h-full w-full object-contain" draggable={false} />
      </div>
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

  if (element.type === 'shape' || element.type === 'sticker') {
    const color = typeof element.data?.color === 'string' ? element.data.color : state.color;
    return (
      <div className="absolute overflow-hidden" style={style} data-preview-element={element.type}>
        <span className="block h-full w-full rounded-md bg-current opacity-70" style={{ color }} />
      </div>
    );
  }

  return null;
}

function CardPanel({ state, view, dimensions }: { state: DesignState; view: CardView; dimensions: CardDimensions }) {
  const elements = getElements(state, view).toSorted((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const isOpen = view === 'card-open';

  return (
    <div
      className={`relative w-full max-w-[min(94vw,760px)] overflow-visible ${isOpen ? 'shadow-[0_20px_36px_-18px_rgba(35,35,35,0.55)]' : '[transform:perspective(900px)_rotateY(-3deg)] shadow-[0_20px_30px_-16px_rgba(35,35,35,0.58)]'}`}
      style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
      data-preview="card"
      data-card-view={view}
      data-card-orientation={dimensions.width < dimensions.height ? 'vertical' : 'horizontal'}
    >
      <div className="absolute inset-0 -z-10 translate-y-1 rounded-sm border border-black/10 bg-[#eee9df]" aria-hidden="true" />
      <div className="absolute inset-0 overflow-hidden rounded-sm border border-black/10 bg-white" style={{ backgroundColor: state.backgroundColor }}>
        {elements.map((element) => <ElementPreview key={element.id} element={element} state={state} />)}
        {isOpen && (
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4 pointer-events-none bg-gradient-to-r from-black/5 via-black/15 to-transparent select-none z-10" aria-hidden="true" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/5" aria-hidden="true" />
      </div>
    </div>
  );
}

export function CardPreview({ state, view }: CardPreviewProps): React.JSX.Element {
  const options = state.productOptions as CardOptions;
  const dimensions = getDimensions(options.orientation, view);
  return (
    <div className="flex min-h-[min(70vh,560px)] w-full items-center justify-center px-3 py-6" data-card-preview-root>
      <CardPanel state={state} view={view} dimensions={dimensions} />
    </div>
  );
}
