import { NextResponse } from 'next/server.js';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AuthorizationError,
  requireStaff as authorizeStaff,
} from '../../../../../lib/admin/authorization.ts';
import type { StaffIdentity } from '../../../../../lib/domain/order.ts';
import {
  TemplateServiceError,
  templateServiceStatuses,
  type TemplateErrorCode,
} from '../../../../../lib/domain/template.ts';
import { TemplateRepository } from '../../../../../lib/repositories/template-repository.ts';
import { TemplateManagementService } from '../../../../../lib/services/template-management.ts';
import { createPrivilegedSupabaseClient } from '../../../../../lib/supabase/admin.ts';

export {
  AuthorizationError,
  TemplateServiceError,
  templateServiceStatuses,
  TemplateRepository,
  TemplateManagementService,
};
export type { TemplateErrorCode };
export class InvalidRouteInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRouteInput';
  }
}

export type TemplateAction =
  | 'create'
  | 'publish'
  | 'save_draft'
  | 'validate'
  | 'archive'
  | 'republish'
  | 'discard'
  | 'duplicate'
  | 'patch_metadata'
  | 'takeover'
  | 'delete';

export function requiredRoleForAction(action: TemplateAction): 'admin' | 'editor' {
  if (action === 'delete' || action === 'takeover') {
    return 'admin';
  }
  return 'editor';
}

export interface TemplateRouteDependencies {
  requireStaff?: (request?: Request, requiredRole?: 'admin' | 'editor') => Promise<StaffIdentity>;
  createRepository?: () => Promise<TemplateRepository> | TemplateRepository;
  createPrivilegedRepository?: () => Promise<TemplateRepository> | TemplateRepository;
  createService?: () => Promise<TemplateManagementService> | TemplateManagementService;
  supabaseClient?: SupabaseClient;
  service?: TemplateManagementService;
  repo?: TemplateRepository;
}

export type NonDynamicRouteContext = {
  params?: Promise<Record<string, string>>;
} & TemplateRouteDependencies;
export function assertTemplateOrigin(request: Request): void {
  const method = request.method ? request.method.toUpperCase() : 'GET';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return;
  }

  const origin = request.headers.get('origin');
  let expectedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!expectedHost && request.url) {
    try {
      expectedHost = new URL(request.url).host;
    } catch {
      expectedHost = null;
    }
  }

  if (!origin) {
    const referer = request.headers.get('referer');
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (expectedHost && refererUrl.host === expectedHost) {
          return;
        }
        if (request.url && refererUrl.origin === new URL(request.url).origin) {
          return;
        }
      } catch {
        // malformed referer URL falls through to error
      }
    }
    throw new AuthorizationError('Origin header missing or invalid', 403);
  }

  try {
    const originUrl = new URL(origin);
    if (expectedHost && originUrl.host === expectedHost) {
      return;
    }
    if (request.url && originUrl.origin === new URL(request.url).origin) {
      return;
    }
    throw new AuthorizationError('Cross-origin mutation forbidden', 403);
  } catch (err) {
    if (err instanceof AuthorizationError) throw err;
    throw new AuthorizationError('Invalid origin header', 403);
  }
}

export async function getStaffTemplateContext(
  request?: Request,
  dependencies: TemplateRouteDependencies = {},
  requiredRole?: 'admin' | 'editor',
): Promise<{
  staff: StaffIdentity;
  repo?: TemplateRepository;
  service?: TemplateManagementService;
  supabaseClient?: SupabaseClient;
}> {
  if (request) {
    assertTemplateOrigin(request);
  }

  const staff = dependencies.requireStaff
    ? await dependencies.requireStaff(request, requiredRole)
    : await authorizeStaff(request, requiredRole, { supabaseClient: dependencies.supabaseClient });

  let repo: TemplateRepository | undefined;
  if (dependencies.repo) {
    repo = dependencies.repo;
  } else if (dependencies.createRepository) {
    repo = await dependencies.createRepository();
  } else if (dependencies.createPrivilegedRepository) {
    repo = await dependencies.createPrivilegedRepository();
  } else if (dependencies.supabaseClient) {
    repo = new TemplateRepository(dependencies.supabaseClient);
  } else {
    try {
      repo = new TemplateRepository(createPrivilegedSupabaseClient());
    } catch {
      repo = undefined;
    }
  }

  const service = dependencies.service
    ?? (dependencies.createService
      ? await dependencies.createService()
      : repo
        ? new TemplateManagementService(repo)
        : undefined);

  return {
    staff,
    repo,
    service,
    supabaseClient: dependencies.supabaseClient,
  };
}

export function templateRouteError(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: error.message, code: error.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' },
      { status: error.status },
    );
  }
  if (error instanceof TemplateServiceError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
      { status: error.status },
    );
  }
  if (
    error instanceof InvalidRouteInput
    || error instanceof SyntaxError
    || error instanceof TypeError
    || error instanceof RangeError
  ) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json(
      { error: message, code: 'INVALID_INPUT' },
      { status: 400 },
    );
  }
  console.error('Template route failed', error);
  return NextResponse.json(
    { error: 'Template request failed', code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidRouteInput('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}
