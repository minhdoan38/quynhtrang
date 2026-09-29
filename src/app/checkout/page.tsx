'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import {
  type DesignState,
  createInitialState,
  normalizeQuantity,
} from '@/lib/product-state';
import { loadState, saveState } from '@/lib/storage';
import { OrderSummaryCard } from '@/components/checkout/order-summary-card';
import { QuantityStepper } from '@/components/checkout/quantity-stepper';
import { calculatePriceQuote } from '@/lib/pricing';
import type { CustomerInfo, PendingOrder } from '@/lib/order-types';
import { PaymentQrPanel } from '@/components/checkout/payment-qr-panel';
import { OrderConfirmationPanel } from '@/components/checkout/order-confirmation-panel';

export default function CheckoutPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [design, setDesign] = useState<DesignState>(() => createInitialState('wrapping'));
  const [isLoaded, setIsLoaded] = useState(false);

  // Wizard Step: 1 = Summary + Quantity, 2 = Customer Info, 3 = QR Payment / Confirmation
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [state36Mode, setState36Mode] = useState<'payment' | 'confirmation'>('payment');

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
    fullName: '',
    phone: '',
    shippingAddress: '',
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

  // Recover existing order from session storage if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedOrderId = sessionStorage.getItem('quynhtrang.pendingOrderId');
      if (savedOrderId) {
        fetch(`/api/orders/${savedOrderId}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.order) {
              setCreatedOrder(data.order);
            }
          })
          .catch(() => { });
      }
    }
  }, []);

  const priceQuote = calculatePriceQuote({
    productId: design.productId,
    variantId: design.variantId,
    quantity: design.quantity,
    productOptions: design.productOptions,
  });

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
    { dependencies: [step, state36Mode], scope: containerRef }
  );

  const handleUpdateQuantity = (newQty: number) => {
    const validQty = normalizeQuantity(newQty);
    const nextDesign = { ...design, quantity: validQty };
    setDesign(nextDesign);
    saveState(nextDesign);
    if (createdOrder) {
      setCreatedOrder(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('quynhtrang.pendingOrderId');
      }
    }
  };

  const handleBack = () => {
    if (step === 3 && state36Mode === 'confirmation') {
      setState36Mode('payment');
      return;
    }
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

    if (!customer.fullName.trim() || !customer.phone.trim() || !customer.shippingAddress.trim()) {
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
              fullName: customer.fullName.trim(),
              phone: customer.phone.trim(),
              shippingAddress: customer.shippingAddress.trim(),
            },
            idempotencyKey: createdOrder?.idempotencyKey || `idem-${Date.now()}`,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.order) {
          throw new Error(data.error || 'Tạo đơn hàng không thành công.');
        }

        setCreatedOrder(data.order);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('quynhtrang.pendingOrderId', data.order.id);
        }
        setState36Mode('payment');
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
          <span>{step === 1 ? 'Đơn hàng' : 'Quay lại'}</span>
        </button>

        <div className="text-center">
          <h1 className="font-serif text-sm sm:text-base font-bold text-[#2E3338]">
            {step === 1 ? '1. Tóm tắt đơn hàng' : step === 2 ? '2. Thông tin nhận hàng' : state36Mode === 'confirmation' ? 'Xác nhận đơn hàng' : '3. Hướng dẫn thanh toán'}
          </h1>
          <p className="text-[11px] text-[#666A6D]">
            {step === 3 && state36Mode === 'confirmation' ? 'Hoàn tất' : `Bước ${step} / 3`}
          </p>
        </div>

        <div className="w-16" aria-hidden="true" />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-lg mx-auto w-full p-4 sm:p-6 pb-28">
        {/* STEP 1: Order Summary + Quantity */}
        {step === 1 && (
          <div className="checkout-step-content space-y-5">
            <OrderSummaryCard
              design={design}
              onEditDesign={() =>
                router.push(
                  design.productId === 'wrapping'
                    ? '/products/wrapping-paper'
                    : `/products/${design.productId}`
                )
              }
            />

            <QuantityStepper quantity={design.quantity} onChange={handleUpdateQuantity} />

            <div className="rounded-2xl border border-[#DDD6CC] bg-[#F8F3E8]/60 p-4 space-y-2 text-xs">
              <div className="flex justify-between text-[#666A6D]">
                <span>Tạm tính ({design.quantity} bản):</span>
                <span className="font-semibold text-[#2E3338]">{priceQuote.formattedSubtotal}</span>
              </div>
              <div className="flex justify-between text-[#666A6D]">
                <span>Đơn giá:</span>
                <span className="font-semibold text-[#2E3338]">
                  {priceQuote.formattedUnitPrice} / sản phẩm
                </span>
              </div>
              <div className="flex justify-between text-[#666A6D]">
                <span>Phí vận chuyển:</span>
                <span className="font-semibold text-[#5F7E67]">
                  Tính theo địa chỉ giao ở bước tiếp theo
                </span>
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
                value={customer.fullName}
                onChange={(e) => setCustomer({ ...customer, fullName: e.target.value })}
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
                value={customer.shippingAddress}
                onChange={(e) => setCustomer({ ...customer, shippingAddress: e.target.value })}
                placeholder="Số nhà, ngõ/ngách, tên đường, phường/xã, quận/huyện, tỉnh/thành..."
                className="w-full p-3 rounded-xl border border-[#DDD6CC] bg-white text-sm text-[#2E3338] placeholder:text-[#666A6D] focus:border-[#315F86] focus:outline-none resize-none"
              />
            </div>

            <p className="text-[11px] text-[#666A6D]">
              Bằng việc bấm Tiếp tục, bản thiết kế sẽ được lưu an toàn lên hệ thống và chuyển sang thanh toán.
            </p>
          </form>
        )}

        {/* STEP 3: QR Payment Demo */}
        {step === 3 && createdOrder && (
          <div className="checkout-step-content space-y-5">
            {state36Mode === 'payment' ? (
              <PaymentQrPanel
                order={createdOrder}
                onPaymentReported={() => {
                  setCreatedOrder((prev) =>
                    prev
                      ? {
                        ...prev,
                        paymentStatus: 'payment_reported',
                        payment: {
                          ...prev.payment,
                          status: 'payment_reported',
                          customerReportedAt: new Date().toISOString(),
                        },
                      }
                      : null
                  );
                  setState36Mode('confirmation');
                }}
                onPayLater={() => {
                  setState36Mode('confirmation');
                }}
                onBackToCustomerInfo={() => setStep(2)}
              />
            ) : (
              <OrderConfirmationPanel
                order={createdOrder}
                onReopenPayment={() => setState36Mode('payment')}
                onNewDesign={() => router.push('/')}
              />
            )}
          </div>
        )}
      </main>

      {/* Fixed Bottom Action Bar (Only Steps 1 & 2) */}
      {step !== 3 && (
        <footer className="fixed bottom-0 inset-x-0 border-t border-[#DDD6CC] bg-[#FFFDF8]/95 backdrop-blur-md p-4 z-40">
          <div className="max-w-lg mx-auto w-full flex items-center gap-3">
            {step === 1 && (
              <div className="w-full flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[11px] text-[#666A6D]">Tạm tính:</span>
                  <span className="text-base font-bold text-[#315F86]">{priceQuote.formattedSubtotal}</span>
                </div>
                <button
                  type="button"
                  onClick={() => advanceToStep(2)}
                  className="h-11 px-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98]"
                >
                  <span>Tiếp tục</span>
                  <ArrowRight size={16} />
                </button>
              </div>
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
          </div>
        </footer>
      )}
    </div>
  );
}
