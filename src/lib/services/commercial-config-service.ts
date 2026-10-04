import type { StaffIdentity } from '../domain/order.ts';
import type { CommercialConfigVersion, CommercialVariantRule } from '../domain/commercial-config.ts';
import type { CommercialDraft } from '../domain/catalog.ts';
import type { AdminCatalogRepository } from '../repositories/admin-catalog-repository.ts';
import { validateCommercialConfig } from '../domain/commercial-config.ts';
export type { CommercialDraft } from '../domain/catalog.ts';

export interface SaveCommercialDraftInput {
  draftId: string;
  expectedRevision: number;
  payload: Omit<CommercialConfigVersion, 'id' | 'productId' | 'versionNumber'> & Partial<Pick<CommercialConfigVersion, 'id' | 'productId' | 'versionNumber'>>;
  requestId: string;
}

export interface PublishCommercialConfigInput {
  productId: string;
  expectedDraftRevision: number;
  expectedProductRevision: number;
  requestId: string;
}

export type PublishedCommercialConfig = CommercialConfigVersion;

interface CommercialDeps {
  staff: StaffIdentity;
  repo: AdminCatalogRepository;
}

function requireAdmin(staff: StaffIdentity): void {
  if (staff.role !== 'admin') throw new Error('FORBIDDEN');
}

function validatePayload(payload: CommercialConfigVersion, activeVariantIds: readonly string[]): void {
  const errors = validateCommercialConfig(payload, activeVariantIds);
  if (errors.length > 0) throw new Error(`COMMERCIAL_CONFIG_INVALID: ${errors.join('; ')}`);
}

export async function createOrLoadCommercialDraft(productId: string, staffId: string, deps: CommercialDeps): Promise<CommercialDraft> {
  requireAdmin(deps.staff);
  if (deps.staff.userId !== staffId) throw new Error('FORBIDDEN');
  if (!productId.trim()) throw new Error('INVALID_INPUT');
  return deps.repo.loadDraft(productId, staffId);
}

export async function saveCommercialDraft(input: SaveCommercialDraftInput, deps: CommercialDeps): Promise<CommercialDraft> {
  requireAdmin(deps.staff);
  if (!input.draftId.trim() || !input.requestId.trim() || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw new Error('INVALID_INPUT');
  const draft = deps.repo.getCommercialDraftById(input.draftId);
  if (!draft) throw new Error('NOT_FOUND');
  const product = deps.repo.getProduct(draft.productId);
  if (!product) throw new Error('NOT_FOUND');
  const payload: CommercialConfigVersion = {
    id: input.payload.id ?? draft.payload.id ?? draft.id,
    productId: input.payload.productId ?? draft.productId,
    versionNumber: input.payload.versionNumber ?? draft.payload.versionNumber ?? 1,
    currency: input.payload.currency,
    paymentPolicy: input.payload.paymentPolicy,
    variantRules: input.payload.variantRules,
  };
  const activeVariantIds = deps.repo.listVariants(draft.productId).filter((variant) => variant.status === 'active').map((variant) => variant.id);
  validatePayload(payload, activeVariantIds);
  return deps.repo.saveDraft(input.draftId, input.expectedRevision, payload);
}

export async function publishProductCommercialConfig(input: PublishCommercialConfigInput, deps: CommercialDeps): Promise<PublishedCommercialConfig> {
  requireAdmin(deps.staff);
  if (!input.productId.trim() || !input.requestId.trim()) throw new Error('INVALID_INPUT');
  const product = deps.repo.getProduct(input.productId);
  const draft = deps.repo.getCommercialDraft(input.productId);
  if (!product || !draft) throw new Error('NOT_FOUND');
  const activeVariantIds = deps.repo.listVariants(input.productId).filter((variant) => variant.status === 'active').map((variant) => variant.id);
  validatePayload({ ...draft.payload, id: draft.payload.id ?? draft.id, productId: input.productId, versionNumber: Math.max(1, draft.payload.versionNumber ?? 1) }, activeVariantIds);
  return deps.repo.publishDraft(input.productId, input.expectedDraftRevision, input.expectedProductRevision, input.requestId);
}
