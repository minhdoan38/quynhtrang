import { NextResponse } from 'next/server.js';
import { TemplateRepository } from '../../../../../lib/repositories/template-repository.ts';
import { TemplateServiceError } from '../../../../../lib/domain/template.ts';
import { cloneTemplateIntoProject, resolveTemplateForUse } from '../../../../../lib/services/template-clone.ts';
import { createPrivilegedSupabaseClient } from '../../../../../lib/supabase/admin.ts';
import { getSupabaseConfig } from '../../../../../lib/supabase/config.ts';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '../../../../../lib/supabase/server.ts';

export interface TemplateUseRouteDependencies {
  repo?: TemplateRepository;
  actor?: { userId: string } | null;
  getActor?: () => Promise<{ userId: string } | null>;
}

function resolveRepo(dependencies?: TemplateUseRouteDependencies): TemplateRepository {
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

async function resolveActor(dependencies?: TemplateUseRouteDependencies): Promise<{ userId: string } | null> {
  if (dependencies?.getActor) {
    return dependencies.getActor();
  }
  if (dependencies && 'actor' in dependencies) {
    return dependencies.actor ?? null;
  }
  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      return { userId: authData.user.id };
    }
  } catch {
    // Guest user or SSR unconfigured cookies
  }
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: TemplateUseRouteDependencies,
) {
  try {
    const { id } = await context.params;

    if (!id || !id.trim()) {
      return NextResponse.json(
        { code: 'INVALID_INPUT', message: 'Mã mẫu không hợp lệ' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { expectedVersionId, target, requestId } = body;

    if (!expectedVersionId || typeof expectedVersionId !== 'string') {
      return NextResponse.json(
        { code: 'INVALID_INPUT', message: 'expectedVersionId is required' },
        { status: 400 },
      );
    }

    const trimmedId = id.trim();


    const deps = dependencies ?? (context && 'repo' in context ? (context as unknown as TemplateUseRouteDependencies) : undefined);
    const repo = resolveRepo(deps);
    const actor = await resolveActor(deps);
    let templateIdToUse = trimmedId;
    const existing = await repo.getTemplate(trimmedId);
    if (!existing) {
      const resolved = await resolveTemplateForUse(trimmedId, { repo, target });
      if (resolved) {
        templateIdToUse = resolved.templateId;
      }
    }

    const result = await cloneTemplateIntoProject(
      actor,
      {
        templateId: templateIdToUse,
        expectedVersionId: expectedVersionId.trim(),
        target: target ?? { productId: 'wrapping', variantId: 'default', mode: null, shape: null },
        requestId: requestId || crypto.randomUUID(),
      },
      { repo },
    );

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: unknown) {
    if (error instanceof TemplateServiceError) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
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

// ponytail: authenticated use route → skipped: complex session recovery redirect, add when multi-tab session recovery needed.
