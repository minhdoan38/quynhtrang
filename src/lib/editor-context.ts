import type { DesignState } from './product-state.ts';
import type { DesignReviewMode, EditorMutationMode } from './domain/design-revision.ts';

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
  versionId?: string;
  initialDocument: DesignState;
  onSave?: (doc: DesignState) => Promise<{ revision: number } | void>;
  onUploadAsset?: (file: File) => Promise<{ assetId: string; url: string }>;
  onExit?: () => void;
}

export interface TemplatePreviewEditorContext {
  type: 'template-preview';
  templateId?: string;
  initialDocument: DesignState;
  onExit?: () => void;
}

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
