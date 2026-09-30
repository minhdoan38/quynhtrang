import { serveAsset } from '../../../../lib/services/serve-asset.ts';

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;
    return await serveAsset(id);
  } catch (error) {
    console.error('Lỗi tải tài nguyên:', error);
    return Response.json(
      { error: 'Lỗi máy chủ khi tải tài nguyên.' },
      { status: 500 },
    );
  }
}
