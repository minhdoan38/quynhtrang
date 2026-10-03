import { NextResponse } from 'next/server.js';
import { TemplateRepository } from '../../../../../lib/repositories/template-repository.ts';
import { TemplateServiceError } from '../../../../../lib/domain/template.ts';
import { cloneTemplateIntoProject } from '../../../../../lib/services/template-clone.ts';
import { createPrivilegedSupabaseClient } from '../../../../../lib/supabase/admin.ts';
import { getSupabaseConfig } from '../../../../../lib/supabase/config.ts';
import { createClient } from '@supabase/supabase-js';

export interface TemplateUseRouteDependencies {
  repo?: TemplateRepository;
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
  dependencies?: TemplateUseRouteDependencies,
) {
  try {
    const deps = dependencies ?? (context && 'repo' in context ? (context as unknown as TemplateUseRouteDependencies) : undefined);
    const repo = resolveRepo(deps);
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

    const actor = null;

    const result = await cloneTemplateIntoProject(
      actor,
      {
        templateId: id.trim(),
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

// ponytail: direct guest clone route → skipped: account cloud transaction, add when Task 17 authenticated clone is implemented.
