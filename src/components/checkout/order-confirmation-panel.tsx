'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  CheckCircle2,
  Clock,
  QrCode,
  Sparkles,
  Package,
  MapPin,
  Copy,
  Check,
  UserCheck,
} from 'lucide-react';
import type { PendingOrder } from '@/lib/order-types';
import { formatCurrencyVND } from '@/lib/pricing';
import { DesignCanvas } from '@/components/customizer/design-canvas';

export interface OrderConfirmationPanelProps {
  order: PendingOrder;
  onReopenPayment: () => void;
  onNewDesign?: () => void;
}

export function OrderConfirmationPanel({
  order,
  onReopenPayment,
  onNewDesign,
}: OrderConfirmationPanelProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const { snapshot, customer } = order;

  // Staggered entrance animation with reduced-motion support
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };
          if (reduceMotion) {
            gsap.set('.confirmation-section', { opacity: 1, y: 0 });
            return;
          }

          gsap.fromTo(
            '.confirmation-section',
            { opacity: 0, y: 14 },
            {
              opacity: 1,
              y: 0,
              duration: 0.35,
              stagger: 0.08,
              ease: 'power2.out',
              clearProps: 'transform',
            }
          );
        }
      );
      return () => mm.revert();
    },
    { scope: containerRef }
  );

  const handleCopyOrderCode = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(order.id);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleStartNewDesign = () => {
    if (onNewDesign) {
      onNewDesign();
    } else {
      router.push('/');
    }
  };

  const formattedAmount = formatCurrencyVND(order.payment?.amount || 0);

  return (
    <div ref={containerRef} className="space-y-4 max-w-md mx-auto w-full">
      {/* 1. Recorded Headline Card */}
      <div className="confirmation-section rounded-2xl border border-[#DDD6CC] bg-white p-6 text-center space-y-3 shadow-xs">
        <div className="inline-flex p-3 rounded-full bg-[#C8D8C4]/40 text-[#5F7E67]">
          <CheckCircle2 size={36} />
        </div>

        <div>
          <h1 className="font-serif text-xl font-bold text-[#2E3338]">
            Đã ghi nhận đơn hàng
          </h1>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-[#666A6D]">
            <span>Mã đơn:</span>
            <strong className="text-sm font-mono text-[#315F86]">#{order.id}</strong>
            <button
              type="button"
              onClick={handleCopyOrderCode}
              aria-label="Sao chép mã đơn hàng"
              className="p-1 rounded text-[#315F86] hover:bg-[#F8F3E8] transition-colors"
            >
              {copiedCode ? <Check size={14} className="text-[#5F7E67]" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Payment status badge: Neutral/calm waiting confirmation */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF6EE] border border-[#F2DFA0] px-3 py-1 text-xs text-[#A86E22]">
          <Clock size={14} className="shrink-0" />
          <span>
            Thanh toán: <strong>Chờ xác nhận</strong>
          </span>
        </div>

        <p className="text-xs text-[#666A6D] leading-relaxed">
          Bản thiết kế đã được bảo lưu an toàn. Chúng mình sẽ liên hệ và xử lý đơn sau khi thanh toán được xác nhận.
        </p>
      </div>

      {/* 2. Ordered Product & Approved Design Snapshot */}
      <div className="confirmation-section rounded-2xl border border-[#DDD6CC] bg-white p-4 space-y-3 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#2E3338]">
          <Package size={16} className="text-[#315F86]" />
          <span>Sản phẩm đặt in</span>
        </div>

        <div className="flex gap-3 items-center pt-2 border-t border-[#ECE6DC]">
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
              {snapshot.summary.quantity} bản · {formattedAmount}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Delivery Recipient Summary */}
      <div className="confirmation-section rounded-2xl border border-[#DDD6CC] bg-white p-4 space-y-2.5 text-xs shadow-2xs">
        <div className="flex items-center gap-2 font-semibold text-[#2E3338]">
          <MapPin size={16} className="text-[#315F86]" />
          <span>Thông tin nhận hàng</span>
        </div>

        <div className="space-y-1 pt-1.5 border-t border-[#ECE6DC] text-[#666A6D]">
          <p>
            <strong className="text-[#2E3338]">Người nhận:</strong> {customer.fullName} ({customer.phone})
          </p>
          <p>
            <strong className="text-[#2E3338]">Địa chỉ:</strong> {customer.shippingAddress}
          </p>
        </div>
      </div>

      {/* 4. Actions: Reopen QR / Pay now, New Design */}
      <div className="confirmation-section pt-1 space-y-2.5">
        <button
          type="button"
          onClick={onReopenPayment}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98]"
        >
          <QrCode size={16} />
          <span>Xem lại mã thanh toán</span>
        </button>

        <button
          type="button"
          onClick={handleStartNewDesign}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-[#DDD6CC] bg-white text-xs sm:text-sm font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
        >
          <Sparkles size={16} />
          <span>Thiết kế sản phẩm khác</span>
        </button>
      </div>

      {/* 5. Optional Account Migration Prompt (Non-blocking, secondary) */}
      <div className="confirmation-section rounded-xl border border-[#ECE6DC] bg-[#FFFDF8] p-3 text-center space-y-1.5 text-xs">
        <div className="inline-flex items-center gap-1.5 text-[#315F86] font-semibold text-xs">
          <UserCheck size={14} />
          <span>Lưu đơn hàng vào tài khoản</span>
        </div>
        <p className="text-xs text-[#666A6D]">
          Đăng nhập để theo dõi tiến độ in ấn và dễ dàng đặt lại sau này.
        </p>
      </div>
    </div>
  );
}
