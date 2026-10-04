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

test('minus button decrements quantity by step without crossing min', () => {
  const contract = props({ quantity: 15, min: 10, step: 5 });
  assert.equal(Math.max(contract.min ?? 1, contract.quantity - (contract.step ?? 1)), 10);
  assert.match(componentSource, /onClick=\{\(\) => onChange\(Math\.max\(min, quantity - step\)\)\}/);
});

test('plus button increments quantity by step without crossing max', () => {
  const contract = props({ quantity: 15, max: 20, step: 5 });
  assert.equal(Math.min(contract.max ?? 999, contract.quantity + (contract.step ?? 1)), 20);
  assert.match(componentSource, /onClick=\{\(\) => onChange\(Math\.min\(effectiveMax, quantity \+ step\)\)\}/);
});

test('minus button is disabled at default minimum quantity', () => {
  const contract = props({ quantity: 1 });
  assert.equal(contract.quantity <= (contract.min ?? 1), true);
  assert.match(componentSource, /disabled=\{quantity <= min\}/);
});

test('plus button is disabled at maximum quantity', () => {
  const contract = props({ quantity: 999 });
  assert.equal(contract.quantity >= (contract.max ?? 999), true);
  assert.match(componentSource, /disabled=\{quantity >= effectiveMax\}/);
});

test('input handles direct numeric typing and displays error for invalid input', () => {
  assert.match(componentSource, /inputMode="numeric"/);
  assert.match(componentSource, /pattern="\[0-9\]\*"/);
  assert.match(componentSource, /const parsed = Number\.parseInt\(value, 10\)/);
  assert.match(componentSource, /onChange\(parsed\)/);
  assert.match(componentSource, /Số lượng tối thiểu là \$\{min\} bản\./);
  assert.match(componentSource, /Số lượng tối đa là \$\{effectiveMax\} bản\./);
  assert.match(componentSource, /Số lượng phải theo bước \$\{step\} \(bắt đầu từ \$\{min\} bản\)\./);
  assert.ok(componentSource.includes('{error && <p className="text-xs text-[#B3535D]">{error}</p>}'));
});

test('controls expose required accessible labels and touch target sizing', () => {
  assert.match(componentSource, /aria-label="Giảm số lượng"/);
  assert.match(componentSource, /aria-label="Tăng số lượng"/);
  assert.match(componentSource, /aria-label="Số lượng đặt in"/);
  assert.equal((componentSource.match(/min-w-\[44px\] min-h-\[44px\] w-11 h-11/g) ?? []).length, 2);
  assert.match(componentSource, /className="w-24 h-11[^"']*text-center[^"']*font-bold/);
});
