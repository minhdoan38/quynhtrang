export type ProductId = 'wrapping' | 'card' | 'sticker' | 'notebook';

export interface ProductVariant {
  readonly id: string;
  readonly name: string;
  readonly price: number;
}

export interface WrappingOptions {
  mode: 'repeat' | 'single';
  repeatStyle: 'regular' | 'scattered' | 'brick';
  patternScale: number;
  spacingX: number;
  spacingY: number;
  rotation: number;
  [key: string]: unknown;
}

export interface CardOptions {
  surface: 'front' | 'inside';
  fold?: 'half' | 'flat';
  [key: string]: unknown;
}

export interface StickerOptions {
  borderWidth: number;
  hasWhiteBorder: boolean;
  [key: string]: unknown;
}

export interface NotebookOptions {
  finish: 'matte' | 'glossy';
  [key: string]: unknown;
}

export type ProductOptions = WrappingOptions | CardOptions | StickerOptions | NotebookOptions | Record<string, unknown>;

export interface ProductConfig {
  readonly id: ProductId;
  readonly name: string;
  readonly defaultVariant: string;
  readonly variants: readonly ProductVariant[];
  readonly defaultOptions: Readonly<Record<string, unknown>>;
}

export interface ImageState {
  name: string;
  type?: string;
  size?: number;
  src: string;
  width?: number;
  height?: number;
}
export type ElementType = 'image' | 'text' | 'shape' | 'sticker' | 'group';

export interface CanvasElement {
  id: string;
  type: ElementType;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked?: boolean;
  zIndex?: number;
  parentGroupId?: string;
  surface?: 'front' | 'inside';
  data?: Record<string, unknown>;
}

export interface DesignState {
  productId: ProductId;
  variantId: string;
  templateId: string | null;
  text: string;
  color: string;
  backgroundColor: string;
  image: ImageState | null;
  quantity: number;
  productOptions: Record<string, unknown>;
  elements?: CanvasElement[];
}

export type DesignAction =
  | { type: 'SET_PRODUCT'; value: ProductId }
  | { type: 'SET_VARIANT'; value: string }
  | { type: 'SET_TEMPLATE'; value: string }
  | { type: 'SET_TEXT'; value: string }
  | { type: 'SET_COLOR'; value: string }
  | { type: 'SET_BACKGROUND_COLOR'; value: string }
  | { type: 'SET_IMAGE'; value: ImageState | null }
  | { type: 'SET_QUANTITY'; value: number | string }
  | { type: 'SET_PRODUCT_OPTION'; key: string; value: unknown }
  | { type: 'MOVE_ELEMENT'; id: string; x: number; y: number }
  | { type: 'RESIZE_ELEMENT'; id: string; width: number; height: number; x?: number; y?: number }
  | { type: 'ROTATE_ELEMENT'; id: string; rotation: number }
  | { type: 'LOCK_ELEMENT'; id: string; locked: boolean }
  | { type: 'SET_ELEMENTS'; value: CanvasElement[] }
  | { type: 'UPDATE_ELEMENT'; id: string; patch: Partial<CanvasElement> }
  | { type: 'ADD_CANVAS_ELEMENT'; element: CanvasElement }
  | { type: 'REMOVE_CANVAS_ELEMENT'; id: string }
  | { type: 'REORDER_ELEMENTS'; orderedIds: string[] }
  | { type: 'DUPLICATE_ELEMENT'; id: string }
  | { type: 'DELETE_ELEMENT'; id: string }
  | { type: 'BRING_FORWARD'; id: string }
  | { type: 'SEND_BACKWARD'; id: string };
export interface DesignSummary {
  product: string;
  variant: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceLabel: string;
}

export interface PreflightCheck {
  id: string;
  level: 'pass' | 'warning' | 'error';
  label: string;
}

export interface PreflightResult {
  level: 'pass' | 'warning' | 'error';
  checks: PreflightCheck[];
}

