import { redirect } from 'next/navigation.js';
import Link from 'next/link';
import { Package, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { CustomerNavHeader } from '@/components/layout/customer-nav-header.tsx';
import { CustomerOrderCard, type CustomerOrderItem } from '@/components/customer/customer-order-card.tsx';

export default async function MyOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    redirect('/login?returnUrl=/my-orders');
  }

  const { data: ordersData } = await supabase.rpc('get_customer_orders');
  const orders: CustomerOrderItem[] = Array.isArray(ordersData) ? ordersData : [];

  return (
    <div className="min-h-screen bg-[#FFFDF8] flex flex-col">
      <CustomerNavHeader />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        <div className="border-b border-[#ECE6DC] pb-4">
          <h1 className="text-2xl font-serif font-bold text-[#2E3338]">Đơn hàng của tôi</h1>
          <p className="text-xs text-[#666A6D] mt-1">
            Theo dõi trạng thái thanh toán, tiến độ in ấn và xem lại các đơn hàng đã đặt.
          </p>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#DDD6CC] bg-white p-12 text-center max-w-md mx-auto my-8 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#F8F3E8] flex items-center justify-center text-[#315F86] mx-auto">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2E3338]">Chưa có đơn hàng nào</h2>
              <p className="text-xs text-[#666A6D] mt-1">
                Bạn chưa đặt đơn hàng nào bằng tài khoản này. Khám phá các mẫu sản phẩm và tạo đơn hàng đầu tiên ngay nhé!
              </p>
            </div>
            <Link href="/products" className="inline-block pt-2">
              <Button className="h-10 px-5 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold rounded-xl gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Xem sản phẩm</span>
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <CustomerOrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
