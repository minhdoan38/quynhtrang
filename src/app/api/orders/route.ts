import { NextResponse } from 'next/server';
import { serverOrderStore } from '@/lib/server-order-store';
import type { CustomerInfo } from '@/lib/order-types';
import type { DesignState } from '@/lib/product-state';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { design, customer }: { design: DesignState; customer: CustomerInfo } = body;

    if (!design || !design.productId) {
      return NextResponse.json(
        { error: 'Dữ liệu thiết kế không hợp lệ.' },
        { status: 400 }
      );
    }

    if (!customer?.fullName?.trim() || !customer?.phone?.trim() || !customer?.shippingAddress?.trim()) {
      return NextResponse.json(
        { error: 'Vui lòng cung cấp đầy đủ tên, số điện thoại và địa chỉ.' },
        { status: 400 }
      );
    }

    const order = serverOrderStore.createOrder(design, customer);

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    console.error('Lỗi tạo đơn hàng:', err);
    return NextResponse.json(
      { error: 'Có lỗi xảy ra khi tạo đơn hàng.' },
      { status: 500 }
    );
  }
}
