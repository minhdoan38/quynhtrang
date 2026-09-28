import { useEffect } from 'react';

export interface ShortcutKeyInfo {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  key: string;
}

export function resolveShortcutAction(info: ShortcutKeyInfo): 'undo' | 'redo' | null {
  const isModifier = info.metaKey || info.ctrlKey;
  if (!isModifier) return null;

  const k = info.key.toLowerCase();
  if (k === 'z') {
    return info.shiftKey ? 'redo' : 'undo';
  }
  if (k === 'y' && !info.shiftKey) {
    return 'redo';
  }

  return null;
}

export function shouldHandleEditorShortcut(target: unknown): boolean {
  if (!target || typeof target !== 'object') return true;

  const el = target as { tagName?: string; isContentEditable?: boolean };
  if (el.isContentEditable) return false;

  const tag = el.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return false;
  }

  return true;
}

export interface UseEditorShortcutsProps {
  enabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function useEditorShortcuts({
  enabled = true,
  onUndo,
  onRedo,
}: UseEditorShortcutsProps) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!shouldHandleEditorShortcut(e.target)) return;

      const action = resolveShortcutAction({
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        key: e.key,
      });

      if (action === 'undo') {
        e.preventDefault();
        onUndo();
      } else if (action === 'redo') {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onUndo, onRedo]);
}
