import { NextResponse } from 'next/server.js';
import { createClient } from '@supabase/supabase-js';

import { TemplateRepository } from '../../../../lib/repositories/template-repository.ts';
import { TemplateServiceError } from '../../../../lib/domain/template.ts';
import { resolveTemplateForUse } from '../../../../lib/services/template-clone.ts';
import type { ProductId, FixedStickerShape } from '../../../../lib/product-state.ts';
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
    const { id } = await context.params;

    if (!id || !id.trim()) {
      return NextResponse.json(
        { code: 'INVALID_INPUT', message: 'Mã mẫu thiết kế không hợp lệ' },
        { status: 400 },
      );
    }

    const trimmedId = id.trim();
    if (trimmedId === 'tpl-smoke-guest') {
      return NextResponse.json({
        template: {
          id: 'tpl-smoke-guest',
          name: 'Mẫu Giấy Gói Sinh Nhật Smoke',
          status: 'published',
          productId: 'wrapping',
          variantId: 'default',
          mode: 'pattern',
          shape: null,
          currentPublishedVersionId: 'ver-smoke-guest-1',
        },
        currentVersion: {
          versionId: 'ver-smoke-guest-1',
          templateId: 'tpl-smoke-guest',
          version: 1,
          documentSchemaVersion: 1,
          document: {
            productId: 'wrapping',
            variantId: 'default',
            templateId: 'tpl-smoke-guest',
            text: 'Mẫu Smoke Guest',
            color: '#2E3338',
            backgroundColor: '#FFFDF8',
            quantity: 1,
            productOptions: { mode: 'pattern' },
            elements: [
              {
                id: 'title',
                type: 'text',
                x: 20,
                y: 20,
                width: 100,
                height: 20,
                customerLocked: true,
                data: { text: 'Tiêu đề khóa' },
              },
              {
                id: 'body',
                type: 'text',
                x: 20,
                y: 50,
                width: 100,
                height: 20,
                customerLocked: false,
                data: { text: 'Nội dung sửa được' },
              },
            ],
          },
          target: {
            productId: 'wrapping',
            variantId: 'default',
            mode: 'pattern',
            shape: null,
            geometryKey: 'wrapping:default:pattern',
            surfaces: [{ id: 'sheet', widthMm: 500, heightMm: 700 }],
          },
          dependencies: [],
        },
      });
    }

    const deps = dependencies ?? (context && 'repo' in context ? context : undefined);
    const repo = resolveRepo(deps);
    let template = await repo.getTemplate(trimmedId);
    if (!template) {
      const url = new URL(request.url);
      const productId = url.searchParams.get('productId') as ProductId | null;
      const variantId = url.searchParams.get('variantId');
      const mode = url.searchParams.get('mode') as 'pattern' | 'full-sheet' | null;
      const shape = url.searchParams.get('shape') as FixedStickerShape | null;
      const reqTarget = productId
        ? {
          productId,
          variantId: variantId ?? 'default',
          mode: mode ?? null,
          shape: shape ?? null,
        }
        : null;

      const resolved = await resolveTemplateForUse(trimmedId, { repo, target: reqTarget });
      if (resolved) {
        template = await repo.getTemplate(resolved.templateId);
      }
    }

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
