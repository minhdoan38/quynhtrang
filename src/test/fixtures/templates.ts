import type { DesignState } from '../../lib/product-state.ts';

export function makeCardDocument(): DesignState {
  return {
    productId: 'card',
    variantId: 'vertical',
    templateId: null,
    text: '',
    color: '#2E3338',
    backgroundColor: '#FFFDF8',
    image: null,
    quantity: 1,
    productOptions: { surface: 'front' },
    elements: [
      {
        id: 'name',
        type: 'text',
        x: 20,
        y: 20,
        width: 60,
        height: 12,
        rotation: 0,
        locked: false,
        zIndex: 1,
        surface: 'front',
        data: {
          text: 'Tên của bạn',
          color: '#2E3338',
          fontFamily: 'sans-serif',
          fontSize: 20,
          fontWeight: 'regular',
          fontStyle: 'normal',
          textAlign: 'center',
          lineHeight: 1.4,
          letterSpacing: 0,
          placeholder: false,
        },
      },
    ],
  };
}
