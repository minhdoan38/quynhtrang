import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  NOTEBOOK_COVER_DEFINITION,
  isElementInNotebookBindingZone,
} from '../lib/product-state.ts';

test('NOTEBOOK_COVER_DEFINITION provides exact A5 aspect ratio and valid dimensions', () => {
  assert.equal(NOTEBOOK_COVER_DEFINITION.widthMm, 148);
  assert.equal(NOTEBOOK_COVER_DEFINITION.heightMm, 210);
  assert.equal(NOTEBOOK_COVER_DEFINITION.aspectRatio, 148 / 210);
  assert.ok(NOTEBOOK_COVER_DEFINITION.aspectRatio > 0);
  assert.ok(Number.isFinite(NOTEBOOK_COVER_DEFINITION.aspectRatio));
});

test('notebook dimensions and binding zone are valid positive finite numbers', () => {
  assert.ok(NOTEBOOK_COVER_DEFINITION.widthMm > 0);
  assert.ok(NOTEBOOK_COVER_DEFINITION.heightMm > 0);
  assert.ok(NOTEBOOK_COVER_DEFINITION.bindingMarginMm > 0);
  assert.ok(NOTEBOOK_COVER_DEFINITION.bindingMarginPct > 0);

  assert.ok(Number.isFinite(NOTEBOOK_COVER_DEFINITION.widthMm));
  assert.ok(Number.isFinite(NOTEBOOK_COVER_DEFINITION.heightMm));
  assert.ok(Number.isFinite(NOTEBOOK_COVER_DEFINITION.bindingMarginMm));
  assert.ok(Number.isFinite(NOTEBOOK_COVER_DEFINITION.bindingMarginPct));

  assert.equal(NOTEBOOK_COVER_DEFINITION.bindingMarginPct, 12);
  assert.equal(isElementInNotebookBindingZone({ x: 0 }), true);
  assert.equal(isElementInNotebookBindingZone({ x: 11.9 }), true);
  assert.equal(isElementInNotebookBindingZone({ x: 12 }), false);
});

test('globals.css uses exact 148 / 210 aspect ratio for notebook canvas', () => {
  const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(
    css,
    /\.design-canvas--notebook\s*\{[^}]*aspect-ratio:\s*148\s*\/\s*210;[^}]*\}/s
  );
});

test('design-canvas.tsx wires notebook aspect ratio and binding guide', () => {
  const canvasPath = path.resolve(process.cwd(), 'src/components/customizer/design-canvas.tsx');
  const canvasCode = fs.readFileSync(canvasPath, 'utf8');

  assert.match(canvasCode, /NOTEBOOK_COVER_DEFINITION/);
  assert.match(canvasCode, /aspectRatio:\s*NOTEBOOK_COVER_DEFINITION\.aspectRatio/);
  assert.match(canvasCode, /data-ui-guide="notebook-binding"/);
  assert.match(canvasCode, /left-\[12%\]/);
  assert.match(canvasCode, /Vùng gần gáy/);
  assert.match(canvasCode, /rounded-r-xl/);
  assert.match(canvasCode, /rounded-l-xs/);
  assert.match(canvasCode, /shadow-xl/);
});