export const PRODUCTS: Readonly<Record<ProductId, ProductConfig>> = Object.freeze({
  wrapping: Object.freeze({
    id: 'wrapping' as const,
    name: 'Giấy gói quà',
    defaultVariant: 'a1',
    variants: Object.freeze([
      Object.freeze({ id: 'a1', name: 'Khổ A1', price: 69000 }),
      Object.freeze({ id: 'a2', name: 'Khổ A2', price: 49000 }),
    ]),
    defaultOptions: Object.freeze({
      mode: 'repeat',
      repeatStyle: 'regular',
      patternScale: 100,
      spacingX: 0,
      spacingY: 0,
      rotation: 0,
    }),
  }),
  card: Object.freeze({
    id: 'card' as const,
    name: 'Thiệp chúc mừng',
    defaultVariant: 'horizontal',
    variants: Object.freeze([
      Object.freeze({ id: 'horizontal', name: 'Thiệp ngang', price: 29000 }),
      Object.freeze({ id: 'vertical', name: 'Thiệp đứng', price: 29000 }),
    ]),
    defaultOptions: Object.freeze({
      surface: 'front',
    }),
  }),
  sticker: Object.freeze({
    id: 'sticker' as const,
    name: 'Sticker cắt rời',
    defaultVariant: 'die-cut',
    variants: Object.freeze([
      Object.freeze({ id: 'die-cut', name: 'Cắt theo hình (Die-cut)', price: 19000 }),
      Object.freeze({ id: 'fixed-shape', name: 'Hình cố định (Fixed Shape)', price: 19000 }),
      Object.freeze({ id: 'phone', name: 'Sticker điện thoại (Phone Sticker)', price: 25000 }),
    ]),
    defaultOptions: Object.freeze({
      borderWidth: 4,
      hasWhiteBorder: true,
    }),
  }),
  notebook: Object.freeze({
    id: 'notebook' as const,
    name: 'Bìa sổ tay',
    defaultVariant: 'standard',
    variants: Object.freeze([
      Object.freeze({ id: 'standard', name: 'Tiêu chuẩn', price: 49000 }),
    ]),
    defaultOptions: Object.freeze({
      finish: 'matte',
    }),
  }),
});

export type TemplateCategory = 'all' | 'birthday' | 'cute' | 'floral' | 'minimal' | 'love' | 'thanks';

export interface TemplateConfig {
  name: string;
  category: TemplateCategory;
  productIds?: readonly ProductId[];
  variantIds?: readonly string[];
  text: string;
  color: string;
  backgroundColor: string;
  previewHint?: string;
  productOptions: Readonly<Partial<Record<ProductId, Readonly<Record<string, unknown>>>>>;
}

