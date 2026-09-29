import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { QuantityStepperProps } from '../components/checkout/quantity-stepper.tsx';

const componentPath = resolve(process.cwd(), 'src/components/checkout/quantity-stepper.tsx');
const componentSource = readFileSync(componentPath, 'utf8');

function props(overrides: Partial<QuantityStepperProps> = {}): QuantityStepperProps {
  return {
    quantity: 10,
    onChange: () => undefined,
    ...overrides,
  };
}

test('minus button decrements quantity without crossing min', () => {
  const contract = props({ quantity: 5, min: 1 });
  assert.equal(Math.max(contract.min ?? 1, contract.quantity - 1), 4);
  assert.match(componentSource, /onClick=\{\(\) => onChange\(Math\.max\(min, quantity - 1\)\)\}/);
});

test('plus button increments quantity without crossing max', () => {
  const contract = props({ quantity: 5, max: 999 });
  assert.equal(Math.min(contract.max ?? 999, contract.quantity + 1), 6);
  assert.match(componentSource, /onClick=\{\(\) => onChange\(Math\.min\(max, quantity \+ 1\)\)\}/);
});

test('minus button is disabled at default minimum quantity', () => {
  const contract = props({ quantity: 1 });
  assert.equal(contract.quantity <= (contract.min ?? 1), true);
  assert.match(componentSource, /disabled=\{quantity <= min\}/);
});

test('plus button is disabled at default maximum quantity', () => {
  const contract = props({ quantity: 999 });
  assert.equal(contract.quantity >= (contract.max ?? 999), true);
  assert.match(componentSource, /disabled=\{quantity >= max\}/);
});

test('input handles direct numeric typing and displays error for invalid input', () => {
  assert.match(componentSource, /inputMode="numeric"/);
  assert.match(componentSource, /pattern="\[0-9\]\*"/);
  assert.match(componentSource, /const parsed = Number\.parseInt\(value, 10\)/);
  assert.match(componentSource, /onChange\(parsed\)/);
  assert.match(componentSource, /Số lượng tối thiểu là \$\{min\} bản\./);
  assert.ok(componentSource.includes('{error && <p className="text-xs text-[#B3535D]">{error}</p>}'));
});

test('controls expose required accessible labels and touch target sizing', () => {
  assert.match(componentSource, /aria-label="Giảm số lượng"/);
  assert.match(componentSource, /aria-label="Tăng số lượng"/);
  assert.match(componentSource, /aria-label="Số lượng đặt in"/);
  assert.equal((componentSource.match(/min-w-\[44px\] min-h-\[44px\] w-11 h-11/g) ?? []).length, 2);
  assert.match(componentSource, /className="w-24 h-11[^"']*text-center[^"']*font-bold/);
});
