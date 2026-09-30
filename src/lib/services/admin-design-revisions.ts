import { requireCurrentStaff } from '../admin/authorization.ts';
import { createServerSupabaseClient } from '../supabase/server.ts';
import { DesignRevisionRepository } from '../repositories/design-revision-repository.ts';
import type {
  StaffDesignDraft,
  StaffDraftSummary,
  DraftLease,
  RevisionResult,
  SaveStaffDraftInput,
  ApprovedRevisionResult,
  DesignVersionListItem,
} from '../domain/design-revision.ts';
import type { DesignState } from '../product-state.ts';

export async function createDraft(params: {
  orderId: string;
  baseVersionId: string;
  expectedProductionVersionId: string;
  reason: string;
  sessionId: string;
  requestId: string;
}): Promise<RevisionResult<StaffDesignDraft>> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.createDraft(params);
}

export async function heartbeatDraft(
  draftId: string,
  sessionId: string,
  epoch: number
): Promise<RevisionResult<DraftLease>> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.heartbeatLease(draftId, sessionId, epoch);
}

export async function saveDraft(
  input: SaveStaffDraftInput
): Promise<RevisionResult<{ revision: number; updatedAt: string; requestId: string }>> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.saveDraft(input);
}

export async function discardDraft(params: {
  draftId: string;
  expectedRevision: number;
  expectedProductionVersionId: string;
  sessionId: string;
  epoch: number;
  requestId: string;
}): Promise<RevisionResult<{ draftId: string; status: 'discarded' }>> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.discardDraft(params);
}

export async function takeoverDraft(params: {
  draftId: string;
  expectedEpoch: number;
  sessionId: string;
  requestId: string;
}): Promise<RevisionResult<StaffDesignDraft>> {
  await requireCurrentStaff('admin');
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.takeoverLease(params);
}

export async function approveDraft(params: {
  draftId: string;
  expectedRevision: number;
  expectedProductionVersionId: string;
  sessionId: string;
  epoch: number;
  assessmentId: string;
  acknowledgedWarningIds: string[];
  requestId: string;
}): Promise<RevisionResult<ApprovedRevisionResult>> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.approveRevision(params);
}

export async function approveCustomerAsIs(params: {
  orderId: string;
  expectedCustomerVersionId: string;
  expectedProductionVersionId: string;
  assessmentId: string;
  acknowledgedWarningIds: string[];
  requestId: string;
}): Promise<RevisionResult<ApprovedRevisionResult>> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.approveCustomerAsIs(params);
}

export async function getActiveDraftSummary(orderId: string): Promise<StaffDraftSummary | null> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.getActiveDraftSummary(orderId);
}

export async function getFullDraft(draftId: string): Promise<StaffDesignDraft | null> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.getFullDraft(draftId);
}

export async function listVersions(orderId: string): Promise<DesignVersionListItem[]> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.listVersions(orderId);
}

export async function getVersionDocument(versionId: string): Promise<DesignState | null> {
  await requireCurrentStaff();
  const supabase = await createServerSupabaseClient();
  const repo = new DesignRevisionRepository(supabase);
  return repo.getVersionDocument(versionId);
}
