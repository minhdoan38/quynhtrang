import type { DesignState, ProductId, ImageState, CanvasElement } from './product-state';
import type { DemoOrder } from '@/components/customizer/confirmation-panel';

const STATE_KEY = 'print-customizer-state-v1';
const ORDER_KEY = 'print-customizer-order-v1';
const RECENT_PROJECTS_KEY = 'quynhtrang-recent-projects-v1';
export const RECENT_PROJECT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

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
  syncedCloudProjectId?: string;
  syncedRevision?: number;
  migratedAt?: number;
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

export function getRecentProjects(now: number = Date.now()): RecentProject[] {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // ponytail: in-memory prune on read; skipped background worker/server sync, add if offline retention sync across devices is required.
    const pruned = parsed.filter(
      (p): p is RecentProject =>
        typeof p === 'object' &&
        p !== null &&
        typeof p.updatedAt === 'number' &&
        now - p.updatedAt <= RECENT_PROJECT_RETENTION_MS
    );
    if (pruned.length !== parsed.length) {
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(pruned));
    }
    return pruned.slice(0, 3);
  } catch (err) {
    console.error('Failed to load recent projects from localStorage:', err);
    return [];
  }
}

export function saveRecentProject(state: DesignState, explicitId?: string): boolean {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return true;
  try {
    const existing = getRecentProjects();
    const existingMatch = existing.find((p) => (explicitId ? p.id === explicitId : p.productId === state.productId));
    const projectId = explicitId ?? existingMatch?.id ?? `${state.productId}-${Date.now()}`;
    const project: RecentProject = {
      id: projectId,
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
      syncedCloudProjectId: existingMatch?.syncedCloudProjectId,
      syncedRevision: existingMatch?.syncedRevision,
      migratedAt: existingMatch?.migratedAt,
    };

    // Deduplicate same ID or same productId
    const filtered = existing.filter((p) => p.id !== projectId && (explicitId ? true : p.productId !== state.productId));
    const updated = [project, ...filtered].slice(0, 3);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('Failed to save recent project to localStorage:', err);
    return false;
  }
}

export function pruneExpiredRecentProjects(now: number = Date.now()): RecentProject[] {
  return getRecentProjects(now);
}

export function markProjectMigrated(localId: string, cloudProjectId: string, revision: number): void {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return;
  try {
    const existing = getRecentProjects();
    const updated = existing.map((p) => {
      if (p.id === localId) {
        return {
          ...p,
          syncedCloudProjectId: cloudProjectId,
          syncedRevision: revision,
          migratedAt: Date.now(),
        };
      }
      return p;
    });
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to mark project migrated in localStorage:', err);
  }
}

export function flushAutosave(state: DesignState): boolean {
  const stateOk = saveState(state);
  const projectOk = saveRecentProject(state);
  return stateOk && projectOk;
}

export function removeRecentProject(id: string): void {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return;
  try {
    const existing = getRecentProjects();
    const updated = existing.filter((p) => p.id !== id);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove recent project:', err);
  }
}
