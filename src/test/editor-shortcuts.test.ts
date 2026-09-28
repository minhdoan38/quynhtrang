import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldHandleEditorShortcut, resolveShortcutAction } from '../lib/use-editor-shortcuts.ts';

test('resolveShortcutAction detects Cmd+Z and Ctrl+Z as undo', () => {
  assert.equal(
    resolveShortcutAction({ metaKey: true, ctrlKey: false, shiftKey: false, key: 'z' }),
    'undo'
  );
  assert.equal(
    resolveShortcutAction({ metaKey: false, ctrlKey: true, shiftKey: false, key: 'z' }),
    'undo'
  );
  assert.equal(
    resolveShortcutAction({ metaKey: true, ctrlKey: false, shiftKey: false, key: 'Z' }),
    'undo'
  );
});

test('resolveShortcutAction detects Cmd+Shift+Z, Ctrl+Shift+Z, Cmd+Y, Ctrl+Y as redo', () => {
  assert.equal(
    resolveShortcutAction({ metaKey: true, ctrlKey: false, shiftKey: true, key: 'z' }),
    'redo'
  );
  assert.equal(
    resolveShortcutAction({ metaKey: false, ctrlKey: true, shiftKey: true, key: 'Z' }),
    'redo'
  );
  assert.equal(
    resolveShortcutAction({ metaKey: true, ctrlKey: false, shiftKey: false, key: 'y' }),
    'redo'
  );
  assert.equal(
    resolveShortcutAction({ metaKey: false, ctrlKey: true, shiftKey: false, key: 'Y' }),
    'redo'
  );
});

test('resolveShortcutAction ignores plain Z or other keys without modifier', () => {
  assert.equal(
    resolveShortcutAction({ metaKey: false, ctrlKey: false, shiftKey: false, key: 'z' }),
    null
  );
  assert.equal(
    resolveShortcutAction({ metaKey: true, ctrlKey: false, shiftKey: false, key: 'c' }),
    null
  );
});

test('shouldHandleEditorShortcut excludes input, textarea, and contenteditable targets', () => {
  const mockInput = { tagName: 'INPUT', isContentEditable: false };
  assert.equal(shouldHandleEditorShortcut(mockInput), false);

  const mockTextarea = { tagName: 'TEXTAREA', isContentEditable: false };
  assert.equal(shouldHandleEditorShortcut(mockTextarea), false);

  const mockEditable = { tagName: 'DIV', isContentEditable: true };
  assert.equal(shouldHandleEditorShortcut(mockEditable), false);

  const mockBody = { tagName: 'BODY', isContentEditable: false };
  assert.equal(shouldHandleEditorShortcut(mockBody), true);

  const mockCanvas = { tagName: 'DIV', isContentEditable: false };
  assert.equal(shouldHandleEditorShortcut(mockCanvas), true);
});
