import { PRODUCTS, type ProductId } from './product-state.ts';
import { CATALOG_PRODUCTS } from './product-catalog.ts';
import { listSupportedTargetKeysFor } from './template-target.ts';

export type ProductDefinitionKey =
  | 'wrapping:a1'
  | 'wrapping:a2'
  | 'card:horizontal'
  | 'card:vertical'
  | 'sticker:die-cut'
  | 'sticker:fixed-shape'
  | 'sticker:phone'
  | 'notebook:standard';

export type ProductDefinitionCapabilities = {
  definitionKey: ProductDefinitionKey;
  productId: ProductId;
  variantId: string;
  familyLabel: string;
  physicalSummary: string;
  surfacesSummary: string;
  previewAvailable: boolean;
  productionRendererAvailable: boolean;
  templateTargetKeys: readonly string[];
};

const PRODUCT_DEFINITION_KEYS: readonly ProductDefinitionKey[] = [
  'wrapping:a1',
  'wrapping:a2',
  'card:horizontal',
  'card:vertical',
  'sticker:die-cut',
  'sticker:fixed-shape',
  'sticker:phone',
  'notebook:standard',
];

function buildCapabilities(key: ProductDefinitionKey): ProductDefinitionCapabilities {
  const [productId, variantId] = key.split(':') as [ProductId, string];
  const product = PRODUCTS[productId];
  const variant = product?.variants.find((item) => item.id === variantId);
  const catalogProduct = CATALOG_PRODUCTS[productId];
  const catalogVariant = catalogProduct?.variants.find((item) => item.id === variantId);

  const familyLabel = catalogProduct?.name ?? product?.name ?? productId;
  const physicalSummary = catalogVariant?.dimensions
    ? `${catalogVariant.name} · ${catalogVariant.dimensions}`
    : (variant?.name ?? variantId);
  const surfacesSummary = catalogProduct?.paperSpecs?.printSurfaces ?? '1 mặt';
  const templateTargetKeys = Object.freeze(listSupportedTargetKeysFor(productId, variantId));

  return Object.freeze({
    definitionKey: key,
    productId,
    variantId,
    familyLabel,
    physicalSummary,
    surfacesSummary,
    previewAvailable: true,
    productionRendererAvailable: true,
    templateTargetKeys,
  });
}

const REGISTRY_ENTRIES: readonly ProductDefinitionCapabilities[] = Object.freeze(
  PRODUCT_DEFINITION_KEYS.map(buildCapabilities),
);

const REGISTRY_BY_KEY: Readonly<Record<string, ProductDefinitionCapabilities>> = Object.freeze(
  Object.fromEntries(REGISTRY_ENTRIES.map((entry) => [entry.definitionKey, entry])),
);

export function resolveProductDefinition(
  productId: string,
  variantId: string,
): ProductDefinitionCapabilities | null {
  if (!productId || !variantId) return null;
  const key = `${productId.trim().toLowerCase()}:${variantId.trim().toLowerCase()}`;
  return REGISTRY_BY_KEY[key] ?? null;
}

export function listProductDefinitionCapabilities(): readonly ProductDefinitionCapabilities[] {
  return REGISTRY_ENTRIES;
}
