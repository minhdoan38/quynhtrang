import { randomUUID } from 'node:crypto';

import type { StaffIdentity } from '../domain/order.ts';
import type { DesignState } from '../product-state.ts';
import { createInitialState } from '../product-state.ts';
import { createTemplateTarget } from '../template-target.ts';
import {
  TemplateServiceError,
  type AdminTemplateListQuery,
  type CreateTemplateRepoInput,
  type DeleteDraftTemplateInput,
  type DuplicateTemplateInput,
  type EligibleSourceProject,
  type PublishTemplateInput,
  type SaveTemplateDraftInput,
  type TemplateDraftRecord,
  type TemplateCategoryRecord,
  type TemplateMetadataPatch,
  type TemplateMutation,
  type TemplateRecord,
  type TemplateTarget,
  type TemplateTargetInput,
  type TemplateVersionPayload,
  type TemplateVersionSummary,
} from '../domain/template.ts';
import { TemplateRepository } from '../repositories/template-repository.ts';
import { createPrivilegedSupabaseClient } from '../supabase/admin.ts';
import {
  createTemplateFromProject,
  resolveTemplateAsset,
  uploadTemplateAsset,
  type CreateTemplateFromProjectInput,
  type CreateTemplateFromProjectResult,
  type TemplateAssetAccess,
  type UploadedTemplateAsset,
} from './template-assets.ts';

export const KNOWN_TEMPLATE_CATEGORIES: Record<string, true> = {
  birthday: true,
  cute: true,
  floral: true,
  minimal: true,
  love: true,
  thanks: true,
};

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_ELEMENT_COUNT = 500;
const MAX_TAG_COUNT = 20;
const MAX_TAG_LENGTH = 40;
const MAX_NAME_LENGTH = 120;

export interface CreateTemplateInput {
  requestId: string;
  id?: string;
  name: string;
  target: TemplateTargetInput;
  categoryId?: string | null;
  tags?: string[];
  sortOrder?: number;
  initialDocument?: DesignState;
}

export interface TemplateDetailResult {
  template: TemplateRecord;
  draft: TemplateDraftRecord | null;
  versions: TemplateVersionSummary[];
}

export function createBlankTemplateDocument(target: TemplateTarget): DesignState {
  const base = createInitialState(target.productId);
  base.variantId = target.variantId;
  base.elements = [];
  base.templateId = null;

  if (target.productId === 'wrapping' && target.mode) {
    base.productOptions = {
      ...base.productOptions,
      mode: target.mode,
      wrapping: {
        ...(typeof base.productOptions?.wrapping === 'object' && base.productOptions.wrapping !== null
          ? (base.productOptions.wrapping as Record<string, unknown>)
          : {}),
        mode: target.mode,
      },
    };
  }

  if (target.productId === 'sticker' && target.shape) {
    base.productOptions = {
      ...base.productOptions,
      shape: target.shape,
      sticker: {
        ...(typeof base.productOptions?.sticker === 'object' && base.productOptions.sticker !== null
          ? (base.productOptions.sticker as Record<string, unknown>)
          : {}),
        shape: target.shape,
      },
    };
  }

  return base;
}

export class TemplateManagementService {
  private readonly repo: TemplateRepository;

  constructor(repo: TemplateRepository) {
    this.repo = repo;
  }

