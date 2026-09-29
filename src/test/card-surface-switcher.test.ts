import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CARD_SURFACES,
  getCardSurfaceLabel,
  type CardSurface,
} from '../lib/product-state.ts';

test('CARD_SURFACES defines exact customer surfaces in order', () => {
  assert.deepEqual(CARD_SURFACES, ['front', 'inside', 'back']);
});

test('getCardSurfaceLabel maps customer surfaces to Vietnamese labels', () => {
  assert.equal(getCardSurfaceLabel('front'), 'Mặt trước');
  assert.equal(getCardSurfaceLabel('inside'), 'Bên trong');
  assert.equal(getCardSurfaceLabel('back'), 'Mặt sau');
});

test('CardSurfaceSwitcher source file exports function component with required semantics', () => {
  const componentPath = resolve(
    process.cwd(),
    'src/components/customizer/card-surface-switcher.tsx'
  );
  const source = readFileSync(componentPath, 'utf8');

  assert.match(
    source,
    /export\s+function\s+CardSurfaceSwitcher\s*\(/,
    'Component must export a function named CardSurfaceSwitcher'
  );
  assert.match(
    source,
    /export\s+interface\s+CardSurfaceSwitcherProps/,
    'Component must export CardSurfaceSwitcherProps interface'
  );
  assert.match(
    source,
    /from\s+['"]@\/lib\/product-state['"]/,
    'Component must import from product-state domain'
  );
  assert.match(
    source,
    /role=["']tablist["']/,
    'Container must use role="tablist"'
  );
  assert.match(
    source,
    /aria-label=["']Chọn mặt thiệp["']/,
    'Container must have Vietnamese aria label'
  );
  assert.match(
    source,
    /role=["']tab["']/,
    'Each option must use role="tab"'
  );
  assert.match(
    source,
    /aria-selected=\{value === surface\}/,
    'Each option must wire aria-selected to active surface'
  );
  assert.match(
    source,
    /onClick=\{\(\) => onChange\(surface\)\}/,
    'Each option must call onChange on click'
  );
  assert.match(
    source,
    /motion-reduce:transition-none/,
    'Indicator transition must respect prefers-reduced-motion'
  );
});

test('CardSurface values map cleanly to labels without missing mappings', () => {
  for (const surface of CARD_SURFACES) {
    const typedSurface: CardSurface = surface;
    const label: string = getCardSurfaceLabel(typedSurface);
    assert.equal(typeof label, 'string');
    assert.ok(label.length > 0);
    assert.equal(/imposition|inside-left|inside-right|spread/i.test(label), false);
  }
});
