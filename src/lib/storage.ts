import type { DesignState, ProductId, ImageState, CanvasElement } from './product-state';
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
  elements?: CanvasElement[];
  updatedAt: number;
}

export function sanitizeElementsForStorage(elements?: CanvasElement[]): CanvasElement[] | undefined {
  if (!elements) return undefined;
  return elements
    .filter((element) => {
      const candidate = element as {
        generated?: unknown;
        isGeneratedContour?: unknown;
        data?: Record<string, unknown>;
      };
      if (candidate.generated === true || candidate.isGeneratedContour === true) return false;
      if (
        candidate.data?.generated === true ||
        candidate.data?.patternGenerated === true ||
        candidate.data?.isGeneratedContour === true
      ) {
        return false;
      }
      return true;
    })
    .map((element) => {
      // Strip generated sticker contour fields attached directly or inside data
      const copy = { ...element } as Record<string, unknown>;
      delete copy.borderSvgPath;
      delete copy.cutlineSvgPath;
      delete copy.stickerContour;
      if (copy.data && typeof copy.data === 'object') {
        const dataCopy = { ...(copy.data as Record<string, unknown>) };
        delete dataCopy.borderSvgPath;
        delete dataCopy.cutlineSvgPath;
        delete dataCopy.stickerContour;
        copy.data = dataCopy;
      }
      return copy as unknown as CanvasElement;
    });
}

export function sanitizeProductOptionsForStorage(
  options?: Record<string, unknown>
): Record<string, unknown> {
  if (!options) return {};
  const sanitized: Record<string, unknown> = { ...options };
  delete sanitized.borderSvgPath;
  delete sanitized.cutlineSvgPath;
  delete sanitized.stickerContour;
  delete sanitized.contourResult;
  return sanitized;
}

export function sanitizeDesignForStorage(state: DesignState): DesignState {
  return {
    ...state,
    productOptions: sanitizeProductOptionsForStorage(state.productOptions),
    elements: sanitizeElementsForStorage(state.elements),
  };
}

export function saveState(state: DesignState): boolean {
  if (typeof window === 'undefined' && typeof sessionStorage === 'undefined') return true;
  try {
    const sanitizedState = sanitizeDesignForStorage(state);
    sessionStorage.setItem(STATE_KEY, JSON.stringify(sanitizedState));
    return true;
  } catch (err) {
    console.error('Failed to save state to sessionStorage:', err);
    return false;
  }
}

export function loadState(): Partial<DesignState> | null {
  if (typeof window === 'undefined' && typeof sessionStorage === 'undefined') return null;
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
      productOptions: sanitizeProductOptionsForStorage(state.productOptions),
      elements: sanitizeElementsForStorage(state.elements),
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