export const TEMPLATES: Readonly<Record<string, TemplateConfig>> = Object.freeze({
  blank: Object.freeze({
    name: 'Trống',
    category: 'minimal',
    text: '',
    color: '#111827',
    backgroundColor: '#ffffff',
    previewHint: 'Bắt đầu từ trang trắng',
    productOptions: Object.freeze({}),
  }),
  minimal: Object.freeze({
    name: 'Tối giản',
    category: 'minimal',
    text: 'Dành riêng cho bạn',
    color: '#243447',
    backgroundColor: '#f5f1e8',
    previewHint: 'Đường nét thanh lịch, gam màu trung tính',
    productOptions: Object.freeze({
      wrapping: Object.freeze({ mode: 'single', repeatStyle: 'regular', patternScale: 90 }),
      card: Object.freeze({ surface: 'front', fold: 'half' }),
      sticker: Object.freeze({ hasWhiteBorder: true, borderWidth: 6 }),
      notebook: Object.freeze({ finish: 'matte' }),
    }),
  }),
  celebrate: Object.freeze({
    name: 'Tiệc tùng',
    category: 'birthday',
    text: 'Chúc mừng!',
    color: '#7c2d12',
    backgroundColor: '#fef3c7',
    previewHint: 'Rực rỡ cho các dịp sinh nhật và kỷ niệm',
    productOptions: Object.freeze({
      wrapping: Object.freeze({ mode: 'repeat', repeatStyle: 'brick', patternScale: 125 }),
      card: Object.freeze({ surface: 'inside', fold: 'half' }),
      sticker: Object.freeze({ hasWhiteBorder: true, borderWidth: 10 }),
      notebook: Object.freeze({ finish: 'glossy' }),
    }),
  }),
  // Thêm template chuyên biệt theo yêu cầu Screen 03
  'card-h-birthday': Object.freeze({
    name: 'Sinh nhật ấm áp',
    category: 'birthday',
    productIds: ['card'] as const,
    variantIds: ['horizontal'] as const,
    text: 'Happy Birthday to You',
    color: '#B86C84',
    backgroundColor: '#FFFDF8',
    previewHint: 'Thiết kế thiệp ngang nhẹ nhàng',
    productOptions: Object.freeze({
      card: Object.freeze({ surface: 'front', fold: 'half' }),
    }),
  }),
  'card-h-cute': Object.freeze({
    name: 'Gấu con đáng yêu',
    category: 'cute',
    productIds: ['card'] as const,
    variantIds: ['horizontal'] as const,
    text: 'You are so special!',
    color: '#315F86',
    backgroundColor: '#F8F3E8',
    previewHint: 'Hình vẽ ngọt ngào cho người thương',
    productOptions: Object.freeze({
      card: Object.freeze({ surface: 'front', fold: 'half' }),
    }),
  }),
  'card-h-love': Object.freeze({
    name: 'Tình yêu dịu êm',
    category: 'love',
    productIds: ['card'] as const,
    variantIds: ['horizontal'] as const,
    text: 'Forever & Always',
    color: '#B3535D',
    backgroundColor: '#FFF8F8',
    previewHint: 'Tông hoa hồng lãng mạn',
    productOptions: Object.freeze({
      card: Object.freeze({ surface: 'front', fold: 'half' }),
    }),
  }),
  'card-v-floral': Object.freeze({
    name: 'Nhành hoa nhỏ',
    category: 'floral',
    productIds: ['card'] as const,
    variantIds: ['vertical'] as const,
    text: 'Lời chúc yêu thương',
    color: '#2E3338',
    backgroundColor: '#FAF7F0',
    previewHint: 'Thiệp đứng họa tiết thực vật tinh tế',
    productOptions: Object.freeze({
      card: Object.freeze({ surface: 'front', fold: 'half' }),
    }),
  }),
  'card-thanks': Object.freeze({
    name: 'Lời cảm ơn',
    category: 'thanks',
    productIds: ['card'] as const,
    text: 'Thank you so much',
    color: '#5F7E67',
    backgroundColor: '#F3F6F3',
    previewHint: 'Gam xanh xô thơm trang nhã',
    productOptions: Object.freeze({
      card: Object.freeze({ surface: 'front', fold: 'half' }),
    }),
  }),
  'wrapping-a1-cute': Object.freeze({
    name: 'Họa tiết Cute A1',
    category: 'cute',
    productIds: ['wrapping'] as const,
    variantIds: ['a1'] as const,
    text: 'Sweet Gift',
    color: '#315F86',
    backgroundColor: '#F4EAE1',
    previewHint: 'Lưới hoa văn nhỏ xinh vừa khổ A1',
    productOptions: Object.freeze({
      wrapping: Object.freeze({ mode: 'repeat', repeatStyle: 'half-drop', patternScale: 110 }),
    }),
  }),
  'wrapping-a1-floral': Object.freeze({
    name: 'Vườn hoa Pastel A1',
    category: 'floral',
    productIds: ['wrapping'] as const,
    variantIds: ['a1'] as const,
    text: 'For You',
    color: '#7c2d12',
    backgroundColor: '#F9F4EE',
    previewHint: 'Họa tiết hoa rải đều khổ A1',
    productOptions: Object.freeze({
      wrapping: Object.freeze({ mode: 'repeat', repeatStyle: 'brick', patternScale: 130 }),
    }),
  }),
  'wrapping-a2-minimal': Object.freeze({
    name: 'Kẻ sọc Minimal A2',
    category: 'minimal',
    productIds: ['wrapping'] as const,
    variantIds: ['a2'] as const,
    text: 'Simple Joy',
    color: '#2E3338',
    backgroundColor: '#EFECE6',
    previewHint: 'Họa tiết kẻ sọc tối giản vừa vặn khổ A2',
    productOptions: Object.freeze({
      wrapping: Object.freeze({ mode: 'repeat', repeatStyle: 'regular', patternScale: 85 }),
    }),
  }),
  'sticker-diecut-love': Object.freeze({
    name: 'Trái tim viền trắng',
    category: 'love',
    productIds: ['sticker'] as const,
    variantIds: ['die-cut'] as const,
    text: 'Love',
    color: '#B3535D',
    backgroundColor: '#FFFFFF',
    previewHint: 'Tạo đường cắt die-cut ôm sát hình',
    productOptions: Object.freeze({
      sticker: Object.freeze({ hasWhiteBorder: true, borderWidth: 8, cutLineMode: 'die-cut' }),
    }),
  }),
  'sticker-cute-pack': Object.freeze({
    name: 'Sticker Mèo con',
    category: 'cute',
    productIds: ['sticker'] as const,
    text: 'Meow',
    color: '#2E3338',
    backgroundColor: '#FFFFFF',
    previewHint: 'Họa tiết nhí nhảnh dán điện thoại & vở',
    productOptions: Object.freeze({
      sticker: Object.freeze({ hasWhiteBorder: true, borderWidth: 6 }),
    }),
  }),
  'notebook-floral': Object.freeze({
    name: 'Khu vườn bí mật',
    category: 'floral',
    productIds: ['notebook'] as const,
    text: 'My Daily Journal',
    color: '#2E3338',
    backgroundColor: '#EDE8DF',
    previewHint: 'Bìa sổ tay họa tiết thực vật nhã nhặn',
    productOptions: Object.freeze({
      notebook: Object.freeze({ finish: 'matte' }),
    }),
  }),
});

