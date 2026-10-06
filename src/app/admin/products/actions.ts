'use server';

import { revalidatePath } from 'next/cache.js';
import { AuthorizationError, requireCurrentStaff } from '../../../lib/admin/authorization.ts';
import { createServerSupabaseClient } from '../../../lib/supabase/server.ts';
import { AdminCatalogRepository, type ProductMetadataPatch, type CatalogMutationResult } from '../../../lib/repositories/admin-catalog-repository.ts';
import { updateProductMetadata, enableSupportedVariant, activateProduct, archiveProduct, activateVariant, archiveVariant, type AdminCatalogDeps } from '../../../lib/services/admin-product-catalog.ts';
import { createOrLoadCommercialDraft, saveCommercialDraft, publishProductCommercialConfig, type SaveCommercialDraftInput, type PublishCommercialConfigInput } from '../../../lib/services/commercial-config-service.ts';
import type { CommercialDraft } from '../../../lib/domain/catalog.ts';
import type { CommercialConfigVersion } from '../../../lib/domain/commercial-config.ts';
import { catalogActionError, type CatalogActionResult } from '../../../lib/admin/product-catalog-ui.ts';

async function mutate<T>(productId: string, operation: (deps: AdminCatalogDeps) => Promise<T>): Promise<CatalogActionResult<T>> {
  try {
    const staff = await requireCurrentStaff('admin');
    if (typeof productId !== 'string' || !productId.trim()) throw new Error('INVALID_INPUT');
    const repo = new AdminCatalogRepository(await createServerSupabaseClient());
    if (!await repo.getProductById(productId)) throw new Error('NOT_FOUND');
    const value = await operation({ staff, repo });
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath('/');
    return { ok: true, value };
  } catch (error) {
    if (error instanceof AuthorizationError) return catalogActionError(new Error(error.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN'));
    return catalogActionError(error);
  }
}

async function lifecycleResult(result: Promise<CatalogMutationResult>): Promise<CatalogMutationResult> {
  const value = await result;
  if (!value.ok) throw new Error(value.code ?? 'INTERNAL_ERROR');
  return value;
}

export async function updateProductMetadataAction(input: { productId: string; expectedRevision: number; patch: ProductMetadataPatch }) {
  return mutate(input?.productId, (deps) => lifecycleResult(updateProductMetadata(input.productId, input.expectedRevision, input.patch, deps)));
}
export async function enableVariantAction(input: { productId: string; definitionKey: string; expectedProductRevision: number }) {
  return mutate(input?.productId, (deps) => lifecycleResult(enableSupportedVariant(input.productId, input.definitionKey, input.expectedProductRevision, deps)));
}
export async function activateProductAction(input: { productId: string; expectedRevision: number }) {
  return mutate(input?.productId, (deps) => lifecycleResult(activateProduct(input.productId, input.expectedRevision, deps)));
}
export async function archiveProductAction(input: { productId: string; expectedRevision: number }) {
  return mutate(input?.productId, (deps) => lifecycleResult(archiveProduct(input.productId, input.expectedRevision, deps)));
}
export async function activateVariantAction(input: { productId: string; variantId: string; expectedRevision: number }) {
  return mutate(input?.productId, (deps) => {
    if (deps.repo.getVariant(input.variantId)?.productId !== input.productId) throw new Error('NOT_FOUND');
    return lifecycleResult(activateVariant(input.variantId, input.expectedRevision, deps));
  });
}
export async function archiveVariantAction(input: { productId: string; variantId: string; expectedRevision: number }) {
  return mutate(input?.productId, (deps) => {
    if (deps.repo.getVariant(input.variantId)?.productId !== input.productId) throw new Error('NOT_FOUND');
    return lifecycleResult(archiveVariant(input.variantId, input.expectedRevision, deps));
  });
}
export async function loadCommercialDraftAction(productId: string): Promise<CatalogActionResult<CommercialDraft>> {
  return mutate(productId, (deps) => createOrLoadCommercialDraft(productId, deps.staff.userId, deps));
}
export async function saveCommercialDraftAction(input: SaveCommercialDraftInput & { productId: string }): Promise<CatalogActionResult<CommercialDraft>> {
  return mutate(input?.productId, (deps) => {
    if (deps.repo.getCommercialDraftById(input.draftId)?.productId !== input.productId) throw new Error('NOT_FOUND');
    return saveCommercialDraft(input, deps);
  });
}
export async function publishCommercialConfigAction(input: PublishCommercialConfigInput & { draftId: string }): Promise<CatalogActionResult<CommercialConfigVersion>> {
  return mutate(input?.productId, (deps) => {
    return publishProductCommercialConfig(input, deps);
  });
}
