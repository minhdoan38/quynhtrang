import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '../supabase/browser.ts';
import type { DesignState } from '../product-state.ts';

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
  client?: SupabaseClient
): Promise<AutosaveResponseResult> {
  const supabase = client ?? createBrowserSupabaseClient();

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
