import { NextResponse } from 'next/server.js';
import { createClient } from '@supabase/supabase-js';

import { TemplateRepository } from '../../../../../lib/repositories/template-repository.ts';
import { TemplateServiceError } from '../../../../../lib/domain/template.ts';
import { createPrivilegedSupabaseClient } from '../../../../../lib/supabase/admin.ts';
import { createServerSupabaseClient } from '../../../../../lib/supabase/server.ts';
import { getSupabaseConfig } from '../../../../../lib/supabase/config.ts';

export interface VersionRouteAuthIdentity {
  userId?: string | null;
  role?: 'admin' | 'editor' | 'customer' | null;
}

export interface VersionRouteDependencies {
  repo?: TemplateRepository;
  getAuthIdentity?: (request: Request) => Promise<VersionRouteAuthIdentity | null>;
}

function resolveRepo(dependencies?: VersionRouteDependencies): TemplateRepository {
  if (dependencies?.repo) return dependencies.repo;

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

async function resolveIdentity(
  request: Request,
  dependencies?: VersionRouteDependencies,
): Promise<VersionRouteAuthIdentity | null> {
  if (dependencies?.getAuthIdentity) {
    return dependencies.getAuthIdentity(request);
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return null;

    const userId = authData.user.id;
    // Check staff role
    const { data: staffRow } = await supabase
      .from('staff_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    const role = (staffRow?.role as 'admin' | 'editor' | undefined) ?? 'customer';
    return { userId, role };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ versionId: string }> } & VersionRouteDependencies,
  dependencies?: VersionRouteDependencies,
) {
  try {
    const deps = dependencies ?? (context && 'repo' in context ? context : undefined);
    const repo = resolveRepo(deps);
    const { versionId } = await context.params;

    if (!versionId || !versionId.trim()) {
      return NextResponse.json(
        { code: 'INVALID_INPUT', message: 'Mã phiên bản không hợp lệ' },
        { status: 400 },
      );
    }

    const identity = await resolveIdentity(request, deps);

    const payload = await repo.resolveTemplateVersionById(versionId, {
      role: identity?.role ?? undefined,
      userId: identity?.userId ?? null,
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: unknown) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống';
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message },
      { status: 500 },
    );
  }
}

// ponytail: single version resolver endpoint → skipped: ETag caching for immutable payload, add when network load tests show preview version bottlenecks.
