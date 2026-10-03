import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { StaffIdentity } from '../domain/order.ts';
import type {
  DependencyMetadataItem,
  TemplateAvailability,
  TemplateAvailabilityBlocker,
  TemplateAvailabilityDependencies,
  TemplateDraftGuard,
  TemplateRecord,
  TemplateValidationReceipt,
  TemplateVersionPayload,
} from '../domain/template.ts';
import { TemplateServiceError } from '../domain/template.ts';
import { getPreflight } from '../product-state.ts';
import { extractLibraryDependencies } from './library-dependencies.ts';
import { extractTemplateAssetManifest } from './template-assets.ts';
import { renderDocument, type DocumentFontOption } from './document-renderer.ts';
import { TemplateRepository } from '../repositories/template-repository.ts';
import { createServerSupabaseClient } from '../supabase/server.ts';

export interface TemplateValidationOptions {
  repository?: TemplateRepository;
}

export function getTemplateAvailability(
  template: Pick<TemplateRecord, 'id' | 'status' | 'archivedAt' | 'currentPublishedVersionId' | 'target'>,
  version?: Pick<TemplateVersionPayload, 'versionId' | 'target' | 'dependencies' | 'document'> | null,
  dependencies?: TemplateAvailabilityDependencies,
): TemplateAvailability {
  const blockers: TemplateAvailabilityBlocker[] = [];

  // 1. TEMPLATE_ARCHIVED
  if (template.status === 'archived' || template.archivedAt != null) {
    blockers.push({
      code: 'TEMPLATE_ARCHIVED',
      message: 'Mẫu đã được lưu trữ',
    });
  }

  // 2. NO_PUBLISHED_VERSION
  if (!template.currentPublishedVersionId || !version) {
    blockers.push({
      code: 'NO_PUBLISHED_VERSION',
      message: 'Mẫu chưa có phiên bản xuất bản',
    });
    return { available: false, blockers };
  }

  // 3. INVALID_PRODUCT_TARGET
  if (!template.target || !template.target.surfaces || template.target.surfaces.length === 0) {
    blockers.push({
      code: 'INVALID_PRODUCT_TARGET',
      message: 'Mục tiêu sản phẩm không hợp lệ',
    });
  }

  // 4. VERSION_INVALID
  if (dependencies?.assetManifestHealthy === false) {
    blockers.push({
      code: 'VERSION_INVALID',
      message: 'Tài nguyên trong phiên bản bị thiếu hoặc hư hỏng',
    });
  }

  // 5. Dependencies check
  if (version.dependencies && dependencies?.lookup) {
    const lookup = dependencies.lookup;
    const getItem = (key: string): DependencyMetadataItem | undefined => {
      if (lookup instanceof Map) {
        return lookup.get(key) ?? lookup.get(`font-face:${key}`) ?? lookup.get(`sticker:${key}`);
      }
      const record = lookup as Record<string, DependencyMetadataItem>;
      return record[key] ?? record[`font-face:${key}`] ?? record[`sticker:${key}`];
    };

    for (const dep of version.dependencies) {
      const item = getItem(dep.id);
      if (!item) {
        blockers.push({
          code: 'MISSING_DEPENDENCY',
          kind: dep.kind,
          id: dep.id,
          message: `Phụ thuộc không tồn tại: ${dep.id}`,
        });
        continue;
      }

      if (dep.checksum && item.checksum && dep.checksum !== item.checksum) {
        blockers.push({
          code: 'MISSING_DEPENDENCY',
          kind: dep.kind,
          id: dep.id,
          message: `Mã kiểm tra không khớp cho: ${dep.id}`,
        });
      }

      if (item.status === 'archived' || item.familyStatus === 'archived') {
        blockers.push({
          code: 'ARCHIVED_DEPENDENCY',
          kind: dep.kind,
          id: dep.id,
          message: `Phụ thuộc đã bị lưu trữ: ${dep.id}`,
        });
      } else if (item.status === 'draft' || item.familyStatus === 'draft') {
        blockers.push({
          code: 'UNPUBLISHED_DEPENDENCY',
          kind: dep.kind,
          id: dep.id,
          message: `Phụ thuộc chưa được xuất bản: ${dep.id}`,
        });
      }
    }
  }

  return {
    available: blockers.length === 0,
    blockers,
  };
}

