import { useState, useCallback, useRef } from 'react';
import {
 type DesignState,
 type DesignAction,
 transitionState,
} from './product-state.ts';
import type { DesignReviewMode } from './domain/design-revision.ts';
import {
 createHistoryState,
 commitHistoryEntry,
 undoHistory,
 redoHistory,
 canUndo as canUndoStack,
 canRedo as canRedoStack,
 type HistoryActionType,
 type HistoryEntry,
 type HistoryState,
 type SelectionSnapshot,
} from './history.ts';
import {
 beginTransaction,
 commitTransaction,
 cancelTransaction,
 type TransactionSession,
} from './history-transaction.ts';

export interface DesignHistoryManager {
 getState: () => DesignState;
 setState: (next: DesignState) => void;
 getHistory: () => HistoryState;
 getActiveTransaction: () => TransactionSession | null;
 canUndo: () => boolean;
 canRedo: () => boolean;
 dispatchDirect: (action: DesignAction) => DesignState;
 executeAction: (
  action: DesignAction,
  metadata: { type: HistoryActionType; label: string; affectedIds?: string[] }
 ) => HistoryEntry | null;
 commitManualEntry: (params: {
  type: HistoryActionType;
  label: string;
  before: DesignState;
  after: DesignState;
  affectedIds?: string[];
 }) => HistoryEntry | null;
 startTransaction: (
  type: HistoryActionType,
  label: string,
  affectedIds?: string[]
 ) => TransactionSession;
 commitActiveTransaction: () => HistoryEntry | null;
 cancelActiveTransaction: () => void;
 undo: () => HistoryEntry | null;
 redo: () => HistoryEntry | null;
 resetHistory: (initialState: DesignState) => void;
}

/**
 * Pure state manager for testing and headless usage without React DOM
 */
export function createDesignHistoryManager(
 initialState: DesignState,
 getSelection: () => SelectionSnapshot,
 setSelection: (sel: SelectionSnapshot) => void,
 historyLimit: number = 75,
 mode?: DesignReviewMode | 'guest'
): DesignHistoryManager {
 let state = initialState;
 let history = createHistoryState(historyLimit);
 let activeTransaction: TransactionSession | null = null;

 return {
  getState: () => state,
  setState: (next: DesignState) => {
   state = next;
  },
  getHistory: () => history,
  getActiveTransaction: () => activeTransaction,
  canUndo: () => activeTransaction !== null || canUndoStack(history),
  canRedo: () => activeTransaction === null && canRedoStack(history),

  dispatchDirect: (action: DesignAction) => {
   state = transitionState(state, action, mode);
   return state;
  },

  executeAction: (action, metadata) => {
   // If a transaction is active, close it first
   if (activeTransaction) {
    const commitRes = commitTransaction(history, activeTransaction, state, getSelection());
    history = commitRes.nextHistory;
    activeTransaction = null;
   }

   const beforeState = state;
   const beforeSelection = getSelection();
   const nextState = transitionState(beforeState, action, mode);

   if (nextState === beforeState) return null;

   state = nextState;
   const afterSelection = getSelection();

   history = commitHistoryEntry(history, {
    type: metadata.type,
    label: metadata.label,
    before: beforeState,
    after: nextState,
    selectionBefore: beforeSelection,
    selectionAfter: afterSelection,
    affectedIds: metadata.affectedIds ?? [],
   });

   return history.past[history.past.length - 1] ?? null;
  },

  commitManualEntry: ({ type, label, before, after, affectedIds = [] }) => {
   history = commitHistoryEntry(history, {
    type,
    label,
    before,
    after,
    selectionBefore: getSelection(),
    selectionAfter: getSelection(),
    affectedIds,
   });

   return history.past[history.past.length - 1] ?? null;
  },

  startTransaction: (type, label, affectedIds = []) => {
   // If previous transaction uncommitted, commit it before starting new one
   if (activeTransaction) {
    const res = commitTransaction(history, activeTransaction, state, getSelection());
    history = res.nextHistory;
   }
   activeTransaction = beginTransaction(state, getSelection(), type, label, affectedIds);
   return activeTransaction;
  },

  commitActiveTransaction: () => {
   if (!activeTransaction) return null;
   const res = commitTransaction(history, activeTransaction, state, getSelection());
   history = res.nextHistory;
   activeTransaction = null;
   return res.committedEntry;
  },

  cancelActiveTransaction: () => {
   if (!activeTransaction) return;
   const res = cancelTransaction(activeTransaction);
   state = res.restoredState;
   setSelection(res.restoredSelection);
   activeTransaction = null;
  },

  undo: () => {
   // If transaction active, Undo cancels transaction first
   if (activeTransaction) {
    const canceledLabel = activeTransaction.label;
    const res = cancelTransaction(activeTransaction);
    state = res.restoredState;
    setSelection(res.restoredSelection);
    const canceledType = activeTransaction.type;
    const canceledIds = activeTransaction.affectedIds;
    activeTransaction = null;

    // Return a mock entry so caller knows an undo occurred
    return {
     id: `undo-cancel-${Date.now()}`,
     timestamp: Date.now(),
     type: canceledType,
     label: canceledLabel,
     before: res.restoredState,
     after: res.restoredState,
     selectionBefore: res.restoredSelection,
     selectionAfter: res.restoredSelection,
     affectedIds: canceledIds,
    };
   }

   const res = undoHistory(history, state, getSelection());
   if (!res) return null;

   history = res.nextHistory;
   state = res.restoredState;
   setSelection(res.restoredSelection);
   return res.undoneEntry;
  },

  redo: () => {
   if (activeTransaction) return null;

   const res = redoHistory(history, state, getSelection());
   if (!res) return null;

   history = res.nextHistory;
   state = res.restoredState;
   setSelection(res.restoredSelection);
   return res.redoneEntry;
  },

  resetHistory: (initialState: DesignState) => {
   state = initialState;
   history = createHistoryState(historyLimit);
   activeTransaction = null;
  },
 };
}