  async createTemplate(
    actor: StaffIdentity,
    input: CreateTemplateInput,
  ): Promise<{ template: TemplateRecord; draft: TemplateDraftRecord }> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }

    if (!input.requestId || typeof input.requestId !== 'string' || !input.requestId.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'requestId is required', 400);
    }

    const trimmedName = typeof input.name === 'string' ? input.name.trim() : '';
    if (trimmedName.length < 1 || trimmedName.length > MAX_NAME_LENGTH) {
      throw new TemplateServiceError(
        'INVALID_INPUT',
        `Template name must be 1 to ${MAX_NAME_LENGTH} characters`,
        400,
      );
    }

    let resolvedTarget: TemplateTarget;
    try {
      resolvedTarget = createTemplateTarget(input.target);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid template target';
      throw new TemplateServiceError('INVALID_INPUT', msg, 400);
    }

    let templateId = typeof input.id === 'string' ? input.id.trim() : '';
    if (!templateId) {
      const slug = trimmedName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      templateId = slug || `tmpl-${randomUUID().slice(0, 8)}`;
    } else if (!/^[a-zA-Z0-9_-]{1,100}$/.test(templateId)) {
      throw new TemplateServiceError(
        'INVALID_INPUT',
        'Template ID must contain only alphanumeric characters, underscores, and dashes (1-100 chars)',
        400,
      );
    }

    let categoryId: string | null = null;
    if (input.categoryId !== undefined && input.categoryId !== null) {
      const cat = String(input.categoryId).trim();
      if (cat) {
        if (!KNOWN_TEMPLATE_CATEGORIES[cat]) {
          throw new TemplateServiceError(
            'INVALID_INPUT',
            `Unknown category ID "${cat}". Allowed: ${Object.keys(KNOWN_TEMPLATE_CATEGORIES).join(', ')}`,
            400,
          );
        }
        categoryId = cat;
      }
    }

    let tags: string[] = [];
    if (input.tags !== undefined) {
      if (!Array.isArray(input.tags)) {
        throw new TemplateServiceError('INVALID_INPUT', 'Tags must be an array of strings', 400);
      }
      if (input.tags.length > MAX_TAG_COUNT) {
        throw new TemplateServiceError(
          'INVALID_INPUT',
          `Tags cannot exceed ${MAX_TAG_COUNT} items`,
          400,
        );
      }
      for (const tag of input.tags) {
        if (typeof tag !== 'string' || tag.trim().length > MAX_TAG_LENGTH) {
          throw new TemplateServiceError(
            'INVALID_INPUT',
            `Each tag must be a string up to ${MAX_TAG_LENGTH} characters`,
            400,
          );
        }
      }
      tags = input.tags.map((t) => t.trim()).filter(Boolean);
    }

    let sortOrder = 0;
    if (input.sortOrder !== undefined) {
      if (!Number.isInteger(input.sortOrder)) {
        throw new TemplateServiceError('INVALID_INPUT', 'sortOrder must be an integer', 400);
      }
      sortOrder = input.sortOrder;
    }

    let initialDocument: DesignState;
    if (input.initialDocument) {
      const doc = input.initialDocument;
      const jsonStr = JSON.stringify(doc);
      if (jsonStr.length > MAX_DOCUMENT_BYTES) {
        throw new TemplateServiceError(
          'INVALID_INPUT',
          `Initial document exceeds max size of 2 MiB`,
          400,
        );
      }

      const elements = doc.elements ?? [];
      if (elements.length > MAX_ELEMENT_COUNT) {
        throw new TemplateServiceError(
          'INVALID_INPUT',
          `Initial document element count exceeds ${MAX_ELEMENT_COUNT}`,
          400,
        );
      }

      if (doc.productId !== resolvedTarget.productId || doc.variantId !== resolvedTarget.variantId) {
        throw new TemplateServiceError(
          'TARGET_MISMATCH',
          `Document target (${doc.productId}/${doc.variantId}) does not match template target (${resolvedTarget.productId}/${resolvedTarget.variantId})`,
          422,
        );
      }

      initialDocument = doc;
    } else {
      initialDocument = createBlankTemplateDocument(resolvedTarget);
    }

    const repoInput: CreateTemplateRepoInput = {
      requestId: input.requestId,
      id: templateId,
      name: trimmedName,
      productId: resolvedTarget.productId,
      variantId: resolvedTarget.variantId,
      productMode: resolvedTarget.mode,
      fixedStickerShape: resolvedTarget.shape,
      categoryId,
      tags,
      sortOrder,
      targetSnapshot: {
        productId: resolvedTarget.productId,
        variantId: resolvedTarget.variantId,
        mode: resolvedTarget.mode,
        shape: resolvedTarget.shape,
        geometryKey: resolvedTarget.geometryKey,
        surfaces: resolvedTarget.surfaces,
      },
      initialDocument,
    };

    const result = await this.repo.createTemplate(actor.userId, repoInput);
    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async createTemplateDraft(
    actor: StaffIdentity,
    mutation: TemplateMutation,
    expectedBaseVersionId?: string | null,
  ): Promise<TemplateDraftRecord> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }

    if (!mutation.templateId || !mutation.templateId.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'templateId is required', 400);
    }
    if (!mutation.requestId || !mutation.requestId.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'requestId is required', 400);
    }

    const result = await this.repo.createDraft(actor.userId, mutation, expectedBaseVersionId);
    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async patchTemplateMetadata(
    actor: StaffIdentity,
    mutation: TemplateMutation,
    patch: TemplateMetadataPatch,
  ): Promise<TemplateRecord> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }

    if (!mutation.templateId || !mutation.templateId.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'templateId is required', 400);
    }
    if (!Number.isInteger(mutation.expectedCatalogRevision) || mutation.expectedCatalogRevision < 0) {
      throw new TemplateServiceError(
        'INVALID_INPUT',
        'expectedCatalogRevision must be a non-negative integer',
        400,
      );
    }
    if (!mutation.requestId || !mutation.requestId.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'requestId is required', 400);
    }

    const validatedPatch: TemplateMetadataPatch = {};
    let patchCount = 0;

    if (patch.name !== undefined) {
      const trimmedName = patch.name.trim();
      if (trimmedName.length < 1 || trimmedName.length > MAX_NAME_LENGTH) {
        throw new TemplateServiceError(
          'INVALID_INPUT',
          `Template name must be 1 to ${MAX_NAME_LENGTH} characters`,
          400,
        );
      }
      validatedPatch.name = trimmedName;
      patchCount++;
    }

    if (patch.categoryId !== undefined) {
      if (patch.categoryId !== null) {
        const cat = String(patch.categoryId).trim();
        if (!KNOWN_TEMPLATE_CATEGORIES[cat]) {
          throw new TemplateServiceError(
            'INVALID_INPUT',
            `Unknown category ID "${cat}". Allowed: ${Object.keys(KNOWN_TEMPLATE_CATEGORIES).join(', ')}`,
            400,
          );
        }
        validatedPatch.categoryId = cat;
      } else {
        validatedPatch.categoryId = null;
      }
      patchCount++;
    }

    if (patch.tags !== undefined) {
      if (!Array.isArray(patch.tags)) {
        throw new TemplateServiceError('INVALID_INPUT', 'Tags must be an array of strings', 400);
      }
      if (patch.tags.length > MAX_TAG_COUNT) {
        throw new TemplateServiceError(
          'INVALID_INPUT',
          `Tags cannot exceed ${MAX_TAG_COUNT} items`,
          400,
        );
      }
      for (const tag of patch.tags) {
        if (typeof tag !== 'string' || tag.trim().length > MAX_TAG_LENGTH) {
          throw new TemplateServiceError(
            'INVALID_INPUT',
            `Each tag must be a string up to ${MAX_TAG_LENGTH} characters`,
            400,
          );
        }
      }
      validatedPatch.tags = patch.tags.map((t) => t.trim()).filter(Boolean);
      patchCount++;
    }

    if (patch.sortOrder !== undefined) {
      if (!Number.isInteger(patch.sortOrder)) {
        throw new TemplateServiceError('INVALID_INPUT', 'sortOrder must be an integer', 400);
      }
      validatedPatch.sortOrder = patch.sortOrder;
      patchCount++;
    }

    if (patchCount === 0) {
      throw new TemplateServiceError('INVALID_INPUT', 'At least one metadata field must be provided to patch', 400);
    }

    const result = await this.repo.patchMetadata(actor.userId, mutation, validatedPatch);
    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async getTemplate(id: string): Promise<TemplateRecord> {
    if (!id || !id.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'Template id is required', 400);
    }
    const template = await this.repo.getTemplate(id.trim());
    if (!template) {
      throw new TemplateServiceError('NOT_FOUND', `Template "${id}" not found`, 404);
    }
    return template;
  }

  async getTemplateDetail(id: string): Promise<TemplateDetailResult> {
    const template = await this.getTemplate(id);
    const [draft, versions] = await Promise.all([
      this.repo.getDraft(template.id),
      this.repo.listVersions(template.id),
    ]);

    return {
      template,
      draft,
      versions,
    };
  }

  async listAdminTemplates(
    query?: AdminTemplateListQuery,
  ): Promise<{ items: TemplateRecord[]; total: number }> {
    return this.repo.listAdminTemplates(query);
  }

  async listCategories(): Promise<TemplateCategoryRecord[]> {
    return this.repo.listCategories();
  }

  async acquireDraftLease(
    actor: StaffIdentity,
    input: { requestId: string; draftId: string; sessionId: string },
  ): Promise<TemplateDraftRecord> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (!input.draftId?.trim() || !input.sessionId?.trim() || !input.requestId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'draftId, sessionId, and requestId are required', 400);
    }

    const result = await this.repo.acquireLease(actor.userId, {
      requestId: input.requestId.trim(),
      draftId: input.draftId.trim(),
      sessionId: input.sessionId.trim(),
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async heartbeatDraftLease(
    actor: StaffIdentity,
    input: { requestId: string; draftId: string; sessionId: string; epoch: number },
  ): Promise<{ sessionId: string; epoch: number; expiresAt: string }> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (
      !input.draftId?.trim() ||
      !input.sessionId?.trim() ||
      !input.requestId?.trim() ||
      typeof input.epoch !== 'number' ||
      !Number.isInteger(input.epoch) ||
      input.epoch < 0
    ) {
      throw new TemplateServiceError(
        'INVALID_INPUT',
        'draftId, sessionId, requestId, and valid epoch are required',
        400,
      );
    }

    const result = await this.repo.heartbeatLease(actor.userId, {
      requestId: input.requestId.trim(),
      draftId: input.draftId.trim(),
      sessionId: input.sessionId.trim(),
      epoch: input.epoch,
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async saveDraft(
    actor: StaffIdentity,
    input: SaveTemplateDraftInput,
  ): Promise<{ revision: number; updatedAt: string; requestId: string }> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (!input.draftId?.trim() || !input.sessionId?.trim() || !input.requestId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'draftId, sessionId, and requestId are required', 400);
    }
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new TemplateServiceError('INVALID_INPUT', 'expectedRevision must be a positive integer', 400);
    }
    if (!Number.isInteger(input.leaseEpoch) || input.leaseEpoch < 0) {
      throw new TemplateServiceError('INVALID_INPUT', 'leaseEpoch must be a non-negative integer', 400);
    }
    if (!input.document || typeof input.document !== 'object') {
      throw new TemplateServiceError('INVALID_INPUT', 'document is required', 400);
    }

    const jsonStr = JSON.stringify(input.document);
    if (jsonStr.length > MAX_DOCUMENT_BYTES) {
      throw new TemplateServiceError('INVALID_INPUT', 'Document exceeds max size of 2 MiB', 400);
    }
    if ((input.document.elements?.length ?? 0) > MAX_ELEMENT_COUNT) {
      throw new TemplateServiceError('INVALID_INPUT', `Document element count exceeds ${MAX_ELEMENT_COUNT}`, 400);
    }

    const result = await this.repo.saveDraft(actor.userId, {
      ...input,
      draftId: input.draftId.trim(),
      sessionId: input.sessionId.trim(),
      requestId: input.requestId.trim(),
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async takeoverDraft(
    actor: StaffIdentity,
    input: {
      requestId: string;
      draftId: string;
      expectedRevision: number;
      expectedEpoch: number;
      newSessionId: string;
      reason: string;
    },
  ): Promise<TemplateDraftRecord> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (actor.role !== 'admin') {
      throw new TemplateServiceError('FORBIDDEN', 'Only administrators can take over draft leases', 403);
    }
    if (!input.draftId?.trim() || !input.newSessionId?.trim() || !input.requestId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'draftId, newSessionId, and requestId are required', 400);
    }
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new TemplateServiceError('INVALID_INPUT', 'expectedRevision must be a positive integer', 400);
    }
    if (!Number.isInteger(input.expectedEpoch) || input.expectedEpoch < 0) {
      throw new TemplateServiceError('INVALID_INPUT', 'expectedEpoch must be a non-negative integer', 400);
    }
    const trimmedReason = (input.reason ?? '').trim();
    if (trimmedReason.length < 3 || trimmedReason.length > 500) {
      throw new TemplateServiceError('INVALID_INPUT', 'Takeover reason must be between 3 and 500 characters', 400);
    }

    const result = await this.repo.takeoverDraft(actor.userId, {
      requestId: input.requestId.trim(),
      draftId: input.draftId.trim(),
      expectedRevision: input.expectedRevision,
      expectedEpoch: input.expectedEpoch,
      newSessionId: input.newSessionId.trim(),
      reason: trimmedReason,
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async discardDraft(
    actor: StaffIdentity,
    input: {
      requestId: string;
      draftId: string;
      expectedRevision: number;
      sessionId: string;
      epoch: number;
    },
  ): Promise<{ draftId: string; discarded: boolean }> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (!input.draftId?.trim() || !input.sessionId?.trim() || !input.requestId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'draftId, sessionId, and requestId are required', 400);
    }
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new TemplateServiceError('INVALID_INPUT', 'expectedRevision must be a positive integer', 400);
    }
    if (!Number.isInteger(input.epoch) || input.epoch < 0) {
      throw new TemplateServiceError('INVALID_INPUT', 'epoch must be a non-negative integer', 400);
    }

    const result = await this.repo.discardDraft(actor.userId, {
      requestId: input.requestId.trim(),
      draftId: input.draftId.trim(),
      expectedRevision: input.expectedRevision,
      sessionId: input.sessionId.trim(),
      epoch: input.epoch,
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async discardTemplateDraft(
    actor: StaffIdentity,
    input: {
      requestId: string;
      draftId: string;
      expectedRevision: number;
      sessionId: string;
      epoch: number;
    },
  ): Promise<{ draftId: string; discarded: boolean }> {
    return this.discardDraft(actor, input);
  }

  async archiveTemplate(
    actor: StaffIdentity,
    mutation: TemplateMutation,
  ): Promise<TemplateRecord> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (!['admin', 'editor'].includes(actor.role)) {
      throw new TemplateServiceError('FORBIDDEN', 'Actor does not have permission to archive templates', 403);
    }

    if (!mutation.templateId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'templateId is required', 400);
    }
    if (!mutation.requestId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'requestId is required', 400);
    }
    if (!Number.isInteger(mutation.expectedCatalogRevision) || mutation.expectedCatalogRevision < 1) {
      throw new TemplateServiceError('INVALID_INPUT', 'expectedCatalogRevision must be a positive integer', 400);
    }

    const result = await this.repo.archiveTemplate(actor.userId, {
      templateId: mutation.templateId.trim(),
      expectedCatalogRevision: mutation.expectedCatalogRevision,
      requestId: mutation.requestId.trim(),
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async republishTemplate(
    actor: StaffIdentity,
    mutation: TemplateMutation,
  ): Promise<TemplateRecord> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (!['admin', 'editor'].includes(actor.role)) {
      throw new TemplateServiceError('FORBIDDEN', 'Actor does not have permission to republish templates', 403);
    }

    if (!mutation.templateId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'templateId is required', 400);
    }
    if (!mutation.requestId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'requestId is required', 400);
    }
    if (!Number.isInteger(mutation.expectedCatalogRevision) || mutation.expectedCatalogRevision < 1) {
      throw new TemplateServiceError('INVALID_INPUT', 'expectedCatalogRevision must be a positive integer', 400);
    }

    const result = await this.repo.republishTemplate(actor.userId, {
      templateId: mutation.templateId.trim(),
      expectedCatalogRevision: mutation.expectedCatalogRevision,
      requestId: mutation.requestId.trim(),
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async duplicateTemplate(
    actor: StaffIdentity,
    input: DuplicateTemplateInput,
  ): Promise<{ template: TemplateRecord; draft: TemplateDraftRecord }> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (!['admin', 'editor'].includes(actor.role)) {
      throw new TemplateServiceError('FORBIDDEN', 'Actor does not have permission to duplicate templates', 403);
    }

    if (!input.sourceTemplateId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'sourceTemplateId is required', 400);
    }
    if (!input.requestId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'requestId is required', 400);
    }
    if (input.newName && input.newName.trim().length > 120) {
      throw new TemplateServiceError('INVALID_INPUT', 'newName cannot exceed 120 characters', 400);
    }

    const result = await this.repo.duplicateTemplate(actor.userId, {
      sourceTemplateId: input.sourceTemplateId.trim(),
      requestId: input.requestId.trim(),
      sourceVersionId: input.sourceVersionId?.trim() || undefined,
      newName: input.newName?.trim() || undefined,
      newTemplateId: input.newTemplateId?.trim() || undefined,
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async deleteDraftTemplate(
    actor: StaffIdentity,
    input: DeleteDraftTemplateInput,
  ): Promise<{ templateId: string; deleted: boolean }> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (actor.role !== 'admin') {
      throw new TemplateServiceError('FORBIDDEN', 'Only administrators can delete templates', 403);
    }

    if (!input.templateId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'templateId is required', 400);
    }
    if (!input.requestId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'requestId is required', 400);
    }

    const result = await this.repo.deleteDraftTemplate(actor.userId, {
      templateId: input.templateId.trim(),
      requestId: input.requestId.trim(),
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async publishTemplate(
    actor: StaffIdentity,
    input: PublishTemplateInput,
  ): Promise<TemplateVersionPayload> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    if (!['admin', 'editor'].includes(actor.role)) {
      throw new TemplateServiceError('FORBIDDEN', 'Actor does not have permission to publish templates', 403);
    }

    if (!input.templateId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'templateId is required', 400);
    }
    if (!input.draftId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'draftId is required', 400);
    }
    if (!input.requestId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'requestId is required', 400);
    }
    if (!input.sessionId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'sessionId is required', 400);
    }
    if (!input.validationId?.trim()) {
      throw new TemplateServiceError('INVALID_INPUT', 'validationId is required', 400);
    }
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new TemplateServiceError('INVALID_INPUT', 'expectedRevision must be a positive integer', 400);
    }
    if (input.expectedCatalogRevision !== undefined && (!Number.isInteger(input.expectedCatalogRevision) || input.expectedCatalogRevision < 1)) {
      throw new TemplateServiceError('INVALID_INPUT', 'expectedCatalogRevision must be a positive integer', 400);
    }
    if (input.leaseEpoch !== undefined && (!Number.isInteger(input.leaseEpoch) || input.leaseEpoch < 0)) {
      throw new TemplateServiceError('INVALID_INPUT', 'leaseEpoch must be a non-negative integer', 400);
    }
    if (input.revisionNote && input.revisionNote.length > 500) {
      throw new TemplateServiceError('INVALID_INPUT', 'revisionNote cannot exceed 500 characters', 400);
    }

    const result = await this.repo.publishDraft(actor.userId, {
      ...input,
      templateId: input.templateId.trim(),
      draftId: input.draftId.trim(),
      requestId: input.requestId.trim(),
      sessionId: input.sessionId.trim(),
      validationId: input.validationId.trim(),
      acknowledgedWarningIds: Array.isArray(input.acknowledgedWarningIds) ? input.acknowledgedWarningIds : [],
    });

    if (!result.ok) {
      throw new TemplateServiceError(result.code, result.message);
    }

    return result.value;
  }

  async listEligibleSourceProjects(
    actor: StaffIdentity,
    productId?: string | null,
  ): Promise<EligibleSourceProject[]> {
    if (!actor || !actor.userId) {
      throw new TemplateServiceError('UNAUTHENTICATED', 'Staff identity required', 401);
    }
    return this.repo.listEligibleSourceProjects(actor.userId, productId);
  }

  async createTemplateFromProject(
    actor: StaffIdentity,
    input: CreateTemplateFromProjectInput,
  ): Promise<CreateTemplateFromProjectResult> {
    return createTemplateFromProject(actor, input, { repo: this.repo });
  }

  async uploadTemplateAsset(
    actor: StaffIdentity,
    guard: { templateId: string; draftId?: string },
    file: { bytes: Uint8Array | Buffer; filename?: string; mimeType?: string },
  ): Promise<UploadedTemplateAsset> {
    return uploadTemplateAsset(actor, guard, file, { repo: this.repo });
  }

  async resolveTemplateAsset(
    assetId: string,
    access: TemplateAssetAccess,
  ) {
    return resolveTemplateAsset(assetId, access, { repo: this.repo });
  }
}

export async function publishTemplate(
  actor: StaffIdentity,
  input: PublishTemplateInput,
  options?: { repo?: TemplateRepository },
): Promise<TemplateVersionPayload> {
  const repo = options?.repo ?? new TemplateRepository(createPrivilegedSupabaseClient());
  const service = new TemplateManagementService(repo);
  return service.publishTemplate(actor, input);
}
