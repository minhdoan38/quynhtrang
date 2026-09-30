import type { DesignState, ProductId, PreflightResult } from '../product-state.ts';
import type { FulfillmentStatus } from './order.ts';

export type StaffDraftStatus = 'editing' | 'ready_for_review' | 'approved' | 'discarded';
export type DesignReviewMode = 'review' | 'staff-edit' | 'preflight' | 'review-changes';

export type RevisionErrorCode =
 | 'UNAUTHENTICATED'
 | 'FORBIDDEN'
 | 'ORDER_LOCKED'
 | 'ACTIVE_DRAFT_EXISTS'
 | 'LEASE_LOST'
 | 'REVISION_CONFLICT'
 | 'PRODUCTION_CHANGED'
 | 'INVALID_DOCUMENT'
 | 'PREFLIGHT_BLOCKED'
 | 'PREFLIGHT_STALE'
 | 'WARNINGS_UNACKNOWLEDGED'
 | 'INVALID_REASON'
 | 'DRAFT_CLOSED'
 | 'ASSET_UNAVAILABLE';

export type RevisionResult<T> =
 | { ok: true; value: T }
 | { ok: false; code: RevisionErrorCode; message: string };

export interface DraftLease {
 sessionId: string;
 epoch: number;
 expiresAt: string;
}

export interface StaffDesignDraft {
 id: string;
 orderId: string;
 projectId: string;
 baseDesignVersionId: string;
 expectedProductionDesignVersionId: string;
 document: DesignState;
 revision: number;
 reason: string;
 status: StaffDraftStatus;
 createdBy: string;
 editorUserId: string;
 lease: DraftLease | null;
 createdAt: string;
 updatedAt: string;
 approvedDesignVersionId: string | null;
}

export interface DraftWriteGuard {
 draftId: string;
 expectedRevision: number;
 expectedProductionVersionId: string;
 lease: Pick<DraftLease, 'sessionId' | 'epoch'>;
}

export interface SaveStaffDraftInput extends DraftWriteGuard {
 requestId: string;
 document: DesignState;
}

export interface StaffPreflightAssessment {
 id: string;
 draftId: string | null;
 versionId: string | null;
 revision: number | null;
 documentHash: string;
 findings: PreflightResult;
 expiresAt: string;
 warningIds: string[];
}

export interface ApprovedRevisionResult {
 orderId: string;
 customerVersionId: string;
 productionVersionId: string;
 versionNumber: number;
 draftId: string | null;
}

export interface DesignVersionListItem {
 id: string;
 versionNumber: number;
 source: string;
 parentVersionId: string | null;
 reason: string | null;
 createdBy: string | null;
 createdAt: string;
 thumbnailPath: string | null;
 isCustomer: boolean;
 isProduction: boolean;
}

export interface StaffDraftSummary {
 id: string;
 orderId: string;
 status: StaffDraftStatus;
 editorUserId: string;
 editorDisplayName?: string;
 reason: string;
 revision: number;
 leaseExpiresAt: string | null;
 lastActivityAt: string;
 createdAt: string;
}

/**
 * Checks whether an order is eligible for design revisions.
 * Fulfillment in_production, completed, cancelled, and cancelled orders are ineligible.
 */
export function isDesignMutationEligible(state: { fulfillmentStatus: FulfillmentStatus }): boolean {
 return state.fulfillmentStatus === 'unprocessed' || state.fulfillmentStatus === 'ready_for_production';
}

const ALLOWED_ARTWORK_OPTION_KEYS: Record<ProductId, Record<string, true>> = {
 wrapping: {
  mode: true,
  patternConfig: true,
  repeatStyle: true,
  patternScale: true,
  spacingX: true,
  spacingY: true,
  rotation: true,
  backgroundColorValue: true,
  textColorValue: true,
 },
 card: {
  surface: true,
  textColorValue: true,
  backgroundColorValue: true,
 },
 sticker: {
  borderWidth: true,
  minBorderWidth: true,
  maxBorderWidth: true,
  hasWhiteBorder: true,
  showCutline: true,
  cutLineMode: true,
  backgroundColorValue: true,
  textColorValue: true,
 },
 notebook: {
  backgroundColorValue: true,
  textColorValue: true,
 },
};

const FROZEN_OPTION_KEYS: Record<ProductId, Record<string, true>> = {
 wrapping: {},
 card: { fold: true, orientation: true },
 sticker: { shape: true, size: true, width: true, height: true },
 notebook: { finish: true, binding: true, size: true },
};
/**
 * Ensures that staff edits do not change commercial or frozen manufacturing specifications.
 * Throws an Error if an unauthorized change is detected.
 */
export function assertStaffArtworkCompatible(base: DesignState, next: DesignState): void {
 if (base.productId !== next.productId) {
  throw new Error(`Không thể thay đổi sản phẩm trong bản chỉnh sửa (gốc: ${base.productId}, mới: ${next.productId})`);
 }

 if (base.variantId !== next.variantId) {
  throw new Error(`Không thể thay đổi loại hoặc khổ sản phẩm trong bản chỉnh sửa (gốc: ${base.variantId}, mới: ${next.variantId})`);
 }

 if (base.quantity !== next.quantity) {
  throw new Error(`Không thể thay đổi số lượng đặt hàng trong bản chỉnh sửa (gốc: ${base.quantity}, mới: ${next.quantity})`);
 }

 const productId = base.productId;
 const allowed = ALLOWED_ARTWORK_OPTION_KEYS[productId] || {};
 const frozen = FROZEN_OPTION_KEYS[productId] || {};

 const baseOpts = (base.productOptions || {}) as Record<string, unknown>;
 const nextOpts = (next.productOptions || {}) as Record<string, unknown>;

 const allKeys = new Set([...Object.keys(baseOpts), ...Object.keys(nextOpts)]);

 for (const key of allKeys) {
  const baseVal = baseOpts[key];
  const nextVal = nextOpts[key];

  if (JSON.stringify(baseVal) === JSON.stringify(nextVal)) {
   continue;
  }

  if (frozen[key]) {
   throw new Error(`Tùy chọn cấu hình "${key}" đã bị khóa với sản phẩm ${productId}`);
  }

  if (!allowed[key]) {
   throw new Error(`Tùy chọn không hợp lệ cho bản sửa thiết kế: "${key}"`);
  }
 }
}

/**
 * Determines whether a canvas element can be mutated in the given mode.
 * In review mode: false for all elements.
 * In guest mode: true only if element is not locked.
 * In staff-edit mode: true (staff can adjust artwork elements even if customer locked them).
 */
export function canMutateElement(
 mode: DesignReviewMode | 'guest' | undefined,
 element: { locked?: boolean }
): boolean {
 if (mode === 'review' || mode === 'preflight' || mode === 'review-changes') {
  return false;
 }
 if (mode === 'staff-edit') {
  return true;
 }
 return !element.locked;
}

/**
 * Validates revision reason (trimmed 3-500 Unicode characters).
 */
export function validateRevisionReason(reason: string): { valid: boolean; reason?: string } {
 if (typeof reason !== 'string') {
  return { valid: false, reason: 'Lý do chỉnh sửa phải là chuỗi ký tự' };
 }
 const trimmed = reason.trim();
 const charLength = Array.from(trimmed).length;
 if (charLength < 3) {
  return { valid: false, reason: 'Lý do chỉnh sửa phải có ít nhất 3 ký tự' };
 }
 if (charLength > 500) {
  return { valid: false, reason: 'Lý do chỉnh sửa không được vượt quá 500 ký tự' };
 }
 return { valid: true };
}
