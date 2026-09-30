import { computeCombinedBounds } from './multi-selection.ts';
import { getDefaultElements, type CanvasElement, type DesignState } from './product-state.ts';
import { canMutateElement, type DesignReviewMode } from './domain/design-revision.ts';

export interface GroupElementsResult {
 state: DesignState;
 groupId: string;
}

/**
 * Creates a persistent group container in document elements binding selected items together
 */
export function groupElements(
 state: DesignState,
 targetIds: readonly string[],
 mode?: DesignReviewMode | 'guest'
): GroupElementsResult {
 const currentList = state.elements ?? getDefaultElements(state);
 const targetIdSet = new Set(targetIds);

 const targets = currentList.filter((el) => targetIdSet.has(el.id) && canMutateElement(mode, el));

 if (targets.length < 2) {
  return { state, groupId: '' };
 }

 // Ensure all items belong to the same product surface
 const firstSurface = targets[0]?.surface || 'front';
 const allSameSurface = targets.every((el) => (el.surface || 'front') === firstSurface);
 if (!allSameSurface) {
  return { state, groupId: '' };
 }

 const bounds = computeCombinedBounds(targets);
 if (!bounds) {
  return { state, groupId: '' };
 }

 const groupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
 const maxZ = Math.max(...currentList.map((e) => e.zIndex ?? 0), 0);

 const groupElement: CanvasElement = {
  id: groupId,
  type: 'group',
  name: 'Nhóm',
  x: Number(bounds.centerX.toFixed(2)),
  y: Number(bounds.centerY.toFixed(2)),
  width: Math.max(10, Math.round(bounds.width)),
  height: Math.max(10, Math.round(bounds.height)),
  rotation: 0,
  locked: false,
  zIndex: maxZ + 1,
  surface: firstSurface,
  data: {
   childIds: targets.map((t) => t.id),
  },
 };

 const nextList = [
  ...currentList.map((el) => {
   if (targetIdSet.has(el.id) && canMutateElement(mode, el)) {
    return {
     ...el,
     parentGroupId: groupId,
    };
   }
   return el;
  }),
  groupElement,
 ];

 return {
  state: {
   ...state,
   elements: nextList,
  },
  groupId,
 };
}

/**
 * Ungroups a persistent group element and restores its children as top-level elements
 */
export function ungroupElement(state: DesignState, groupId: string): DesignState {
 const currentList = state.elements ?? getDefaultElements(state);
 const targetGroup = currentList.find((el) => el.id === groupId && el.type === 'group');

 if (!targetGroup) return state;

 const nextList = currentList
  .filter((el) => el.id !== groupId)
  .map((el) => {
   if (el.parentGroupId === groupId) {
    const { parentGroupId: _, ...rest } = el;
    return rest as CanvasElement;
   }
   return el;
  });

 return {
  ...state,
  elements: nextList,
 };
}

/**
 * Duplicates an array of selected elements with a slight visual offset (+4%, +4%)
 * If a persistent group is selected, duplicates the group container and its children hierarchy
 */
export function duplicateSelectedElements(
 state: DesignState,
 targetIds: readonly string[],
 mode?: DesignReviewMode | 'guest'
): { state: DesignState; newIds: string[] } {
 const currentList = state.elements ?? getDefaultElements(state);
 const targetIdSet = new Set(targetIds);

 const targets = currentList.filter((el) => targetIdSet.has(el.id) && canMutateElement(mode, el));
 if (targets.length === 0) return { state, newIds: [] };

 const newIds: string[] = [];
 const duplicates: CanvasElement[] = [];
 const maxZ = Math.max(...currentList.map((e) => e.zIndex ?? 0), 0);

 // Map old group ID to new group ID for cloned hierarchies
 const groupMapping = new Map<string, string>();

 // First pass: instantiate new groups
 for (const el of targets) {
  if (el.type === 'group') {
   const newGroupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
   groupMapping.set(el.id, newGroupId);
   newIds.push(newGroupId);

   duplicates.push({
    ...el,
    id: newGroupId,
    name: el.name ? `${el.name} (Bản sao)` : 'Nhóm (Bản sao)',
    x: el.x + 4,
    y: el.y + 4,
    zIndex: maxZ + duplicates.length + 1,
   });

   // Also clone child elements of this group
   const children = currentList.filter((child) => child.parentGroupId === el.id);
   for (const child of children) {
    const newChildId = `${child.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    duplicates.push({
     ...child,
     id: newChildId,
     parentGroupId: newGroupId,
     x: child.x + 4,
     y: child.y + 4,
     zIndex: maxZ + duplicates.length + 1,
    });
   }
  }
 }

 // Second pass: clone non-group target elements that are not already cloned as children
 for (const el of targets) {
  if (el.type === 'group') continue;
  // If element is already cloned because its parent group was in targets, skip
  if (el.parentGroupId && groupMapping.has(el.parentGroupId)) continue;

  const newId = `${el.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  newIds.push(newId);

  duplicates.push({
   ...el,
   id: newId,
   x: el.x + 4,
   y: el.y + 4,
   zIndex: maxZ + duplicates.length + 1,
  });
 }

 return {
  state: {
   ...state,
   elements: [...currentList, ...duplicates],
  },
  newIds,
 };
}

/**
 * Deletes selected elements in one atomic operation
 * If a group is deleted, its member children are cascadingly removed
 */
export function deleteSelectedElements(
 state: DesignState,
 targetIds: readonly string[],
 mode?: DesignReviewMode | 'guest'
): DesignState {
 const currentList = state.elements ?? getDefaultElements(state);
 const targetIdSet = new Set(targetIds);

 // Gather cascading child IDs if group is in targets
 const allIdsToRemove = new Set(targetIds);
 for (const el of currentList) {
  if (el.type === 'group' && targetIdSet.has(el.id)) {
   const children = currentList.filter((child) => child.parentGroupId === el.id);
   for (const child of children) {
    allIdsToRemove.add(child.id);
   }
  }
 }

 const nextList = currentList.filter((el) => !allIdsToRemove.has(el.id) || !canMutateElement(mode, el));

 return {
  ...state,
  elements: nextList,
 };
}
