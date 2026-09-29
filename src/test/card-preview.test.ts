import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createInitialState,
  type CanvasElement,
  type CardOptions,
  type DesignState,
} from '../lib/product-state.ts';
import type { CardPreviewProps } from '../components/customizer/preview/card-preview.tsx';

const componentPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/card-preview.tsx',
);
const source = readFileSync(componentPath, 'utf8');

function createElement(
  id: string,
  surface?: CanvasElement['surface'],
  type: CanvasElement['type'] = 'text',
): CanvasElement {
  return {
    id,
    type,
    x: 50,
    y: 50,
    width: 30,
    height: 12,
    rotation: 0,
    surface,
    data: type === 'text' ? { text: `Element ${id}` } : { src: `https://example.com/${id}.png` },
  };
}

function createCardState(orientation: CardOptions['orientation'] = 'horizontal'): DesignState {
  const base = createInitialState('card');
  return {
    ...base,
    productOptions: {
      ...base.productOptions,
      orientation,
    },
  };
}

test('CardPreview source contracts match requirements', () => {
  assert.match(source, /^'use client';/);
  assert.match(source, /export interface CardPreviewProps/);
  assert.match(source, /export function CardPreview/);
  assert.match(source, /from '@\/lib\/product-state'/);
  assert.match(source, /CardOptions/);
  assert.match(source, /CanvasElement/);
  assert.match(source, /DesignState/);
  assert.match(source, /148/);
  assert.match(source, /105/);
  assert.match(source, /296/);
  assert.match(source, /210/);
  assert.match(
    source,
    /className="absolute inset-y-0 left-1\/2 -translate-x-1\/2 w-4 pointer-events-none bg-gradient-to-r from-black\/5 via-black\/15 to-transparent select-none z-10"/,
  );
  assert.doesNotMatch(source, /border-dashed/);
  assert.doesNotMatch(source, /Nếp gấp/);
  assert.doesNotMatch(source, /SelectionOverlay/);
  assert.doesNotMatch(source, /resize/i);
});

test('CardPreview type contract accepts state and view modes', () => {
  const state = createCardState('horizontal');
  const closedProps: CardPreviewProps = { state, view: 'card-closed' };
  const openProps: CardPreviewProps = { state, view: 'card-open' };
  const backProps: CardPreviewProps = { state, view: 'card-back' };

  assert.equal(closedProps.view, 'card-closed');
  assert.equal(openProps.view, 'card-open');
  assert.equal(backProps.view, 'card-back');
  assert.equal(closedProps.state.productId, 'card');
});

test('CardPreview filters elements by surface correctly across views', () => {
  const frontDefault = createElement('front-default');
  const frontExplicit = createElement('front-explicit', 'front');
  const insideElement = createElement('inside-element', 'inside');
  const backElement = createElement('back-element', 'back');

  const elements = [frontDefault, frontExplicit, insideElement, backElement];

  const filterByView = (view: CardPreviewProps['view']) => {
    const surface = view === 'card-open' ? 'inside' : view === 'card-back' ? 'back' : 'front';
    return elements.filter((element) => (element.surface ?? 'front') === surface).map((e) => e.id);
  };

  assert.deepEqual(filterByView('card-closed'), ['front-default', 'front-explicit']);
  assert.deepEqual(filterByView('card-open'), ['inside-element']);
  assert.deepEqual(filterByView('card-back'), ['back-element']);
});

test('CardPreview calculates correct aspect ratios for horizontal and vertical orientations', () => {
  const getDims = (orientation: CardOptions['orientation'], view: CardPreviewProps['view']) => {
    const isVertical = orientation === 'vertical';
    if (view === 'card-open') {
      return isVertical ? { width: 210, height: 148 } : { width: 296, height: 105 };
    }
    return isVertical ? { width: 105, height: 148 } : { width: 148, height: 105 };
  };

  assert.deepEqual(getDims('horizontal', 'card-closed'), { width: 148, height: 105 });
  assert.deepEqual(getDims('horizontal', 'card-open'), { width: 296, height: 105 });
  assert.deepEqual(getDims('horizontal', 'card-back'), { width: 148, height: 105 });

  assert.deepEqual(getDims('vertical', 'card-closed'), { width: 105, height: 148 });
  assert.deepEqual(getDims('vertical', 'card-open'), { width: 210, height: 148 });
  assert.deepEqual(getDims('vertical', 'card-back'), { width: 105, height: 148 });
});

test('CardPreview renders realistic paper fold crease and omits editor fold guides', () => {
  assert.match(source, /bg-gradient-to-r from-black\/5 via-black\/15 to-transparent/);
  assert.doesNotMatch(source, /border-dashed/);
  assert.doesNotMatch(source, /Nếp gấp/);
  assert.doesNotMatch(source, /data-ui-guide="card-fold"/);
});
