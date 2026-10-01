import { createHmac, timingSafeEqual } from 'node:crypto';
import { notFound } from 'next/navigation.js';

import {
  DocumentRenderSurface,
  getDocumentRenderDimensions,
  resolveDocumentRenderSurface,
} from '@/components/customizer/document-render-surface';
import type { DesignState } from '@/lib/product-state.ts';
import { getSupabaseSecretKey } from '@/lib/supabase/config.ts';

interface InternalRenderPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveSingleParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getAuthorizationSecret(): string {
  const customToken = process.env.INTERNAL_RENDER_TOKEN?.trim();
  if (customToken) return customToken;
  const supabaseSecret = getSupabaseSecretKey()?.trim();
  if (supabaseSecret) return supabaseSecret;
  return 'internal-render-secret';
}

function isAuthorized(params: {
  token?: string;
  signature?: string;
  payload?: string;
}): boolean {
  const secret = getAuthorizationSecret();

  if (params.token) {
    const expected = Buffer.from(secret);
    const provided = Buffer.from(params.token);
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      return true;
    }
  }

  if (params.signature && params.payload) {
    const expectedSig = createHmac('sha256', secret).update(params.payload).digest('hex');
    const expectedBuf = Buffer.from(expectedSig);
    const providedBuf = Buffer.from(params.signature);
    if (expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf)) {
      return true;
    }
  }

  return false;
}

function parseDocument(raw: string | undefined): DesignState | null {
  if (!raw) return null;
  try {
    const decoded = raw.startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as DesignState;
    if (parsed && typeof parsed.productId === 'string') {
      return parsed;
    }
    return null;
  } catch {
    try {
      const decodedBase64 = Buffer.from(raw, 'base64').toString('utf8');
      const parsed = JSON.parse(decodedBase64) as DesignState;
      if (parsed && typeof parsed.productId === 'string') {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }
}

export default async function InternalRenderPage({
  searchParams,
}: InternalRenderPageProps) {
  const resolvedParams = await searchParams;
  const token = resolveSingleParam(resolvedParams.token);
  const signature = resolveSingleParam(resolvedParams.sig ?? resolvedParams.signature);
  const payload = resolveSingleParam(resolvedParams.data ?? resolvedParams.payload ?? resolvedParams.document);

  if (!isAuthorized({ token, signature, payload })) {
    notFound();
  }

  const document = parseDocument(payload);
  if (!document) {
    notFound();
  }

  const rawSurface = resolveSingleParam(resolvedParams.surface);
  const surface = resolveDocumentRenderSurface(document, rawSurface);

  const rawWidth = resolveSingleParam(resolvedParams.width ?? resolvedParams.widthPx);
  const rawHeight = resolveSingleParam(resolvedParams.height ?? resolvedParams.heightPx);
  const widthPx = rawWidth ? Number.parseInt(rawWidth, 10) : undefined;
  const heightPx = rawHeight ? Number.parseInt(rawHeight, 10) : undefined;

  let dimensions;
  try {
    dimensions = getDocumentRenderDimensions(document, {
      surface,
      widthPx: Number.isInteger(widthPx) ? widthPx : undefined,
      heightPx: Number.isInteger(heightPx) ? heightPx : undefined,
    });
  } catch {
    notFound();
  }

  return (
    <main style={{ margin: 0, padding: 0, background: 'transparent' }}>
      <div
        id="render-container"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <DocumentRenderSurface
          document={document}
          surface={surface}
          widthPx={dimensions.width}
          heightPx={dimensions.height}
        />
      </div>
    </main>
  );
}
