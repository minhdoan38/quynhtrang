export const PRODUCTS = Object.freeze({
  wrapping: Object.freeze({
    id: 'wrapping',
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
    id: 'card',
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
    id: 'sticker',
    name: 'Sticker cắt rời',
    defaultVariant: 'die-cut',
    variants: Object.freeze([
      Object.freeze({ id: 'die-cut', name: 'Cắt theo hình', price: 19000 }),
      Object.freeze({ id: 'sheet', name: 'Tấm sticker', price: 35000 }),
    ]),
    defaultOptions: Object.freeze({
      borderWidth: 4,
      hasWhiteBorder: true,
    }),
  }),
  notebook: Object.freeze({
    id: 'notebook',
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

export const TEMPLATES = Object.freeze({
  blank: Object.freeze({
    text: '',
    color: '#111827',
    backgroundColor: '#ffffff',
    productOptions: Object.freeze({}),
  }),
  minimal: Object.freeze({
    text: 'Dành riêng cho bạn',
    color: '#243447',
    backgroundColor: '#f5f1e8',
    productOptions: Object.freeze({
      wrapping: Object.freeze({ mode: 'single', repeatStyle: 'regular', patternScale: 90 }),
      card: Object.freeze({ surface: 'front', fold: 'half' }),
      sticker: Object.freeze({ hasWhiteBorder: true, borderWidth: 6 }),
      notebook: Object.freeze({ finish: 'matte' }),
    }),
  }),
  celebrate: Object.freeze({
    text: 'Chúc mừng!',
    color: '#7c2d12',
    backgroundColor: '#fef3c7',
    productOptions: Object.freeze({
      wrapping: Object.freeze({ mode: 'repeat', repeatStyle: 'brick', patternScale: 125 }),
      card: Object.freeze({ surface: 'inside', fold: 'half' }),
      sticker: Object.freeze({ hasWhiteBorder: true, borderWidth: 10 }),
      notebook: Object.freeze({ finish: 'glossy' }),
    }),
  }),
});

export function normalizeQuantity(value, fallback = 1) {
  const quantity = Number.parseInt(value, 10);
  const safeFallback = Number.isFinite(fallback) ? Math.min(999, Math.max(1, Math.trunc(fallback))) : 1;
  return Number.isFinite(quantity) ? Math.min(999, Math.max(1, quantity)) : safeFallback;
}

function cloneOptions(productId) {
  const product = PRODUCTS[productId] ?? PRODUCTS.wrapping;
  return { ...product.defaultOptions };
}

export function createInitialState(productId = 'wrapping') {
  const product = PRODUCTS[productId] ?? PRODUCTS.wrapping;
  return {
    productId: product.id,
    variantId: product.defaultVariant,
    templateId: null,
    text: '',
    color: '#111827',
    backgroundColor: '#ffffff',
    image: null,
    quantity: 1,
    productOptions: cloneOptions(product.id),
  };
}

export function transitionState(state, action) {
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

    default:
      return state;
  }
}

export function getDesignSummary(state) {
  const product = PRODUCTS[state.productId] ?? PRODUCTS.wrapping;
  const variant = product.variants.find((v) => v.id === state.variantId) ?? product.variants[0];
  const quantity = normalizeQuantity(state.quantity);
  const unitPrice = variant.price;
  const totalPrice = unitPrice * quantity;

  return {
    product: product.name,
    variant: variant.name,
    quantity,
    unitPrice,
    totalPrice,
    priceLabel: `${new Intl.NumberFormat('vi-VN').format(totalPrice)} ₫`,
  };
}

export function getPreflight(state) {
  const checks = [];

  if (state.image) {
    const isSmall = (state.image.width && state.image.width < 1200) ||
      (state.image.height && state.image.height < 1200);

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

  let level = 'pass';
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
