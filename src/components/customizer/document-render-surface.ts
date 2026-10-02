import type { CSSProperties, ReactNode } from 'react';
import { createElement, Fragment } from 'react';

import type { ColorValue } from '../../lib/color/color-types.ts';
import { colorValueToCss } from '../../lib/color/color-renderers.ts';
import { computePatternGrid, getWrappingPaperDimensions } from '../../lib/pattern-renderer.ts';
import type {
  CanvasElement,
  CardSurface,
  DesignState,
  FixedStickerShape,
  StickerOptions,
} from '../../lib/product-state.ts';
import {
  getImageData,
  getTextData,
  normalizeWrappingOptions,
} from '../../lib/product-state.ts';
import { computeStickerContour } from '../../lib/sticker-contour.ts';
export interface DocumentRenderOptions {
  surface?: string;
  widthPx?: number;
  heightPx?: number;
}

export interface DocumentRenderDimensions {
  width: number;
  height: number;
}

const CARD_SURFACE_LOOKUP: Record<CardSurface, true> = {
  front: true,
  inside: true,
  back: true,
};

const MAX_RENDER_DIMENSION = 4096;

export function resolveDocumentRenderSurface(design: DesignState, requestedSurface?: string): CardSurface {
  const candidate = requestedSurface ?? design.productOptions.surface;
  if (typeof candidate === 'string' && candidate in CARD_SURFACE_LOOKUP) {
    return candidate as CardSurface;
  }
  return 'front';
}

export function getDocumentRenderDimensions(
  design: DesignState,
  options: DocumentRenderOptions = {},
): DocumentRenderDimensions {
  const surface = resolveDocumentRenderSurface(design, options.surface);
  const isVertical = design.variantId === 'vertical'
    || design.productOptions.orientation === 'vertical'
    || design.productOptions.variant === 'vertical';

  let naturalDimensions: DocumentRenderDimensions;
  switch (design.productId) {
    case 'card':
      naturalDimensions = isVertical
        ? { width: surface === 'inside' ? 840 : 420, height: 592 }
        : { width: surface === 'inside' ? 1184 : 592, height: 420 };
      break;
    case 'wrapping':
      naturalDimensions = { width: 600, height: 600 };
      break;
    case 'sticker':
      naturalDimensions = { width: 400, height: 400 };
      break;
    case 'notebook':
      naturalDimensions = { width: 592, height: 840 };
      break;
    default:
      throw new Error(`Unsupported product: ${String((design as DesignState).productId)}`);
  }

  const width = options.widthPx ?? naturalDimensions.width;
  const height = options.heightPx ?? naturalDimensions.height;

  if (
    !Number.isInteger(width)
    || width < 2
    || width > MAX_RENDER_DIMENSION
    || !Number.isInteger(height)
    || height < 2
    || height > MAX_RENDER_DIMENSION
  ) {
    throw new RangeError(`Render dimensions must be integers from 2 to ${MAX_RENDER_DIMENSION}`);
  }

  return { width, height };
}


export interface DocumentRenderSurfaceProps {
  document: DesignState;
  surface?: string;
  widthPx?: number;
  heightPx?: number;
  className?: string;
  id?: string;
}

