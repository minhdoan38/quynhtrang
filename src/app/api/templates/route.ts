import { NextResponse } from 'next/server.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { FixedStickerShape, ProductId } from '../../../lib/product-state.ts';
import {
  TemplateRepository,
} from '../../../lib/repositories/template-repository.ts';
import {
  TemplateServiceError,
  type BrowseAvailableTemplatesOptions,
  type TemplateTargetInput,
} from '../../../lib/domain/template.ts';
import { createPrivilegedSupabaseClient } from '../../../lib/supabase/admin.ts';
import { getSupabaseConfig } from '../../../lib/supabase/config.ts';

export interface TemplatesRouteDependencies {
  repo?: TemplateRepository;
}

function resolveRepo(dependencies?: TemplatesRouteDependencies): TemplateRepository {
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
  context?: { params?: Promise<Record<string, string>> } & TemplatesRouteDependencies,
  dependencies?: TemplatesRouteDependencies,
) {
  try {
    const deps = dependencies ?? (context && 'repo' in context ? context : undefined);
    const repo = resolveRepo(deps);

    const url = new URL(request.url);
    const productId = url.searchParams.get('productId') as ProductId | null;
    const variantId = url.searchParams.get('variantId');
    const modeParam = url.searchParams.get('mode');
    const shapeParam = url.searchParams.get('shape');
    const categoryId = url.searchParams.get('categoryId');
    const query = url.searchParams.get('query');
    const cursor = url.searchParams.get('cursor');
    const limitParam = url.searchParams.get('limit');
    const limitInt = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = !Number.isNaN(limitInt) ? Math.max(1, Math.min(60, limitInt)) : undefined;

    const target: Partial<TemplateTargetInput> = {};
    if (productId) target.productId = productId;
    if (variantId) target.variantId = variantId;
    if (url.searchParams.has('mode')) {
      target.mode = (modeParam === 'none' || modeParam === 'null' || !modeParam)
        ? null
        : (modeParam as 'pattern' | 'full-sheet');
    }
    if (url.searchParams.has('shape')) {
      target.shape = (shapeParam === 'none' || shapeParam === 'null' || !shapeParam)
        ? null
        : (shapeParam as FixedStickerShape);
    } else if (productId === 'sticker' && variantId === 'die-cut') {
      target.shape = null;
    }
    const options: BrowseAvailableTemplatesOptions = {
      target: Object.keys(target).length > 0 ? target : undefined,
      categoryId: categoryId ?? undefined,
      query: query ?? undefined,
      cursor: cursor ?? undefined,
      limit: limit ?? undefined,
    };

    const result = await repo.browseAvailableTemplates(options);

    return NextResponse.json(result, {
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

// ponytail: direct public catalog endpoint without API keys → skipped: public IP rate limiter, add when DDOS/crawling protection is required.
