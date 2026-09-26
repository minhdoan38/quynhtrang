/**
 * Navigation state machine and Back resolution hierarchy.
 * Follows the core rule:
 * "Back should always close the nearest active state first before leaving the current screen."
 */

export type CheckoutStep = 'summary' | 'customer' | 'qr' | 'confirmation';

export type SaveStatus = 'saved' | 'saving' | 'error';

export interface EditorBackState {
  hasUnsavedWarning?: boolean;
  isCheckoutOpen?: boolean;
  checkoutStep?: CheckoutStep;
  hasCreatedOrder?: boolean;
  isPreviewOpen?: boolean;
  isPreflightOpen?: boolean;
  activeSheet?: string | null;
  focusMode?: string | null;
  selectedTarget?: string | null;
  saveStatus?: SaveStatus;
  isDirty?: boolean;
  returnView?: 'setup' | 'launcher';
}

export type EditorBackAction =
  | { type: 'CLOSE_UNSAVED_WARNING' }
  | { type: 'CHECKOUT_PREVIOUS_STEP'; toStep: 'summary' | 'customer' }
  | { type: 'DISMISS_CHECKOUT' }
  | { type: 'DISMISS_CONFIRMATION' }
  | { type: 'CLOSE_PREVIEW' }
  | { type: 'CLOSE_PREFLIGHT' }
  | { type: 'CLOSE_SHEET' }
  | { type: 'EXIT_FOCUS_MODE'; cancelChanges: true }
  | { type: 'DESELECT_TARGET' }
  | { type: 'PROMPT_UNSAVED'; reason: 'saving' | 'error' }
  | { type: 'LEAVE_EDITOR'; destination: 'setup' | 'launcher' };

/**
 * Pure resolver for Back navigation inside Editor.
 * Order of priority:
 * 1. Unsaved warning modal -> Close warning modal
 * 2. Checkout open:
 *    - if on confirmation -> close checkout (never re-enter QR)
 *    - if on qr -> go back to customer
 *    - if on customer -> go back to summary
 *    - if on summary -> close checkout dialog, remain in editor
 * 3. Dedicated Preview Dialog open -> Close preview, remain in editor
 * 4. Dedicated Preflight open -> Close preflight, remain in editor
 * 5. Active bottom sheet open -> Close sheet, remain in editor
 * 6. Focused editing mode (Crop, Text edit) -> Cancel mode & changes, return to selected target
 * 7. Selected canvas object -> Deselect object, restore main toolbar
 * 8. Base clean editor:
 *    - If saveStatus is 'saving' or 'error' (real risk of data loss) -> prompt warning
 *    - If saveStatus is 'saved' (or not dirty) -> leave editor immediately without prompt
 */
export function resolveEditorBackAction(state: EditorBackState): EditorBackAction {
  // 1. Close unsaved warning if currently open
  if (state.hasUnsavedWarning) {
    return { type: 'CLOSE_UNSAVED_WARNING' };
  }

  // 2. Checkout active steps
  if (state.isCheckoutOpen) {
    const step = state.checkoutStep || 'summary';
    if (step === 'confirmation') {
      return { type: 'DISMISS_CONFIRMATION' };
    }
    if (step === 'qr') {
      return { type: 'CHECKOUT_PREVIOUS_STEP', toStep: 'customer' };
    }
    if (step === 'customer') {
      return { type: 'CHECKOUT_PREVIOUS_STEP', toStep: 'summary' };
    }
    return { type: 'DISMISS_CHECKOUT' };
  }

  // 3. Physical Preview dialog
  if (state.isPreviewOpen) {
    return { type: 'CLOSE_PREVIEW' };
  }

  // 4. Preflight dialog / panel
  if (state.isPreflightOpen) {
    return { type: 'CLOSE_PREFLIGHT' };
  }

  // 5. Bottom sheets (Font, Color, Layers, Templates, Opacity, More, etc.)
  if (state.activeSheet !== null && state.activeSheet !== undefined) {
    return { type: 'CLOSE_SHEET' };
  }

  // 6. Focused editing mode (Crop, Text-edit)
  if (state.focusMode !== null && state.focusMode !== undefined) {
    return { type: 'EXIT_FOCUS_MODE', cancelChanges: true };
  }

  // 7. Selected object on canvas
  if (state.selectedTarget !== null && state.selectedTarget !== undefined) {
    return { type: 'DESELECT_TARGET' };
  }

  // 8. Base editor exit check
  if (state.saveStatus === 'saving') {
    return { type: 'PROMPT_UNSAVED', reason: 'saving' };
  }
  if (state.saveStatus === 'error') {
    return { type: 'PROMPT_UNSAVED', reason: 'error' };
  }

  // Clean and safely persisted: leave immediately without confirmation
  return {
    type: 'LEAVE_EDITOR',
    destination: state.returnView || 'setup',
  };
}

/**
 * Pure resolver for Template Browser Back
 */
export interface TemplateBrowserBackState {
  hasPreviewItem: boolean;
  returnView: 'setup' | 'editor';
}

export type TemplateBrowserBackAction =
  | { type: 'CLOSE_TEMPLATE_PREVIEW' }
  | { type: 'RETURN_TO_PREVIOUS_VIEW'; destination: 'setup' | 'editor' };

export function resolveTemplateBrowserBackAction(
  state: TemplateBrowserBackState
): TemplateBrowserBackAction {
  if (state.hasPreviewItem) {
    return { type: 'CLOSE_TEMPLATE_PREVIEW' };
  }
  return {
    type: 'RETURN_TO_PREVIOUS_VIEW',
    destination: state.returnView,
  };
}

/**
 * Pure resolver for Product Setup Back
 */
export function resolveProductSetupBackAction(): { type: 'RETURN_TO_LAUNCHER' } {
  return { type: 'RETURN_TO_LAUNCHER' };
}