export interface UseDesignHistoryOptions {
 initialState: DesignState;
 getSelection: () => SelectionSnapshot;
 onRestoreSelection: (sel: SelectionSnapshot) => void;
 limit?: number;
 mode?: DesignReviewMode | 'guest';
}

export interface UseDesignHistoryReturn {
 state: DesignState;
 setState: React.Dispatch<React.SetStateAction<DesignState>>;
 history: HistoryState;
 activeTransaction: TransactionSession | null;
 canUndo: boolean;
 canRedo: boolean;
 dispatchDirect: (action: DesignAction) => void;
 executeAction: (
  action: DesignAction,
  metadata: { type: HistoryActionType; label: string; affectedIds?: string[] }
 ) => HistoryEntry | null;
 commitManualEntry: (params: {
  type: HistoryActionType;
  label: string;
  before: DesignState;
  after: DesignState;
  affectedIds?: string[];
 }) => HistoryEntry | null;
 startTransaction: (
  type: HistoryActionType,
  label: string,
  affectedIds?: string[]
 ) => TransactionSession;
 commitActiveTransaction: () => HistoryEntry | null;
 cancelActiveTransaction: () => void;
 undo: () => HistoryEntry | null;
 redo: () => HistoryEntry | null;
 resetHistory: (newInitialState: DesignState) => void;
}

/**
 * React hook uniting document state, bounded history, and transaction lifecycle.
 */
