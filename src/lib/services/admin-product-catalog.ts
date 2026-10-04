import type { StaffIdentity } from '../domain/order.ts';
import type { CatalogStatus } from '../domain/commercial-config.ts';
import type { AdminCatalogRepository, CatalogMutationResult, ProductMetadataPatch } from '../repositories/admin-catalog-repository.ts';
import { resolveProductDefinitionKey } from '../product-definition-registry.ts';

export type MutationResult = CatalogMutationResult;

export interface AdminCatalogDeps {
  staff: StaffIdentity;
  repo: AdminCatalogRepository;
}

interface LifecycleDeps {
  staff: StaffIdentity;
  repo: AdminCatalogRepository;
}

function forbidden(): MutationResult {
  return { ok: false, code: 'FORBIDDEN', message: 'Chỉ quản trị viên mới có quyền thay đổi trạng thái danh mục' };
}

export async function updateProductMetadata(productId: string, expectedRevision: number, patch: ProductMetadataPatch, deps: AdminCatalogDeps): Promise<MutationResult> {
  if (deps.staff.role !== 'admin') return forbidden();
  if (typeof productId !== 'string' || !productId.trim() || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, code: 'INVALID_INPUT' };
  const keys = Object.keys(patch);
  if (!keys.length || keys.some((key) => !['name', 'description', 'thumbnail', 'sortOrder'].includes(key)) ||
    (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.length > 200)) ||
    (patch.description !== undefined && (typeof patch.description !== 'string' || patch.description.length > 5000)) ||
    (patch.sortOrder !== undefined && (!Number.isSafeInteger(patch.sortOrder) || Math.abs(patch.sortOrder) > 2147483647))) return { ok: false, code: 'INVALID_INPUT' };
  if (patch.thumbnail !== undefined && patch.thumbnail !== null && patch.thumbnail !== '') {
    if (typeof patch.thumbnail !== 'string' || patch.thumbnail.length > 2048 || /[\\\s]/.test(patch.thumbnail)) return { ok: false, code: 'INVALID_INPUT' };
    if (!/^\/(?!\/)/.test(patch.thumbnail)) {
      try { if (new URL(patch.thumbnail).protocol !== 'https:') return { ok: false, code: 'INVALID_INPUT' }; }
      catch { return { ok: false, code: 'INVALID_INPUT' }; }
    }
  }
  return deps.repo.updateProductMetadata(productId, expectedRevision, patch);
}

export function enableSupportedVariant(productId: string, definitionKey: string, expectedProductRevision: number, deps: AdminCatalogDeps): Promise<MutationResult> {
  if (deps.staff.role !== 'admin') return Promise.resolve(forbidden());
  if (typeof productId !== 'string' || !productId.trim() || typeof definitionKey !== 'string' || !definitionKey.trim() || !Number.isSafeInteger(expectedProductRevision) || expectedProductRevision < 1) return Promise.resolve({ ok: false, code: 'INVALID_INPUT' });
  return deps.repo.enableVariant(productId, definitionKey, expectedProductRevision);
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
    if (!variant?.definitionKey) {
      return { ok: false, code: 'MISSING_DEFINITION_KEY', message: 'Biến thể chưa được gắn definition_key' };
    }
    const definition = resolveProductDefinitionKey(variant.definitionKey);
    if (!definition || definition.productId !== variant.productId || definition.variantId !== variant.id) {
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
