import type { DemoOrder } from './confirmation-panel';

const ORDER_KEY = 'print-customizer-order-v1';

export function saveOrder(order: DemoOrder | null): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (order) {
      sessionStorage.setItem(ORDER_KEY, JSON.stringify(order));
    } else {
      sessionStorage.removeItem(ORDER_KEY);
    }
    return true;
  } catch (err) {
    console.error('Failed to save order to sessionStorage:', err);
    return false;
  }
}

export function loadOrder(): DemoOrder | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ORDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('Failed to load order from sessionStorage:', err);
    return null;
  }
}
