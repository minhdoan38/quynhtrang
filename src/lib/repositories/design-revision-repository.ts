import type { SupabaseClient } from '@supabase/supabase-js';
import type { DesignState } from '../product-state.ts';
import type {
  StaffDesignDraft,
  StaffDraftSummary,
  DraftLease,
  RevisionResult,
  SaveStaffDraftInput,
  ApprovedRevisionResult,
  DesignVersionListItem,
} from '../domain/design-revision.ts';

export class DesignRevisionRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async getActiveDraftSummary(orderId: string): Promise<StaffDraftSummary | null> {
    const { data, error } = await this.client
      .from('design_revision_drafts')
      .select('id, order_id, status, editor_user_id, reason, revision, lease_expires_at, last_activity_at, created_at')
      .eq('order_id', orderId)
      .in('status', ['editing', 'ready_for_review'])
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      id: String(data.id),
      orderId: String(data.order_id),
      status: data.status,
      editorUserId: String(data.editor_user_id),
      reason: String(data.reason),
      revision: Number(data.revision),
      leaseExpiresAt: data.lease_expires_at ? String(data.lease_expires_at) : null,
      lastActivityAt: String(data.last_activity_at),
      createdAt: String(data.created_at),
    };
  }

  async getFullDraft(draftId: string): Promise<StaffDesignDraft | null> {
    const { data, error } = await this.client
      .from('design_revision_drafts')
      .select('*')
      .eq('id', draftId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      id: String(data.id),
      orderId: String(data.order_id),
      projectId: String(data.project_id),
      baseDesignVersionId: String(data.base_design_version_id),
      expectedProductionDesignVersionId: String(data.expected_production_design_version_id),
      document: data.document as DesignState,
      revision: Number(data.revision),
      reason: String(data.reason),
      status: data.status,
      createdBy: String(data.created_by),
      editorUserId: String(data.editor_user_id),
      lease: data.lease_session_id
        ? {
          sessionId: String(data.lease_session_id),
          epoch: Number(data.lease_epoch ?? 1),
          expiresAt: String(data.lease_expires_at ?? ''),
        }
        : null,
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
      approvedDesignVersionId: data.approved_design_version_id ? String(data.approved_design_version_id) : null,
    };
  }

  async listVersions(orderId: string): Promise<DesignVersionListItem[]> {
    const { data: orderData, error: orderError } = await this.client
      .from('orders')
      .select('project_id, customer_approved_design_version_id, production_design_version_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !orderData || !orderData.project_id) {
      return [];
    }

    const { data: versions, error: versionsError } = await this.client
      .from('design_versions')
      .select('id, version_number, source, parent_design_version_id, revision_reason, created_by, created_at, approved_thumbnail_path')
      .eq('project_id', orderData.project_id)
      .order('version_number', { ascending: false });

    if (versionsError || !versions) {
      return [];
    }

    return versions.map((v) => ({
      id: String(v.id),
      versionNumber: Number(v.version_number),
      source: String(v.source),
      parentVersionId: v.parent_design_version_id ? String(v.parent_design_version_id) : null,
      reason: v.revision_reason ? String(v.revision_reason) : null,
      createdBy: v.created_by ? String(v.created_by) : null,
      createdAt: String(v.created_at),
      thumbnailPath: v.approved_thumbnail_path ? String(v.approved_thumbnail_path) : null,
      isCustomer: v.id === orderData.customer_approved_design_version_id,
      isProduction: v.id === orderData.production_design_version_id,
    }));
  }

  async getVersionDocument(versionId: string): Promise<DesignState | null> {
    const { data, error } = await this.client
      .from('design_versions')
      .select('design_document')
      .eq('id', versionId)
      .maybeSingle();

    if (error || !data || !data.design_document) {
      return null;
    }

    return data.design_document as DesignState;
  }

  async createDraft(params: {
    orderId: string;
    baseVersionId: string;
    expectedProductionVersionId: string;
    reason: string;
    sessionId: string;
    requestId: string;
  }): Promise<RevisionResult<StaffDesignDraft>> {
    const inputHash = `${params.orderId}:${params.baseVersionId}:${params.reason.trim()}`;
    const { data, error } = await this.client.rpc('create_design_revision_draft', {
      p_order_id: params.orderId,
      p_base_version_id: params.baseVersionId,
      p_expected_production_version_id: params.expectedProductionVersionId,
      p_reason: params.reason,
      p_session_id: params.sessionId,
      p_request_id: params.requestId,
      p_input_hash: inputHash,
    });

    if (error) {
      return { ok: false, code: 'FORBIDDEN', message: error.message };
    }

    return data as RevisionResult<StaffDesignDraft>;
  }

  async heartbeatLease(draftId: string, sessionId: string, epoch: number): Promise<RevisionResult<DraftLease>> {
    const { data, error } = await this.client.rpc('heartbeat_draft_lease', {
      p_draft_id: draftId,
      p_session_id: sessionId,
      p_epoch: epoch,
    });

    if (error) {
      return { ok: false, code: 'LEASE_LOST', message: error.message };
    }

    return data as RevisionResult<DraftLease>;
  }

  async saveDraft(input: SaveStaffDraftInput): Promise<RevisionResult<{ revision: number; updatedAt: string; requestId: string }>> {
    const documentHash = JSON.stringify(input.document);
    const { data, error } = await this.client.rpc('save_design_revision_draft', {
      p_draft_id: input.draftId,
      p_expected_revision: input.expectedRevision,
      p_expected_production_version_id: input.expectedProductionVersionId,
      p_session_id: input.lease.sessionId,
      p_epoch: input.lease.epoch,
      p_request_id: input.requestId,
      p_document: input.document,
      p_document_hash: documentHash,
    });

    if (error) {
      return { ok: false, code: 'REVISION_CONFLICT', message: error.message };
    }

    return data as RevisionResult<{ revision: number; updatedAt: string; requestId: string }>;
  }

  async discardDraft(params: {
    draftId: string;
    expectedRevision: number;
    expectedProductionVersionId: string;
    sessionId: string;
    epoch: number;
    requestId: string;
  }): Promise<RevisionResult<{ draftId: string; status: 'discarded' }>> {
    const { data, error } = await this.client.rpc('discard_design_revision_draft', {
      p_draft_id: params.draftId,
      p_expected_revision: params.expectedRevision,
      p_expected_production_version_id: params.expectedProductionVersionId,
      p_session_id: params.sessionId,
      p_epoch: params.epoch,
      p_request_id: params.requestId,
    });

    if (error) {
      return { ok: false, code: 'FORBIDDEN', message: error.message };
    }

    return data as RevisionResult<{ draftId: string; status: 'discarded' }>;
  }

  async takeoverLease(params: {
    draftId: string;
    expectedEpoch: number;
    sessionId: string;
    requestId: string;
  }): Promise<RevisionResult<StaffDesignDraft>> {
    const { data, error } = await this.client.rpc('takeover_draft_lease', {
      p_draft_id: params.draftId,
      p_expected_epoch: params.expectedEpoch,
      p_session_id: params.sessionId,
      p_request_id: params.requestId,
    });

    if (error) {
      return { ok: false, code: 'FORBIDDEN', message: error.message };
    }

    return data as RevisionResult<StaffDesignDraft>;
  }

  async approveRevision(params: {
    draftId: string;
    expectedRevision: number;
    expectedProductionVersionId: string;
    sessionId: string;
    epoch: number;
    assessmentId: string;
    acknowledgedWarningIds: string[];
    requestId: string;
  }): Promise<RevisionResult<ApprovedRevisionResult>> {
    const { data, error } = await this.client.rpc('approve_design_revision', {
      p_draft_id: params.draftId,
      p_expected_revision: params.expectedRevision,
      p_expected_production_version_id: params.expectedProductionVersionId,
      p_session_id: params.sessionId,
      p_epoch: params.epoch,
      p_assessment_id: params.assessmentId,
      p_acknowledged_warning_ids: params.acknowledgedWarningIds,
      p_request_id: params.requestId,
    });

    if (error) {
      return { ok: false, code: 'FORBIDDEN', message: error.message };
    }

    return data as RevisionResult<ApprovedRevisionResult>;
  }

  async approveCustomerAsIs(params: {
    orderId: string;
    expectedCustomerVersionId: string;
    expectedProductionVersionId: string;
    assessmentId: string;
    acknowledgedWarningIds: string[];
    requestId: string;
  }): Promise<RevisionResult<ApprovedRevisionResult>> {
    const { data, error } = await this.client.rpc('approve_customer_design_as_production', {
      p_order_id: params.orderId,
      p_expected_customer_version_id: params.expectedCustomerVersionId,
      p_expected_production_version_id: params.expectedProductionVersionId,
      p_assessment_id: params.assessmentId,
      p_acknowledged_warning_ids: params.acknowledgedWarningIds,
      p_request_id: params.requestId,
    });

    if (error) {
      return { ok: false, code: 'FORBIDDEN', message: error.message };
    }

    return data as RevisionResult<ApprovedRevisionResult>;
  }
}
