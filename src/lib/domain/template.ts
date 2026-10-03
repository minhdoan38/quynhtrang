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

export interface TemplateCategoryRecord {
  id: string;
  name: string;
  sortOrder: number;
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
  status?: TemplateStatus | 'needs_update';
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


export interface DuplicateTemplateInput {
  requestId: string;
  sourceTemplateId: string;
  sourceVersionId?: string | null;
  newName?: string | null;
  newTemplateId?: string | null;
}

export interface DeleteDraftTemplateInput {
  requestId: string;
  templateId: string;
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
  blockers?: TemplateAvailabilityBlocker[];
  thumbnailUrl?: string | null;
}

export interface TemplateDraftRecord {
  id: string;
  templateId: string;
  basedOnVersionId: string | null;
  designDocument: DesignState;
  documentSchemaVersion: number;
  draftRevision: number;
  sourceDocumentHash?: string | null;
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
  sortOrder?: number;
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
  findings: { code: string; elementId?: string; surfaceId?: string; message?: string }[];
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
  storagePath?: string;
  checksum: string;
  mimeType: string;
  byteSize: number;
  widthPx?: number;
  heightPx?: number;
  uploadStatus?: string;
  status?: 'draft' | 'published' | 'archived' | 'cleaned';
  isPublished: boolean;
  createdAt: string;
  createdBy?: string | null;
}

export interface AttachTemplateAssetInput {
  templateId: string;
  draftId?: string | null;
  storageBucket: string;
  storagePath: string;
  checksum: string;
  mimeType: string;
  byteSize: number;
  pixelWidth?: number | null;
  pixelHeight?: number | null;
  uploadStatus?: string;
}

export interface EligibleSourceProject {
  id: string;
  productId: string;
  variantId: string | null;
  currentWorkingRevision: number;
  createdAt: string;
  updatedAt: string;
  eligible: boolean;
  blockedReason: string | null;
}

export interface SourceProjectDetail extends EligibleSourceProject {
  ownerUserId: string;
  workingDocument: Record<string, unknown> | null;
}

export interface TemplatePage {
  items: TemplateCard[];
  nextCursor: string | null;
}

export interface BrowseAvailableTemplatesOptions {
  target?: Partial<TemplateTargetInput> | TemplateTarget | null;
  categoryId?: string | null;
  query?: string | null;
  cursor?: string | null;
  limit?: number | null;
}

export interface DependencyMetadataItem {
  id: string;
  kind: 'font-face' | 'sticker' | 'font-family';
  status: 'draft' | 'published' | 'archived';
  checksum?: string;
  familyName?: string;
  familyId?: string;
  familyStatus?: 'draft' | 'published' | 'archived';
  storageBucket?: string;
  storagePath?: string;
  format?: string;
  postscriptName?: string;
  cssFamily?: string;
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
  | 'RIGHTS_ACKNOWLEDGEMENT_REQUIRED'
  | 'SOURCE_PROJECT_HAS_ORDERS'
  | 'ARCHIVED_DEPENDENCY'
  | 'NO_PUBLISHED_VERSION'
  | 'CANNOT_DELETE_PUBLISHED_TEMPLATE'
  | 'CANNOT_DELETE_TEMPLATE_WITH_VERSIONS'
  | 'CANNOT_DELETE_REFERENCED_TEMPLATE'
  | 'INTERNAL_ERROR'
  | 'TEMPLATE_CHANGED'
  | 'TEMPLATE_UNAVAILABLE';

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
  ARCHIVED_DEPENDENCY: 409,
  NO_PUBLISHED_VERSION: 409,
  CANNOT_DELETE_PUBLISHED_TEMPLATE: 409,
  CANNOT_DELETE_TEMPLATE_WITH_VERSIONS: 409,
  CANNOT_DELETE_REFERENCED_TEMPLATE: 409,
  VALIDATION_FAILED: 422,
  TARGET_MISMATCH: 422,
  DEPENDENCY_UNRESOLVED: 422,
  ASSET_MISSING: 422,
  STORAGE_FAILURE: 500,
  RIGHTS_ACKNOWLEDGEMENT_REQUIRED: 400,
  SOURCE_PROJECT_HAS_ORDERS: 400,
  INTERNAL_ERROR: 500,
  TEMPLATE_CHANGED: 409,
  TEMPLATE_UNAVAILABLE: 409,
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
