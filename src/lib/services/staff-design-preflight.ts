import { createHash, randomUUID } from 'node:crypto';
import { requireCurrentStaff } from '../admin/authorization.ts';
import { createServerSupabaseClient } from '../supabase/server.ts';
import { getPreflight, type DesignState, type PreflightResult, type PreflightCheck } from '../product-state.ts';
import type {
  DraftWriteGuard,
  StaffPreflightAssessment,
  RevisionResult,
} from '../domain/design-revision.ts';

export function evaluateDraftPreflight(params: {
  draftId: string;
  orderId: string;
  baseVersionId: string;
  expectedProductionVersionId: string;
  revision: number;
  document: DesignState;
  actorUserId: string;
  leaseEpoch: number;
}): StaffPreflightAssessment {
  const findings: PreflightResult = getPreflight(params.document);
  const warningIds: string[] = findings.checks
    .filter((c: PreflightCheck) => c.level === 'warning')
    .map((c: PreflightCheck) => c.id);

  const documentHash = createHash('sha256')
    .update(JSON.stringify(params.document))
    .digest('hex');

  const assessmentId = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  return {
    id: assessmentId,
    draftId: params.draftId,
    versionId: null,
    revision: params.revision,
    documentHash,
    findings,
    expiresAt,
    warningIds,
  };
}

export async function runDraftPreflight(
  guard: DraftWriteGuard
): Promise<RevisionResult<StaffPreflightAssessment>> {
  const staff = await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();

  const { data: draft, error: draftError } = await supabase
    .from('design_revision_drafts')
    .select('*')
    .eq('id', guard.draftId)
    .maybeSingle();

  if (draftError || !draft) {
    return { ok: false, code: 'DRAFT_CLOSED', message: 'Bản nháp không tồn tại' };
  }

  if (draft.status !== 'editing' && draft.status !== 'ready_for_review') {
    return { ok: false, code: 'DRAFT_CLOSED', message: 'Bản nháp đã đóng' };
  }

  if (
    draft.editor_user_id !== staff.userId ||
    draft.lease_session_id !== guard.lease.sessionId ||
    draft.lease_epoch !== guard.lease.epoch
  ) {
    return { ok: false, code: 'LEASE_LOST', message: 'Phiên làm việc đã bị chuyển quyền' };
  }

  if (draft.revision !== guard.expectedRevision) {
    return { ok: false, code: 'PREFLIGHT_STALE', message: 'Bản nháp đã có thay đổi mới' };
  }

  const assessment = evaluateDraftPreflight({
    draftId: guard.draftId,
    orderId: draft.order_id,
    baseVersionId: draft.base_design_version_id,
    expectedProductionVersionId: guard.expectedProductionVersionId,
    revision: draft.revision,
    document: draft.document as DesignState,
    actorUserId: staff.userId,
    leaseEpoch: guard.lease.epoch,
  });

  const productConfigHash = createHash('sha256')
    .update(JSON.stringify((draft.document as DesignState)?.productOptions || {}))
    .digest('hex');

  // Insert assessment
  const { error: insertError } = await supabase
    .from('design_preflight_assessments')
    .insert({
      id: assessment.id,
      draft_id: guard.draftId,
      version_id: null,
      order_id: draft.order_id,
      revision: draft.revision,
      document_hash: assessment.documentHash,
      expected_production_version_id: guard.expectedProductionVersionId,
      base_version_id: draft.base_design_version_id,
      actor_user_id: staff.userId,
      lease_epoch: guard.lease.epoch,
      validator_version: 'state39-v1',
      product_config_hash: productConfigHash,
      asset_manifest_hash: 'manifest-v1',
      findings: assessment.findings,
      warning_ids: assessment.warningIds,
      expires_at: assessment.expiresAt,
    });

  if (insertError) {
    return { ok: false, code: 'FORBIDDEN', message: insertError.message };
  }

  // Update status to ready_for_review if no blocking errors
  if (assessment.findings.level !== 'error') {
    await supabase
      .from('design_revision_drafts')
      .update({
        status: 'ready_for_review',
        updated_at: new Date().toISOString(),
      })
      .eq('id', guard.draftId)
      .eq('revision', draft.revision);
  }

  return { ok: true, value: assessment };
}

export async function runCustomerPreflight(params: {
  orderId: string;
  expectedCustomerVersionId: string;
  expectedProductionVersionId: string;
}): Promise<RevisionResult<StaffPreflightAssessment>> {
  const staff = await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();

  const { data: version, error: versionError } = await supabase
    .from('design_versions')
    .select('*')
    .eq('id', params.expectedCustomerVersionId)
    .maybeSingle();

  if (versionError || !version) {
    return { ok: false, code: 'INVALID_DOCUMENT', message: 'Không tìm thấy phiên bản của khách' };
  }

  const findings: PreflightResult = getPreflight(version.design_document as DesignState);
  const warningIds: string[] = findings.checks
    .filter((c: PreflightCheck) => c.level === 'warning')
    .map((c: PreflightCheck) => c.id);

  const documentHash = createHash('sha256')
    .update(JSON.stringify(version.design_document))
    .digest('hex');

  const assessmentId = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const productConfigHash = createHash('sha256')
    .update(JSON.stringify(version.product_snapshot || {}))
    .digest('hex');

  const { error: insertError } = await supabase
    .from('design_preflight_assessments')
    .insert({
      id: assessmentId,
      draft_id: null,
      version_id: params.expectedCustomerVersionId,
      order_id: params.orderId,
      revision: null,
      document_hash: documentHash,
      expected_production_version_id: params.expectedProductionVersionId,
      base_version_id: params.expectedCustomerVersionId,
      actor_user_id: staff.userId,
      lease_epoch: 1,
      validator_version: 'state39-v1',
      product_config_hash: productConfigHash,
      asset_manifest_hash: 'manifest-v1',
      findings,
      warning_ids: warningIds,
      expires_at: expiresAt,
    });

  if (insertError) {
    return { ok: false, code: 'FORBIDDEN', message: insertError.message };
  }

  return {
    ok: true,
    value: {
      id: assessmentId,
      draftId: null,
      versionId: params.expectedCustomerVersionId,
      revision: null,
      documentHash,
      findings,
      expiresAt,
      warningIds,
    },
  };
}
