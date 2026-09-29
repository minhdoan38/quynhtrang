import { serverOrderStore } from '../../../../lib/server-order-store.ts';

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    if (!id) {
      return Response.json(
        { error: 'Thiếu mã đơn hàng.' },
        { status: 400 }
      );
    }

    const order = serverOrderStore.getOrder(id);

    if (!order) {
      return Response.json(
        { error: 'Không tìm thấy đơn hàng.' },
        { status: 404 }
      );
    }

    return Response.json({ order });
  } catch (err) {
    console.error('Lỗi truy vấn đơn hàng:', err);
    return Response.json(
      { error: 'Lỗi máy chủ.' },
      { status: 500 }
    );
  }
}
