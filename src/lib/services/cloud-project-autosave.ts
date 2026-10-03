import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '../supabase/browser.ts';
import type { DesignState } from '../product-state.ts';
import {
  extractLibraryDependencies,
  validateNoDraftDependencies,
} from './library-dependencies.ts';

export interface SaveCustomerProjectRevisionOptions {
  libraryLookup?: ReadonlyMap<string, { status: string }>;
}

export interface AutosaveResponseResult {
  conflict: boolean;
  serverRevision?: number;
  newRevision?: number;
  userMessage?: string;
}

export function handleAutosaveResponse(raw: unknown): AutosaveResponseResult {
  const res = raw as {
    success?: boolean;
    error?: string;
    current_revision?: number;
    new_revision?: number;
  };

  if (res?.error === 'STALE_REVISION' || res?.success === false) {
    return {
      conflict: true,
      serverRevision: res.current_revision,
      userMessage: 'Thiết kế này vừa được cập nhật trên thiết bị khác. Vui lòng tải lại phiên bản mới nhất.',
    };
  }

  return {
    conflict: false,
    newRevision: res?.new_revision,
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
    return {
      conflict: false,
      userMessage: error.message || 'Lỗi lưu trữ đám mây',
    };
  }

  return handleAutosaveResponse(data);
}
