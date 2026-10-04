import { PRODUCTS, type ProductId } from './product-state.ts';
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
const FAMILY_LABELS: Record<ProductId, string> = {
  wrapping: 'Giấy gói quà',
  card: 'Thiệp chúc mừng',
  sticker: 'Sticker dán theo yêu cầu',
  notebook: 'Bìa sổ tay cá nhân hóa',
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
  const familyLabel = FAMILY_LABELS[productId];
  const physicalSummary = variant?.name ?? variantId;
  const surfacesSummary = productId === 'card' ? 'Tùy biến 3 mặt' : '1 mặt';
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
export function resolveProductDefinitionKey(definitionKey: string): ProductDefinitionCapabilities | null {
  const normalized = definitionKey.trim().toLowerCase();
  return normalized ? REGISTRY_BY_KEY[normalized] ?? null : null;
}

export function listProductDefinitionCapabilities(): readonly ProductDefinitionCapabilities[] {
  return REGISTRY_ENTRIES;
}
