import { NextResponse } from 'next/server';
import { getPaymentInstructions } from '@/lib/payment-qr-provider';
import { serverOrderStore } from '@/lib/server-order-store';

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    if (!id) {
      return NextResponse.json({ error: 'Thiếu mã đơn hàng.' }, { status: 400 });
    }

    const order = serverOrderStore.getOrder(id);
    if (!order) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
    }

    const instructions = await getPaymentInstructions(id);
    return NextResponse.json({ instructions, order });
  } catch (err) {
    console.error('Lỗi lấy hướng dẫn thanh toán:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Chưa thể tạo mã thanh toán.' },
      { status: 500 }
    );
  }
}
