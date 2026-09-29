import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  filterElementsBySurface,
  getCardSpreadDimensions,
  type CanvasElement,
} from '../lib/product-state.ts';

const element = (id: string, surface?: CanvasElement['surface']): CanvasElement => ({
  id,
  type: 'text',
  x: 50,
  y: 50,
  width: 20,
  height: 10,
  rotation: 0,
  surface,
  data: { text: id },
});

test('filterElementsBySurface selects matching card surface and defaults missing surface to front', () => {
  const elements = [element('front'), element('inside', 'inside'), element('back', 'back')];

  assert.deepEqual(filterElementsBySurface(elements, 'front').map(({ id }) => id), ['front']);
  assert.deepEqual(filterElementsBySurface(elements, 'inside').map(({ id }) => id), ['inside']);
  assert.deepEqual(filterElementsBySurface(elements, 'back').map(({ id }) => id), ['back']);
});

test('getCardSpreadDimensions doubles width for horizontal inside spread', () => {
  const inside = getCardSpreadDimensions('horizontal', 'inside');
  const front = getCardSpreadDimensions('horizontal', 'front');
  const back = getCardSpreadDimensions('horizontal', 'back');

  assert.equal(inside.width, front.width * 2);
  assert.equal(inside.height, front.height);
  assert.equal(inside.foldPosition, front.width);
  assert.deepEqual(back, front);
});

test('getCardSpreadDimensions doubles width for vertical inside spread', () => {
  const inside = getCardSpreadDimensions('vertical', 'inside');
  const front = getCardSpreadDimensions('vertical', 'front');
  const back = getCardSpreadDimensions('vertical', 'back');

  assert.equal(inside.height, front.height);
  assert.equal(inside.width, front.width * 2);
  assert.equal(inside.foldPosition, front.width);
  assert.deepEqual(back, front);
});

test('DesignCanvas source accepts cardSurface and renders fold guide semantics', () => {
  const canvasPath = resolve(
    process.cwd(),
    'src/components/customizer/design-canvas.tsx'
  );
  const source = readFileSync(canvasPath, 'utf8');

  assert.match(
    source,
    /cardSurface\?: CardSurface;/,
    'DesignCanvasProps should declare optional cardSurface property'
  );
  assert.match(
    source,
    /data-ui-guide="card-fold"/,
    'DesignCanvas should render fold guide marked with data-ui-guide="card-fold"'
  );
  assert.match(
    source,
    /Nếp gấp/,
    'Fold guide should render Vietnamese label Nếp gấp'
  );
});

test('CustomizerShell source renders CardSurfaceSwitcher and passes cardSurface', () => {
  const shellPath = resolve(
    process.cwd(),
    'src/components/customizer/customizer-shell.tsx'
  );
  const source = readFileSync(shellPath, 'utf8');

  assert.match(
    source,
    /activeCardSurface,\s*setActiveCardSurface/,
    'CustomizerShell must maintain activeCardSurface state'
  );
  assert.match(
    source,
    /<CardSurfaceSwitcher/,
    'CustomizerShell must render CardSurfaceSwitcher'
  );
  assert.match(
    source,
    /cardSurface=\{activeCardSurface\}/,
    'CustomizerShell must pass activeCardSurface to DesignCanvas'
  );
});
