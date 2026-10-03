import type { DesignState } from './product-state.ts';
import type { DesignReviewMode, EditorMutationMode } from './domain/design-revision.ts';
import type { SaveStatus } from './draft-autosave.ts';

export type EditorContextType =
  | 'guest'
  | 'staff'
  | 'customer'
  | 'template-author'
  | 'template-preview';
export interface GuestEditorContext {
  type?: 'guest';
}

export interface StaffEditorContext {
  type: 'staff';
  mode: DesignReviewMode;
  orderId: string;
  orderCode: string;
  draftId?: string | null;
  baseVersionNumber?: number;
  initialDocument: DesignState;
  sessionId: string;
  onSave?: (doc: DesignState) => Promise<{ revision: number } | void>;
  onUploadAsset?: (file: File) => Promise<{ assetId: string; url: string }>;
  onExit?: () => void;
  onComplete?: () => void;
  readOnly?: boolean;
}

export interface CustomerEditorContext {
  type: 'customer';
  projectId: string;
  initialRevision: number;
  initialDocument: DesignState;
  onSave?: (
    doc: DesignState,
    expectedRev: number
  ) => Promise<{ newRevision: number } | { conflict: true; currentRevision: number }>;
  onExit?: () => void;
}

export interface TemplateAuthorEditorContext {
  type: 'template-author';
  templateId?: string;
  draftId?: string;
  versionId?: string;
  initialDocument: DesignState;
  readOnly?: boolean;
  saveStatus?: SaveStatus;
  draftRevision?: number;
  leaseEpoch?: number;
  sessionId?: string;
  onSave?: (doc: DesignState) => Promise<{ revision: number } | void> | void;
  onUploadAsset?: (file: File) => Promise<{ assetId: string; url: string }>;
  onExit?: () => void;
  onValidate?: () => Promise<unknown> | void;
  onPublish?: () => Promise<unknown> | void;
  onCustomerPreview?: () => void;
  onNavigateSurface?: (surfaceId: string, elementId?: string) => void;
}
export type TemplateEditorContext = TemplateAuthorEditorContext;

export interface TemplatePreviewEditorContext {
  type: 'template-preview';
  templateId?: string;
  initialDocument: DesignState;
  onExit?: () => void;
}
export type TemplatePreviewContext = TemplatePreviewEditorContext;

export type CustomizerContext =
  | GuestEditorContext
  | StaffEditorContext
  | CustomerEditorContext
  | TemplateAuthorEditorContext
  | TemplatePreviewEditorContext;

export function getEditorMutationMode(context?: CustomizerContext | null): EditorMutationMode {
  if (!context || !context.type || context.type === 'guest') return 'guest';
  if (context.type === 'customer') return 'customer';
  if (context.type === 'template-author') return 'template-author';
  if (context.type === 'template-preview') return 'template-preview';
  if (context.type === 'staff') return context.mode;
  return 'guest';
}

export interface EditorCapabilities {
  type: EditorContextType;
  isAuthorMode: boolean;
  isIsolatedPreview: boolean;
  isStaffMode: boolean;
  isCustomerMode: boolean;
  isGuestMode: boolean;
  canSave: boolean;
  canChangeProduct: boolean;
  canChangeVariant: boolean;
  canChangeQuantity: boolean;
  canCheckout: boolean;
  canCustomerLock: boolean;
  canBypassCustomerLock: boolean;
  canConfigurePlaceholder: boolean;
  allowLocalStorage: boolean;
  allowSessionStorage: boolean;
  fixedTarget: boolean;
  showPricing: boolean;
}

export function getEditorCapabilities(context?: CustomizerContext | null): EditorCapabilities {
  const type: EditorContextType = (!context || !context.type || context.type === 'guest')
    ? 'guest'
    : context.type;

  const isAuthorMode = type === 'template-author';
  const isIsolatedPreview = type === 'template-preview';
  const isStaffMode = type === 'staff';
  const isCustomerMode = type === 'customer';
  const isGuestMode = type === 'guest';

  const readOnly = Boolean(
    (context && 'readOnly' in context && context.readOnly) ||
    (type === 'staff' && (context as StaffEditorContext).mode === 'review')
  );

  return {
    type,
    isAuthorMode,
    isIsolatedPreview,
    isStaffMode,
    isCustomerMode,
    isGuestMode,
    canSave: !readOnly && !isIsolatedPreview,
    canChangeProduct: isGuestMode,
    canChangeVariant: isGuestMode || isCustomerMode,
    canChangeQuantity: isGuestMode,
    canCheckout: isGuestMode,
    canCustomerLock: (isAuthorMode && !readOnly) || (isStaffMode && (context as StaffEditorContext).mode === 'staff-edit'),
    canBypassCustomerLock: isAuthorMode || (isStaffMode && (context as StaffEditorContext).mode === 'staff-edit'),
    canConfigurePlaceholder: (isAuthorMode && !readOnly) || (isStaffMode && (context as StaffEditorContext).mode === 'staff-edit'),
    allowLocalStorage: isGuestMode,
    allowSessionStorage: isGuestMode,
    fixedTarget: isAuthorMode || isIsolatedPreview || isStaffMode,
    showPricing: isGuestMode,
  };
}
