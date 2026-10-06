import { serveAsset } from '../../../../lib/services/serve-asset.ts';
import { reportUnexpectedError } from '../../../../lib/observability/report.ts';

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;
    return await serveAsset(id);
  } catch (error) {
    reportUnexpectedError({
      operation: 'serve_asset',
      route: '/api/assets/[id]',
      status: 500,
      error,
    });
    return Response.json(
      { error: 'Lỗi máy chủ khi tải tài nguyên.' },
      { status: 500 },
    );
  }
}
