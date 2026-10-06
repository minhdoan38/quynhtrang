import type { DesignState, ProductId, ImageState, CanvasElement } from './product-state';
import type { TemplateProvenance } from './domain/template';
import type { DemoOrder } from '@/components/customizer/confirmation-panel';
import { loadCheckoutDraft } from './checkout-draft.ts';
import {
  saveGuestProject,
  estimateStorage,
  extractAndPersistImageAssets,
} from './browser-storage/guest-project-store.ts';

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
  sourceTemplate?: TemplateProvenance;
  documentSchemaVersion?: number;
  syncedCloudProjectId?: string;
  syncedRevision?: number;
  migratedAt?: number;
  recoveryPending?: boolean;
}

export interface RetentionProtectionOptions {
  currentProjectId?: string | null;
  activeCheckoutProjectId?: string | null;
  protectedProjectIds?: string[];
}

let currentOpenProjectId: string | null = null;
const inMemoryProjectsCache = new Map<string, RecentProject>();
let lastPersistenceError: { code: string; message: string } | null = null;

export function setCurrentOpenProjectId(id: string | null): void {
  currentOpenProjectId = id;
}

export function getCurrentOpenProjectId(): string | null {
  return currentOpenProjectId;
}

export function getInMemoryProject(id: string): RecentProject | null {
  return inMemoryProjectsCache.get(id) ?? null;
}

export function getLastPersistenceError(): { code: string; message: string } | null {
  return lastPersistenceError;
}

export function clearLastPersistenceError(): void {
  lastPersistenceError = null;
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
        if (dataCopy.assetId) {
          delete dataCopy.data;
          delete dataCopy.payload;
        }
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
    sourceTemplate: state.sourceTemplate ? { ...state.sourceTemplate } : undefined,
    documentSchemaVersion: state.documentSchemaVersion,
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

export function getRecentProjects(
  now: number = Date.now(),
  options?: RetentionProtectionOptions
): RecentProject[] {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') {
    return Array.from(inMemoryProjectsCache.values()).slice(0, 3);
  }
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    let checkoutProjectId: string | null = options?.activeCheckoutProjectId ?? null;
    if (!checkoutProjectId && typeof sessionStorage !== 'undefined') {
      try {
        const draft = loadCheckoutDraft();
        if (draft) {
          const draftCandidate = draft as unknown as { projectId?: string; design?: { projectId?: string } };
          checkoutProjectId = draftCandidate.projectId || draftCandidate.design?.projectId || null;
        }
      } catch {
        // Ignore session draft lookup failures
      }
    }

    const openId = options?.currentProjectId ?? currentOpenProjectId;
    const isProtected = (p: RecentProject): boolean => {
      if (openId && p.id === openId) return true;
      if (checkoutProjectId && p.id === checkoutProjectId) return true;
      if (p.recoveryPending === true) return true;
      if (options?.protectedProjectIds && options.protectedProjectIds.includes(p.id)) return true;
      return false;
    };

    const retained = parsed.filter(
      (p): p is RecentProject =>
        typeof p === 'object' &&
        p !== null &&
        typeof p.updatedAt === 'number' &&
        (isProtected(p) || now - p.updatedAt <= RECENT_PROJECT_RETENTION_MS)
    );

    const protectedList = retained.filter(isProtected);
    const unprotectedList = retained.filter((p) => !isProtected(p));
    const allowedUnprotectedCount = Math.max(0, 3 - protectedList.length);
    const finalUnprotected = unprotectedList.slice(0, allowedUnprotectedCount);
    const capped = retained.filter((p) => isProtected(p) || finalUnprotected.includes(p));

    if (raw && capped.length !== parsed.length) {
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(capped));
    }
    return capped;
  } catch (err) {
    console.error('Failed to load recent projects from localStorage:', err);
    return Array.from(inMemoryProjectsCache.values()).slice(0, 3);
  }
}

function createRecentProject(
  state: DesignState,
  explicitId?: string,
  now: number = Date.now(),
  options?: { recoveryPending?: boolean },
): { project: RecentProject; record: Parameters<typeof saveGuestProject>[0]; existing: RecentProject[] } {
  const existing = getRecentProjects(now);
  const existingMatch = existing.find((p) => (explicitId ? p.id === explicitId : p.productId === state.productId));
  const projectId = explicitId ?? existingMatch?.id ?? `${state.productId}-${now}`;
  const project: RecentProject = {
    id: projectId,
    productId: state.productId,
    variantId: state.variantId,
    templateId: state.templateId,
    text: state.text,
    color: state.color,
    backgroundColor: state.backgroundColor,
    image: state.image ? {
      ...state.image,
      data: state.image.assetId ? undefined : state.image.data,
      payload: state.image.assetId ? undefined : state.image.payload,
    } : null,
    productOptions: sanitizeProductOptionsForStorage(state.productOptions),
    elements: sanitizeElementsForStorage(state.elements),
    sourceTemplate: state.sourceTemplate ? { ...state.sourceTemplate } : undefined,
    documentSchemaVersion: state.documentSchemaVersion,
    updatedAt: now,
    syncedCloudProjectId: existingMatch?.syncedCloudProjectId,
    syncedRevision: existingMatch?.syncedRevision,
    migratedAt: existingMatch?.migratedAt,
    recoveryPending: options?.recoveryPending ?? existingMatch?.recoveryPending,
  };
  return {
    project,
    existing,
    record: {
      id: projectId,
      document: state,
      updatedAt: now,
      schemaVersion: state.documentSchemaVersion ?? 1,
      recoveryPending: project.recoveryPending,
      syncedCloudProjectId: project.syncedCloudProjectId,
      syncedRevision: project.syncedRevision,
    },
  };
}

