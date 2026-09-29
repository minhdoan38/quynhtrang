import { getAsset } from '../../../../lib/asset-store.ts';

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
      if (payload instanceof Uint8Array) {
        const buffer = Buffer.from(payload);
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(buffer.byteLength),
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }
      if (typeof payload === 'string' && payload.length > 0) {
        if (payload.startsWith('data:')) {
          const base64Index = payload.indexOf(';base64,');
          const base64Payload = base64Index !== -1 ? payload.slice(base64Index + 8) : payload;
          const buffer = Buffer.from(base64Payload, 'base64');
          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(buffer.byteLength),
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }
        const trimmed = payload.trim();
        const isBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0 && !trimmed.includes('<');
        const buffer = isBase64 ? Buffer.from(trimmed, 'base64') : Buffer.from(payload, 'utf8');
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(buffer.byteLength),
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
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
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(placeholder.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('Lỗi tải tài nguyên:', err);
    return Response.json(
      { error: 'Lỗi máy chủ khi tải tài nguyên.' },
      { status: 500 }
    );
  }
}