export interface FilterTemplatesParams {
  productId: ProductId;
  variantId: string;
  category?: string;
  searchQuery?: string;
}

export function getCompatibleTemplates({
  productId,
  variantId,
  category = 'all',
  searchQuery = '',
}: FilterTemplatesParams): Array<{ id: string; template: TemplateConfig }> {
  const query = searchQuery.trim().toLowerCase();

  return Object.entries(TEMPLATES)
    .filter(([, tpl]) => {
      // Product compatibility
      if (tpl.productIds && !tpl.productIds.includes(productId)) {
        return false;
      }
      // Variant compatibility
      if (tpl.variantIds && !tpl.variantIds.includes(variantId)) {
        return false;
      }
      // Category filter
      if (category && category !== 'all' && tpl.category !== category) {
        return false;
      }
      // Search query filter
      if (query) {
        const matchName = tpl.name.toLowerCase().includes(query);
        const matchText = tpl.text.toLowerCase().includes(query);
        const matchHint = (tpl.previewHint || '').toLowerCase().includes(query);
        if (!matchName && !matchText && !matchHint) {
          return false;
        }
      }
      return true;
    })
    .map(([id, template]) => ({ id, template }));
}

export function normalizeQuantity(value: unknown, fallback = 1): number {
  const quantity = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value), 10);
  const safeFallback = Number.isFinite(fallback) ? Math.min(999, Math.max(1, Math.trunc(fallback))) : 1;
  return Number.isFinite(quantity) ? Math.min(999, Math.max(1, quantity)) : safeFallback;
}

function cloneOptions(productId: ProductId): Record<string, unknown> {
  const prod = PRODUCTS[productId] ?? PRODUCTS.wrapping;
  return { ...prod.defaultOptions };
}

export function getDefaultElements(state: DesignState): CanvasElement[] {
  const elements: CanvasElement[] = [];
  if (state.image) {
    elements.push({
      id: 'image-1',
      type: 'image',
      x: 50,
      y: 45,
      width: 60,
      height: 60,
      rotation: 0,
      locked: Boolean(state.productOptions.isLocked),
      zIndex: 1,
      data: { src: state.image.src, name: state.image.name },
    });
  }
  if (state.text) {
    elements.push({
      id: 'text-1',
      type: 'text',
      x: 50,
      y: 75,
      width: 70,
      height: 20,
      rotation: 0,
      locked: false,
      zIndex: 2,
      data: { text: state.text, color: state.color },
    });
  }
  return elements;
}

export function createInitialState(productId: ProductId = 'wrapping'): DesignState {
  const prod = PRODUCTS[productId] ?? PRODUCTS.wrapping;
  return {
    productId: prod.id,
    variantId: prod.defaultVariant,
    templateId: null,
    text: '',
    color: '#111827',
    backgroundColor: '#ffffff',
    image: null,
    quantity: 1,
    productOptions: cloneOptions(prod.id),
  };
}