function recordPersistenceError(): void {
  lastPersistenceError = {
    code: 'CLIENT_PERSISTENCE_ERROR',
    message: 'Không thể lưu trữ dữ liệu trên thiết bị. Hãy kiểm tra bộ nhớ trình duyệt.',
  };
  void estimateStorage();
}

function writeRecentProjectMetadata(project: RecentProject, existing: RecentProject[], state: DesignState, explicitId?: string): boolean {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return true;
  try {
    const filtered = existing.filter((p) => p.id !== project.id && (explicitId ? true : p.productId !== state.productId));
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify([project, ...filtered].slice(0, 3)));
    return true;
  } catch (err) {
    recordPersistenceError();
    console.error('Failed to save recent project to localStorage:', err);
    return false;
  }
}

export function saveRecentProject(
  state: DesignState,
  explicitId?: string,
  now: number = Date.now(),
  options?: { recoveryPending?: boolean },
): boolean {
  const { project, record, existing } = createRecentProject(state, explicitId, now, options);
  inMemoryProjectsCache.set(project.id, project);
  void saveGuestProject(record).then((ok) => {
    if (!ok) recordPersistenceError();
  }).catch(() => {
    recordPersistenceError();
  });
  const metadataOk = writeRecentProjectMetadata(project, existing, state, explicitId);
  if (metadataOk) lastPersistenceError = null;
  return metadataOk;
}

function hasInlineImageAssets(state: DesignState): boolean {
  if (state.image && (state.image.data || state.image.payload || (typeof state.image.src === 'string' && state.image.src.startsWith('data:')))) {
    return true;
  }
  if (state.elements) {
    for (const el of state.elements) {
      if (el.type === 'image' && el.data) {
        const d = el.data as Record<string, unknown>;
        if (d.data || d.payload || (typeof d.src === 'string' && d.src.startsWith('data:'))) {
          return true;
        }
      }
    }
  }
  return false;
}

export async function saveRecentProjectAsync(
  state: DesignState,
  explicitId?: string,
  now: number = Date.now(),
  options?: { recoveryPending?: boolean },
): Promise<boolean> {
  const persistableState = hasInlineImageAssets(state)
    ? await extractAndPersistImageAssets(state)
    : state;
  const { project, record, existing } = createRecentProject(persistableState, explicitId, now, options);
  inMemoryProjectsCache.set(project.id, project);
  const metadataOk = writeRecentProjectMetadata(project, existing, persistableState, explicitId);
  if (!metadataOk) return false;
  try {
    const durableOk = await saveGuestProject(record);
    if (!durableOk) {
      recordPersistenceError();
      return false;
    }
    lastPersistenceError = null;
    return true;
  } catch {
    recordPersistenceError();
    return false;
  }
}

export function saveRecentProjectWithResult(
  state: DesignState,
  explicitId?: string,
  now: number = Date.now(),
  options?: { recoveryPending?: boolean },
): { ok: boolean; code?: string } {
  const ok = saveRecentProject(state, explicitId, now, options);
  return ok ? { ok: true } : { ok: false, code: lastPersistenceError?.code ?? 'CLIENT_PERSISTENCE_ERROR' };
}

export async function saveRecentProjectWithResultAsync(
  state: DesignState,
  explicitId?: string,
  now: number = Date.now(),
  options?: { recoveryPending?: boolean },
): Promise<{ ok: boolean; code?: string }> {
  const ok = await saveRecentProjectAsync(state, explicitId, now, options);
  return ok ? { ok: true } : { ok: false, code: lastPersistenceError?.code ?? 'CLIENT_PERSISTENCE_ERROR' };
}

export function addRecentProject(project: RecentProject, now: number = Date.now()): boolean {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return true;
  try {
    const existing = getRecentProjects(now);
    const filtered = existing.filter((p) => p.id !== project.id);
    const updated = [{ ...project, updatedAt: project.updatedAt ?? now }, ...filtered].slice(0, 3);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('Failed to add recent project to localStorage:', err);
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

export async function flushAutosaveAsync(state: DesignState, explicitId?: string): Promise<boolean> {
  const stateOk = saveState(state);
  const projectOk = await saveRecentProjectAsync(state, explicitId);
  return stateOk && projectOk;
}

export function flushAutosave(state: DesignState, explicitId?: string): boolean {
  const stateOk = saveState(state);
  const projectOk = saveRecentProject(state, explicitId);
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
