import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '../supabase/browser.ts';
import type { DesignState } from '../product-state.ts';
import {
  extractLibraryDependencies,
  validateNoDraftDependencies,
} from './library-dependencies.ts';
import { toSafeOperationError, type RetryPolicy } from '../reliability/error-contract.ts';
import { createOperationId } from '../reliability/operation-id.ts';

export interface SaveCustomerProjectRevisionOptions {
  libraryLookup?: ReadonlyMap<string, { status: string }>;
}

export interface AutosaveResponseResult {
  conflict: boolean;
  serverRevision?: number;
  newRevision?: number;
  userMessage?: string;
  operationId?: string;
  code?: string;
  safeMessageKey?: string;
  retryable?: boolean;
  retryPolicy?: RetryPolicy;
}

export function handleAutosaveResponse(
  raw: unknown,
  options?: { operationId?: string },
): AutosaveResponseResult {
  const res = raw as {
    success?: boolean;
    error?: string;
    current_revision?: number;
    new_revision?: number;
  };
  const operationId = options?.operationId || createOperationId('autosave');

  if (res?.error === 'STALE_REVISION' || res?.success === false) {
    const isStale = res?.error === 'STALE_REVISION';
    const safeErr = toSafeOperationError(
      {
        code: res?.error || (isStale ? 'STALE_REVISION' : 'UNEXPECTED_ERROR'),
        current_revision: res?.current_revision,
      },
      {
        operation: 'cloudProjectAutosave',
        operationId,
        defaultMessage: isStale
          ? 'Thiết kế này vừa được cập nhật trên thiết bị khác. Vui lòng tải lại phiên bản mới nhất.'
          : undefined,
      },
    );

    return {
      conflict: isStale,
      serverRevision: res?.current_revision,
      userMessage: safeErr.userMessage,
      operationId: safeErr.operationId,
      code: safeErr.code,
      safeMessageKey: safeErr.safeMessageKey,
      retryable: safeErr.retryable,
      retryPolicy: safeErr.retryPolicy,
    };
  }

  return {
    conflict: false,
    newRevision: res?.new_revision,
    operationId,
  };
}

export async function saveCustomerProjectRevision(
  projectId: string,
  expectedRevision: number,
  workingDocument: DesignState,
  client?: SupabaseClient,
  options?: SaveCustomerProjectRevisionOptions,
): Promise<AutosaveResponseResult> {
  const supabase = client ?? createBrowserSupabaseClient();

  if (options?.libraryLookup) {
    validateNoDraftDependencies(workingDocument, options.libraryLookup);
  } else {
    const deps = extractLibraryDependencies(workingDocument);
    if (deps.length > 0 && typeof supabase.from === 'function') {
      const stickerIds = deps.filter((d) => d.kind === 'sticker').map((d) => d.id);
      const fontFaceIds = deps.filter((d) => d.kind === 'font-face').map((d) => d.id);
      const lookup = new Map<string, { status: string }>();

      if (stickerIds.length > 0) {
        try {
          const { data: stickers } = await supabase
            .from('sticker_assets')
            .select('id, status')
            .in('id', stickerIds);
          if (stickers) {
            for (const s of stickers) {
              lookup.set(`sticker:${s.id}`, { status: s.status });
            }
          }
        } catch {
          // Table query failed
        }
      }

      if (fontFaceIds.length > 0) {
        try {
          const { data: faces } = await supabase
            .from('font_faces')
            .select('id, status')
            .in('id', fontFaceIds);
          if (faces) {
            for (const f of faces) {
              lookup.set(`font-face:${f.id}`, { status: f.status });
            }
          }
        } catch {
          // Table query failed
        }
      }

      validateNoDraftDependencies(workingDocument, lookup);
    }
  }
  const { data, error } = await supabase.rpc('save_customer_project_revision', {
    p_project_id: projectId,
    p_expected_revision: expectedRevision,
    p_working_document: workingDocument,
  });

  if (error) {
    const errorRecord = typeof error === 'object' && error !== null ? error : null;
    const rawCode = errorRecord && 'code' in errorRecord && typeof errorRecord.code === 'string'
      ? errorRecord.code.trim()
      : '';
    const rawMsg = error.message?.trim() || '';
    const isNetworkError = /failed to fetch|fetch failed|socket hang up|econnreset|etimedout/i.test(rawMsg);
    const isPostgresCode = /^[0-9A-Z]{5}$/.test(rawCode);
    const isPostgrestCode = /^PGRST\d+$/i.test(rawCode);
    const isDomainCode =
      /^[A-Z][A-Z0-9_]{2,49}$/.test(rawMsg) && !isPostgresCode && !isPostgrestCode;
    const isSafeToPass = isDomainCode || isNetworkError;
    // ponytail: safe default copy over raw DB text; add more granular DB codes if client recovery flows demand it.
    const safeErr = toSafeOperationError(error, {
      operation: 'cloudProjectAutosave',
      defaultMessage: isSafeToPass ? error.message : 'Lỗi lưu trữ đám mây',
    });
    return {
      conflict: false,
      userMessage: safeErr.userMessage,
      operationId: safeErr.operationId,
      code: safeErr.code,
      safeMessageKey: safeErr.safeMessageKey,
      retryable: safeErr.retryable,
      retryPolicy: safeErr.retryPolicy,
    };
  }

  return handleAutosaveResponse(data);
}