function resolveCssColor(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    try {
      return colorValueToCss(value as ColorValue);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function resolveImageOpacity(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 100;
  const normalized = num > 1 ? num / 100 : num;
  return Math.max(0, Math.min(1, normalized));
}

function getMaskStyle(mask: string | null | undefined): CSSProperties {
  switch (mask) {
    case 'circle':
      return { clipPath: 'circle(50% at 50% 50%)', borderRadius: '50%' };
    case 'oval':
      return { clipPath: 'ellipse(50% 50% at 50% 50%)', borderRadius: '50%' };
    case 'rounded':
      return { clipPath: 'inset(0 round 16px)', borderRadius: '16px' };
    case 'heart':
      return {
        clipPath:
          'polygon(50% 92%,8% 52%,4% 32%,8% 15%,20% 5%,36% 7%,50% 22%,64% 7%,80% 5%,92% 15%,96% 32%,92% 52%)',
      };
    default:
      return {};
  }
}

function RenderElementView({
  element,
  design,
  coordinateSpace,
}: {
  element: CanvasElement;
  design: DesignState;
  coordinateSpace?: { width: number; height: number };
}): ReactNode {
  if (element.type === 'group') return null;

  const x = typeof element.x === 'number' && Number.isFinite(element.x) ? element.x : 0;
  const y = typeof element.y === 'number' && Number.isFinite(element.y) ? element.y : 0;
  const elementWidth = typeof element.width === 'number' && Number.isFinite(element.width) ? element.width : 0;
  const elementHeight = typeof element.height === 'number' && Number.isFinite(element.height) ? element.height : 0;
  const z = typeof element.zIndex === 'number' && Number.isFinite(element.zIndex) ? element.zIndex : 0;
  const r = typeof element.rotation === 'number' && Number.isFinite(element.rotation) ? element.rotation : 0;

  const left = coordinateSpace ? (x / coordinateSpace.width) * 100 : x;
  const top = coordinateSpace ? (y / coordinateSpace.height) * 100 : y;
  const width = coordinateSpace ? (elementWidth / coordinateSpace.width) * 100 : elementWidth;
  const height = coordinateSpace ? (elementHeight / coordinateSpace.height) * 100 : elementHeight;

  const boxStyle: CSSProperties = {
    position: 'absolute',
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    zIndex: z,
    transform: `translate(-50%, -50%) rotate(${r}deg)`,
  };

  if (element.type === 'image') {
    const data = getImageData(element);
    if (!data?.src || data.placeholder) return null;

    const crop = data.crop;
    const cropX = typeof crop?.offsetX === 'number' && Number.isFinite(crop.offsetX) ? crop.offsetX : 0;
    const cropY = typeof crop?.offsetY === 'number' && Number.isFinite(crop.offsetY) ? crop.offsetY : 0;
    const cropScale = typeof crop?.scale === 'number' && Number.isFinite(crop.scale) ? Math.max(0.01, crop.scale) : 1;
    const cropRotation = typeof crop?.rotation === 'number' && Number.isFinite(crop.rotation) ? crop.rotation : 0;
    const cropTransform = `translate3d(${cropX}px, ${cropY}px, 0) scale(${cropScale}) rotate(${cropRotation}deg)`;

    return createElement(
      'div',
      {
        className: 'dr-element dr-image-frame',
        'data-render-element': 'image',
        style: {
          ...boxStyle,
          ...getMaskStyle(data.mask),
          opacity: resolveImageOpacity(data.opacity),
          overflow: 'hidden',
        },
      },
      createElement('img', {
        src: data.src,
        alt: '',
        style: {
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: cropTransform,
          transformOrigin: 'center',
        },
      }),
    );
  }

  if (element.type === 'text') {
    const data = getTextData(element);
    if (!data?.text || data.text.trim().length === 0 || data.placeholder) return null;

    const resolvedColor = resolveCssColor(
      (element.data as Record<string, unknown> | undefined)?.colorValue,
      data.color || design.color,
    );
    const isGradient = resolvedColor.includes('gradient(');
    const colorStyle: CSSProperties = isGradient
      ? {
        backgroundImage: resolvedColor,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
      }
      : { color: resolvedColor };

    const fontWeight = data.fontWeight === 'bold' ? 700 : data.fontWeight === 'medium' ? 500 : 400;
    const fontSize = typeof data.fontSize === 'number' && Number.isFinite(data.fontSize) ? Math.max(1, data.fontSize) : 20;
    const lineHeight = typeof data.lineHeight === 'number' && Number.isFinite(data.lineHeight) ? Math.max(0.1, data.lineHeight) : 1.4;
    const letterSpacing = typeof data.letterSpacing === 'number' && Number.isFinite(data.letterSpacing) ? data.letterSpacing : 0;

    return createElement(
      'div',
      {
        className: 'dr-element dr-text',
        'data-render-element': 'text',
        style: {
          ...boxStyle,
          ...colorStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          padding: '1px',
          fontFamily: data.fontFamily || 'sans-serif',
          fontSize: `${fontSize}px`,
          fontStyle: data.fontStyle === 'italic' ? 'italic' : 'normal',
          fontWeight,
          lineHeight,
          letterSpacing: `${letterSpacing}px`,
          textAlign: data.align || 'center',
        },
      },
      data.text,
    );
  }

  const rawData = (element.data ?? {}) as Record<string, unknown>;
  const fill = resolveCssColor(rawData.fillValue ?? rawData.fill ?? rawData.color, design.color || '#111827');
  const stroke = resolveCssColor(rawData.strokeValue ?? rawData.stroke ?? rawData.border, 'transparent');
  const strokeWidth = typeof rawData.strokeWidth === 'number' && Number.isFinite(rawData.strokeWidth)
    ? Math.max(0, rawData.strokeWidth)
    : typeof rawData.borderWidth === 'number' && Number.isFinite(rawData.borderWidth)
      ? Math.max(0, rawData.borderWidth)
      : 0;

  return createElement('div', {
    className: 'dr-element dr-shape',
    'data-render-element': element.type,
    style: {
      ...boxStyle,
      background: fill,
      border: `${strokeWidth}px solid ${stroke}`,
      borderRadius: String(rawData.borderRadius ?? '8px'),
      overflow: 'hidden',
    },
  });
}

function LegacyContent({ design }: { design: DesignState }): ReactNode {
  const hasImage = Boolean(design.image?.src);
  const hasText = Boolean(design.text && design.text.trim().length > 0);
  if (!hasImage && !hasText) return null;

  return createElement(
    Fragment,
    null,
    hasImage
      ? createElement('img', {
        className: 'dr-legacy-image',
        src: design.image!.src,
        alt: '',
        style: {
          position: 'absolute',
          inset: '15%',
          width: '70%',
          height: '70%',
          objectFit: 'contain',
        },
      })
      : null,
    hasText
      ? createElement(
        'div',
        {
          className: 'dr-legacy-text',
          style: {
            position: 'absolute',
            inset: '10%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: 'clamp(18px, 6vw, 64px)',
            whiteSpace: 'pre-wrap',
            color: design.color || '#111827',
          },
        },
        design.text,
      )
      : null,
  );
}

export function DocumentRenderSurface({
  document: design,
  surface: requestedSurface,
  widthPx,
  heightPx,
  className = '',
  id,
}: DocumentRenderSurfaceProps): ReactNode {
  const surface = resolveDocumentRenderSurface(design, requestedSurface);
  const elements = [...(design.elements ?? [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const rootStyle: CSSProperties = {
    position: 'relative',
    width: widthPx ? `${widthPx}px` : '100%',
    height: heightPx ? `${heightPx}px` : '100%',
    overflow: 'hidden',
  };

  if (design.productId === 'card') {
    const cardElements = elements.filter((element) => (element.surface ?? 'front') === surface);
    const background = resolveCssColor(design.productOptions.backgroundColorValue, design.backgroundColor || '#ffffff');

    return createElement(
      'div',
      {
        id,
        className: `dr-surface dr-card ${className}`.trim(),
        'data-product': 'card',
        'data-surface': surface,
        style: { ...rootStyle, background },
      },
      cardElements.map((element) =>
        createElement(RenderElementView, { key: element.id, element, design }),
      ),
      cardElements.length === 0 && surface === 'front'
        ? createElement(LegacyContent, { design })
        : null,
    );
  }

  if (design.productId === 'wrapping') {
    const options = normalizeWrappingOptions(design.productOptions);
    const variantKey = design.variantId || String(design.productOptions.variant || 'a1');
    const dimensions = getWrappingPaperDimensions(variantKey);
    const background = resolveCssColor(
      design.productOptions.backgroundColorValue,
      options.patternConfig.backgroundColor || design.backgroundColor || '#ffffff',
    );

    if (options.mode === 'pattern' && options.patternConfig.enabled) {
      const rawScale = typeof options.patternConfig.scale === 'number' && Number.isFinite(options.patternConfig.scale)
        ? options.patternConfig.scale
        : 100;
      const grid = computePatternGrid({
        sheetWidth: dimensions.width,
        sheetHeight: dimensions.height,
        config: {
          ...options.patternConfig,
          scale: Math.max(10, Math.min(500, rawScale)),
        },
      });

      return createElement(
        'div',
        {
          id,
          className: `dr-surface dr-wrapping ${className}`.trim(),
          'data-product': 'wrapping',
          'data-mode': 'pattern',
          style: { ...rootStyle, background },
        },
        grid.cells.map((cell) => {
          const left = (cell.x / dimensions.width) * 100;
          const top = (cell.y / dimensions.height) * 100;
          const width = (cell.width / dimensions.width) * 100;
          const height = (cell.height / dimensions.height) * 100;
          const mirrorX = cell.mirrorX ? -1 : 1;
          const mirrorY = cell.mirrorY ? -1 : 1;

          return createElement(
            'div',
            {
              key: `${cell.col}:${cell.row}`,
              className: 'dr-pattern-cell',
              'data-pattern-cell': true,
              style: {
                position: 'absolute',
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
                transform: `rotate(${cell.rotation}deg) scaleX(${mirrorX}) scaleY(${mirrorY})`,
                transformOrigin: 'center',
                overflow: 'visible',
              },
            },
            createElement(
              'div',
              {
                className: 'dr-motif',
                style: { position: 'relative', width: '100%', height: '100%', overflow: 'hidden' },
              },
              elements.map((element) =>
                createElement(RenderElementView, { key: element.id, element, design }),
              ),
              elements.length === 0 ? createElement(LegacyContent, { design }) : null,
            ),
          );
        }),
      );
    }

    return createElement(
      'div',
      {
        id,
        className: `dr-surface dr-wrapping ${className}`.trim(),
        'data-product': 'wrapping',
        'data-mode': 'full-sheet',
        style: { ...rootStyle, background },
      },
      elements.map((element) =>
        createElement(RenderElementView, { key: element.id, element, design, coordinateSpace: dimensions }),
      ),
      elements.length === 0 ? createElement(LegacyContent, { design }) : null,
    );
  }

  if (design.productId === 'sticker') {
    const options = design.productOptions as StickerOptions;
    const background = resolveCssColor(design.productOptions.backgroundColorValue, design.backgroundColor || '#ffffff');
    const shape = options.shape as FixedStickerShape | undefined;
    const rawBorder = typeof options.borderWidth === 'number' && Number.isFinite(options.borderWidth) ? options.borderWidth : 2;
    const borderWidth = options.hasWhiteBorder ? Math.max(0, rawBorder) : 0;

    if (shape) {
      const aspect = shape === 'circle' || shape === 'square' ? '1 / 1' : '1.4 / 1';
      const borderRadius = shape === 'circle' || shape === 'oval'
        ? '50%'
        : shape === 'rounded-rectangle'
          ? '16px'
          : '0';

      return createElement(
        'div',
        {
          id,
          className: `dr-surface dr-sticker ${className}`.trim(),
          style: { ...rootStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        },
        createElement(
          'div',
          {
            className: 'dr-sticker-fixed',
            'data-product': 'sticker',
            'data-sticker-shape': shape,
            style: {
              position: 'relative',
              maxWidth: '100%',
              maxHeight: '100%',
              width: '100%',
              aspectRatio: aspect,
              borderRadius,
              border: `${borderWidth}px solid white`,
              background,
              overflow: 'hidden',
            },
          },
          elements.map((element) =>
            createElement(RenderElementView, { key: element.id, element, design }),
          ),
          elements.length === 0 ? createElement(LegacyContent, { design }) : null,
        ),
      );
    }

    const contour = computeStickerContour(elements, options);
    const borderPath = contour.borderSvgPath || 'M2 2 H98 V98 H2 Z';

    return createElement(
      'div',
      {
        id,
        className: `dr-surface dr-sticker ${className}`.trim(),
        'data-product': 'sticker',
        'data-sticker-shape': 'die-cut',
        style: { ...rootStyle, background: 'transparent' },
      },
      options.hasWhiteBorder
        ? createElement(
          'svg',
          {
            className: 'dr-sticker-border',
            viewBox: '0 0 100 100',
            preserveAspectRatio: 'none',
            'aria-hidden': 'true',
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 },
          },
          createElement('path', {
            d: borderPath,
            fill: 'white',
            stroke: 'white',
            strokeWidth: Math.max(1, borderWidth * 0.8),
            strokeLinejoin: 'round',
          }),
        )
        : null,
      createElement(
        'div',
        {
          className: 'dr-sticker-art',
          style: {
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            background,
            zIndex: 1,
          },
        },
        elements.map((element) =>
          createElement(RenderElementView, { key: element.id, element, design }),
        ),
        elements.length === 0 ? createElement(LegacyContent, { design }) : null,
      ),
    );
  }

  const background = resolveCssColor(design.productOptions.backgroundColorValue, design.backgroundColor || '#ffffff');
  return createElement(
    'div',
    {
      id,
      className: `dr-surface dr-notebook ${className}`.trim(),
      'data-product': 'notebook',
      style: { ...rootStyle, background },
    },
    elements.map((element) =>
      createElement(RenderElementView, { key: element.id, element, design }),
    ),
    elements.length === 0 ? createElement(LegacyContent, { design }) : null,
  );
}
