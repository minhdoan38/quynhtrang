'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Home, Sparkles, Clock, MapPin, Package } from 'lucide-react';
import type { PendingOrder } from '@/lib/order-types';
import { DesignCanvas } from '@/components/customizer/design-canvas';

export default function OrderConfirmationPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const [order, setOrder] = useState<PendingOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders/${params.id}`);
        const data = await res.json();
        if (!res.ok || !data.order) {
          throw new Error(data.error || 'Không tìm thấy đơn hàng.');
        }
        setOrder(data.order);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi tải đơn hàng.');
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [params.id]);

  useEffect(() => {
    // Intercept browser Back so customer returns to product catalog, never back into payment QR
    const onPopState = () => {
      router.replace('/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center text-xs font-semibold text-[#666A6D]">
        Đang tải thông tin đơn hàng #{params.id}...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#FFFDF8] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-semibold text-[#B3535D]">{error || 'Không tìm thấy đơn hàng.'}</p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-[#315F86] px-4 text-xs font-semibold text-white shadow-xs"
        >
          Về trang thiết kế
        </button>
      </div>
    );
  }

  const { snapshot, customer } = order;

  return (
    <div className="min-h-screen bg-[#FFFDF8] text-[#2E3338] font-sans pb-16">
      {/* Header */}
      <header className="h-[52px] border-b border-[#DDD6CC] bg-[#FFFDF8] px-4 flex items-center justify-between">
        <span className="font-serif text-base font-bold text-[#2E3338]">quỳnh trang studio</span>
        <span className="text-xs font-semibold text-[#315F86]">Đơn hàng #{order.id}</span>
      </header>

      <main className="max-w-md mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* Status Confirmation Banner */}
        <div className="rounded-2xl border border-[#DDD6CC] bg-white p-6 text-center space-y-3 shadow-xs">
          <div className="inline-flex p-3 rounded-full bg-[#C8D8C4]/40 text-[#5F7E67]">
            <CheckCircle2 size={36} />
          </div>

          <div>
            <h1 className="font-serif text-xl font-bold text-[#2E3338]">
              Đã ghi nhận đơn hàng!
            </h1>
            <p className="text-xs text-[#666A6D] mt-1">
              Mã đơn: <strong className="text-[#2E3338]">#{order.id}</strong>
            </p>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FFFDF8] border border-[#F2DFA0] px-3 py-1 text-xs text-[#A86E22]">
            <Clock size={14} />
            <span>Thanh toán: <strong>Chờ xác nhận</strong></span>
          </div>

          <p className="text-[11px] text-[#666A6D] leading-relaxed">
            Bản thiết kế đã được bảo lưu nguyên vẹn trên hệ thống. Chúng mình sẽ liên hệ xác nhận đơn và tiến hành in ấn sớm nhất!
          </p>
        </div>

        {/* Product & Design Snapshot Card */}
        <div className="rounded-2xl border border-[#DDD6CC] bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#2E3338]">
            <Package size={16} className="text-[#315F86]" />
            <span>Sản phẩm đặt in</span>
          </div>

          <div className="flex gap-3 items-center pt-1 border-t border-[#ECE6DC]">
            <div className="w-20 h-20 rounded-xl bg-[#F8F3E8] border border-[#ECE6DC] overflow-hidden flex items-center justify-center shrink-0">
              <div className="scale-[0.35] transform origin-center">
                <DesignCanvas
                  productId={snapshot.design.productId}
                  text={snapshot.design.text}
                  color={snapshot.design.color}
                  backgroundColor={snapshot.design.backgroundColor}
                  image={snapshot.design.image}
                  productOptions={snapshot.design.productOptions}
                />
              </div>
            </div>

            <div className="flex-1 min-w-0 text-xs">
              <p className="font-bold text-[#2E3338] truncate">{snapshot.summary.product}</p>
              <p className="text-[#666A6D]">{snapshot.summary.variant}</p>
              <p className="mt-1 font-semibold text-[#315F86]">
                Số lượng: {snapshot.summary.quantity} bản · {snapshot.summary.priceLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Customer Shipping Info (State 35 customer fields: fullName, phone, shippingAddress) */}
        <div className="rounded-2xl border border-[#DDD6CC] bg-white p-4 space-y-2.5 text-xs">
          <div className="flex items-center gap-2 font-semibold text-[#2E3338]">
            <MapPin size={16} className="text-[#315F86]" />
            <span>Thông tin nhận hàng</span>
          </div>

          <div className="space-y-1 pt-1 border-t border-[#ECE6DC] text-[#666A6D]">
            <p>
              <strong className="text-[#2E3338]">Người nhận:</strong> {customer.fullName} ({customer.phone})
            </p>
            <p>
              <strong className="text-[#2E3338]">Địa chỉ:</strong> {customer.shippingAddress}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2.5">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98]"
          >
            <Sparkles size={16} />
            <span>Thiết kế sản phẩm khác</span>
          </button>

          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-[#DDD6CC] bg-white text-xs sm:text-sm font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
          >
            <Home size={16} />
            <span>Về trang chủ</span>
          </button>
        </div>
      </main>
    </div>
  );
}
