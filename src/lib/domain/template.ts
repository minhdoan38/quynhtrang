import type { DesignState, ProductId, FixedStickerShape } from '../product-state.ts';
import type { LibraryRef } from './asset-library.ts';

export type TemplateStatus = 'draft' | 'published' | 'archived';

export interface TemplateTargetInput {
  productId: ProductId;
  variantId: string;
  mode: 'pattern' | 'full-sheet' | null;
  shape: FixedStickerShape | null;
}

export interface TemplateTargetSurface {
  id: 'front' | 'inside' | 'back' | 'sheet';
  widthMm: number;
  heightMm: number;
}

export interface TemplateTarget extends TemplateTargetInput {
  surfaces: TemplateTargetSurface[];
  geometryKey: string;
}

export interface TemplateMutation {
  templateId: string;
  expectedCatalogRevision: number;
  requestId: string;
}

export interface TemplateMetadataPatch {
  name?: string;
  categoryId?: string | null;
  tags?: string[];
  sortOrder?: number;
}

export interface CreateTemplateRepoInput {
  requestId: string;
  id: string;
  name: string;
  productId: ProductId;
  variantId: string;
  productMode: 'pattern' | 'full-sheet' | null;
  fixedStickerShape: FixedStickerShape | null;
  categoryId?: string | null;
  tags?: string[];
  sortOrder?: number;
  targetSnapshot: Record<string, unknown>;
  initialDocument: DesignState;
}

export interface AdminTemplateListQuery {
  status?: TemplateStatus;
  productId?: string;
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TemplateVersionSummary {
  id: string;
  version: number;
  publishedAt: string;
  publishedBy: string | null;
  revisionNote: string | null;
}

export type TemplateRepoResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TemplateErrorCode | string; message: string };

export interface TemplateDraftGuard {
  templateId: string;
  draftId: string;
  expectedRevision: number;
  sessionId: string;
  leaseEpoch: number;
}

export interface SaveTemplateDraftInput extends TemplateDraftGuard {
  requestId: string;
  document: DesignState;
}

export interface PublishTemplateInput extends TemplateDraftGuard, TemplateMutation {
  validationId: string;
  acknowledgedWarningIds: string[];
  revisionNote?: string;
}

export interface UseTemplateInput {
  templateId: string;
  expectedVersionId: string;
  target: TemplateTargetInput;
  requestId: string;
}

export interface TemplateProvenance {
  templateId: string;
  templateVersionId: string;
}

export interface TemplateVersionPayload {
  versionId: string;
  templateId: string;
  version: number;
  documentSchemaVersion: number;
  document: DesignState;
  target: TemplateTarget;
  dependencies: LibraryRef[];
}

export interface TemplateAvailabilityBlocker {
  code: string;
  kind?: string;
  id?: string;
  message: string;
}

export interface TemplateAvailability {
  available: boolean;
  blockers: TemplateAvailabilityBlocker[];
}

export interface TemplateRecord {
  id: string;
  slug?: string;
  name: string;
  status: TemplateStatus;
  revision: number;
  productId: ProductId;
  variantId: string;
  mode: 'pattern' | 'full-sheet' | null;
  shape: FixedStickerShape | null;
  target: TemplateTarget;
  categoryId: string;
  tags: string[];
  sortOrder: number;
  currentPublishedVersionId: string | null;
  everPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface TemplateDraftRecord {
  id: string;
  templateId: string;
  basedOnVersionId: string | null;
  designDocument: DesignState;
  documentSchemaVersion: number;
  draftRevision: number;
  editorUserId: string | null;
  leaseSessionId: string | null;
  leaseEpoch: number;
  leaseExpiresAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface TemplateCard {
  id: string;
  slug: string;
  name: string;
  target: TemplateTarget;
  categoryId: string;
  tags: string[];
  currentVersionId: string | null;
  thumbnailUrl: string | null;
  status?: TemplateStatus;
  blockers?: TemplateAvailabilityBlocker[];
  updatedAt?: string;
}

export interface TemplateValidationReceipt {
  id: string;
  templateId: string;
  draftId: string;
  sourceRevision: number;
  sourceDocumentHash: string;
  candidateDocumentHash: string;
  targetHash: string;
  leaseEpoch: number;
  sessionId: string;
  findings: { code: string; elementId?: string; message?: string }[];
  warningIds: string[];
  customerPreviewPassed: boolean;
  engineFingerprint: string;
  thumbnail: {
    assetId: string;
    sha256: string;
  };
  expiresAt: string;
}

export interface TemplateAssetRecord {
  id: string;
  templateId: string;
  draftId: string | null;
  storageBucket: string;
  storageKey: string;
  checksum: string;
  mimeType: string;
  byteSize: number;
  widthPx?: number;
  heightPx?: number;
  isPublished: boolean;
  createdAt: string;
  createdBy?: string | null;
}

export interface TemplatePage {
  items: TemplateCard[];
  nextCursor: string | null;
}

export interface DependencyMetadataItem {
  id: string;
  kind: 'font-face' | 'sticker';
  status: 'draft' | 'published' | 'archived';
  checksum?: string;
  familyName?: string;
  familyId?: string;
  familyStatus?: 'draft' | 'published' | 'archived';
}

export interface TemplateAvailabilityDependencies {
  lookup?: ReadonlyMap<string, DependencyMetadataItem> | Record<string, DependencyMetadataItem>;
  assetManifestHealthy?: boolean;
}

export type TemplateErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'LEASE_CONFLICT'
  | 'LEASE_EXPIRED'
  | 'ACTIVE_DRAFT_EXISTS'
  | 'IMMUTABLE_VERSION'
  | 'ALREADY_PUBLISHED'
  | 'CANNOT_DELETE_PUBLISHED'
  | 'CANNOT_DELETE_WITH_HISTORY'
  | 'VALIDATION_FAILED'
  | 'TARGET_MISMATCH'
  | 'DEPENDENCY_UNRESOLVED'
  | 'ASSET_MISSING'
  | 'STORAGE_FAILURE'
  | 'INTERNAL_ERROR';

export const templateServiceStatuses: Record<TemplateErrorCode | string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  LEASE_CONFLICT: 409,
  LEASE_EXPIRED: 409,
  ACTIVE_DRAFT_EXISTS: 409,
  IMMUTABLE_VERSION: 409,
  ALREADY_PUBLISHED: 409,
  CANNOT_DELETE_PUBLISHED: 409,
  CANNOT_DELETE_WITH_HISTORY: 409,
  VALIDATION_FAILED: 422,
  TARGET_MISMATCH: 422,
  DEPENDENCY_UNRESOLVED: 422,
  ASSET_MISSING: 422,
  STORAGE_FAILURE: 500,
  INTERNAL_ERROR: 500,
};

export class TemplateServiceError extends Error {
  readonly code: TemplateErrorCode | string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: TemplateErrorCode | string, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'TemplateServiceError';
    this.code = code;
    this.status = status ?? (templateServiceStatuses[code] ?? 500);
    this.details = details;
  }
}
