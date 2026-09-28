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
  | 'change-product-option';

export interface SelectionSnapshot {
  selectedTarget: 'image' | 'text' | 'shape' | 'sticker' | 'group' | null;
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
