import {
  FIXED_STICKER_SHAPES,
  getCardSpreadDimensions,
  getFixedStickerDimensions,
  NOTEBOOK_COVER_DEFINITION,
  type CardOrientation,
  type CardSurface,
  type DesignState,
  type FixedStickerShape,
  type ProductId,
} from './product-state.ts';
import { getWrappingPaperDimensions } from './pattern-renderer.ts';
import type {
  DependencyMetadataItem,
  TemplateAvailability,
  TemplateAvailabilityBlocker,
  TemplateAvailabilityDependencies,
  TemplateRecord,
  TemplateTarget,
  TemplateTargetInput,
  TemplateTargetSurface,
  TemplateVersionPayload,
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

const CARD_SURFACES_ORDER: readonly CardSurface[] = ['front', 'inside', 'back'];

export function createTemplateTarget(input: TemplateTargetInput): TemplateTarget {
  if (!VALID_PRODUCTS[input.productId]) {
    throw new Error(`Invalid productId: ${String(input.productId)}`);
  }

  let surfaces: TemplateTargetSurface[];

  switch (input.productId) {
    case 'card': {
      if (input.variantId !== 'horizontal' && input.variantId !== 'vertical') {
        throw new Error(`Invalid variantId for card: ${input.variantId}`);
      }
      if (input.mode !== null) {
        throw new Error(`Card target mode must be null, got: ${String(input.mode)}`);
      }
      if (input.shape !== null) {
        throw new Error(`Card target shape must be null, got: ${String(input.shape)}`);
      }

      const orientation = input.variantId as CardOrientation;
      surfaces = CARD_SURFACES_ORDER.map((surfaceId) => {
        const dims = getCardSpreadDimensions(orientation, surfaceId);
        return {
          id: surfaceId,
          widthMm: dims.width,
          heightMm: dims.height,
        };
      });
      break;
    }

    case 'wrapping': {
      const variant = input.variantId.toLowerCase();
      if (variant !== 'a1' && variant !== 'a2') {
        throw new Error(`Invalid variantId for wrapping: ${input.variantId}`);
      }
      if (input.mode !== 'pattern' && input.mode !== 'full-sheet') {
        throw new Error(`Wrapping target mode must be 'pattern' or 'full-sheet', got: ${String(input.mode)}`);
      }
      if (input.shape !== null) {
        throw new Error(`Wrapping target shape must be null, got: ${String(input.shape)}`);
      }

      const dims = getWrappingPaperDimensions(variant);
      surfaces = [
        {
          id: 'sheet',
          widthMm: dims.width,
          heightMm: dims.height,
        },
      ];
      break;
    }

    case 'notebook': {
      if (input.variantId !== 'standard') {
        throw new Error(`Invalid variantId for notebook: ${input.variantId}`);
      }
      if (input.mode !== null) {
        throw new Error(`Notebook target mode must be null, got: ${String(input.mode)}`);
      }
      if (input.shape !== null) {
        throw new Error(`Notebook target shape must be null, got: ${String(input.shape)}`);
      }

      surfaces = [
        {
          id: 'front',
          widthMm: NOTEBOOK_COVER_DEFINITION.widthMm,
          heightMm: NOTEBOOK_COVER_DEFINITION.heightMm,
        },
      ];
      break;
    }

    case 'sticker': {
      if (input.mode !== null) {
        throw new Error(`Sticker target mode must be null, got: ${String(input.mode)}`);
      }

      if (input.variantId === 'fixed-shape') {
        if (!input.shape || !FIXED_STICKER_SHAPES.includes(input.shape)) {
          throw new Error(`Fixed-shape sticker requires a valid shape, got: ${String(input.shape)}`);
        }
        const dims = getFixedStickerDimensions(input.shape);
        surfaces = [
          {
            id: 'front',
            widthMm: dims.width,
            heightMm: dims.height,
          },
        ];
      } else if (input.variantId === 'die-cut' || input.variantId === 'phone') {
        if (input.shape !== null) {
          throw new Error(`${input.variantId} sticker shape must be null, got: ${String(input.shape)}`);
        }
        surfaces = [
          {
            id: 'front',
            widthMm: 50,
            heightMm: 50,
          },
        ];
      } else {
        throw new Error(`Invalid variantId for sticker: ${input.variantId}`);
      }
      break;
    }

    default:
      throw new Error(`Unsupported productId: ${String(input.productId)}`);
  }

  const surfaceKeys = surfaces.map((s) => `${s.id}-${s.widthMm}x${s.heightMm}`).join('_');
  const geometryKey = `${input.productId}:${input.variantId}:mode:${input.mode ?? 'none'}:shape:${input.shape ?? 'none'}:surfaces:${surfaceKeys}`;

  return {
    productId: input.productId,
    variantId: input.variantId,
    mode: input.mode,
    shape: input.shape,
    surfaces,
    geometryKey,
  };
}

export function templateTargetsEqual(a: TemplateTarget, b: TemplateTarget): boolean {
  return (
    a.productId === b.productId &&
    a.variantId === b.variantId &&
    a.mode === b.mode &&
    a.shape === b.shape &&
    a.geometryKey === b.geometryKey
  );
}

export interface ValidationFinding {
  code: string;
  elementId?: string;
  message?: string;
}

export function validateTemplateDocument(
  document: DesignState,
  target: TemplateTarget,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (document.productId !== target.productId) {
    findings.push({
      code: 'PRODUCT_MISMATCH',
      message: `Document productId "${document.productId}" does not match target productId "${target.productId}".`,
    });
  }

  if (document.variantId !== target.variantId) {
    findings.push({
      code: 'VARIANT_MISMATCH',
      message: `Document variantId "${document.variantId}" does not match target variantId "${target.variantId}".`,
    });
  }

  const options = (document.productOptions || {}) as Record<string, unknown>;

  if (target.productId === 'wrapping' && target.mode) {
    const docMode = options.mode ?? (options.wrapping as Record<string, unknown> | undefined)?.mode;
    if (docMode && docMode !== target.mode) {
      findings.push({
        code: 'MODE_MISMATCH',
        message: `Wrapping document mode "${String(docMode)}" does not match target mode "${target.mode}".`,
      });
    }
  }

  if (target.productId === 'sticker' && target.variantId === 'fixed-shape' && target.shape) {
    const docShape = options.shape ?? (options.sticker as Record<string, unknown> | undefined)?.shape;
    if (docShape && docShape !== target.shape) {
      findings.push({
        code: 'SHAPE_MISMATCH',
        message: `Fixed-shape sticker document shape "${String(docShape)}" does not match target shape "${target.shape}".`,
      });
    }
  }

  const allowedSurfaces: Record<string, true> = {};
  for (const surface of target.surfaces) {
    allowedSurfaces[surface.id] = true;
  }

  const elements = document.elements ?? [];
  const seenIds = new Set<string>();
  const elementMap: Record<string, { id: string; parentGroupId?: string }> = {};

  for (const element of elements) {
    if (typeof element.id !== 'string' || !element.id.trim()) {
      findings.push({
        code: 'INVALID_ELEMENT_ID',
        message: 'Element must have a non-empty string id.',
      });
    } else {
      if (seenIds.has(element.id)) {
        findings.push({
          code: 'DUPLICATE_ELEMENT_ID',
          elementId: element.id,
          message: `Duplicate element id "${element.id}".`,
        });
      }
      seenIds.add(element.id);
      elementMap[element.id] = element;
    }

    if (!VALID_ELEMENT_TYPES[element.type]) {
      findings.push({
        code: 'INVALID_ELEMENT_TYPE',
        elementId: element.id,
        message: `Invalid element type "${element.type}".`,
      });
    }

    if (
      !Number.isFinite(element.x) ||
      !Number.isFinite(element.y) ||
      !Number.isFinite(element.width) ||
      !Number.isFinite(element.height) ||
      (element.rotation !== undefined && !Number.isFinite(element.rotation))
    ) {
      findings.push({
        code: 'NON_FINITE_FRAME',
        elementId: element.id,
        message: `Element "${element.id}" has non-finite frame coordinates.`,
      });
    } else if (element.width <= 0 || element.height <= 0) {
      findings.push({
        code: 'NEGATIVE_FRAME',
        elementId: element.id,
        message: `Element "${element.id}" has non-positive width or height (${element.width}x${element.height}).`,
      });
    }

    const elementSurface = element.surface ?? (target.productId === 'wrapping' ? 'sheet' : 'front');
    if (!allowedSurfaces[elementSurface]) {
      findings.push({
        code: 'INVALID_SURFACE',
        elementId: element.id,
        message: `Element "${element.id}" uses surface "${elementSurface}", which is not allowed for ${target.productId}.`,
      });
    }
  }

  // Validate group parents and detect cycles
  for (const element of elements) {
    if (element.parentGroupId) {
      if (element.parentGroupId === element.id) {
        findings.push({
          code: 'INVALID_GROUP_PARENT',
          elementId: element.id,
          message: `Element "${element.id}" cannot be its own parent.`,
        });
        continue;
      }

      // Check cycles
      const visited = new Set<string>([element.id]);
      let currentParentId: string | undefined = element.parentGroupId;

      while (currentParentId) {
        if (visited.has(currentParentId)) {
          findings.push({
            code: 'CYCLIC_GROUP',
            elementId: element.id,
            message: `Cyclic group hierarchy detected starting at element "${element.id}".`,
          });
          break;
        }
        visited.add(currentParentId);
        const parentEl: { id: string; parentGroupId?: string } | undefined = elementMap[currentParentId];
        currentParentId = parentEl?.parentGroupId;
      }
    }
  }

  return findings;
}

export type TemplateAvailabilityTemplateInput = Partial<TemplateRecord> & {
  id?: string;
  status: 'draft' | 'published' | 'archived';
  currentPublishedVersionId?: string | null;
  target?: TemplateTargetInput | TemplateTarget | null;
};

export type TemplateAvailabilityVersionInput = Partial<TemplateVersionPayload> & {
  id?: string;
  templateId?: string;
  version?: number;
  target?: TemplateTargetInput | TemplateTarget | null;
  dependencies?: { kind: 'font-face' | 'sticker'; id: string; checksum?: string }[] | null;
};

export function getTemplateAvailability(
  template: TemplateAvailabilityTemplateInput,
  version: TemplateAvailabilityVersionInput | null | undefined,
  dependencies?: TemplateAvailabilityDependencies,
): TemplateAvailability {
  const blockers: TemplateAvailabilityBlocker[] = [];

  if (template.status === 'archived') {
    blockers.push({
      code: 'TEMPLATE_ARCHIVED',
      message: 'Mẫu thiết kế đã được lưu trữ.',
    });
  }

  if (!template.currentPublishedVersionId || !version) {
    blockers.push({
      code: 'NO_PUBLISHED_VERSION',
      message: 'Mẫu thiết kế chưa có phiên bản xuất bản.',
    });
    return { available: false, blockers };
  }

  // Target validity checks
  let resolvedTmplTarget: TemplateTarget | null = null;
  if (template.target) {
    try {
      resolvedTmplTarget = createTemplateTarget(template.target);
    } catch {
      blockers.push({
        code: 'INVALID_PRODUCT_TARGET',
        message: 'Mục tiêu sản phẩm của mẫu không hợp lệ.',
      });
    }
  }

  if (version.target) {
    try {
      const resolvedVerTarget = createTemplateTarget(version.target);
      if (resolvedTmplTarget && !templateTargetsEqual(resolvedTmplTarget, resolvedVerTarget)) {
        blockers.push({
          code: 'INVALID_PRODUCT_TARGET',
          message: 'Mục tiêu sản phẩm của phiên bản không khớp với mẫu.',
        });
      }
    } catch {
      blockers.push({
        code: 'INVALID_PRODUCT_TARGET',
        message: 'Mục tiêu sản phẩm của phiên bản không hợp lệ.',
      });
    }
  }

  // Version integrity checks
  if (template.id && version.templateId && template.id !== version.templateId) {
    blockers.push({
      code: 'VERSION_INVALID',
      message: 'Phiên bản không thuộc về mẫu thiết kế này.',
    });
  }

  if (dependencies?.assetManifestHealthy === false) {
    blockers.push({
      code: 'VERSION_INVALID',
      message: 'Tập tin tài sản của phiên bản không hợp lệ hoặc bị thiếu.',
    });
  }

  // Dependency status checks
  const versionDeps = version.dependencies ?? [];
  const lookup = dependencies?.lookup;

  const getDepMeta = (kind: string, id: string): DependencyMetadataItem | undefined => {
    if (!lookup) return undefined;
    if (lookup instanceof Map) {
      return lookup.get(`${kind}:${id}`) ?? lookup.get(id);
    }
    const record = lookup as Record<string, DependencyMetadataItem>;
    return record[`${kind}:${id}`] ?? record[id];
  };

  for (const dep of versionDeps) {
    const meta = getDepMeta(dep.kind, dep.id);
    if (!meta) {
      blockers.push({
        code: 'MISSING_DEPENDENCY',
        kind: dep.kind,
        id: dep.id,
        message: `Tài nguyên ${dep.kind} "${dep.id}" không tồn tại.`,
      });
    } else if (meta.status === 'archived') {
      blockers.push({
        code: 'ARCHIVED_DEPENDENCY',
        kind: dep.kind,
        id: dep.id,
        message: `Tài nguyên ${dep.kind} "${dep.id}" đã bị lưu trữ.`,
      });
    } else if (meta.status === 'draft') {
      blockers.push({
        code: 'UNPUBLISHED_DEPENDENCY',
        kind: dep.kind,
        id: dep.id,
        message: `Tài nguyên ${dep.kind} "${dep.id}" chưa được xuất bản.`,
      });
    } else if (dep.kind === 'font-face' && meta.familyStatus === 'archived') {
      blockers.push({
        code: 'ARCHIVED_DEPENDENCY',
        kind: 'font-family',
        id: meta.familyId ?? meta.familyName ?? dep.id,
        message: `Bộ font của phông chữ "${dep.id}" đã bị lưu trữ.`,
      });
    } else if (dep.checksum && meta.checksum && dep.checksum !== meta.checksum) {
      blockers.push({
        code: 'VERSION_INVALID',
        kind: dep.kind,
        id: dep.id,
        message: `Mã kiểm tra của tài nguyên ${dep.kind} "${dep.id}" không khớp.`,
      });
    }
  }

  return {
    available: blockers.length === 0,
    blockers,
  };
}

export function listAllSupportedTargetKeys(): string[] {
  const targets: TemplateTarget[] = [
    createTemplateTarget({ productId: 'card', variantId: 'horizontal', mode: null, shape: null }),
    createTemplateTarget({ productId: 'card', variantId: 'vertical', mode: null, shape: null }),
    createTemplateTarget({ productId: 'wrapping', variantId: 'a1', mode: 'pattern', shape: null }),
    createTemplateTarget({ productId: 'wrapping', variantId: 'a1', mode: 'full-sheet', shape: null }),
    createTemplateTarget({ productId: 'wrapping', variantId: 'a2', mode: 'pattern', shape: null }),
    createTemplateTarget({ productId: 'wrapping', variantId: 'a2', mode: 'full-sheet', shape: null }),
    createTemplateTarget({ productId: 'notebook', variantId: 'standard', mode: null, shape: null }),
    createTemplateTarget({ productId: 'sticker', variantId: 'die-cut', mode: null, shape: null }),
    createTemplateTarget({ productId: 'sticker', variantId: 'phone', mode: null, shape: null }),
    createTemplateTarget({ productId: 'sticker', variantId: 'fixed-shape', mode: null, shape: 'circle' }),
    createTemplateTarget({ productId: 'sticker', variantId: 'fixed-shape', mode: null, shape: 'square' }),
    createTemplateTarget({ productId: 'sticker', variantId: 'fixed-shape', mode: null, shape: 'rectangle' }),
    createTemplateTarget({ productId: 'sticker', variantId: 'fixed-shape', mode: null, shape: 'oval' }),
    createTemplateTarget({ productId: 'sticker', variantId: 'fixed-shape', mode: null, shape: 'rounded-rectangle' }),
  ];

  return targets.map((t) => t.geometryKey);
}
