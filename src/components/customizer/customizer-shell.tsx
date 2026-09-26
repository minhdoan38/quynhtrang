'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft } from 'lucide-react';
import {
  createInitialState,
  transitionState,
  getDesignSummary,
  getPreflight,
  type DesignState,
  type DesignAction,
  type ProductId,
} from '@/lib/product-state';
import {
  getRecentProjects,
  loadState,
  loadOrder,
  saveOrder,
  saveRecentProject,
  saveState,
  type RecentProject,
} from '@/lib/storage';
import { processImageUpload, revokeImageUrl } from '@/lib/upload';
import { DesignCanvas } from './design-canvas';
import { ProductLauncher } from './product-launcher';
import { ProductSetup } from './product-setup';
import { ProductChooser } from './product-chooser';
import { TemplateChooser } from './template-chooser';
import { TemplateBrowser } from './template-browser';
import { ProductControls } from './product-controls';
import { UploadControl } from './upload-control';
import { PreviewDialog } from './preview-dialog';
import { CheckoutSheet } from './checkout-sheet';
import { BottomNavigation } from './bottom-navigation';
import type { DemoOrder } from './confirmation-panel';

type View = 'launcher' | 'setup' | 'editor' | 'template-browser';
export function CustomizerShell() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>('launcher');

  const [templateReturnView, setTemplateReturnView] = useState<'setup' | 'editor'>('setup');
  const [state, setState] = useState<DesignState>(() => createInitialState('wrapping'));
  const [past, setPast] = useState<DesignState[]>([]);
  const [future, setFuture] = useState<DesignState[]>([]);
  const [order, setOrder] = useState<DemoOrder | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

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

  // Restore editor data after mount, but always open at the simple launcher.
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
    if (savedOrder) setOrder(savedOrder);
    setRecentProjects(getRecentProjects());
  }, []);

  useEffect(() => {
    if (mounted) saveState(state);
  }, [state, mounted]);

  useEffect(() => {
    if (mounted) saveOrder(order);
  }, [order, mounted]);

  useEffect(() => {
    if (mounted && view === 'editor') {
      saveRecentProject(state);
      setRecentProjects(getRecentProjects());
    }
  }, [state, mounted, view]);

  const dispatch = useCallback((action: DesignAction) => {
    setState((curr) => {
      const next = transitionState(curr, action);
      if (next === curr) return curr;
      setPast((prev) => [...prev, curr]);
      setFuture([]);
      return next;
    });
  }, []);

  const handleSelectProduct = useCallback((productId: ProductId) => {
    setState(createInitialState(productId));
    setPast([]);
    setFuture([]);
    setIsPreviewOpen(false);
    setIsCheckoutOpen(false);
    setView('setup');
  }, []);

  const handleResumeProject = useCallback((project: RecentProject) => {
    const base = createInitialState(project.productId);
    setState({
      ...base,
      ...project,
      quantity: 1,
      productOptions: { ...base.productOptions, ...project.productOptions },
    });
    setPast([]);
    setFuture([]);
    setView('editor');
  }, []);

  const handleBackToLauncher = useCallback(() => {
    saveRecentProject(state);
    setRecentProjects(getRecentProjects());
    setIsPreviewOpen(false);
    setIsCheckoutOpen(false);
    setView('launcher');
  }, [state]);

  const handleUndo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      setFuture((prevFuture) => [state, ...prevFuture]);
      setState(previous);
      return prevPast.slice(0, -1);
    });
  }, [state]);

  const handleRedo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      setPast((prevPast) => [...prevPast, state]);
      setState(next);
      return prevFuture.slice(1);
    });
  }, [state]);

  const handleResetDesign = useCallback(() => {
    if (state.image?.src) revokeImageUrl(state.image.src);
    dispatch({ type: 'SET_TEXT', value: '' });
    dispatch({ type: 'SET_IMAGE', value: null });
    showToast('Đã xóa nội dung chữ và ảnh.');
  }, [dispatch, state.image, showToast]);

  const handleUploadImage = useCallback(async (file: File) => {
    try {
      const imageState = await processImageUpload(file);
      if (state.image?.src) revokeImageUrl(state.image.src);
      dispatch({ type: 'SET_IMAGE', value: imageState });
      showToast('Tải ảnh lên thành công.');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Tải ảnh thất bại.');
    }
  }, [dispatch, state.image, showToast]);

  const handleRemoveImage = useCallback(() => {
    if (state.image?.src) revokeImageUrl(state.image.src);
    dispatch({ type: 'SET_IMAGE', value: null });
  }, [dispatch, state.image]);

  const handleSubmitOrder = useCallback((customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    note: string;
  }) => {
    const summary = getDesignSummary(state);
    setOrder({
      id: `demo-${Date.now()}`,
      status: 'pending',
      paymentStatus: 'unverified',
      customer,
      summary,
      createdAt: new Date().toISOString(),
    });
    showToast('Đã tạo đơn demo. Thanh toán chưa được xác nhận.');
  }, [state, showToast]);

  const handleStartOver = useCallback(() => {
    if (state.image?.src) revokeImageUrl(state.image.src);
    setState(createInitialState('wrapping'));
    setOrder(null);
    setPast([]);
    setFuture([]);
    setIsPreviewOpen(false);
    setIsCheckoutOpen(false);
    setView('launcher');
    setRecentProjects(getRecentProjects());
    showToast('Đã bắt đầu thiết kế mới.');
  }, [state.image, showToast]);

  useGSAP(() => {
    if (view !== 'editor') return;
    gsap.fromTo('#design-canvas', { scale: 0.95, autoAlpha: 0.85 }, {
      scale: 1,
      autoAlpha: 1,
      duration: 0.35,
      ease: 'power2.out',
    });
  }, { dependencies: [state.productId, view], scope: containerRef });

  const summary = getDesignSummary(state);
  const preflight = getPreflight(state);

  if (view === 'launcher') {
    return (
      <ProductLauncher
        recentProjects={recentProjects}
        onSelectProduct={handleSelectProduct}
        onResumeProject={handleResumeProject}
      />
    );
  }

  if (view === 'setup') {
    return (
      <ProductSetup
        productId={state.productId}
        variantId={state.variantId}
        onSelectVariant={(variantId) => {
          dispatch({ type: 'SET_VARIANT', value: variantId });
        }}
        onStartWithTemplate={() => {
          setTemplateReturnView('setup');
          setView('template-browser');
        }}
        onStartBlank={() => {
          dispatch({ type: 'SET_TEMPLATE', value: 'blank' });
          setView('editor');
          showToast('Bắt đầu thiết kế với trang trắng.');
        }}
        onBack={() => {
          setView('launcher');
        }}
      />
    );
  }

  if (view === 'template-browser') {
    return (
      <TemplateBrowser
        productId={state.productId}
        variantId={state.variantId}
        onBack={() => setView(templateReturnView)}
        onApplyTemplate={(tplId) => {
          dispatch({ type: 'SET_TEMPLATE', value: tplId });
          setView('editor');
          showToast('Đã áp dụng mẫu thiết kế.');
        }}
      />
    );
  }
  return (
    <div ref={containerRef} className="min-h-screen bg-[#F8F3E8] pb-24">
      {toastMessage && (
        <div id="toast" role="status" aria-live="polite" className="fixed top-4 right-4 z-50 rounded-lg bg-[#2E3338] px-4 py-2 text-xs font-semibold text-white shadow-lg">
          {toastMessage}
        </div>
      )}

      <header className="editor-header">
        <button type="button" className="editor-back" onClick={handleBackToLauncher}>
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Chọn sản phẩm khác</span>
        </button>
        <div className="editor-brand">quỳnh trang</div>
      </header>

      <main id="app" className="mx-auto max-w-4xl p-4 sm:p-6">
        <div id="editor-view" className="grid grid-cols-1 items-start gap-6 md:grid-cols-12">
          <div className="editor-panel md:col-span-6">
            <div className="flex min-h-[300px] w-full items-center justify-center py-6">
              <DesignCanvas
                productId={state.productId}
                text={state.text}
                color={state.color}
                backgroundColor={state.backgroundColor}
                image={state.image}
                productOptions={state.productOptions}
              />
            </div>
            <div className="w-full border-t border-[#ECE6DC] pt-3">
              <UploadControl image={state.image} onUpload={handleUploadImage} onRemove={handleRemoveImage} />
            </div>
          </div>

          <div className="editor-panel space-y-6 md:col-span-6">
            <ProductChooser
              productId={state.productId}
              variantId={state.variantId}
              onChangeSetup={() => setView('setup')}
            />
            <TemplateChooser
              templateId={state.templateId}
              onSelectTemplate={(key) => dispatch({ type: 'SET_TEMPLATE', value: key })}
              onOpenTemplateBrowser={() => {
                setTemplateReturnView('editor');
                setView('template-browser');
              }}
            />
            <ProductControls
              productId={state.productId}
              text={state.text}
              color={state.color}
              backgroundColor={state.backgroundColor}
              productOptions={state.productOptions}
              onSetText={(value) => dispatch({ type: 'SET_TEXT', value })}
              onSetColor={(value) => dispatch({ type: 'SET_COLOR', value })}
              onSetBackgroundColor={(value) => dispatch({ type: 'SET_BACKGROUND_COLOR', value })}
              onSetOption={(key, value) => dispatch({ type: 'SET_PRODUCT_OPTION', key, value })}
            />
          </div>
        </div>
      </main>

      <PreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        onProceedToCheckout={() => { setIsPreviewOpen(false); setIsCheckoutOpen(true); }}
        state={state}
        summary={summary}
        preflight={preflight}
      />
      <CheckoutSheet
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        quantity={state.quantity}
        onSetQuantity={(quantity) => dispatch({ type: 'SET_QUANTITY', value: quantity })}
        summary={summary}
        onSubmitOrder={handleSubmitOrder}
        order={order}
        onStartOver={handleStartOver}
      />
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

