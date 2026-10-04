import type { StaffIdentity } from '../domain/order.ts';
import type { CatalogStatus } from '../domain/commercial-config.ts';
import type { AdminCatalogRepository, CatalogMutationResult } from '../repositories/admin-catalog-repository.ts';
import { resolveProductDefinition } from '../product-definition-registry.ts';

export type MutationResult = CatalogMutationResult;

interface LifecycleDeps {
  staff: StaffIdentity;
  repo: AdminCatalogRepository;
}

function forbidden(): MutationResult {
  return { ok: false, code: 'FORBIDDEN', message: 'Chỉ quản trị viên mới có quyền thay đổi trạng thái danh mục' };
}

async function setProductStatus(productId: string, status: CatalogStatus, expectedRevision: number, deps: LifecycleDeps): Promise<MutationResult> {
  if (deps.staff.role !== 'admin') return forbidden();
  if (!productId.trim() || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Thông tin sản phẩm hoặc revision không hợp lệ' };
  }
  return deps.repo.setProductStatus(productId, status, expectedRevision);
}

async function setVariantStatus(variantId: string, status: CatalogStatus, expectedRevision: number, deps: LifecycleDeps): Promise<MutationResult> {
  if (deps.staff.role !== 'admin') return forbidden();
  if (!variantId.trim() || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Thông tin biến thể hoặc revision không hợp lệ' };
  }
  if (status === 'active') {
    const variant = deps.repo.getVariant(variantId);
    if (variant?.definitionKey && !resolveProductDefinition(variant.productId, variant.id)) {
      return { ok: false, code: 'UNKNOWN_DEFINITION_KEY', message: 'Definition_key không thuộc danh mục hỗ trợ' };
    }
  }
  return deps.repo.setVariantStatus(variantId, status, expectedRevision);
}

export function activateProduct(productId: string, expectedRevision: number, deps: LifecycleDeps): Promise<MutationResult> {
  return setProductStatus(productId, 'active', expectedRevision, deps);
}

export function archiveProduct(productId: string, expectedRevision: number, deps: LifecycleDeps): Promise<MutationResult> {
  return setProductStatus(productId, 'archived', expectedRevision, deps);
}

export function activateVariant(variantId: string, expectedRevision: number, deps: LifecycleDeps): Promise<MutationResult> {
  return setVariantStatus(variantId, 'active', expectedRevision, deps);
}

export function archiveVariant(variantId: string, expectedRevision: number, deps: LifecycleDeps): Promise<MutationResult> {
  return setVariantStatus(variantId, 'archived', expectedRevision, deps);
}
