import type { DesignState } from './product-state.ts';

export type HistoryActionType =
  | 'add'
  | 'move'
  | 'resize'
  | 'rotate'
  | 'edit-text'
  | 'change-font'
  | 'change-font-size'
  | 'change-text-align'
  | 'change-color'
  | 'change-gradient'
  | 'change-opacity'
  | 'crop'
  | 'remove-background'
  | 'refine-background'
  | 'replace-image'
  | 'change-mask'
  | 'group'
  | 'ungroup'
  | 'delete'
  | 'duplicate'
  | 'reorder-layer'
  | 'lock'
  | 'unlock'
  | 'apply-template'
  | 'change-product-option'
  | 'change-pattern-repeat'
  | 'change-pattern-scale'
  | 'change-pattern-spacing'
  | 'change-pattern-background'
  | 'rotate-pattern'
  | 'change-sticker-border'
  | 'toggle-sticker-border';

export interface SelectionSnapshot {
  selectedTarget: 'image' | 'text' | 'group' | null;
  selectedElementId: string | null;
  selectedElementIds: string[];
  selectionMode: 'default' | 'multi-select' | 'group-edit';
  activeGroupId: string | null;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  type: HistoryActionType;
  label: string;
  before: DesignState;
  after: DesignState;
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot;
  affectedIds: string[];
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  limit: number;
}

export const DEFAULT_HISTORY_LIMIT = 75;

export function createHistoryState(limit: number = DEFAULT_HISTORY_LIMIT): HistoryState {
  return {
    past: [],
    future: [],
    limit: Math.max(1, limit),
  };
}

export function commitHistoryEntry(
  history: HistoryState,
  entry: Omit<HistoryEntry, 'id' | 'timestamp'>
): HistoryState {
  const fullEntry: HistoryEntry = {
    ...entry,
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };

  const nextPast = [...history.past, fullEntry];
  if (nextPast.length > history.limit) {
    nextPast.splice(0, nextPast.length - history.limit);
  }

  return {
    ...history,
    past: nextPast,
    future: [], // New commit clears redo branch
  };
}

export function undoHistory(
  history: HistoryState,
  currentState: DesignState,
  currentSelection: SelectionSnapshot
): {
  nextHistory: HistoryState;
  restoredState: DesignState;
  restoredSelection: SelectionSnapshot;
  undoneEntry: HistoryEntry;
} | null {
  if (history.past.length === 0) return null;

  const entry = history.past[history.past.length - 1];
  const nextPast = history.past.slice(0, -1);

  // Future entry stores currentState as after and entry.before as before so redo reapplies entry.after
  const nextFuture = [entry, ...history.future];

  return {
    nextHistory: {
      ...history,
      past: nextPast,
      future: nextFuture,
    },
    restoredState: entry.before,
    restoredSelection: entry.selectionBefore,
    undoneEntry: entry,
  };
}

export function redoHistory(
  history: HistoryState,
  currentState: DesignState,
  currentSelection: SelectionSnapshot
): {
  nextHistory: HistoryState;
  restoredState: DesignState;
  restoredSelection: SelectionSnapshot;
  redoneEntry: HistoryEntry;
} | null {
  if (history.future.length === 0) return null;

  const entry = history.future[0];
  const nextFuture = history.future.slice(1);
  const nextPast = [...history.past, entry];

  return {
    nextHistory: {
      ...history,
      past: nextPast,
      future: nextFuture,
    },
    restoredState: entry.after,
    restoredSelection: entry.selectionAfter,
    redoneEntry: entry,
  };
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

export function getHistoryActionLabel(type: HistoryActionType): string {
  switch (type) {
    case 'change-sticker-border':
      return 'Đổi độ dày viền sticker';
    case 'toggle-sticker-border':
      return 'Bật/tắt viền trắng sticker';
    case 'add':
      return 'Thêm đối tượng';
    case 'move':
      return 'Di chuyển';
    case 'resize':
      return 'Thay đổi kích thước';
    case 'rotate':
      return 'Xoay';
    case 'edit-text':
      return 'Sửa chữ';
    case 'change-font':
      return 'Đổi font';
    case 'change-font-size':
      return 'Đổi cỡ chữ';
    case 'change-text-align':
      return 'Đổi căn lề';
    case 'change-color':
      return 'Đổi màu';
    case 'change-gradient':
      return 'Đổi dải màu';
    case 'change-opacity':
      return 'Đổi độ mờ';
    case 'crop':
      return 'Cắt ảnh';
    case 'remove-background':
      return 'Xóa nền';
    case 'refine-background':
      return 'Chỉnh viền cắt';
    case 'replace-image':
      return 'Thay ảnh';
    case 'change-mask':
      return 'Đổi khung hình';
    case 'group':
      return 'Nhóm';
    case 'ungroup':
      return 'Rã nhóm';
    case 'delete':
      return 'Xóa';
    case 'duplicate':
      return 'Nhân bản';
    case 'reorder-layer':
      return 'Đổi thứ tự lớp';
    case 'lock':
      return 'Khóa lớp';
    case 'unlock':
      return 'Mở khóa lớp';
    case 'apply-template':
      return 'Áp dụng mẫu';
    case 'change-product-option':
      return 'Đổi tùy chọn sản phẩm';
    case 'change-pattern-repeat':
      return 'Đổi kiểu lặp';
    case 'change-pattern-scale':
      return 'Đổi cỡ họa tiết';
    case 'change-pattern-spacing':
      return 'Đổi khoảng cách họa tiết';
    case 'change-pattern-background':
      return 'Đổi màu nền giấy';
    case 'rotate-pattern':
      return 'Xoay họa tiết';
    default:
      return 'Chỉnh sửa';
  }
}
