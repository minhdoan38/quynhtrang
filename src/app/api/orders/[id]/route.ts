import { NextResponse } from 'next/server';
import { serverOrderStore } from '@/lib/server-order-store';

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    if (!id) {
      return NextResponse.json(
        { error: 'Thiếu mã đơn hàng.' },
        { status: 400 }
      );
    }

    const order = serverOrderStore.getOrder(id);

    if (!order) {
      return NextResponse.json(
        { error: 'Không tìm thấy đơn hàng.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ order });
  } catch (err) {
    console.error('Lỗi truy vấn đơn hàng:', err);
    return NextResponse.json(
      { error: 'Lỗi máy chủ.' },
      { status: 500 }
    );
  }
}
