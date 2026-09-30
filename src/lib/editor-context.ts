import type { DesignState } from './product-state.ts';
import type { DesignReviewMode } from './domain/design-revision.ts';

export type EditorContextType = 'guest' | 'staff';

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

export type CustomizerContext = GuestEditorContext | StaffEditorContext;