export function useDesignHistory({
 initialState,
 getSelection,
 onRestoreSelection,
 limit = 75,
 mode,
}: UseDesignHistoryOptions): UseDesignHistoryReturn {
 const [state, setState] = useState<DesignState>(initialState);
 const [history, setHistory] = useState<HistoryState>(() => createHistoryState(limit));
 const [activeTransaction, setActiveTransaction] = useState<TransactionSession | null>(null);

 // Keep latest refs for callbacks
 const stateRef = useRef<DesignState>(state);
 stateRef.current = state;
 const historyRef = useRef<HistoryState>(history);
 historyRef.current = history;
 const activeTxRef = useRef<TransactionSession | null>(activeTransaction);
 activeTxRef.current = activeTransaction;

 const dispatchDirect = useCallback((action: DesignAction) => {
  setState((curr) => transitionState(curr, action, mode));
 }, [mode]);

 const executeAction = useCallback(
  (
   action: DesignAction,
   metadata: { type: HistoryActionType; label: string; affectedIds?: string[] }
  ): HistoryEntry | null => {
   let currentHistory = historyRef.current;
   const currentTx = activeTxRef.current;

   // Commit in-flight transaction first if any
   if (currentTx) {
    const res = commitTransaction(currentHistory, currentTx, stateRef.current, getSelection());
    currentHistory = res.nextHistory;
    setActiveTransaction(null);
    activeTxRef.current = null;
   }

   const beforeState = stateRef.current;
   const beforeSelection = getSelection();
   const nextState = transitionState(beforeState, action, mode);

   if (nextState === beforeState) return null;

   const afterSelection = getSelection();

   const nextHistory = commitHistoryEntry(currentHistory, {
    type: metadata.type,
    label: metadata.label,
    before: beforeState,
    after: nextState,
    selectionBefore: beforeSelection,
    selectionAfter: afterSelection,
    affectedIds: metadata.affectedIds ?? [],
   });

   setHistory(nextHistory);
   setState(nextState);

   return nextHistory.past[nextHistory.past.length - 1] ?? null;
  },
  [getSelection, mode]
 );
 const commitManualEntry = useCallback(
  ({
   type,
   label,
   before,
   after,
   affectedIds = [],
  }: {
   type: HistoryActionType;
   label: string;
   before: DesignState;
   after: DesignState;
   affectedIds?: string[];
  }): HistoryEntry | null => {
   const beforeSel = getSelection();
   const afterSel = getSelection();

   const nextHistory = commitHistoryEntry(historyRef.current, {
    type,
    label,
    before,
    after,
    selectionBefore: beforeSel,
    selectionAfter: afterSel,
    affectedIds,
   });

   setHistory(nextHistory);
   return nextHistory.past[nextHistory.past.length - 1] ?? null;
  },
  [getSelection]
 );

 const startTransaction = useCallback(
  (type: HistoryActionType, label: string, affectedIds: string[] = []): TransactionSession => {
   let currentHistory = historyRef.current;
   const currentTx = activeTxRef.current;

   if (currentTx) {
    const res = commitTransaction(currentHistory, currentTx, stateRef.current, getSelection());
    currentHistory = res.nextHistory;
    setHistory(currentHistory);
   }

   const tx = beginTransaction(stateRef.current, getSelection(), type, label, affectedIds);
   setActiveTransaction(tx);
   return tx;
  },
  [getSelection]
 );

 const commitActiveTransaction = useCallback((): HistoryEntry | null => {
  const currentTx = activeTxRef.current;
  if (!currentTx) return null;

  const res = commitTransaction(historyRef.current, currentTx, stateRef.current, getSelection());
  setHistory(res.nextHistory);
  setActiveTransaction(null);
  return res.committedEntry;
 }, [getSelection]);

 const cancelActiveTransaction = useCallback(() => {
  const currentTx = activeTxRef.current;
  if (!currentTx) return;

  const res = cancelTransaction(currentTx);
  setState(res.restoredState);
  onRestoreSelection(res.restoredSelection);
  setActiveTransaction(null);
 }, [onRestoreSelection]);

 const undo = useCallback((): HistoryEntry | null => {
  const currentTx = activeTxRef.current;

  // Active transaction takes priority: Undo cancels it first
  if (currentTx) {
   const canceledLabel = currentTx.label;
   const canceledType = currentTx.type;
   const canceledIds = currentTx.affectedIds;
   const res = cancelTransaction(currentTx);
   setState(res.restoredState);
   onRestoreSelection(res.restoredSelection);
   setActiveTransaction(null);

   return {
    id: `undo-cancel-${Date.now()}`,
    timestamp: Date.now(),
    type: canceledType,
    label: canceledLabel,
    before: res.restoredState,
    after: res.restoredState,
    selectionBefore: res.restoredSelection,
    selectionAfter: res.restoredSelection,
    affectedIds: canceledIds,
   };
  }

  const res = undoHistory(historyRef.current, stateRef.current, getSelection());
  if (!res) return null;

  setHistory(res.nextHistory);
  setState(res.restoredState);
  onRestoreSelection(res.restoredSelection);
  return res.undoneEntry;
 }, [getSelection, onRestoreSelection]);

 const redo = useCallback((): HistoryEntry | null => {
  if (activeTxRef.current) return null;

  const res = redoHistory(historyRef.current, stateRef.current, getSelection());
  if (!res) return null;

  setHistory(res.nextHistory);
  setState(res.restoredState);
  onRestoreSelection(res.restoredSelection);
  return res.redoneEntry;
 }, [getSelection, onRestoreSelection]);

 const resetHistory = useCallback(
  (newInitialState: DesignState) => {
   setState(newInitialState);
   setHistory(createHistoryState(limit));
   setActiveTransaction(null);
  },
  [limit]
 );

 return {
  state,
  setState,
  history,
  activeTransaction,
  canUndo: activeTransaction !== null || canUndoStack(history),
  canRedo: activeTransaction === null && canRedoStack(history),
  dispatchDirect,
  executeAction,
  commitManualEntry,
  startTransaction,
  commitActiveTransaction,
  cancelActiveTransaction,
  undo,
  redo,
  resetHistory,
 };
}
