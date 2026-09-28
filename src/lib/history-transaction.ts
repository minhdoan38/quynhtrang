import type { DesignState } from './product-state.ts';
import {
  commitHistoryEntry,
  type HistoryActionType,
  type HistoryEntry,
  type HistoryState,
  type SelectionSnapshot,
} from './history.ts';

export interface TransactionSession {
  id: string;
  type: HistoryActionType;
  label: string;
  baselineState: DesignState;
  baselineSelection: SelectionSnapshot;
  affectedIds: string[];
  startTime: number;
}

export function hasActiveTransaction(session: TransactionSession | null): boolean {
  return session !== null;
}

export function beginTransaction(
  currentState: DesignState,
  currentSelection: SelectionSnapshot,
  type: HistoryActionType,
  label: string,
  affectedIds: string[] = []
): TransactionSession {
  return {
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label,
    baselineState: currentState,
    baselineSelection: currentSelection,
    affectedIds,
    startTime: Date.now(),
  };
}

/**
 * Checks whether two DesignStates have meaningful document changes.
 * Avoids false positive commits if the object references differ but data is identical.
 */
export function areDesignStatesEqual(a: DesignState, b: DesignState): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  if (
    a.productId !== b.productId ||
    a.variantId !== b.variantId ||
    a.templateId !== b.templateId ||
    a.text !== b.text ||
    a.color !== b.color ||
    a.backgroundColor !== b.backgroundColor ||
    a.quantity !== b.quantity
  ) {
    return false;
  }

  // Fast stringify check for options and image/elements
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function commitTransaction(
  history: HistoryState,
  session: TransactionSession,
  currentState: DesignState,
  currentSelection: SelectionSnapshot
): {
  nextHistory: HistoryState;
  committedEntry: HistoryEntry | null;
} {
  // If no change occurred between baseline and current state, commit nothing
  if (areDesignStatesEqual(session.baselineState, currentState)) {
    return {
      nextHistory: history,
      committedEntry: null,
    };
  }

  const nextHistory = commitHistoryEntry(history, {
    type: session.type,
    label: session.label,
    before: session.baselineState,
    after: currentState,
    selectionBefore: session.baselineSelection,
    selectionAfter: currentSelection,
    affectedIds: session.affectedIds,
  });

  const committedEntry = nextHistory.past[nextHistory.past.length - 1] ?? null;

  return {
    nextHistory,
    committedEntry,
  };
}

export function cancelTransaction(session: TransactionSession): {
  restoredState: DesignState;
  restoredSelection: SelectionSnapshot;
} {
  return {
    restoredState: session.baselineState,
    restoredSelection: session.baselineSelection,
  };
}
