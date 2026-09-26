import type { DesignState } from './product-state';
import type { DemoOrder } from '@/components/customizer/confirmation-panel';

const STATE_KEY = 'print-customizer-state-v1';
const ORDER_KEY = 'print-customizer-order-v1';

export function saveState(state: DesignState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state to sessionStorage:', err);
  }
}

export function loadState(): Partial<DesignState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('Failed to load state from sessionStorage:', err);
    return null;
  }
}

export function saveOrder(order: DemoOrder | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (order) {
      sessionStorage.setItem(ORDER_KEY, JSON.stringify(order));
    } else {
      sessionStorage.removeItem(ORDER_KEY);
    }
  } catch (err) {
    console.error('Failed to save order to sessionStorage:', err);
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
