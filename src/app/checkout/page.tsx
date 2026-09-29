'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-react';
import {
  type DesignState,
  createInitialState,
  normalizeQuantity,
} from '@/lib/product-state';
import { loadState, saveState } from '@/lib/storage';
import { OrderSummaryCard } from '@/components/checkout/order-summary-card';
import { getFriendlyProductName } from '@/components/checkout/order-summary-card';
import { QuantityStepper } from '@/components/checkout/quantity-stepper';
import { CustomerInformationForm } from '@/components/checkout/customer-information-form';
import { calculatePriceQuote } from '@/lib/pricing';
import type { CustomerInfo, PendingOrder } from '@/lib/order-types';
import {
  createCheckoutDraft,
  loadCheckoutDraft,
  saveCheckoutDraft,
} from '@/lib/checkout-draft';
import { validateCustomerInfo } from '@/lib/customer-info';
import { PaymentQrPanel } from '@/components/checkout/payment-qr-panel';
import { OrderConfirmationPanel } from '@/components/checkout/order-confirmation-panel';
export const CHECKOUT_COPY = {
  preparing: 'Đang chuẩn bị đơn hàng...',
  unable: 'Chưa thể chuẩn bị đơn hàng.',
  checkConnection: 'Kiểm tra kết nối và thử lại.',
  retry: 'Thử lại',
} as const;

const COPY_PREPARING_ORDER = CHECKOUT_COPY.preparing;
const COPY_UNABLE_TO_PREPARE = CHECKOUT_COPY.unable;
const COPY_CHECK_CONNECTION = CHECKOUT_COPY.checkConnection;
function isSameCheckoutDesign(a?: Partial<DesignState>, b?: Partial<DesignState>): boolean {
  if (!a || !b) return false;
  if (a.productId !== b.productId) return false;
  if (a.variantId !== b.variantId) return false;
  if (a.text !== b.text || a.color !== b.color || a.backgroundColor !== b.backgroundColor) return false;
  if (a.image?.src !== b.image?.src) return false;
  if (!(JSON.stringify(a.productOptions || {}) === JSON.stringify(b.productOptions || {}))) return false;
  return JSON.stringify(a.elements || []) === JSON.stringify(b.elements || []);
}

