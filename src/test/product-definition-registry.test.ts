import test from 'node:test';
import assert from 'node:assert/strict';

import { PRODUCTS } from '../lib/product-state.ts';
import { CATALOG_PRODUCTS } from '../lib/product-catalog.ts';
import { listAllSupportedTargetKeys } from '../lib/template-target.ts';
import {
  listProductDefinitionCapabilities,
  resolveProductDefinition,
  type ProductDefinitionKey,
} from '../lib/product-definition-registry.ts';

const expectedDefinitionKeys: readonly ProductDefinitionKey[] = [
  'wrapping:a1',
  'wrapping:a2',
  'card:horizontal',
  'card:vertical',
  'sticker:die-cut',
  'sticker:fixed-shape',
  'sticker:phone',
  'notebook:standard',
];

test('maps every static product variant to one stable definition', () => {
  const definitions = listProductDefinitionCapabilities();

  assert.deepEqual(
    definitions.map(({ definitionKey }) => definitionKey),
    expectedDefinitionKeys,
  );
  for (const product of Object.values(PRODUCTS)) {
    for (const variant of product.variants) {
      const definition = resolveProductDefinition(product.id, variant.id);
      assert.ok(definition);
      assert.equal(definition.definitionKey, `${product.id}:${variant.id}`);
      assert.equal(definition.productId, product.id);
      assert.equal(definition.variantId, variant.id);
      assert.equal(definition.familyLabel, CATALOG_PRODUCTS[product.id].name);
    }
  }
});

test('exposes all exact supported template target keys', () => {
  const keys = listProductDefinitionCapabilities().flatMap(({ templateTargetKeys }) => [...templateTargetKeys]);

  assert.equal(keys.length, 14);
  assert.deepEqual([...keys].sort(), [...listAllSupportedTargetKeys()].sort());
});

test('returns null for unknown product or variant without fallback', () => {
  assert.equal(resolveProductDefinition('unknown', 'standard'), null);
  assert.equal(resolveProductDefinition('card', 'unknown'), null);
});

test('returns serializable capability metadata without implementation functions', () => {
  const definitions = listProductDefinitionCapabilities();
  const serialized = JSON.stringify(definitions);
  const parsed = JSON.parse(serialized) as unknown[];

  assert.deepEqual(parsed, definitions);
  for (const definition of definitions) {
    assert.equal(typeof definition.previewAvailable, 'boolean');
    assert.equal(typeof definition.productionRendererAvailable, 'boolean');
    assert.equal(Object.values(definition).some((value) => typeof value === 'function'), false);
  }
});
