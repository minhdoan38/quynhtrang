'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, ArrowRight, Minus, Plus, QrCode, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  type DesignState,
  createInitialState,
  getDesignSummary,
  normalizeQuantity,
} from '@/lib/product-state';
import { loadState, saveState } from '@/lib/storage';
import { DesignCanvas } from '@/components/customizer/design-canvas';
import type { CustomerInfo, PendingOrder } from '@/lib/order-types';

export default function CheckoutPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [design, setDesign] = useState<DesignState>(() => createInitialState('wrapping'));
  const [isLoaded, setIsLoaded] = useState(false);

  // Wizard Step: 1 = Summary + Quantity, 2 = Customer Info, 3 = QR Payment Demo
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step-aware browser Back synchronization
  useEffect(() => {
    const onPopState = () => {
      setStep((curr) => {
        if (curr === 3) return 2;
        if (curr === 2) return 1;
        router.push('/?view=editor');
        return 1;
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [router]);
  // Form info
  const [customer, setCustomer] = useState<CustomerInfo>({
    name: '',
    phone: '',
    address: '',
    note: '',
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [createdOrder, setCreatedOrder] = useState<PendingOrder | null>(null);

  // Load design from storage on mount
  useEffect(() => {
    const saved = loadState();
    if (saved && saved.productId) {
      const base = createInitialState(saved.productId);
      setDesign({
        ...base,
        ...saved,
        productId: saved.productId,
        productOptions: { ...base.productOptions, ...(saved.productOptions || {}) },
      } as DesignState);
    }
    setIsLoaded(true);
  }, []);

  const summary = getDesignSummary(design);

  // Motion transitions between wizard steps
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
            gsap.set('.checkout-step-content', { opacity: 1, x: 0 });
            return;
          }

          gsap.fromTo(
            '.checkout-step-content',
            { opacity: 0, x: 12 },
            {
              opacity: 1,
              x: 0,
              duration: 0.3,
              ease: 'power2.out',
              clearProps: 'transform',
            }
          );
        }
      );
      return () => mm.revert();
    },
    { dependencies: [step], scope: containerRef }
  );

  const handleUpdateQuantity = (newQty: number) => {
    const validQty = normalizeQuantity(newQty);
    const nextDesign = { ...design, quantity: validQty };
    setDesign(nextDesign);
    saveState(nextDesign);
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(1);
      return;
    }
    // Step 1: back to Editor
    router.push('/?view=editor');
  };

  const advanceToStep = (nextStep: 2 | 3) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ checkoutStep: nextStep }, '');
    }
    setStep(nextStep);
  };

  const handleSubmitCustomerInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customer.name.trim() || !customer.phone.trim() || !customer.address.trim()) {
      setFormError('Vui lòng điền đầy đủ họ tên, số điện thoại và địa chỉ nhận hàng.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            design,
            customer: {
              name: customer.name.trim(),
              phone: customer.phone.trim(),
              address: customer.address.trim(),
              note: customer.note?.trim() || '',
            },
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.order) {
          throw new Error(data.error || 'Tạo đơn hàng không thành công.');
        }

        setCreatedOrder(data.order);
        advanceToStep(3); // Advance to QR Payment Demo
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi tạo đơn hàng.');
      }
    });
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center text-xs font-semibold text-[#666A6D]">
        Đang chuẩn bị trang đặt in...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#FFFDF8] text-[#2E3338] flex flex-col font-sans"
    >
      {/* Top Header */}
      <header className="h-[52px] border-b border-[#DDD6CC] bg-[#FFFDF8]/90 px-4 flex items-center justify-between backdrop-blur-sm sticky top-0 z-30">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs sm:text-sm font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{step === 1 ? 'Chỉnh sửa' : 'Quay lại'}</span>
        </button>

        <div className="text-center">
          <h1 className="font-serif text-sm sm:text-base font-bold text-[#2E3338]">
            {step === 1 && '1. Tóm tắt đơn hàng'}
            {step === 2 && '2. Thông tin nhận hàng'}
            {step === 3 && '3. Hướng dẫn thanh toán'}
          </h1>
          <p className="text-[11px] text-[#666A6D]">Bước {step} / 3</p>
        </div>

        <div className="w-16" aria-hidden="true" />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-lg mx-auto w-full p-4 sm:p-6 pb-28">
        {/* STEP 1: Order Summary + Quantity */}
        {step === 1 && (
          <div className="checkout-step-content space-y-5">
            {/* Design Preview Thumbnail Card */}
            <div className="rounded-2xl border border-[#DDD6CC] bg-white p-4 shadow-xs flex gap-4 items-center">
              <div className="w-24 h-24 rounded-xl bg-[#F8F3E8] border border-[#ECE6DC] overflow-hidden flex items-center justify-center shrink-0">
                <div className="scale-[0.4] transform origin-center">
                  <DesignCanvas
                    productId={design.productId}
                    text={design.text}
                    color={design.color}
                    backgroundColor={design.backgroundColor}
                    image={design.image}
                    productOptions={design.productOptions}
                  />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <span className="inline-block rounded-full bg-[#DCEBF4] px-2.5 py-0.5 text-[10px] font-semibold text-[#315F86]">
                  {summary.product}
                </span>
                <h2 className="mt-1 text-sm font-bold text-[#2E3338] truncate">
                  {summary.variant}
                </h2>
                <p className="mt-1 text-xs text-[#666A6D]">
                  Đơn giá: {new Intl.NumberFormat('vi-VN').format(summary.unitPrice)} ₫
                </p>
              </div>
            </div>

            {/* Quantity Selector */}
            <div className="rounded-2xl border border-[#DDD6CC] bg-[#FFFDF8] p-4 space-y-2">
              <label htmlFor="quantity-input" className="text-xs font-semibold text-[#2E3338]">
                Số lượng đặt in (1 - 999 bản):
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleUpdateQuantity(design.quantity - 1)}
                  disabled={design.quantity <= 1}
                  className="w-10 h-10 rounded-xl border border-[#DDD6CC] bg-white flex items-center justify-center text-[#2E3338] disabled:opacity-30 disabled:pointer-events-none hover:bg-[#F8F3E8] transition-colors"
                >
                  <Minus size={16} />
                </button>

                <input
                  id="quantity-input"
                  type="number"
                  min={1}
                  max={999}
                  value={design.quantity}
                  onChange={(e) => handleUpdateQuantity(Number.parseInt(e.target.value, 10))}
                  className="w-24 h-10 rounded-xl border border-[#DDD6CC] bg-white text-center text-sm font-bold text-[#2E3338] focus:border-[#315F86] focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() => handleUpdateQuantity(design.quantity + 1)}
                  disabled={design.quantity >= 999}
                  className="w-10 h-10 rounded-xl border border-[#DDD6CC] bg-white flex items-center justify-center text-[#2E3338] disabled:opacity-30 disabled:pointer-events-none hover:bg-[#F8F3E8] transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Pricing Summary */}
            <div className="rounded-2xl border border-[#DDD6CC] bg-[#F8F3E8]/60 p-4 space-y-2 text-xs">
              <div className="flex justify-between text-[#666A6D]">
                <span>Tạm tính ({design.quantity} bản):</span>
                <span className="font-semibold text-[#2E3338]">{summary.priceLabel}</span>
              </div>
              <div className="flex justify-between text-[#666A6D]">
                <span>Phí vận chuyển:</span>
                <span className="font-semibold text-[#5F7E67]">Tính theo địa chỉ giao</span>
              </div>
              <div className="border-t border-[#DDD6CC] pt-2 flex justify-between text-sm font-bold text-[#2E3338]">
                <span>Tổng ước tính:</span>
                <span className="text-[#315F86]">{summary.priceLabel}</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Customer Information Form */}
        {step === 2 && (
          <form onSubmit={handleSubmitCustomerInfo} className="checkout-step-content space-y-4">
            {formError && (
              <div className="rounded-xl border border-[#B3535D]/30 bg-[#F6DADD] p-3 text-xs text-[#B3535D] flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="customer-name" className="text-xs font-semibold text-[#2E3338]">
                Họ và tên người nhận <span className="text-[#B3535D]">*</span>
              </label>
              <input
                id="customer-name"
                type="text"
                autoComplete="name"
                required
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                placeholder="Ví dụ: Nguyễn Quỳnh Trang"
                className="w-full h-11 px-3.5 rounded-xl border border-[#DDD6CC] bg-white text-sm text-[#2E3338] placeholder:text-[#666A6D] focus:border-[#315F86] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="customer-phone" className="text-xs font-semibold text-[#2E3338]">
                Số điện thoại liên hệ <span className="text-[#B3535D]">*</span>
              </label>
              <input
                id="customer-phone"
                type="tel"
                autoComplete="tel"
                required
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                placeholder="09xxxxxxxx"
                className="w-full h-11 px-3.5 rounded-xl border border-[#DDD6CC] bg-white text-sm text-[#2E3338] placeholder:text-[#666A6D] focus:border-[#315F86] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="customer-address" className="text-xs font-semibold text-[#2E3338]">
                Địa chỉ nhận hàng <span className="text-[#B3535D]">*</span>
              </label>
              <textarea
                id="customer-address"
                autoComplete="street-address"
                required
                rows={3}
                value={customer.address}
                onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                placeholder="Số nhà, ngõ/ngách, tên đường, phường/xã, quận/huyện, tỉnh/thành..."
                className="w-full p-3 rounded-xl border border-[#DDD6CC] bg-white text-sm text-[#2E3338] placeholder:text-[#666A6D] focus:border-[#315F86] focus:outline-none resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="customer-note" className="text-xs font-semibold text-[#2E3338]">
                Ghi chú thêm (không bắt buộc)
              </label>
              <input
                id="customer-note"
                type="text"
                value={customer.note}
                onChange={(e) => setCustomer({ ...customer, note: e.target.value })}
                placeholder="Ví dụ: Giao giờ hành chính, đóng gói cẩn thận..."
                className="w-full h-11 px-3.5 rounded-xl border border-[#DDD6CC] bg-white text-sm text-[#2E3338] placeholder:text-[#666A6D] focus:border-[#315F86] focus:outline-none"
              />
            </div>

            <p className="text-[11px] text-[#666A6D]">
              Bằng việc bấm Tiếp tục, bản thiết kế sẽ được lưu an toàn lên hệ thống và chuyển sang thanh toán.
            </p>
          </form>
        )}

        {/* STEP 3: QR Payment Demo */}
        {step === 3 && createdOrder && (
          <div className="checkout-step-content space-y-5 text-center">
            <div className="rounded-2xl border border-[#DDD6CC] bg-white p-6 shadow-sm space-y-4">
              <div className="inline-flex p-3 rounded-full bg-[#F8F3E8] text-[#315F86]">
                <QrCode size={40} />
              </div>

              <div>
                <h2 className="font-serif text-lg font-bold text-[#2E3338]">
                  Quét mã để thanh toán
                </h2>
                <p className="text-xs text-[#666A6D] mt-1">
                  Mã đơn hàng: <strong className="text-[#315F86]">#{createdOrder.id}</strong>
                </p>
                <p className="text-base font-bold text-[#2E3338] mt-1">
                  Số tiền: {createdOrder.snapshot.summary.priceLabel}
                </p>
              </div>

              {/* QR Image Simulation */}
              <div className="w-48 h-48 mx-auto rounded-xl border border-[#DDD6CC] bg-[#FFFDF8] p-3 flex flex-col items-center justify-center">
                <div className="w-full h-full border-2 border-dashed border-[#315F86]/30 rounded-lg flex flex-col items-center justify-center p-2 text-center">
                  <QrCode size={64} className="text-[#315F86] mb-2" />
                  <span className="text-[10px] font-semibold text-[#666A6D]">
                    DEMO QR PAYMENT
                  </span>
                  <span className="text-[9px] text-[#666A6D]">#{createdOrder.id}</span>
                </div>
              </div>

              {/* Status Badge: Waiting confirmation */}
              <div className="rounded-xl border border-[#F2DFA0] bg-[#FFFDF8] p-3 text-xs text-[#A86E22] flex items-center justify-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>
                  Trạng thái: <strong>Chờ xác nhận</strong> (Sau khi chuyển khoản, cửa hàng sẽ đối soát duyệt đơn).
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom Action Bar */}
      <footer className="fixed bottom-0 inset-x-0 border-t border-[#DDD6CC] bg-[#FFFDF8]/95 backdrop-blur-md p-4 z-40">
        <div className="max-w-lg mx-auto w-full flex items-center gap-3">
          {step === 1 && (
            <button
              type="button"
              onClick={() => advanceToStep(2)}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98]"
            >
              <span>Tiếp tục: Điền thông tin</span>
              <ArrowRight size={16} />
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmitCustomerInfo}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <span>{isPending ? 'Đang lưu đơn hàng...' : 'Tiếp tục: Quét mã thanh toán'}</span>
              <ArrowRight size={16} />
            </button>
          )}

          {step === 3 && createdOrder && (
            <button
              type="button"
              onClick={() => router.replace(`/order/${createdOrder.id}`)}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98]"
            >
              <CheckCircle2 size={16} />
              <span>Xem xác nhận đơn hàng</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
