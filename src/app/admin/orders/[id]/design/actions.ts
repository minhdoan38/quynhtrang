'use server';

import * as service from '@/lib/services/admin-design-revisions.ts';
import { runDraftPreflight, runCustomerPreflight } from '@/lib/services/staff-design-preflight.ts';
import type {
  StaffDesignDraft,
  DraftLease,
  RevisionResult,
  SaveStaffDraftInput,
  ApprovedRevisionResult,
  DraftWriteGuard,
  StaffPreflightAssessment,
} from '@/lib/domain/design-revision.ts';

export async function createDraftAction(params: {
  orderId: string;
  baseVersionId: string;
  expectedProductionVersionId: string;
  reason: string;
  sessionId: string;
  requestId: string;
}): Promise<RevisionResult<StaffDesignDraft>> {
  return service.createDraft(params);
}

export async function heartbeatAction(
  draftId: string,
  sessionId: string,
  epoch: number
): Promise<RevisionResult<DraftLease>> {
  return service.heartbeatDraft(draftId, sessionId, epoch);
}

export async function saveDraftAction(
  input: SaveStaffDraftInput
): Promise<RevisionResult<{ revision: number; updatedAt: string; requestId: string }>> {
  return service.saveDraft(input);
}

export async function discardDraftAction(params: {
  draftId: string;
  expectedRevision: number;
  expectedProductionVersionId: string;
  sessionId: string;
  epoch: number;
  requestId: string;
}): Promise<RevisionResult<{ draftId: string; status: 'discarded' }>> {
  return service.discardDraft(params);
}

export async function takeoverDraftAction(params: {
  draftId: string;
  expectedEpoch: number;
  sessionId: string;
  requestId: string;
}): Promise<RevisionResult<StaffDesignDraft>> {
  return service.takeoverDraft(params);
}

export async function approveDraftAction(params: {
  draftId: string;
  expectedRevision: number;
  expectedProductionVersionId: string;
  sessionId: string;
  epoch: number;
  assessmentId: string;
  acknowledgedWarningIds: string[];
  requestId: string;
}): Promise<RevisionResult<ApprovedRevisionResult>> {
  return service.approveDraft(params);
}

export async function approveCustomerAsIsAction(params: {
  orderId: string;
  expectedCustomerVersionId: string;
  expectedProductionVersionId: string;
  assessmentId: string;
  acknowledgedWarningIds: string[];
  requestId: string;
}): Promise<RevisionResult<ApprovedRevisionResult>> {
  return service.approveCustomerAsIs(params);
}

export async function runDraftPreflightAction(
  guard: DraftWriteGuard
): Promise<RevisionResult<StaffPreflightAssessment>> {
  return runDraftPreflight(guard);
}

export async function runCustomerPreflightAction(params: {
  orderId: string;
  expectedCustomerVersionId: string;
  expectedProductionVersionId: string;
}): Promise<RevisionResult<StaffPreflightAssessment>> {
  return runCustomerPreflight(params);
}
