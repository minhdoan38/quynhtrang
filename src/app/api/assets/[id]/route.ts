import { getAsset } from '../../../../lib/asset-store.ts';

function sanitizeSvg(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
}

function buildAssetHeaders(contentType: string, byteLength: number): Headers {
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Length', String(byteLength));
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox;");
  headers.set('X-Content-Type-Options', 'nosniff');
  if (contentType === 'image/svg+xml') {
    headers.set('Content-Disposition', 'inline; filename="asset.svg"');
  }
  return headers;
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    if (!id) {
      return Response.json(
        { error: 'Thiếu mã tài nguyên.' },
        { status: 400 }
      );
    }

    const asset = getAsset(id);

    if (!asset) {
      return Response.json(
        { error: 'Không tìm thấy tài nguyên.' },
        { status: 404 }
      );
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
          if (commaIndex !== -1) {
            base64Payload = base64Payload.slice(commaIndex + 1);
          }
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

    // Default 1x1 transparent PNG fallback payload for promoted assets
    const placeholder = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    return new Response(placeholder, {
      status: 200,
      headers: buildAssetHeaders(contentType, placeholder.byteLength),
    });
  } catch (err) {
    console.error('Lỗi tải tài nguyên:', err);
    return Response.json(
      { error: 'Lỗi máy chủ khi tải tài nguyên.' },
      { status: 500 }
    );
  }
}