export async function validateTemplateDraft(
  actor: StaffIdentity,
  guard: TemplateDraftGuard,
  options: TemplateValidationOptions = {},
): Promise<TemplateValidationReceipt> {
  // 1. RBAC check
  if (!actor || (actor.role !== 'admin' && actor.role !== 'editor')) {
    throw new TemplateServiceError('FORBIDDEN', 'Chỉ biên tập viên hoặc quản trị viên mới có quyền kiểm tra mẫu', 403);
  }

  let repo = options.repository;
  if (!repo) {
    const supabase = await createServerSupabaseClient();
    repo = new TemplateRepository(supabase);
  }

  // 2. Fetch template and draft
  const template = await repo.getTemplate(guard.templateId);
  if (!template) {
    throw new TemplateServiceError('NOT_FOUND', `Không tìm thấy mẫu: ${guard.templateId}`, 404);
  }

  const draft = await repo.getDraft(guard.templateId);
  if (!draft || draft.id !== guard.draftId) {
    throw new TemplateServiceError('NOT_FOUND', `Không tìm thấy bản nháp: ${guard.draftId}`, 404);
  }

  if (draft.draftRevision !== guard.expectedRevision) {
    throw new TemplateServiceError(
      'REVISION_CONFLICT',
      `Xung đột phiên bản bản nháp: mong đợi ${guard.expectedRevision}, hiện tại ${draft.draftRevision}`,
      409,
    );
  }

  if (draft.leaseSessionId !== guard.sessionId || draft.leaseEpoch !== guard.leaseEpoch) {
    throw new TemplateServiceError(
      'LEASE_CONFLICT',
      'Xung đột phiên làm việc hoặc quyền chỉnh sửa bản nháp',
      409,
    );
  }

  const document = draft.designDocument;
  const target = template.target;

  // 3. Target verification
  if (!target || !target.surfaces || target.surfaces.length === 0) {
    throw new TemplateServiceError(
      'INVALID_INPUT',
      'INVALID_PRODUCT_TARGET: Mục tiêu sản phẩm không có bề mặt hợp lệ',
      422,
    );
  }
  for (const s of target.surfaces) {
    if (typeof s.widthMm !== 'number' || s.widthMm <= 0 || typeof s.heightMm !== 'number' || s.heightMm <= 0) {
      throw new TemplateServiceError(
        'INVALID_INPUT',
        `INVALID_PRODUCT_TARGET: Kích thước bề mặt không hợp lệ (${s.id})`,
        422,
      );
    }
  }

  // 4. Dependency extraction & resolution
  const libraryDependencies = extractLibraryDependencies(document);
  const assetManifest = extractTemplateAssetManifest(document);

  const fontFacesToLookup = libraryDependencies
    .filter((d) => d.kind === 'font-face')
    .map((d) => d.id);
  const stickersToLookup = libraryDependencies
    .filter((d) => d.kind === 'sticker')
    .map((d) => d.id);

  // Collect any font families from text elements
  const fontFamiliesToLookup: string[] = [];
  for (const element of document.elements ?? []) {
    if (element.type === 'text') {
      const data = element.data as Record<string, unknown> | undefined;
      const fontFamily = typeof data?.fontFamily === 'string' ? data.fontFamily.trim() : '';
      if (fontFamily && !data?.fontFaceId && !fontFamiliesToLookup.includes(fontFamily)) {
        fontFamiliesToLookup.push(fontFamily);
      }
    }
  }

  const dependencyLookup = await repo.getBatchDependencies({
    fontFaces: fontFacesToLookup,
    stickers: stickersToLookup,
    fontFamilies: fontFamiliesToLookup,
  });

  // Verify library dependencies
  for (const dep of libraryDependencies) {
    const meta = dependencyLookup.get(dep.id)
      ?? dependencyLookup.get(`${dep.kind}:${dep.id}`);

    if (!meta) {
      throw new TemplateServiceError(
        'DEPENDENCY_UNRESOLVED',
        `MISSING_DEPENDENCY: Phụ thuộc không tồn tại (${dep.kind}: ${dep.id})`,
        422,
      );
    }

    if (dep.checksum && meta.checksum && dep.checksum !== meta.checksum) {
      throw new TemplateServiceError(
        'DEPENDENCY_UNRESOLVED',
        `MISSING_DEPENDENCY: Mã kiểm tra không khớp cho ${dep.id}`,
        422,
      );
    }

    if (meta.status === 'archived' || meta.familyStatus === 'archived') {
      throw new TemplateServiceError(
        'DEPENDENCY_UNRESOLVED',
        `ARCHIVED_DEPENDENCY: Phụ thuộc đã bị lưu trữ (${dep.kind}: ${dep.id})`,
        422,
      );
    }

    if (meta.status === 'draft' || meta.familyStatus === 'draft') {
      throw new TemplateServiceError(
        'DEPENDENCY_UNRESOLVED',
        `UNPUBLISHED_DEPENDENCY: Phụ thuộc chưa xuất bản (${dep.kind}: ${dep.id})`,
        422,
      );
    }
  }

  // Verify font families for text elements lacking fontFaceId
  for (const element of document.elements ?? []) {
    if (element.type === 'text') {
      const data = element.data as Record<string, unknown> | undefined;
      const fontFamily = typeof data?.fontFamily === 'string' ? data.fontFamily.trim() : '';
      if (fontFamily && !data?.fontFaceId) {
        const meta = dependencyLookup.get(fontFamily);
        if (!meta) {
          throw new TemplateServiceError(
            'DEPENDENCY_UNRESOLVED',
            `MISSING_DEPENDENCY: Phông chữ không xác định hoặc chưa được quản lý (${fontFamily})`,
            422,
          );
        }
        if (meta.status === 'archived' || meta.familyStatus === 'archived') {
          throw new TemplateServiceError(
            'DEPENDENCY_UNRESOLVED',
            `ARCHIVED_DEPENDENCY: Phông chữ đã bị lưu trữ (${fontFamily})`,
            422,
          );
        }
        if (meta.status === 'draft' || meta.familyStatus === 'draft') {
          throw new TemplateServiceError(
            'DEPENDENCY_UNRESOLVED',
            `UNPUBLISHED_DEPENDENCY: Phông chữ chưa được xuất bản (${fontFamily})`,
            422,
          );
        }
      }
    }
  }

  // Verify template-owned assets: no leakage from other templates
  for (const assetRef of assetManifest) {
    const assetRecord = await repo.getAsset(assetRef.assetId);
    if (!assetRecord) {
      throw new TemplateServiceError(
        'ASSET_MISSING',
        `ASSET_MISSING: Tài nguyên của mẫu không tồn tại (${assetRef.assetId})`,
        422,
      );
    }
    if (assetRecord.templateId !== guard.templateId) {
      throw new TemplateServiceError(
        'FORBIDDEN',
        `PRIVATE_ASSET_LEAKAGE: Tài nguyên ${assetRef.assetId} thuộc về mẫu khác`,
        403,
      );
    }
  }

  // 5. Template-specific checks on elements (placeholders & locks)
  const findings: Array<{ code: string; elementId?: string; message?: string }> = [];
  const warningIds: string[] = [];
  const elements = document.elements ?? [];

  let editableElementCount = 0;

  for (const el of elements) {
    const data = el.data as Record<string, unknown> | undefined;
    const isPlaceholder = Boolean(data?.placeholder);
    const placeholderType = typeof data?.placeholderType === 'string' ? data.placeholderType : undefined;
    const isCustomerLocked = Boolean(el.customerLocked);

    // PLACEHOLDER_LOCK_CONFLICT
    if (isPlaceholder && isCustomerLocked) {
      throw new TemplateServiceError(
        'VALIDATION_FAILED',
        `PLACEHOLDER_LOCK_CONFLICT: Phần tử ${el.id} không thể vừa là khung mẫu (placeholder) vừa bị khóa khách hàng (customerLocked)`,
        422,
      );
    }

    // BROKEN_PLACEHOLDER
    if (isPlaceholder) {
      if (el.type === 'image' && placeholderType === 'text') {
        throw new TemplateServiceError(
          'VALIDATION_FAILED',
          `BROKEN_PLACEHOLDER: Khung hình ảnh ${el.id} không thể có kiểu mẫu văn bản`,
          422,
        );
      }
      if (el.type === 'text' && placeholderType === 'image') {
        throw new TemplateServiceError(
          'VALIDATION_FAILED',
          `BROKEN_PLACEHOLDER: Phần tử văn bản ${el.id} không thể có kiểu mẫu hình ảnh`,
          422,
        );
      }
      if (typeof el.width === 'number' && el.width <= 0) {
        throw new TemplateServiceError(
          'VALIDATION_FAILED',
          `BROKEN_PLACEHOLDER: Phần tử mẫu ${el.id} có chiều rộng không hợp lệ`,
          422,
        );
      }
      if (typeof el.height === 'number' && el.height <= 0) {
        throw new TemplateServiceError(
          'VALIDATION_FAILED',
          `BROKEN_PLACEHOLDER: Phần tử mẫu ${el.id} có chiều cao không hợp lệ`,
          422,
        );
      }
    }

    if (!isCustomerLocked) {
      editableElementCount++;
    }
  }

  if (elements.length > 0 && editableElementCount === 0) {
    findings.push({
      code: 'NO_EDITABLE_ELEMENTS',
      message: 'Mẫu không có phần tử nào cho phép khách chỉnh sửa',
    });
    warningIds.push('template-no-editable-elements');
  }

  // 6. Preflight checks
  const preflight = getPreflight(document);
  if (preflight.hasErrors) {
    const errorMessages = preflight.checks
      .filter((c) => c.level === 'error')
      .map((c) => c.label)
      .join('; ');
    throw new TemplateServiceError(
      'VALIDATION_FAILED',
      `PREFLIGHT_ERROR: ${errorMessages}`,
      422,
    );
  }

  // Add preflight warnings with stable distinct IDs
  for (const check of preflight.checks) {
    if (check.level === 'warning') {
      const stableId = check.id || `warning-${check.elementId ?? 'global'}`;
      if (!warningIds.includes(stableId)) {
        warningIds.push(stableId);
      }
      findings.push({
        code: check.id,
        elementId: check.elementId,
        message: check.label,
      });
    }
  }

  // 7. Real Chromium Render & Thumbnail Generation
  const fonts: DocumentFontOption[] = [];
  for (const dep of libraryDependencies) {
    if (dep.kind === 'font-face') {
      const meta = dependencyLookup.get(dep.id);
      if (meta?.familyName) {
        fonts.push({
          family: meta.familyName,
        });
      }
    }
  }

  let renderResult;
  try {
    renderResult = await renderDocument(document, {
      fonts,
      denyExternalNetwork: true,
      failOnImageError: true,
      verifyCdpFonts: fonts.length > 0,
      expectedFamilyNames: fonts.map((f) => f.family),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('fallback') || message.includes('font')) {
      throw new TemplateServiceError(
        'DEPENDENCY_UNRESOLVED',
        `MISSING_DEPENDENCY: Phông chữ không thể hiển thị trong trình duyệt (${message})`,
        422,
      );
    }
    throw new TemplateServiceError(
      'VALIDATION_FAILED',
      `CUSTOMER_PREVIEW_FAILED: Trình duyệt không thể render thiết kế (${message})`,
      422,
    );
  }

  // 8. Generate 640px WebP thumbnail with sharp
  const webpBuffer = await sharp(renderResult.png)
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const thumbnailSha256 = createHash('sha256').update(webpBuffer).digest('hex');
  const thumbnailPath = `thumbnails/${guard.templateId}/${guard.draftId}-${Date.now()}.webp`;

  await repo.uploadStorageObject('template-drafts', thumbnailPath, webpBuffer, 'image/webp');

  const attachResult = await repo.attachAsset(actor.userId, {
    templateId: guard.templateId,
    draftId: guard.draftId,
    storageBucket: 'template-drafts',
    storagePath: thumbnailPath,
    checksum: thumbnailSha256,
    mimeType: 'image/webp',
    byteSize: webpBuffer.length,
    pixelWidth: 640,
    uploadStatus: 'verified',
  });

  const thumbnailAssetId = attachResult.ok ? attachResult.value.id : randomUUID();

  // 9. Canonical hashes and expiry (10 minutes)
  const sourceDocumentHash = createHash('sha256')
    .update(JSON.stringify(document))
    .digest('hex');
  const candidateDocumentHash = sourceDocumentHash;
  const targetHash = createHash('sha256')
    .update(JSON.stringify(target))
    .digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const receiptRecordResult = await repo.recordValidationRun(actor.userId, {
    templateId: guard.templateId,
    draftId: guard.draftId,
    sourceRevision: guard.expectedRevision,
    leaseSessionId: guard.sessionId,
    leaseEpoch: guard.leaseEpoch,
    sourceDocumentHash,
    candidateDocumentHash,
    targetHash,
    findings,
    warningIds,
    validatorVersion: '1.0.0',
    engineFingerprint: renderResult.engineFingerprint,
    customerPreviewPassed: true,
    thumbnailAssetId,
    thumbnailChecksum: thumbnailSha256,
    expiresAt,
  });

  if (!receiptRecordResult.ok) {
    throw new TemplateServiceError(
      receiptRecordResult.code,
      receiptRecordResult.message,
    );
  }

  return receiptRecordResult.value;
}
