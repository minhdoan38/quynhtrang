import { NextResponse } from 'next/server.js';
import { AdminCatalogRepository } from '../../../lib/repositories/admin-catalog-repository.ts';
import { getSharedCatalogRepositoryForTest } from '../../../lib/repositories/price-quote-repository.ts';
import {
  createPriceQuote,
  refreshPriceQuote,
  verifyPriceQuote,
} from '../../../lib/services/price-quote-service.ts';
import { getGuestOrderAccessTokenFromRequest } from '../../../lib/guest-order-access.ts';
import { getSupabaseSecretKey } from '../../../lib/supabase/config.ts';
import { createServerSupabaseClient } from '../../../lib/supabase/server.ts';

export interface QuoteRouteDeps {
  repo?: AdminCatalogRepository;
}

export interface QuoteRequestBody {
  productId?: string;
  variantId?: string;
  quantity?: number;
  checkoutKey?: string;
  idempotencyKey?: string;
  quoteId?: string;
  clientProvidedPrice?: number;
}

async function getRepository(deps?: QuoteRouteDeps): Promise<AdminCatalogRepository> {
  if (deps?.repo) return deps.repo;
  const shared = getSharedCatalogRepositoryForTest();
  if (shared) return shared;
  const hasSupabase = Boolean(
    getSupabaseSecretKey() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim()
  );
  return new AdminCatalogRepository(hasSupabase ? await createServerSupabaseClient() : null);
}

export async function GET(request: Request, deps?: QuoteRouteDeps) {
  try {
    const url = new URL(request.url);
    const quoteId = url.searchParams.get('id');
    if (!quoteId) {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    const repo = await getRepository(deps);
    const verification = await verifyPriceQuote(quoteId, { repo });

    if (verification.code === 'QUOTE_NOT_FOUND' || !verification.quote) {
      return NextResponse.json({ error: 'QUOTE_NOT_FOUND' }, { status: 404 });
    }

    if (verification.code === 'PRODUCT_NOT_SELLABLE') {
      return NextResponse.json({ error: 'PRODUCT_NOT_SELLABLE', quote: verification.quote }, { status: 400 });
    }

    if (verification.code === 'VARIANT_NOT_SELLABLE') {
      return NextResponse.json({ error: 'VARIANT_NOT_SELLABLE', quote: verification.quote }, { status: 400 });
    }

    const expired = verification.code === 'QUOTE_EXPIRED';
    const config = repo.getCommercialVersion(verification.quote.commercialConfigVersionId);
    const rule = config?.variantRules.find((r) => r.variantId === verification.quote?.variantId);

    return NextResponse.json({
      quote: verification.quote,
      expired,
      rule: rule ? {
        minimumQuantity: rule.minimumQuantity,
        quantityStep: rule.quantityStep,
        maximumQuantity: rule.maximumQuantity,
      } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, deps?: QuoteRouteDeps) {
  try {
    const body = (await request.json().catch(() => ({}))) as QuoteRequestBody;
    const repo = await getRepository(deps);
    const checkoutKey =
      body.checkoutKey?.trim() ||
      body.idempotencyKey?.trim() ||
      request.headers.get('x-checkout-idempotency-key') ||
      crypto.randomUUID();

    // Refresh existing quote
    if (body.quoteId) {
      try {
        const { quote, previousVersionId } = await refreshPriceQuote(
          body.quoteId,
          checkoutKey,
          { repo }
        );
        const config = repo.getCommercialVersion(quote.commercialConfigVersionId);
        const rule = config?.variantRules.find((r) => r.variantId === quote.variantId);
        return NextResponse.json({
          quote,
          refreshed: true,
          previousVersionId,
          message: 'Giá sản phẩm vừa được cập nhật.',
          rule: rule ? {
            minimumQuantity: rule.minimumQuantity,
            quantityStep: rule.quantityStep,
            maximumQuantity: rule.maximumQuantity,
          } : undefined,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'REFRESH_FAILED';
        if (msg === 'QUOTE_NOT_FOUND') {
          return NextResponse.json({ error: 'QUOTE_NOT_FOUND' }, { status: 404 });
        }
        if (msg === 'PRODUCT_NOT_SELLABLE' || msg === 'VARIANT_NOT_SELLABLE') {
          return NextResponse.json({ error: msg }, { status: 400 });
        }
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // Create fresh quote
    if (!body.productId || !body.variantId || typeof body.quantity !== 'number') {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    const guestToken = getGuestOrderAccessTokenFromRequest(request);
    const accessContext = guestToken ?? undefined;

    try {
      const quote = await createPriceQuote(
        {
          productId: body.productId,
          variantId: body.variantId,
          quantity: body.quantity,
          checkoutKey,
          clientProvidedPrice: body.clientProvidedPrice,
          accessContext,
        },
        { repo }
      );
      const config = repo.getCommercialVersion(quote.commercialConfigVersionId);
      const rule = config?.variantRules.find((r) => r.variantId === quote.variantId);
      return NextResponse.json({
        quote,
        rule: rule ? {
          minimumQuantity: rule.minimumQuantity,
          quantityStep: rule.quantityStep,
          maximumQuantity: rule.maximumQuantity,
        } : undefined,
      }, { status: 200 });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'QUOTE_FAILED';
      if (
        msg === 'PRODUCT_NOT_SELLABLE' ||
        msg === 'VARIANT_NOT_SELLABLE' ||
        msg === 'COMMERCIAL_CONFIG_UNAVAILABLE' ||
        msg.startsWith('INVALID_QUANTITY')
      ) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
