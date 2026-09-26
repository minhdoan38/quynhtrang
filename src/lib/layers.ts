import type { CanvasElement } from './product-state.js';

export interface LayerNode {
 element: CanvasElement;
 children: CanvasElement[];
}

export interface LayerRowState {
 elementId: string;
 selected: boolean;
 locked: boolean;
 type: CanvasElement['type'];
 parentGroupId?: string;
 depth: number;
}

/**
 * Generates human-readable layer display name
 * Examples: Truncated text preview, "Ảnh", "Sticker", "Hình tròn", "Group"
 */
export function getLayerDisplayName(element: CanvasElement): string {
 if (element.name) return element.name;

 switch (element.type) {
  case 'text': {
   const rawText = typeof element.data?.text === 'string' ? element.data.text.trim() : '';
   if (!rawText) return 'Dòng chữ';
   if (rawText.length > 20) {
    return `${rawText.slice(0, 20).trim()}...`;
   }
   return rawText;
  }
  case 'image':
   return 'Ảnh';
  case 'sticker':
   return 'Sticker';
  case 'shape': {
   const shapeType = typeof element.data?.shape === 'string' ? element.data.shape : '';
   if (shapeType === 'circle') return 'Hình tròn';
   if (shapeType === 'rect') return 'Hình chữ nhật';
   return 'Hình khối';
  }
  case 'group':
   return 'Group';
  default:
   return 'Thành phần';
 }
}

/**
 * Returns icon symbol key for fast visual recognition
 */
export function getLayerTypeIcon(type: CanvasElement['type']): 'text' | 'image' | 'sticker' | 'shape' | 'group' {
 return type;
}

/**
 * Filters layers belonging to the active surface (front vs inside)
 */
export function getSurfaceLayers(elements: CanvasElement[], surface: string = 'front'): CanvasElement[] {
 return elements.filter((el) => {
  // If element has explicit surface, match it; otherwise default belongs to front
  const elSurface = el.surface || 'front';
  return elSurface === surface;
 });
}

/**
 * Reorders an array of IDs from fromIndex to toIndex
 */
export function reorderLayerIds(ids: string[], fromIndex: number, toIndex: number): string[] {
 if (fromIndex < 0 || fromIndex >= ids.length || toIndex < 0 || toIndex >= ids.length) {
  return ids;
 }
 const result = [...ids];
 const [removed] = result.splice(fromIndex, 1);
 if (removed !== undefined) {
  result.splice(toIndex, 0, removed);
 }
 return result;
}

/**
 * Builds simple hierarchical structure for group rendering
 */
export function buildLayerHierarchy(elements: CanvasElement[]): LayerNode[] {
 const groups: Record<string, LayerNode> = {};
 const rootNodes: LayerNode[] = [];

 // First identify all groups
 for (const el of elements) {
  if (el.type === 'group') {
   const node: LayerNode = { element: el, children: [] };
   groups[el.id] = node;
   if (!el.parentGroupId) {
    rootNodes.push(node);
   }
  }
 }

 // Next place children
 for (const el of elements) {
  if (el.type === 'group') continue;

  if (el.parentGroupId && groups[el.parentGroupId]) {
   groups[el.parentGroupId].children.push(el);
  } else {
   rootNodes.push({ element: el, children: [] });
  }
 }

 return rootNodes;
}
