import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DesignState } from '../product-state.ts';
import {
  TemplateServiceError,
  type TemplateProvenance,
  type TemplateTarget,
  type TemplateVersionPayload,
  type UseTemplateInput,
} from '../domain/template.ts';
import { TemplateRepository } from '../repositories/template-repository.ts';
import { createPrivilegedSupabaseClient } from '../supabase/admin.ts';
import { getSupabaseConfig } from '../supabase/config.ts';
import { createClient } from '@supabase/supabase-js';

export interface UseReceiptData {
  versionId: string;
  requestId: string;
  exp: number;
}

export interface GuestProject {
  id: string;
  requestId: string;
  document: DesignState;
  target: TemplateTarget;
  sourceTemplate: TemplateProvenance;
  createdAt: number;
}

export type CloneTemplateResult =
  | {
    kind: 'guest';
    payload: TemplateVersionPayload;
    useReceipt: string;
  }
  | {
    kind: 'cloud';
    projectId: string;
    revision: number;
    document: DesignState;
  };

const DEFAULT_RECEIPT_SECRET = 'state43-template-use-receipt-secret-v1';

export function createUseReceipt(data: UseReceiptData, customSecret?: string): string {
  const secret = customSecret || process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_RECEIPT_SECRET;
  const payloadStr = JSON.stringify({
    versionId: data.versionId,
    requestId: data.requestId,
    exp: data.exp,
  });
  const b64Payload = Buffer.from(payloadStr, 'utf-8').toString('base64url');
  const signature = createHmac('sha256', secret).update(b64Payload).digest('base64url');
  return `${b64Payload}.${signature}`;
}

export function verifyUseReceipt(receipt: string, customSecret?: string): UseReceiptData | null {
  if (!receipt || typeof receipt !== 'string') return null;
  const parts = receipt.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;
  if (!b64Payload || !signature) return null;

  const secret = customSecret || process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_RECEIPT_SECRET;
  const expectedSignature = createHmac('sha256', secret).update(b64Payload).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const raw = Buffer.from(b64Payload, 'base64url').toString('utf-8');
    const data = JSON.parse(raw) as UseReceiptData;
    if (!data.versionId || !data.requestId || typeof data.exp !== 'number' || Date.now() > data.exp) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function createGuestProjectFromTemplate(
  payload: TemplateVersionPayload,
  requestId: string,
): GuestProject {
  const document: DesignState = structuredClone(payload.document);
  const sourceTemplate: TemplateProvenance = {
    templateId: payload.templateId,
    templateVersionId: payload.versionId,
  };

  document.templateId = payload.templateId;
  document.sourceTemplate = sourceTemplate;
  document.documentSchemaVersion = payload.documentSchemaVersion;

  const localId = requestId?.trim() || randomUUID();

  return {
    id: localId,
    requestId: localId,
    document,
    target: payload.target,
    sourceTemplate,
    createdAt: Date.now(),
  };
}

function resolveRepo(options?: { repo?: TemplateRepository }): TemplateRepository {
  if (options?.repo) return options.repo;
  try {
    const admin = createPrivilegedSupabaseClient();
    return new TemplateRepository(admin);
  } catch {
    const config = getSupabaseConfig();
    if (config) {
      const client = createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return new TemplateRepository(client);
    }
    throw new TemplateServiceError('INTERNAL_ERROR', 'Supabase database is not configured', 500);
  }
}

export async function cloneTemplateIntoProject(
  actor: unknown,
  input: UseTemplateInput,
  options?: { repo?: TemplateRepository; secret?: string },
): Promise<CloneTemplateResult> {
  if (!input.templateId?.trim() || !input.expectedVersionId?.trim() || !input.requestId?.trim()) {
    throw new TemplateServiceError('INVALID_INPUT', 'Thiếu thông tin bắt buộc để nhân bản mẫu', 400);
  }

  const repo = resolveRepo(options);
  const template = await repo.getTemplate(input.templateId.trim());

  if (!template || template.status !== 'published' || template.archivedAt) {
    throw new TemplateServiceError('TEMPLATE_UNAVAILABLE', 'Mẫu này hiện không còn khả dụng.', 409);
  }

  if (template.currentPublishedVersionId !== input.expectedVersionId.trim()) {
    throw new TemplateServiceError('TEMPLATE_CHANGED', 'Phiên bản mẫu đã thay đổi, vui lòng tải lại.', 409);
  }

  const availability = await repo.getTemplateAvailability(template.id);
  if (!availability.available) {
    throw new TemplateServiceError('TEMPLATE_UNAVAILABLE', 'Mẫu này hiện không còn khả dụng.', 409, {
      blockers: availability.blockers,
    });
  }

  const version = await repo.getVersion(input.expectedVersionId.trim());
  if (!version) {
    throw new TemplateServiceError('TEMPLATE_UNAVAILABLE', 'Mẫu này hiện không còn khả dụng.', 409);
  }

  if (input.target?.productId && version.target?.productId && input.target.productId !== version.target.productId) {
    throw new TemplateServiceError('TARGET_MISMATCH', 'Sản phẩm mục tiêu không khớp với mẫu', 422);
  }

  const actorUser = actor as { userId?: string } | null;
  if (!actorUser || !actorUser.userId) {
    const useReceipt = createUseReceipt(
      {
        versionId: version.versionId,
        requestId: input.requestId.trim(),
        exp: Date.now() + 15 * 60 * 1000,
      },
      options?.secret,
    );

    return {
      kind: 'guest',
      payload: version,
      useReceipt,
    };
  }

  // ponytail: authenticated cloud project clone → skipped: cloud project row creation, add when Task 17 implemented.
  throw new TemplateServiceError('NOT_FOUND', 'Cloud clone is handled in Task 17', 501);
}

export async function resolveTemplateForUse(
  idOrLegacyId: string,
  options?: { repo?: TemplateRepository; targetKey?: string },
): Promise<{ templateId: string; versionId: string } | null> {
  const repo = resolveRepo(options);

  const direct = await repo.getTemplate(idOrLegacyId);
  if (direct && direct.status === 'published' && !direct.archivedAt && direct.currentPublishedVersionId) {
    const availability = await repo.getTemplateAvailability(direct.id);
    if (availability.available) {
      return {
        templateId: direct.id,
        versionId: direct.currentPublishedVersionId,
      };
    }
  }

  const legacy = await repo.resolveLegacyTarget(idOrLegacyId, options?.targetKey);
  if (legacy) {
    const targetTemplate = await repo.getTemplate(legacy.templateId);
    if (
      targetTemplate &&
      targetTemplate.status === 'published' &&
      !targetTemplate.archivedAt &&
      targetTemplate.currentPublishedVersionId
    ) {
      const availability = await repo.getTemplateAvailability(targetTemplate.id);
      if (availability.available) {
        return {
          templateId: targetTemplate.id,
          versionId: targetTemplate.currentPublishedVersionId,
        };
      }
    }
  }

  return null;
}
