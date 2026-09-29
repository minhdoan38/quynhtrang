import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialState,
  filterElementsBySurface,
  transitionState,
  type CanvasElement,
} from '../lib/product-state.ts';
import { loadState, saveState } from '../lib/storage.ts';
import { serverOrderStore } from '../lib/server-order-store.ts';
function setupSessionStorage() {
  const values = new Map<string, string>();
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    length: values.size,
  };
}

test('applying card templates populates front and inside surfaces', () => {
  for (const templateId of ['card-h-birthday', 'card-h-cute', 'card-v-floral']) {
    const state = transitionState(createInitialState('card'), { type: 'SET_TEMPLATE', value: templateId });
    assert.ok(filterElementsBySurface(state.elements, 'front').length > 0, `${templateId} front`);
    assert.ok(filterElementsBySurface(state.elements, 'inside').length > 0, `${templateId} inside`);
    assert.equal(filterElementsBySurface(state.elements, 'back').length, 0, `${templateId} back starts empty`);
  }
});

test('storage roundtrip preserves card surface on each element', () => {
  setupSessionStorage();
  const elements: CanvasElement[] = [
    { id: 'front', type: 'text', x: 10, y: 10, width: 40, height: 10, rotation: 0, surface: 'front' },
    { id: 'inside', type: 'text', x: 20, y: 20, width: 40, height: 10, rotation: 0, surface: 'inside' },
    { id: 'back', type: 'text', x: 30, y: 30, width: 40, height: 10, rotation: 0, surface: 'back' },
  ];
  const state = { ...createInitialState('card'), elements };

  assert.equal(saveState(state), true);
  const loaded = loadState();
  assert.deepEqual(loaded?.elements?.map((element) => element.surface), ['front', 'inside', 'back']);
});

test('empty card inside and back surfaces remain empty through serialization', () => {
  setupSessionStorage();
  const state = {
    ...createInitialState('card'), elements: [
      { id: 'front', type: 'text' as const, x: 10, y: 10, width: 40, height: 10, rotation: 0, surface: 'front' as const },
    ]
  };

  assert.equal(saveState(state), true);
  const loaded = loadState();
  assert.deepEqual(filterElementsBySurface(loaded?.elements, 'inside'), []);
  assert.deepEqual(filterElementsBySurface(loaded?.elements, 'back'), []);
});
test('serverOrderStore creates snapshot keeping all multi-surface elements intact', () => {
  const elements: CanvasElement[] = [
    { id: 'front-el', type: 'text', x: 10, y: 10, width: 40, height: 10, rotation: 0, surface: 'front' },
    { id: 'inside-el', type: 'text', x: 20, y: 20, width: 40, height: 10, rotation: 0, surface: 'inside' },
    { id: 'back-el', type: 'text', x: 30, y: 30, width: 40, height: 10, rotation: 0, surface: 'back' },
  ];
  const state = { ...createInitialState('card'), elements };
  const order = serverOrderStore.createOrder(state, {
    name: 'Nguyễn Văn A',
    phone: '0901234567',
    address: '123 Phố Huế, Hà Nội',
  });
  assert.ok(order.id);
  assert.equal(order.snapshot.design.elements?.length, 3);
  assert.deepEqual(
    order.snapshot.design.elements?.map((el) => el.surface),
    ['front', 'inside', 'back']
  );
});
