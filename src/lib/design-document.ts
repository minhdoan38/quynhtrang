import type {
  CanvasElement,
  DesignState,
  ProductId,
} from './product-state.ts';
import type {
  TemplateProvenance,
  TemplateTarget,
} from './domain/template.ts';

const VALID_PRODUCTS: Record<string, true> = {
  wrapping: true,
  card: true,
  sticker: true,
  notebook: true,
};

const VALID_ELEMENT_TYPES: Record<string, true> = {
  text: true,
  image: true,
  sticker: true,
  shape: true,
};

export function readDesignDocument(
  raw: unknown,
  schemaVersion: number,
  target?: TemplateTarget,
): DesignState {
  if (
    typeof schemaVersion !== 'number' ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 0 ||
    schemaVersion > 1
  ) {
    throw new Error(`Unsupported document schema version: ${String(schemaVersion)}`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid raw document: expected object, got ${raw === null ? 'null' : typeof raw}`);
  }

  const rawDoc = raw as Record<string, unknown>;

  const rawProductId = typeof rawDoc.productId === 'string' ? rawDoc.productId : undefined;
  const productId = (rawProductId ?? target?.productId) as ProductId | undefined;

  if (!productId || !VALID_PRODUCTS[productId]) {
    throw new Error(`Invalid or missing productId in document: ${String(productId)}`);
  }

  const rawVariantId = typeof rawDoc.variantId === 'string' ? rawDoc.variantId : undefined;
  const variantId = rawVariantId ?? target?.variantId;

  if (!variantId || typeof variantId !== 'string') {
    throw new Error(`Invalid or missing variantId in document: ${String(variantId)}`);
  }

  if (target) {
    if (rawProductId && rawProductId !== target.productId) {
      throw new Error(`Product mismatch: document has "${rawProductId}", target has "${target.productId}"`);
    }
    if (rawVariantId && rawVariantId !== target.variantId) {
      throw new Error(`Variant mismatch: document has "${rawVariantId}", target has "${target.variantId}"`);
    }
  }

  const templateId = typeof rawDoc.templateId === 'string' ? rawDoc.templateId : null;
  const text = typeof rawDoc.text === 'string' ? rawDoc.text : '';
  const color = typeof rawDoc.color === 'string' ? rawDoc.color : '#2E3338';
  const backgroundColor = typeof rawDoc.backgroundColor === 'string' ? rawDoc.backgroundColor : '#FFFDF8';
  const quantity =
    typeof rawDoc.quantity === 'number' && Number.isFinite(rawDoc.quantity) && rawDoc.quantity > 0
      ? rawDoc.quantity
      : 1;

  const image =
    rawDoc.image && typeof rawDoc.image === 'object'
      ? JSON.parse(JSON.stringify(rawDoc.image))
      : null;

  // Normalize productOptions
  const rawOptions = (rawDoc.productOptions && typeof rawDoc.productOptions === 'object' && !Array.isArray(rawDoc.productOptions))
    ? (rawDoc.productOptions as Record<string, unknown>)
    : {};

  let normalizedOptions: Record<string, unknown>;
  const nestedProductOptions = rawOptions[productId];

  if (nestedProductOptions && typeof nestedProductOptions === 'object' && !Array.isArray(nestedProductOptions)) {
    normalizedOptions = JSON.parse(JSON.stringify(nestedProductOptions));
    for (const [key, value] of Object.entries(rawOptions)) {
      if (!VALID_PRODUCTS[key] && !(key in normalizedOptions)) {
        normalizedOptions[key] = JSON.parse(JSON.stringify(value));
      }
    }
  } else {
    normalizedOptions = JSON.parse(JSON.stringify(rawOptions));
  }

  // Allowed surfaces
  const allowedSurfaces: Record<string, true> = {};
  if (target) {
    for (const s of target.surfaces) {
      allowedSurfaces[s.id] = true;
    }
  }

  // Normalize and validate elements
  const rawElements = Array.isArray(rawDoc.elements) ? rawDoc.elements : [];
  const elements: CanvasElement[] = [];
  const elementMap: Record<string, { id: string; parentGroupId?: string } | undefined> = {};
  const seenIds = new Set<string>();

  for (const rawEl of rawElements) {
    if (!rawEl || typeof rawEl !== 'object' || Array.isArray(rawEl)) {
      throw new Error('Element must be an object.');
    }
    const el = rawEl as Record<string, unknown>;

    const id = typeof el.id === 'string' ? el.id.trim() : '';
    if (!id) {
      throw new Error('Element must have a non-empty string id.');
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate element id "${id}".`);
    }
    seenIds.add(id);

    const type = typeof el.type === 'string' ? el.type : '';
    if (!VALID_ELEMENT_TYPES[type]) {
      throw new Error(`Invalid element type "${type}" on element "${id}".`);
    }

    const x = Number(el.x);
    const y = Number(el.y);
    const width = Number(el.width);
    const height = Number(el.height);
    const rotation = el.rotation !== undefined ? Number(el.rotation) : 0;

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isFinite(rotation)
    ) {
      throw new Error(`Non-finite frame coordinates on element "${id}".`);
    }

    if (width <= 0 || height <= 0) {
      throw new Error(`Negative or zero frame dimension on element "${id}" (${width}x${height}).`);
    }

    const rawSurface = typeof el.surface === 'string' ? el.surface : undefined;
    const defaultSurface = productId === 'wrapping' ? 'sheet' : 'front';
    const surface = rawSurface ?? defaultSurface;

    if (target && !allowedSurfaces[surface]) {
      throw new Error(`Invalid surface "${surface}" on element "${id}" for product "${productId}".`);
    }

    const parentGroupId =
      typeof el.parentGroupId === 'string' && el.parentGroupId.trim()
        ? el.parentGroupId.trim()
        : undefined;

    if (parentGroupId === id) {
      throw new Error(`Element "${id}" cannot be its own parent.`);
    }

    const clonedEl: CanvasElement = {
      id,
      type: type as CanvasElement['type'],
      x,
      y,
      width,
      height,
      rotation,
      locked: Boolean(el.locked),
      zIndex: typeof el.zIndex === 'number' && Number.isFinite(el.zIndex) ? el.zIndex : 1,
      surface: surface as CanvasElement['surface'],
      parentGroupId,
      data: el.data && typeof el.data === 'object' ? JSON.parse(JSON.stringify(el.data)) : {},
    };

    elements.push(clonedEl);
    elementMap[id] = clonedEl;
  }

  // Detect cyclic group hierarchy
  for (const element of elements) {
    if (element.parentGroupId) {
      const visited = new Set<string>([element.id]);
      let currentParentId: string | undefined = element.parentGroupId;

      while (currentParentId) {
        if (visited.has(currentParentId)) {
          throw new Error(`Cyclic group hierarchy detected involving element "${element.id}".`);
        }
        visited.add(currentParentId);
        const parentEl: { id: string; parentGroupId?: string } | undefined = elementMap[currentParentId];
        currentParentId = parentEl?.parentGroupId;
      }
    }
  }

  let sourceTemplate: TemplateProvenance | undefined;
  if (
    rawDoc.sourceTemplate &&
    typeof rawDoc.sourceTemplate === 'object' &&
    typeof (rawDoc.sourceTemplate as Record<string, unknown>).templateId === 'string' &&
    typeof (rawDoc.sourceTemplate as Record<string, unknown>).templateVersionId === 'string'
  ) {
    sourceTemplate = {
      templateId: (rawDoc.sourceTemplate as Record<string, unknown>).templateId as string,
      templateVersionId: (rawDoc.sourceTemplate as Record<string, unknown>).templateVersionId as string,
    };
  }

  return {
    productId,
    variantId,
    templateId,
    text,
    color,
    backgroundColor,
    image,
    quantity,
    productOptions: normalizedOptions,
    elements,
    sourceTemplate,
    documentSchemaVersion: 1,
  };
}
