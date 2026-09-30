'use client';

import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  QrCode,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import type { PendingOrder, PaymentInstructions } from '@/lib/order-types';
import { formatCurrencyVND } from '@/lib/pricing';

export interface PaymentQrPanelProps {
  order: PendingOrder;
  onPaymentReported: () => void;
  onPayLater: () => void;
  onBackToCustomerInfo?: () => void;
}

export function PaymentQrPanel({
  order,
  onPaymentReported,
  onPayLater,
}: PaymentQrPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showManualDetails, setShowManualDetails] = useState(false);
  const [reporting, setReporting] = useState(false);

  // Fetch or refresh payment instructions for this exact order
  const fetchInstructions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/payment`, { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok || !data.instructions) {
        throw new Error(data.error || 'Chưa thể tạo mã thanh toán.');
      }
      setInstructions(data.instructions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa thể tạo mã thanh toán.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstructions();
  }, [order.id]);

  // Entrance motion respecting prefers-reduced-motion
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
            gsap.set('.qr-animate-target', { opacity: 1, y: 0 });
            return;
          }

          gsap.fromTo(
            '.qr-animate-target',
            { opacity: 0, y: 14 },
            {
              opacity: 1,
              y: 0,
              duration: 0.35,
              stagger: 0.06,
              ease: 'power2.out',
              clearProps: 'transform',
            }
          );
        }
      );
      return () => mm.revert();
    },
    { dependencies: [loading, instructions], scope: containerRef }
  );

  const handleCopy = async (key: string, value: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Non-blocking clipboard fallback
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleReportPayment = async () => {
    setReporting(true);
    try {
      await fetch(`/api/orders/${order.id}/payment/report`, { method: 'POST', credentials: 'same-origin' });
    } catch (err) {
      console.warn('Ghi nhận thanh toán nền gặp lỗi:', err);
    } finally {
      setReporting(false);
      onPaymentReported();
    }
  };

  const amountDisplay = formatCurrencyVND(order.payment?.amount || 0);
  const paymentRef = order.payment?.paymentReference || order.id;

  return (
    <div ref={containerRef} className="space-y-4 max-w-md mx-auto w-full">
      {/* Main QR Card */}
      <div className="qr-animate-target rounded-2xl border border-[#DDD6CC] bg-white p-5 sm:p-6 shadow-xs text-center space-y-4">
        <div>
          <h2 className="font-serif text-lg sm:text-xl font-bold text-[#2E3338]">
            Quét mã để thanh toán
          </h2>
          <p className="text-xs text-[#666A6D] mt-1">
            Mã đơn: <strong className="text-[#315F86]">#{order.id}</strong>
          </p>
        </div>

        {/* QR Code Container */}
        <div className="w-56 h-56 mx-auto rounded-2xl border border-[#DDD6CC] bg-[#FFFDF8] p-3 flex flex-col items-center justify-center relative overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 text-xs text-[#666A6D]">
              <RefreshCw className="animate-spin text-[#315F86]" size={28} />
              <span>Đang tạo mã thanh toán...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-3 text-center space-y-2">
              <AlertCircle size={32} className="text-[#B3535D]" />
              <p className="text-xs font-semibold text-[#B3535D]">{error}</p>
              <button
                type="button"
                onClick={fetchInstructions}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#315F86] text-white text-xs font-semibold hover:bg-[#244A69] transition-colors"
              >
                <RefreshCw size={14} />
                <span>Thử lại</span>
              </button>
            </div>
          ) : instructions?.qrUrl ? (
            <div className="relative w-full h-full bg-white rounded-xl flex items-center justify-center p-1.5 shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={instructions.qrUrl}
                alt={`Mã thanh toán VietQR đơn hàng #${order.id}`}
                className="w-full h-full object-contain"
                loading="eager"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-2 text-[#666A6D]">
              <QrCode size={56} className="text-[#315F86] mb-1" />
              <span className="text-xs font-semibold">{paymentRef}</span>
            </div>
          )}
        </div>

        {/* Amount & Reference Details (Outside QR for verification) */}
        <div className="space-y-2 pt-1 border-t border-[#ECE6DC]">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-[#666A6D]">Số tiền thanh toán:</span>
            <span className="text-base font-bold text-[#315F86]">{amountDisplay}</span>
          </div>

          <div className="flex items-center justify-between bg-[#F8F3E8] p-2.5 rounded-xl border border-[#ECE6DC]">
            <div className="text-left">
              <p className="text-xs uppercase font-bold text-[#666A6D] tracking-wide">
                Nội dung chuyển khoản
              </p>
              <p className="font-mono text-sm font-bold text-[#2E3338]">{paymentRef}</p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy('reference', paymentRef)}
              aria-label="Sao chép nội dung chuyển khoản"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#DDD6CC] text-xs font-semibold text-[#2E3338] hover:bg-[#FAF6EE] transition-colors active:scale-95"
            >
              {copiedKey === 'reference' ? (
                <>
                  <Check size={14} className="text-[#5F7E67]" />
                  <span className="text-[#5F7E67]">Đã sao chép</span>
                </>
              ) : (
                <>
                  <Copy size={14} className="text-[#666A6D]" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-[#666A6D] leading-relaxed">
          Vui lòng giữ nguyên số tiền và nội dung chuyển khoản. Đơn hàng sẽ được xử lý sau khi thanh toán được xác nhận.
        </p>

        {/* Status notice */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FAF6EE] border border-[#F2DFA0] text-xs text-[#A86E22]">
          <Clock size={14} className="shrink-0" />
          <span>
            Trạng thái: <strong>Chờ xác nhận thanh toán</strong>
          </span>
        </div>
      </div>

      {/* Same-device problem fallback: Manual bank details */}
      <div className="qr-animate-target rounded-2xl border border-[#DDD6CC] bg-white overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowManualDetails((prev) => !prev)}
          className="w-full px-4 py-3.5 flex items-center justify-between text-left text-xs font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
          aria-expanded={showManualDetails}
        >
          <span>Không quét được trên điện thoại này? Xem thông tin chuyển khoản</span>
          {showManualDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showManualDetails && instructions && (
          <div className="p-4 pt-1 border-t border-[#ECE6DC] space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#666A6D]">Ngân hàng:</span>
              <span className="font-semibold text-[#2E3338]">{instructions.bankName}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#666A6D]">Số tài khoản:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[#2E3338]">{instructions.accountNumber}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('account', instructions.accountNumber)}
                  aria-label="Sao chép số tài khoản"
                  className="p-1 rounded text-[#315F86] hover:bg-[#F8F3E8]"
                >
                  {copiedKey === 'account' ? <Check size={14} className="text-[#5F7E67]" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#666A6D]">Chủ tài khoản:</span>
              <span className="font-semibold text-[#2E3338]">{instructions.accountName}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#666A6D]">Số tiền:</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#315F86]">{amountDisplay}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('amount', String(instructions.amount))}
                  aria-label="Sao chép số tiền"
                  className="p-1 rounded text-[#315F86] hover:bg-[#F8F3E8]"
                >
                  {copiedKey === 'amount' ? <Check size={14} className="text-[#5F7E67]" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#666A6D]">Nội dung:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[#2E3338]">{instructions.paymentReference}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('ref-manual', instructions.paymentReference)}
                  aria-label="Sao chép nội dung chuyển khoản"
                  className="p-1 rounded text-[#315F86] hover:bg-[#F8F3E8]"
                >
                  {copiedKey === 'ref-manual' ? <Check size={14} className="text-[#5F7E67]" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="qr-animate-target space-y-2 pt-2">
        <button
          type="button"
          disabled={reporting}
          onClick={handleReportPayment}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <span>{reporting ? 'Đang chuyển tiếp...' : 'Tôi đã chuyển khoản'}</span>
          <ArrowRight size={16} />
        </button>

        <button
          type="button"
          onClick={onPayLater}
          className="w-full h-11 inline-flex items-center justify-center rounded-xl border border-[#DDD6CC] bg-white text-xs sm:text-sm font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
        >
          <span>Tôi muốn thanh toán sau</span>
        </button>
      </div>
    </div>
  );
}