export function transitionState(state: DesignState, action: DesignAction): DesignState {
  if (!state || !action) {
    return state;
  }

  switch (action.type) {
    case 'SET_PRODUCT': {
      const nextProduct = PRODUCTS[action.value] ?? PRODUCTS.wrapping;
      return {
        ...state,
        productId: nextProduct.id,
        variantId: nextProduct.defaultVariant,
        templateId: null,
        productOptions: cloneOptions(nextProduct.id),
      };
    }

    case 'SET_VARIANT': {
      const currentProduct = PRODUCTS[state.productId] ?? PRODUCTS.wrapping;
      const hasVariant = currentProduct.variants.some((v) => v.id === action.value);
      return {
        ...state,
        variantId: hasVariant ? action.value : state.variantId,
      };
    }

    case 'SET_TEMPLATE': {
      const template = TEMPLATES[action.value];
      if (!template) return state;
      return {
        ...state,
        templateId: action.value,
        text: template.text,
        color: template.color,
        backgroundColor: template.backgroundColor,
        image: null,
        productOptions: {
          ...cloneOptions(state.productId),
          ...(template.productOptions[state.productId] || {}),
        },
      };
    }

    case 'SET_TEXT':
      return {
        ...state,
        text: String(action.value ?? ''),
      };

    case 'SET_COLOR':
      return {
        ...state,
        color: action.value ?? state.color,
      };

    case 'SET_BACKGROUND_COLOR':
      return {
        ...state,
        backgroundColor: action.value ?? state.backgroundColor,
      };

    case 'SET_IMAGE':
      return {
        ...state,
        image: action.value ?? null,
      };

    case 'SET_QUANTITY':
      return {
        ...state,
        quantity: normalizeQuantity(action.value, state.quantity),
      };

    case 'SET_PRODUCT_OPTION': {
      if (!action.key) {
        return state;
      }
      return {
        ...state,
        productOptions: {
          ...state.productOptions,
          [action.key]: action.value,
        },
      };
    }
    case 'MOVE_ELEMENT': {
      const list = state.elements ?? getDefaultElements(state);
      const target = list.find((el) => el.id === action.id);
      if (!target || target.locked) return state;
      return {
        ...state,
        elements: list.map((el) => (el.id === action.id ? { ...el, x: action.x, y: action.y } : el)),
      };
    }

    case 'RESIZE_ELEMENT': {
      const list = state.elements ?? getDefaultElements(state);
      const target = list.find((el) => el.id === action.id);
      if (!target || target.locked) return state;
      return {
        ...state,
        elements: list.map((el) =>
          el.id === action.id
            ? {
              ...el,
              width: action.width,
              height: action.height,
              ...(action.x !== undefined ? { x: action.x } : {}),
              ...(action.y !== undefined ? { y: action.y } : {}),
            }
            : el
        ),
      };
    }

    case 'ROTATE_ELEMENT': {
      const list = state.elements ?? getDefaultElements(state);
      const target = list.find((el) => el.id === action.id);
      if (!target || target.locked) return state;
      return {
        ...state,
        elements: list.map((el) =>
          el.id === action.id ? { ...el, rotation: ((action.rotation % 360) + 360) % 360 } : el
        ),
      };
    }

    case 'LOCK_ELEMENT': {
      const list = state.elements ?? getDefaultElements(state);
      return {
        ...state,
        elements: list.map((el) => (el.id === action.id ? { ...el, locked: action.locked } : el)),
      };
    }

    case 'SET_ELEMENTS': {
      return {
        ...state,
        elements: action.value,
      };
    }

    case 'UPDATE_ELEMENT': {
      const list = state.elements ?? getDefaultElements(state);
      return {
        ...state,
        elements: list.map((el) => (el.id === action.id ? { ...el, ...action.patch } : el)),
      };
    }

    case 'ADD_CANVAS_ELEMENT': {
      const currentList = state.elements ?? getDefaultElements(state);
      const maxZ = currentList.reduce((max, el) => Math.max(max, el.zIndex ?? 1), 0);
      const newElement: CanvasElement = {
        ...action.element,
        zIndex: action.element.zIndex ?? (maxZ + 1),
      };

      // Đồng bộ vào legacy top-level properties nếu đây là image hoặc text đầu tiên
      const syncPatch: Partial<DesignState> = {};
      if (newElement.type === 'text' && !state.text) {
        syncPatch.text = String(newElement.data?.text || '');
      }

      return {
        ...state,
        ...syncPatch,
        elements: [...currentList, newElement],
      };
    }

    case 'REMOVE_CANVAS_ELEMENT': {
      const currentList = state.elements ?? getDefaultElements(state);
      return {
        ...state,
        elements: currentList.filter((el) => el.id !== action.id),
      };
    }

    case 'REORDER_ELEMENTS': {
      const currentList = state.elements ?? getDefaultElements(state);
      const total = action.orderedIds.length;
      const zIndexMap = new Map<string, number>();
      action.orderedIds.forEach((id, index) => {
        zIndexMap.set(id, total - index);
      });
      const nextList = currentList.map((el) => {
        const newZ = zIndexMap.get(el.id);
        return newZ !== undefined ? { ...el, zIndex: newZ } : el;
      });
      nextList.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      return {
        ...state,
        elements: nextList,
      };
    }

    case 'DUPLICATE_ELEMENT': {
      const currentList = state.elements ?? getDefaultElements(state);
      const target = currentList.find((el) => el.id === action.id);
      if (!target) return state;

      const newId = `${target.id}-copy-${Date.now()}`;
      const newZ = (target.zIndex ?? 1) + 1;
      const clone: CanvasElement = {
        ...target,
        id: newId,
        name: target.name ? `${target.name} (Bản sao)` : undefined,
        x: Math.min(80, target.x + 4),
        y: Math.min(80, target.y + 4),
        zIndex: newZ,
        locked: false,
      };

      const updated = currentList.map((el) => {
        if ((el.zIndex ?? 1) >= newZ && el.id !== target.id) {
          return { ...el, zIndex: (el.zIndex ?? 1) + 1 };
        }
        return el;
      });

      return {
        ...state,
        elements: [...updated, clone].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
      };
    }

    case 'DELETE_ELEMENT': {
      const currentList = state.elements ?? getDefaultElements(state);
      const target = currentList.find((el) => el.id === action.id);
      if (!target || target.locked) return state;

      const nextList = currentList.filter((el) => el.id !== action.id);
      const syncPatch: Partial<DesignState> = {};
      if (target.type === 'image' && state.image) {
        syncPatch.image = null;
      } else if (target.type === 'text' && state.text) {
        syncPatch.text = '';
      }

      return {
        ...state,
        ...syncPatch,
        elements: nextList,
      };
    }

    case 'BRING_FORWARD': {
      const currentList = state.elements ?? getDefaultElements(state);
      const sorted = [...currentList].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      const idx = sorted.findIndex((el) => el.id === action.id);
      if (idx === -1 || idx === sorted.length - 1) return state;
      const current = sorted[idx];
      const next = sorted[idx + 1];
      if (!current || !next) return state;
      const tempZ = current.zIndex ?? 0;
      current.zIndex = next.zIndex ?? tempZ + 1;
      next.zIndex = tempZ;
      sorted.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      return { ...state, elements: sorted };
    }

    case 'SEND_BACKWARD': {
      const currentList = state.elements ?? getDefaultElements(state);
      const sorted = [...currentList].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      const idx = sorted.findIndex((el) => el.id === action.id);
      if (idx <= 0) return state;
      const current = sorted[idx];
      const prev = sorted[idx - 1];
      if (!current || !prev) return state;
      const tempZ = current.zIndex ?? 0;
      current.zIndex = prev.zIndex ?? 0;
      prev.zIndex = tempZ;
      sorted.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      return { ...state, elements: sorted };
    }
    default:
      return state;
  }
}

