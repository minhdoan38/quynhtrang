import type { SupabaseClient } from '@supabase/supabase-js';

import { getAsset } from '../asset-store.ts';
import { AssetRepository } from '../repositories/asset-repository.ts';
import { createPrivilegedSupabaseClient } from '../supabase/admin.ts';
import { getSupabaseSecretKey } from '../supabase/config.ts';

function sanitizeSvg(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
}

function buildAssetHeaders(contentType: string, byteLength: number, isPrivate = false): Headers {
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Length', String(byteLength));
  if (isPrivate) {
    headers.set('Cache-Control', 'private, max-age=3600, no-transform');
  } else {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox;");
  headers.set('X-Content-Type-Options', 'nosniff');
  if (contentType === 'image/svg+xml') {
    headers.set('Content-Disposition', 'inline; filename="asset.svg"');
  }
  return headers;
}

export type AssetActor =
  | { kind: 'staff'; userId?: string; role?: string }
  | { kind: 'customer'; userId: string }
  | { kind: 'guest'; tokenHash: string };

export interface ServeAssetOptions {
  supabaseClient?: SupabaseClient;
  actor?: AssetActor;
}

export async function serveAsset(
  id: string,
  options: ServeAssetOptions = {},
): Promise<Response> {
  if (!id) {
    return Response.json({ error: 'Thiếu mã tài nguyên.' }, { status: 400 });
  }

  const asset = getAsset(id);
  if (!asset) {
    const hasSupabaseEnvironment = Boolean(
      options.supabaseClient ||
      getSupabaseSecretKey() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      process.env.SUPABASE_URL?.trim(),
    );
    if (!hasSupabaseEnvironment) {
      return Response.json({ error: 'Không tìm thấy tài nguyên.' }, { status: 404 });
    }

    const client = options.supabaseClient ?? createPrivilegedSupabaseClient();
    const stored = await new AssetRepository(client).getById(id);
    if (!stored) {
      return Response.json({ error: 'Không tìm thấy tài nguyên.' }, { status: 404 });
    }
    const { data, error } = await client.storage.from(stored.storageBucket).download(stored.storagePath);
    if (error || !data) {
      throw new Error(`Không thể tải tài nguyên từ Storage: ${error?.message ?? 'unknown'}`);
    }
    let buffer = Buffer.from(await data.arrayBuffer());
    const contentType = stored.mimeType || 'application/octet-stream';
    if (contentType === 'image/svg+xml') {
      buffer = Buffer.from(sanitizeSvg(buffer.toString('utf8')), 'utf8');
    }
    return new Response(buffer, {
      status: 200,
      headers: buildAssetHeaders(contentType, buffer.byteLength, stored.storageBucket === 'customer-assets'),
    });
  }

  const contentType = asset.mimeType || 'image/png';
  const payload = asset.payload ?? asset.data;
  if (payload !== undefined && payload !== null) {
    if ((payload as unknown) instanceof Uint8Array) {
      let buffer = Buffer.from(payload as unknown as Uint8Array);
      if (contentType === 'image/svg+xml') {
        buffer = Buffer.from(sanitizeSvg(buffer.toString('utf8')), 'utf8');
      }
      return new Response(buffer, {
        status: 200,
        headers: buildAssetHeaders(contentType, buffer.byteLength),
      });
    }
    if (typeof payload === 'string' && payload.length > 0) {
      let base64Payload = payload.trim();
      if (base64Payload.startsWith('<') || base64Payload.includes('xmlns')) {
        const content = sanitizeSvg(base64Payload);
        const buffer = Buffer.from(content, 'utf8');
        return new Response(buffer, {
          status: 200,
          headers: buildAssetHeaders(contentType, buffer.byteLength),
        });
      }
      if (base64Payload.startsWith('data:')) {
        const commaIndex = base64Payload.indexOf(',');
        if (commaIndex !== -1) base64Payload = base64Payload.slice(commaIndex + 1);
      }
      const cleaned = base64Payload.replace(/\s+/g, '');
      let buffer = Buffer.from(cleaned, 'base64');
      if (contentType === 'image/svg+xml') {
        buffer = Buffer.from(sanitizeSvg(buffer.toString('utf8')), 'utf8');
      }
      return new Response(buffer, {
        status: 200,
        headers: buildAssetHeaders(contentType, buffer.byteLength),
      });
    }
  }

  const placeholder = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  return new Response(placeholder, {
    status: 200,
    headers: buildAssetHeaders(contentType, placeholder.byteLength),
  });
}
