import { NextResponse } from 'next/server.js';
import { createClient } from '@supabase/supabase-js';

import { TemplateRepository } from '../../../../lib/repositories/template-repository.ts';
import { TemplateServiceError } from '../../../../lib/domain/template.ts';
import { createPrivilegedSupabaseClient } from '../../../../lib/supabase/admin.ts';
import { getSupabaseConfig } from '../../../../lib/supabase/config.ts';

export interface TemplateDetailRouteDependencies {
  repo?: TemplateRepository;
}

function resolveRepo(dependencies?: TemplateDetailRouteDependencies): TemplateRepository {
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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> } & TemplateDetailRouteDependencies,
  dependencies?: TemplateDetailRouteDependencies,
) {
  try {
    const deps = dependencies ?? (context && 'repo' in context ? context : undefined);
    const repo = resolveRepo(deps);
    const { id } = await context.params;

    if (!id || !id.trim()) {
      return NextResponse.json(
        { code: 'INVALID_INPUT', message: 'Mã mẫu thiết kế không hợp lệ' },
        { status: 400 },
      );
    }

    const template = await repo.getTemplate(id);
    if (!template || template.status !== 'published' || template.archivedAt) {
      return NextResponse.json(
        { code: 'NOT_FOUND', message: 'Không tìm thấy mẫu thiết kế' },
        { status: 404 },
      );
    }

    if (!template.currentPublishedVersionId) {
      return NextResponse.json(
        { code: 'NO_PUBLISHED_VERSION', message: 'Mẫu chưa có phiên bản xuất bản' },
        { status: 404 },
      );
    }

    const availability = await repo.getTemplateAvailability(template.id);
    if (!availability.available) {
      return NextResponse.json(
        { code: 'TEMPLATE_UNAVAILABLE', message: 'Mẫu này hiện không còn khả dụng.' },
        { status: 403 },
      );
    }

    const currentVersion = await repo.getVersion(template.currentPublishedVersionId);

    return NextResponse.json(
      {
        template,
        currentVersion,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
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

// ponytail: single public template metadata endpoint → skipped: customer view counter, add when analytics required.
