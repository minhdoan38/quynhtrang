import type { ReactNode } from 'react';

export type PreviewViewId =
  | 'flat'
  | 'box'
  | 'card-closed'
  | 'card-open'
  | 'card-back'
  | 'sticker'
  | 'notebook';

export interface PreviewViewOption {
  id: PreviewViewId;
  label: string;
}

export interface PreviewShellProps {
  productTitle: string;
  variantTitle?: string;
  activeView: PreviewViewId;
  availableViews?: PreviewViewOption[];
  onViewChange?: (view: PreviewViewId) => void;
  onBackToEdit: () => void;
  onDoneToPreflight: () => void;
  children: ReactNode;
}