export function getDesignSummary(state: DesignState): DesignSummary {
  const prod = PRODUCTS[state.productId] ?? PRODUCTS.wrapping;
  const variant = prod.variants.find((v) => v.id === state.variantId) ?? prod.variants[0];
  const quantity = normalizeQuantity(state.quantity);
  const unitPrice = variant.price;
  const totalPrice = unitPrice * quantity;

  return {
    product: prod.name,
    variant: variant.name,
    quantity,
    unitPrice,
    totalPrice,
    priceLabel: `${new Intl.NumberFormat('vi-VN').format(totalPrice)}\u00a0₫`,
  };
}

export function getPreflight(state: DesignState): PreflightResult {
  const checks: PreflightCheck[] = [];

  if (state.image) {
    const isSmall = (state.image.width !== undefined && state.image.width < 1200) ||
      (state.image.height !== undefined && state.image.height < 1200);

    if (isSmall) {
      checks.push({
        id: 'image-quality',
        level: 'warning',
        label: 'Ảnh có thể hơi mờ khi in',
      });
    } else {
      checks.push({
        id: 'image-quality',
        level: 'pass',
        label: 'Độ nét ảnh đạt chuẩn',
      });
    }
  } else {
    checks.push({
      id: 'image-quality',
      level: 'pass',
      label: 'Chưa có ảnh cần kiểm tra',
    });
  }

  const hasWarning = checks.some((check) => check.level === 'warning');
  const hasError = checks.some((check) => check.level === 'error');

  let level: 'pass' | 'warning' | 'error' = 'pass';
  if (hasError) {
    level = 'error';
  } else if (hasWarning) {
    level = 'warning';
  }

  return {
    level,
    checks,
  };
}