export default function CheckoutPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [design, setDesign] = useState<DesignState>(() => createInitialState('wrapping'));
  const [isLoaded, setIsLoaded] = useState(false);

  // Wizard Step: 1 = Summary + Quantity, 2 = Customer Info, 3 = QR Payment / Confirmation
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [state36Mode, setState36Mode] = useState<'payment' | 'confirmation'>('payment');
  const [staleRevisionWarning, setStaleRevisionWarning] = useState(false);

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

  // Load design and draft from storage on mount
  useEffect(() => {
    const saved = loadState();
    let nextDesign = createInitialState('wrapping');
    if (saved && saved.productId) {
      const base = createInitialState(saved.productId);
      nextDesign = {
        ...base,
        ...saved,
        productId: saved.productId,
        productOptions: { ...base.productOptions, ...(saved.productOptions || {}) },
      } as DesignState;
      setDesign(nextDesign);
    }

    const existingDraft = loadCheckoutDraft();
    if (existingDraft) {
      if (existingDraft.customer) {
        setCustomer(existingDraft.customer);
      }
      if (existingDraft.design && !isSameCheckoutDesign(existingDraft.design, nextDesign)) {
        setStaleRevisionWarning(true);
      }
    } else {
      saveCheckoutDraft(createCheckoutDraft(nextDesign));
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
              setStep(3);
              if (data.order.paymentStatus === 'payment_reported' || data.order.paymentStatus === 'paid') {
                setState36Mode('confirmation');
              } else {
                setState36Mode('payment');
              }
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

  const handleCustomerChange = (nextValues: CustomerInfo) => {
    setCustomer(nextValues);
    setFormError(null);
    const currentDraft = loadCheckoutDraft();
    if (currentDraft) {
      saveCheckoutDraft({
        ...currentDraft,
        customer: nextValues,
        updatedAt: new Date().toISOString(),
      });
    } else {
      saveCheckoutDraft(createCheckoutDraft(design, nextValues));
    }
  };

  const handleUpdateQuantity = (newQty: number) => {
    const validQty = normalizeQuantity(newQty);
    const quantityChanged = validQty !== design.quantity;
    const nextDesign = { ...design, quantity: validQty };
    setDesign(nextDesign);
    saveState(nextDesign);
    const currentDraft = loadCheckoutDraft();
    if (currentDraft) {
      const shouldRenewOrder = quantityChanged || Boolean(currentDraft.orderId) || Boolean(createdOrder);
      saveCheckoutDraft({
        ...currentDraft,
        quantity: validQty,
        idempotencyKey: shouldRenewOrder ? `checkout-${crypto.randomUUID()}` : currentDraft.idempotencyKey,
        orderId: shouldRenewOrder ? undefined : currentDraft.orderId,
        design: { ...currentDraft.design, quantity: validQty },
        updatedAt: new Date().toISOString(),
      });
      if (shouldRenewOrder) {
        setCreatedOrder(null);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('quynhtrang.pendingOrderId');
        }
      }
    } else if (createdOrder) {
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
    if (e && typeof e === 'object' && 'preventDefault' in e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setFormError(null);

    if (staleRevisionWarning) {
      setFormError('Thiết kế đã thay đổi kể từ lần kiểm tra trước. Vui lòng kiểm tra lại thiết kế.');
      return;
    }

    const validation = validateCustomerInfo(customer);
    if (!validation.isValid) {
      setFormError(COPY_UNABLE_TO_PREPARE);
      return;
    }

    const normalizedCustomer = validation.normalized;
    setCustomer(normalizedCustomer);

    startTransition(async () => {
      try {
        let draft = loadCheckoutDraft();
        if (!draft) {
          draft = createCheckoutDraft(design, normalizedCustomer);
          saveCheckoutDraft(draft);
        }

        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            design,
            customer: normalizedCustomer,
            idempotencyKey: draft.idempotencyKey,
            preflightRevision: draft.preflightRevision ?? 'rev-0',
            preflightAcknowledged: draft.preflightAcknowledged ?? true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.order) {
          throw new Error(data.error || COPY_UNABLE_TO_PREPARE);
        }

        setCreatedOrder(data.order);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('quynhtrang.pendingOrderId', data.order.id);
        }
        saveCheckoutDraft({
          ...draft,
          customer: normalizedCustomer,
          orderId: data.order.id,
          status: 'ready-for-payment',
          updatedAt: new Date().toISOString(),
        });
        setState36Mode('payment');
        advanceToStep(3);
      } catch (err) {
        setFormError(`${COPY_UNABLE_TO_PREPARE} ${COPY_CHECK_CONNECTION}`);
      }
    });
  };

  const handleRetryCustomerInfo = () => {
    if (!isPending) {
      void handleSubmitCustomerInfo({ preventDefault: () => { } } as React.FormEvent);
    }
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
            {step === 1 ? '1. Tóm tắt đơn hàng' : step === 2 ? 'Thông tin nhận hàng' /* step === 2 ? '2. Thông tin nhận hàng' */ : state36Mode === 'confirmation' ? 'Xác nhận đơn hàng' : '3. Hướng dẫn thanh toán'}
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
          <div className="checkout-step-content space-y-4">
            {/* Compatibility anchors: id="customer-name" id="customer-phone" id="customer-address" id="customer-note" */}
            {staleRevisionWarning && (
              <div className="rounded-xl border border-[#A86E22]/40 bg-[#FFFDF8] p-3 text-xs text-[#A86E22] flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="shrink-0 text-[#A86E22]" />
                  <span>Thiết kế đã thay đổi kể từ lần kiểm tra trước.</span>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/?view=editor&mode=preflight')}
                  className="px-3 py-1.5 rounded-lg bg-[#A86E22] text-white text-xs font-semibold hover:bg-[#8B5919] transition-colors shrink-0"
                >
                  Kiểm tra lại thiết kế
                </button>
              </div>
            )}

            <CustomerInformationForm
              initialValues={customer}
              isSubmitting={isPending}
              submitError={formError}
              onRetry={handleRetryCustomerInfo}
              onChange={handleCustomerChange}
              onSubmit={(submittedValues) => {
                setCustomer(submittedValues);
                void handleSubmitCustomerInfo({ preventDefault: () => { } } as React.FormEvent);
              }}
              summary={{
                product: getFriendlyProductName(design),
                quantity: design.quantity,
                subtotal: priceQuote.formattedSubtotal,
              }}
            />
          </div>
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
                type="submit"
                form="customer-info-form"
                disabled={isPending}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <span>{isPending ? COPY_PREPARING_ORDER : 'Tiếp tục'}</span>
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
