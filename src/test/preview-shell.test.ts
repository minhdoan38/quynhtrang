import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { PreviewShellProps, PreviewViewId, PreviewViewOption } from '../components/customizer/preview/preview-types.ts';

const componentPath = resolve(
  process.cwd(),
  'src/components/customizer/preview/preview-shell.tsx',
);
const source = readFileSync(componentPath, 'utf8');

test('PreviewShell renders preview header, product titles, and actions', () => {
  assert.match(source, /^'use client';/);
  assert.match(source, /<h1[^>]*>Xem thử<\/h1>/);
  assert.match(source, /\{subtitle\}/);
  assert.match(source, />\s*Xong\s*<\/button>/);
});

test('PreviewShell renders view switcher only for multiple views and calls onViewChange', () => {
  assert.match(source, /availableViews && availableViews\.length > 1/);
  assert.match(source, /availableViews\.map\(\(view\) =>/);
  assert.match(source, /onClick=\{\(\) => onViewChange\?\.\(view\.id\)\}/);
  assert.match(source, /bg-white shadow-xs text-\[#2E3338\] font-semibold/);

  const activeView: PreviewViewId = 'flat';
  const views: PreviewViewOption[] = [
    { id: activeView, label: 'Phẳng' },
    { id: 'box', label: 'Hộp' },
  ];
  let selected: PreviewViewId | undefined;
  const props: PreviewShellProps = {
    productTitle: 'Túi vải',
    activeView,
    availableViews: views,
    onViewChange: (view) => {
      selected = view;
    },
    onBackToEdit: () => { },
    onDoneToPreflight: () => { },
    children: null,
  };
  props.onViewChange?.(views[1].id);
  assert.equal(selected, 'box');
});

test('PreviewShell wires edit and done action handlers', () => {
  assert.match(source, /onClick=\{onBackToEdit\}/);
  assert.match(source, /onClick=\{onDoneToPreflight\}/);

  let editCalls = 0;
  let doneCalls = 0;
  const props: PreviewShellProps = {
    productTitle: 'Thiệp',
    activeView: 'card-closed',
    onBackToEdit: () => {
      editCalls += 1;
    },
    onDoneToPreflight: () => {
      doneCalls += 1;
    },
    children: null,
  };
  props.onBackToEdit();
  props.onDoneToPreflight();
  assert.equal(editCalls, 1);
  assert.equal(doneCalls, 1);
});
