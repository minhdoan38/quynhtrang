import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEditorBackAction,
  resolveTemplateBrowserBackAction,
  resolveProductSetupBackAction,
  type EditorBackState,
} from '../lib/navigation.ts';

test('Editor Back resolves strict hierarchy from outermost transient state to base editor', () => {
  // Scenario 1: Sheet is open while an object is selected and in focus mode
  const stateWithSheet: EditorBackState = {
    activeSheet: 'font',
    focusMode: 'text-edit',
    selectedTarget: 'text',
    saveStatus: 'saved',
  };
  assert.deepEqual(resolveEditorBackAction(stateWithSheet), { type: 'CLOSE_SHEET' });

  // Scenario 2: No sheet, but in focused mode (e.g. crop or text-edit)
  const stateInFocus: EditorBackState = {
    activeSheet: null,
    focusMode: 'crop',
    selectedTarget: 'image',
    saveStatus: 'saved',
  };
  assert.deepEqual(resolveEditorBackAction(stateInFocus), {
    type: 'EXIT_FOCUS_MODE',
    cancelChanges: true,
  });

  // Scenario 3: Object selected on canvas, no sheet and no focus mode
  const stateSelected: EditorBackState = {
    activeSheet: null,
    focusMode: null,
    selectedTarget: 'image',
    saveStatus: 'saved',
  };
  assert.deepEqual(resolveEditorBackAction(stateSelected), { type: 'DESELECT_TARGET' });

  // Scenario 4: Clean editor with saved state leaves immediately without confirmation dialog
  const cleanSavedState: EditorBackState = {
    activeSheet: null,
    focusMode: null,
    selectedTarget: null,
    saveStatus: 'saved',
    returnView: 'setup',
  };
  assert.deepEqual(resolveEditorBackAction(cleanSavedState), {
    type: 'LEAVE_EDITOR',
    destination: 'setup',
  });
});

test('Editor Preview (physical mockup) Back closes preview and remains in Editor', () => {
  const previewState: EditorBackState = {
    isPreviewOpen: true,
    activeSheet: null,
    focusMode: null,
    selectedTarget: null,
    saveStatus: 'saved',
  };
  assert.deepEqual(resolveEditorBackAction(previewState), { type: 'CLOSE_PREVIEW' });
});

test('Preflight Back closes preflight and remains in Editor', () => {
  const preflightState: EditorBackState = {
    isPreflightOpen: true,
    activeSheet: null,
    focusMode: null,
    selectedTarget: null,
    saveStatus: 'saved',
  };
  assert.deepEqual(resolveEditorBackAction(preflightState), { type: 'CLOSE_PREFLIGHT' });
});

test('Checkout Back walks backward through internal steps without losing data', () => {
  // Step 1: In QR step -> goes back to Customer info step
  const atQr: EditorBackState = {
    isCheckoutOpen: true,
    checkoutStep: 'qr',
  };
  assert.deepEqual(resolveEditorBackAction(atQr), {
    type: 'CHECKOUT_PREVIOUS_STEP',
    toStep: 'customer',
  });

  // Step 2: In Customer step -> goes back to Order Summary
  const atCustomer: EditorBackState = {
    isCheckoutOpen: true,
    checkoutStep: 'customer',
  };
  assert.deepEqual(resolveEditorBackAction(atCustomer), {
    type: 'CHECKOUT_PREVIOUS_STEP',
    toStep: 'summary',
  });

  // Step 3: In Order Summary -> closes checkout dialog, returns to Editor
  const atSummary: EditorBackState = {
    isCheckoutOpen: true,
    checkoutStep: 'summary',
  };
  assert.deepEqual(resolveEditorBackAction(atSummary), {
    type: 'DISMISS_CHECKOUT',
  });

  // Step 4: In Confirmation (order finished) -> closes confirmation, never re-enters QR
  const atConfirmation: EditorBackState = {
    isCheckoutOpen: true,
    checkoutStep: 'confirmation',
    hasCreatedOrder: true,
  };
  assert.deepEqual(resolveEditorBackAction(atConfirmation), {
    type: 'DISMISS_CONFIRMATION',
  });
});

test('Autosave status triggers warnings ONLY on real risk of data loss', () => {
  // While saving is still pending, warn customer
  const savingState: EditorBackState = {
    activeSheet: null,
    focusMode: null,
    selectedTarget: null,
    saveStatus: 'saving',
  };
  assert.deepEqual(resolveEditorBackAction(savingState), {
    type: 'PROMPT_UNSAVED',
    reason: 'saving',
  });

  // When save has failed, warn customer with retry capability
  const errorState: EditorBackState = {
    activeSheet: null,
    focusMode: null,
    selectedTarget: null,
    saveStatus: 'error',
  };
  assert.deepEqual(resolveEditorBackAction(errorState), {
    type: 'PROMPT_UNSAVED',
    reason: 'error',
  });

  // If unsaved warning is currently displayed, Back closes the warning dialog
  const warningModalOpen: EditorBackState = {
    hasUnsavedWarning: true,
    saveStatus: 'saving',
  };
  assert.deepEqual(resolveEditorBackAction(warningModalOpen), {
    type: 'CLOSE_UNSAVED_WARNING',
  });
});

test('Template Browser Back closes template preview first before returning to previous view', () => {
  // 1. When preview modal is open, Back closes preview only
  const previewing = resolveTemplateBrowserBackAction({
    hasPreviewItem: true,
    returnView: 'setup',
  });
  assert.deepEqual(previewing, { type: 'CLOSE_TEMPLATE_PREVIEW' });

  // 2. When on template grid, Back returns to setup
  const atGrid = resolveTemplateBrowserBackAction({
    hasPreviewItem: false,
    returnView: 'setup',
  });
  assert.deepEqual(atGrid, {
    type: 'RETURN_TO_PREVIOUS_VIEW',
    destination: 'setup',
  });
});

test('Product Setup Back returns to launcher', () => {
  assert.deepEqual(resolveProductSetupBackAction(), {
    type: 'RETURN_TO_LAUNCHER',
  });
});

test('back exits text editing before deselecting or leaving editor', () => {
  const action = resolveEditorBackAction({
    hasUnsavedWarning: false,
    isPreviewOpen: false,
    isPreflightOpen: false,
    activeSheet: null,
    focusMode: null,
    isTextEditing: true,
    selectedTarget: 'text',
    saveStatus: 'saved',
    returnView: 'setup',
  });
  assert.deepEqual(action, { type: 'EXIT_TEXT_EDIT', commitChanges: true });
});
