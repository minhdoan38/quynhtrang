'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  createInitialState,
  transitionState,
  getDesignSummary,
  getPreflight,
  type DesignState,
  type DesignAction,
  type ProductId,
} from '@/lib/product-state';
import { saveState, loadState, saveOrder, loadOrder } from '@/lib/storage';
import { processImageUpload, revokeImageUrl } from '@/lib/upload';
import { DesignCanvas } from './design-canvas';
import { ProductChooser } from './product-chooser';
import { TemplateChooser } from './template-chooser';
import { ProductControls } from './product-controls';
import { UploadControl } from './upload-control';
import { PreviewDialog } from './preview-dialog';
import { CheckoutSheet } from './checkout-sheet';
import { BottomNavigation } from './bottom-navigation';
import type { DemoOrder } from './confirmation-panel';

export function CustomizerShell() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const [state, setState] = useState<DesignState>(() => createInitialState('wrapping'));
  const [past, setPast] = useState<DesignState[]>([]);
  const [future, setFuture] = useState<DesignState[]>([]);
  const [order, setOrder] = useState<DemoOrder | null>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Restore state safely after client mount to prevent SSR hydration mismatch
  useEffect(() => {
    setMounted(true);
    const saved = loadState();
    if (saved && saved.productId) {
      const base = createInitialState(saved.productId);
      setState({
        ...base,
        ...saved,
        productId: saved.productId,
        productOptions: { ...base.productOptions, ...(saved.productOptions || {}) },
      } as DesignState);
    }
    const savedOrder = loadOrder();
    if (savedOrder) {
      setOrder(savedOrder);
    }
  }, []);

  // Sync state to storage
  useEffect(() => {
    if (mounted) {
      saveState(state);
    }
  }, [state, mounted]);

  // Sync order to storage
  useEffect(() => {
    if (mounted) {
      saveOrder(order);
    }
  }, [order, mounted]);

  const dispatch = useCallback((action: DesignAction) => {
    setState((curr) => {
      const next = transitionState(curr, action);
      if (next === curr) return curr;
      setPast((prev) => [...prev, curr]);
      setFuture([]);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      const newPast = prevPast.slice(0, -1);
      setFuture((prevFuture) => [state, ...prevFuture]);
      setState(previous);
      return newPast;
    });
  }, [state]);

  const handleRedo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      const newFuture = prevFuture.slice(1);
      setPast((prevPast) => [...prevPast, state]);
      setState(next);
      return newFuture;
    });
  }, [state]);

  const handleResetDesign = useCallback(() => {
    if (state.image?.src) {
      revokeImageUrl(state.image.src);
    }
    dispatch({ type: 'SET_TEXT', value: '' });
    dispatch({ type: 'SET_IMAGE', value: null });
    showToast('Đã xóa nội dung chữ và ảnh.');
  }, [dispatch, state.image, showToast]);

  const handleUploadImage = useCallback(
    async (file: File) => {
      try {
        const imageState = await processImageUpload(file);
        if (state.image?.src) {
          revokeImageUrl(state.image.src);
        }
        dispatch({ type: 'SET_IMAGE', value: imageState });
        showToast('Tải ảnh lên thành công.');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Tải ảnh thất bại.';
        showToast(message);
      }
    },
    [dispatch, state.image, showToast]
  );

  const handleRemoveImage = useCallback(() => {
    if (state.image?.src) {
      revokeImageUrl(state.image.src);
    }
    dispatch({ type: 'SET_IMAGE', value: null });
  }, [dispatch, state.image]);

  const handleSubmitOrder = useCallback(
    (customer: {
      name: string;
      email: string;
      phone: string;
      address: string;
      note: string;
    }) => {
      const summary = getDesignSummary(state);
      const newOrder: DemoOrder = {
        id: `demo-${Date.now()}`,
        status: 'pending',
        paymentStatus: 'unverified',
        customer,
        summary,
        createdAt: new Date().toISOString(),
      };
      setOrder(newOrder);
      showToast('Đã tạo đơn demo. Thanh toán chưa được xác nhận.');
    },
    [state, showToast]
  );

  const handleStartOver = useCallback(() => {
    if (state.image?.src) {
      revokeImageUrl(state.image.src);
    }
    setState(createInitialState('wrapping'));
    setOrder(null);
    setPast([]);
    setFuture([]);
    setIsPreviewOpen(false);
    setIsCheckoutOpen(false);
    showToast('Đã bắt đầu thiết kế mới.');
  }, [state.image, showToast]);

  // GSAP animation for product canvas transitions
  useGSAP(
    () => {
      gsap.fromTo(
        '#design-canvas',
        { scale: 0.95, opacity: 0.85 },
        { scale: 1, opacity: 1, duration: 0.35, ease: 'power2.out' }
      );
    },
    { dependencies: [state.productId], scope: containerRef }
  );

  const summary = getDesignSummary(state);
  const preflight = getPreflight(state);

  return (
    <div ref={containerRef} className="min-h-screen bg-stone-50/60 dark:bg-stone-950 pb-24">
      {/* Toast Feedback */}
      {toastMessage && (
        <div
          id="toast"
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 px-4 py-2 rounded-lg shadow-lg text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {toastMessage}
        </div>
      )}

      {/* App Header */}
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight">
              Tự thiết kế sản phẩm in
            </h1>
            <p className="text-xs text-muted-foreground">
              Tùy biến nhanh, xem trước trực quan và đặt in demo
            </p>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="app" className="max-w-4xl mx-auto p-4 sm:p-6">
        <div id="editor-view" className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Canvas Section */}
          <div className="md:col-span-6 flex flex-col items-center gap-4 bg-background p-6 rounded-2xl border shadow-xs">
            <div className="w-full flex justify-center py-6 min-h-[300px] items-center">
              <DesignCanvas
                productId={state.productId}
                text={state.text}
                color={state.color}
                backgroundColor={state.backgroundColor}
                image={state.image}
                productOptions={state.productOptions}
              />
            </div>

            <div className="w-full pt-3 border-t flex flex-col gap-2">
              <UploadControl
                image={state.image}
                onUpload={handleUploadImage}
                onRemove={handleRemoveImage}
              />
            </div>
          </div>

          {/* Controls Section */}
          <div className="md:col-span-6 space-y-6 bg-background p-6 rounded-2xl border shadow-xs">
            <ProductChooser
              productId={state.productId}
              variantId={state.variantId}
              onSelectProduct={(id: ProductId) => dispatch({ type: 'SET_PRODUCT', value: id })}
              onSelectVariant={(val: string) => dispatch({ type: 'SET_VARIANT', value: val })}
            />

            <TemplateChooser
              templateId={state.templateId}
              onSelectTemplate={(key: string) => dispatch({ type: 'SET_TEMPLATE', value: key })}
            />

            <ProductControls
              productId={state.productId}
              text={state.text}
              color={state.color}
              backgroundColor={state.backgroundColor}
              productOptions={state.productOptions}
              onSetText={(val: string) => dispatch({ type: 'SET_TEXT', value: val })}
              onSetColor={(val: string) => dispatch({ type: 'SET_COLOR', value: val })}
              onSetBackgroundColor={(val: string) =>
                dispatch({ type: 'SET_BACKGROUND_COLOR', value: val })
              }
              onSetOption={(key: string, val: unknown) =>
                dispatch({ type: 'SET_PRODUCT_OPTION', key, value: val })
              }
            />
          </div>
        </div>
      </main>

      {/* Preview Dialog */}
      <PreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        onProceedToCheckout={() => {
          setIsPreviewOpen(false);
          setIsCheckoutOpen(true);
        }}
        state={state}
        summary={summary}
        preflight={preflight}
      />

      {/* Checkout Sheet / Dialog */}
      <CheckoutSheet
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        quantity={state.quantity}
        onSetQuantity={(qty: number) => dispatch({ type: 'SET_QUANTITY', value: qty })}
        summary={summary}
        onSubmitOrder={handleSubmitOrder}
        order={order}
        onStartOver={handleStartOver}
      />

      {/* Sticky Bottom Navigation */}
      <BottomNavigation
        onOpenPreview={() => setIsPreviewOpen(true)}
        onResetDesign={handleResetDesign}
        priceLabel={summary.priceLabel}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
    </div>
  );
}
