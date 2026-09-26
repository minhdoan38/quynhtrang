import type { DesignState, ProductId, ImageState } from './product-state';
import type { DemoOrder } from '@/components/customizer/confirmation-panel';

const STATE_KEY = 'print-customizer-state-v1';
const ORDER_KEY = 'print-customizer-order-v1';
const RECENT_PROJECTS_KEY = 'quynhtrang-recent-projects-v1';

export interface RecentProject {
  id: string;
  productId: ProductId;
  variantId: string;
  templateId: string | null;
  text: string;
  color: string;
  backgroundColor: string;
  image: ImageState | null;
  productOptions: Record<string, unknown>;
  updatedAt: number;
}

export function saveState(state: DesignState): boolean {
  if (typeof window === 'undefined') return true;
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Failed to save state to sessionStorage:', err);
    return false;
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

export function getRecentProjects(): RecentProject[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 3);
  } catch (err) {
    console.error('Failed to load recent projects from localStorage:', err);
    return [];
  }
}

export function saveRecentProject(state: DesignState): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const existing = getRecentProjects();
    const project: RecentProject = {
      id: `${state.productId}-${Date.now()}`,
      productId: state.productId,
      variantId: state.variantId,
      templateId: state.templateId,
      text: state.text,
      color: state.color,
      backgroundColor: state.backgroundColor,
      image: state.image ? { ...state.image } : null,
      productOptions: { ...state.productOptions },
      updatedAt: Date.now(),
    };

    // Deduplicate same productId so we don't have multiple duplicates of the exact same product type
    const filtered = existing.filter((p) => p.productId !== state.productId);
    const updated = [project, ...filtered].slice(0, 3);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('Failed to save recent project to localStorage:', err);
    return false;
  }
}

export function flushAutosave(state: DesignState): boolean {
  const stateOk = saveState(state);
  const projectOk = saveRecentProject(state);
  return stateOk && projectOk;
}

export function removeRecentProject(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentProjects();
    const updated = existing.filter((p) => p.id !== id);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove recent project:', err);
  }
}
