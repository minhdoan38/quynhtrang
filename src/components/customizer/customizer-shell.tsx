'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  createInitialState,
  transitionState,
  getDefaultElements,
  getDesignSummary,
  getPreflight,
  TEMPLATES,
  PRODUCTS,
  migrateLegacyText,
  getTextData,
  type DesignState,
  type DesignAction,
  type ProductId,
  type CanvasElement,
  type TextPreset,
} from '@/lib/product-state';
import {
  getRecentProjects,
  loadState,
  saveRecentProject,
  saveState,
  flushAutosave,
  type RecentProject,
} from '@/lib/storage';
import { processImageUpload, revokeImageUrl } from '@/lib/upload';
import {
  resetToFit,
  canOneFingerPan,
  applyPan,
  applyPinchZoom,
  type ViewportState,
} from '@/lib/canvas-viewport';
import { TAP_THRESHOLD_PX } from '@/lib/canvas-interaction';
import { DesignCanvas, type TransformState } from './design-canvas';
import { ProductLauncher } from './product-launcher';
import { ProductSetup } from './product-setup';
import { TemplateBrowser } from './template-browser';
import { EditorPreviewMode } from './editor-preview-mode';
import { EditorPreflightMode } from './editor-preflight-mode';
import { EmptyEditorState } from './empty-editor-state';
import { BottomNavigation, type SelectedTarget } from './bottom-navigation';
import { EditorSheets, type ActiveSheetType } from './editor-sheets';
import type { ImageSourceType, TextStylePreset, ShapePrimitiveType } from '@/lib/add-content';
import { useColorEditor } from './use-color-editor';
import type { ColorTarget, HexColor } from '@/lib/color/color-types';
import { resolveEditorBackAction, type SaveStatus } from '@/lib/navigation';
import {
  startTextEdit,
  updateComposition,
  type ActiveTextEditState,
} from '@/lib/text-edit-session';
import { TextEditOverlay } from './text-edit-overlay';
import { useRouter } from 'next/navigation';
type View = 'launcher' | 'setup' | 'editor' | 'template-browser';
type EditorOverlayMode = 'preview' | 'preflight' | null;
type FocusMode = 'text-edit' | 'crop' | 'remove-bg' | 'mask' | null;

export type TextEditState = ActiveTextEditState | null;
export function CustomizerShell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);

  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>('launcher');
  const [viewport, setViewport] = useState<ViewportState>(resetToFit);

  const [templateReturnView, setTemplateReturnView] = useState<'setup' | 'editor'>('setup');
  const [state, setState] = useState<DesignState>(() => createInitialState('wrapping'));
  const [past, setPast] = useState<DesignState[]>([]);
  const [future, setFuture] = useState<DesignState[]>([]);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  // Redesigned Shell State Model
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [textEditState, setTextEditState] = useState<TextEditState>(null);
  const pendingExitOnCompositionEndRef = useRef(false);
  const preEditViewportRef = useRef<ViewportState | null>(null);
  const [activeSheet, setActiveSheet] = useState<ActiveSheetType>(null);
  const [focusMode, setFocusMode] = useState<FocusMode>(null);
  // Overlay Mode: Preview and Preflight full-screen within Editor
  // Autosave and unsaved warning states
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [hasUnsavedWarning, setHasUnsavedWarning] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fontSessionBaseStateRef = useRef<DesignState | null>(null);
  const opacitySessionBaseStateRef = useRef<DesignState | null>(null);
  const [projectRecents, setProjectRecents] = useState<string[]>([]);

  const activeColorTarget = React.useMemo<ColorTarget | null>(() => {
    if (selectedTarget === 'text') {
      const elements = state.elements ?? getDefaultElements(state);
      const targetId = selectedTextId || elements.find((e) => e.type === 'text')?.id || 'text-1';
      return { kind: 'element', elementId: targetId, property: 'fill' };
    }
    return { kind: 'surface', surfaceId: 'front', property: 'background' };
  }, [selectedTarget, selectedTextId, state]);

  const {
    currentColor: activeColorValue,
    updateColorLive,
    closeSession: closeColorSession,
    designColors,
    recentColors,
    isGradientSupported,
  } = useColorEditor({
    target: activeColorTarget,
    state,
    onUpdateState: (newState) => setState(newState),
    onCommitUndo: (baseState) => {
      setPast((prev) => [...prev, baseState]);
      setFuture([]);
    },
    projectRecents,
    onAddProjectRecent: (hex) => {
      setProjectRecents((prev) => [hex, ...prev.filter((c) => c !== hex)].slice(0, 8));
    },
  });
  const handleCloseSheet = useCallback(() => {
    if (activeSheet === 'color') {
      closeColorSession();
    }
    if (activeSheet === 'font' && fontSessionBaseStateRef.current) {
      const base = fontSessionBaseStateRef.current;
      fontSessionBaseStateRef.current = null;
      if (state.productOptions.fontFamily !== base.productOptions.fontFamily) {
        setPast((prev) => [...prev, base]);
        setFuture([]);
      }
    }
    if (activeSheet === 'opacity' && opacitySessionBaseStateRef.current) {
      const base = opacitySessionBaseStateRef.current;
      opacitySessionBaseStateRef.current = null;
      if (state.productOptions.imageOpacity !== base.productOptions.imageOpacity) {
        setPast((prev) => [...prev, base]);
        setFuture([]);
      }
    }
    setActiveSheet(null);
  }, [activeSheet, state, closeColorSession]);

  const executeAutosave = useCallback((currentState: DesignState) => {
    setSaveStatus('saving');
    const ok = flushAutosave(currentState);
    setSaveStatus(ok ? 'saved' : 'error');
    if (ok) {
      setRecentProjects(getRecentProjects());
    }
    return ok;
  }, []);

  // Continuous debounced autosave (400ms)
  useEffect(() => {
    if (!mounted) return;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      executeAutosave(state);
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, mounted, executeAutosave]);

  // Mobile lifecycle: save on visibility change / backgrounding
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && mounted) {
        executeAutosave(state);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state, mounted, executeAutosave]);
  const [overlayMode, setOverlayMode] = useState<EditorOverlayMode>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Restore editor data after mount
  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const requestedProduct = params.get('product') as ProductId | null;
    const saved = loadState();
    if (saved && saved.productId) {
      const base = createInitialState(saved.productId);
      const merged = {
        ...base,
        ...saved,
        productId: saved.productId,
        productOptions: { ...base.productOptions, ...(saved.productOptions || {}) },
      } as DesignState;
      setState(migrateLegacyText(merged));
    }
    setRecentProjects(getRecentProjects());
    const requestedView = params.get('view') as View | null;
    if (requestedView === 'editor' && saved && saved.productId) {
      setView('editor');
    } else if (requestedProduct && requestedProduct in PRODUCTS) {
      setState(createInitialState(requestedProduct));
      setView('setup');
    }
  }, []);


  // Reset viewport on product or surface change
  useEffect(() => {
    setViewport(resetToFit());
  }, [state.productId, state.productOptions.surface]);

  const dispatch = useCallback((action: DesignAction) => {
    setState((curr) => {
      const next = transitionState(curr, action);
      if (next === curr) return curr;
      setPast((prev) => [...prev, curr]);
      setFuture([]);
      return next;
    });
  }, []);

  const handleSetFont = useCallback((fontFamily: string) => {
    if (selectedTarget === 'text' && selectedTextId) {
      dispatch({
        type: 'UPDATE_TEXT_STYLE',
        id: selectedTextId,
        patch: { fontFamily },
      });
    }
    setState((curr) => ({
      ...curr,
      productOptions: {
        ...curr.productOptions,
        fontFamily,
      },
    }));
  }, [selectedTarget, selectedTextId, dispatch]);

  const handleSetColor = useCallback((color: string) => {
    if (selectedTarget === 'text' && selectedTextId) {
      dispatch({
        type: 'UPDATE_TEXT_STYLE',
        id: selectedTextId,
        patch: { color },
      });
    } else {
      dispatch({ type: 'SET_COLOR', value: color });
    }
  }, [selectedTarget, selectedTextId, dispatch]);

  const handleSetFontSize = useCallback((fontSize: number) => {
    if (selectedTarget === 'text' && selectedTextId) {
      dispatch({
        type: 'UPDATE_TEXT_STYLE',
        id: selectedTextId,
        patch: { fontSize },
      });
    }
    setState((curr) => ({
      ...curr,
      productOptions: {
        ...curr.productOptions,
        fontSize,
      },
    }));
  }, [selectedTarget, selectedTextId, dispatch]);

  const handleSetTextAlign = useCallback((align: 'left' | 'center' | 'right') => {
    if (selectedTarget === 'text' && selectedTextId) {
      dispatch({
        type: 'UPDATE_TEXT_STYLE',
        id: selectedTextId,
        patch: { align },
      });
    }
  }, [selectedTarget, selectedTextId, dispatch]);


  const handleSelectProduct = useCallback((productId: ProductId) => {
    setState(createInitialState(productId));
    setPast([]);
    setFuture([]);
    setSelectedTarget(null);
    setSelectedElementId(null);
    setSelectedTextId(null);
    setTextEditState(null);
    setActiveSheet(null);
    setFocusMode(null);
    setOverlayMode(null);
    setViewport(resetToFit());
    setView('setup');
  }, []);

  const handleResumeProject = useCallback((project: RecentProject) => {
    const base = createInitialState(project.productId);
    const merged: DesignState = {
      ...base,
      ...project,
      quantity: 1,
      productOptions: { ...base.productOptions, ...project.productOptions },
    };
    setState(migrateLegacyText(merged));
    setPast([]);
    setFuture([]);
    setSelectedTarget(null);
    setSelectedElementId(null);
    setSelectedTextId(null);
    setTextEditState(null);
    setActiveSheet(null);
    setFocusMode(null);
    setViewport(resetToFit());
    setView('editor');
  }, []);

  const handleBackToLauncher = useCallback(() => {
    saveRecentProject(state);
    setRecentProjects(getRecentProjects());
    setOverlayMode(null);
    setSelectedTarget(null);
    setSelectedElementId(null);
    setSelectedTextId(null);
    setTextEditState(null);
    setActiveSheet(null);
    setFocusMode(null);
    setView('launcher');
  }, [state]);
  const getSelectedTextElement = useCallback((current: DesignState, id: string | null): CanvasElement | null => {
    if (!id) return null;
    return (current.elements ?? []).find((element) => element.id === id && element.type === 'text') ?? null;
  }, []);

  const beginTextEdit = useCallback((elementId: string, selectAll: boolean): void => {
    const elements = state.elements ?? getDefaultElements(state);
    const element = elements.find((el) => el.id === elementId && el.type === 'text');
    const data = element ? getTextData(element) : null;
    if (!element || !data || element.locked) return;
    preEditViewportRef.current = viewport;
    setSelectedTarget('text');
    setSelectedElementId(elementId);
    setSelectedTextId(elementId);
    setActiveSheet(null);
    setTextEditState(startTextEdit(elementId, data.text, selectAll));
  }, [state, viewport]);

  const commitTextEdit = useCallback((edit: Exclude<TextEditState, null>): void => {
    dispatch({ type: 'COMMIT_TEXT_EDIT', id: edit.elementId, text: edit.draft });
  }, [dispatch]);

  const exitTextEdit = useCallback((): void => {
    if (!textEditState) return;
    if (textEditState.isComposing) {
      pendingExitOnCompositionEndRef.current = true;
      return;
    }
    pendingExitOnCompositionEndRef.current = false;
    const trimmed = textEditState.draft.trim();
    commitTextEdit(textEditState);
    setTextEditState(null);
    if (!trimmed) {
      setSelectedTarget(null);
      setSelectedElementId(null);
      setSelectedTextId(null);
    }
    if (preEditViewportRef.current) {
      setViewport(preEditViewportRef.current);
      preEditViewportRef.current = null;
    }
  }, [textEditState, commitTextEdit]);

  // Keyboard-safe visualViewport adjustment during text editing
  useEffect(() => {
    if (!textEditState || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handleViewportChange = () => {
      const heightDiff = window.innerHeight - vv.height;
      if (heightDiff > 100) {
        setViewport((prev) => ({
          ...prev,
          panY: Math.min(prev.panY, -Math.round(heightDiff * 0.3)),
        }));
      } else if (preEditViewportRef.current) {
        setViewport(preEditViewportRef.current);
      }
    };
    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
    };
  }, [textEditState]);
  const handleSelectTextElement = useCallback((id: string | null) => {
    if (id) {
      setSelectedTarget('text');
      setSelectedElementId(id);
      setSelectedTextId(id);
    } else {
      setSelectedElementId(null);
      setSelectedTextId(null);
      setSelectedTarget(null);
    }
  }, []);
  // Strict local-first Back navigation hierarchy:
  // Strict unified Back navigation resolver across Editor transient states
  const handleUnifiedBack = useCallback(() => {
    if (view === 'template-browser') {
      setView(templateReturnView);
      return;
    }
    if (view === 'setup') {
      setView('launcher');
      return;
    }
    if (view === 'launcher') {
      return;
    }

    // Inside Editor: consult pure resolver
    const action = resolveEditorBackAction({
      hasUnsavedWarning,
      isPreviewOpen: overlayMode === 'preview',
      isPreflightOpen: overlayMode === 'preflight',
      activeSheet,
      isTextEditing: Boolean(textEditState),
      focusMode,
      selectedTarget,
      saveStatus,
      returnView: 'setup',
    });

    switch (action.type) {
      case 'CLOSE_UNSAVED_WARNING':
        setHasUnsavedWarning(false);
        break;
      case 'CLOSE_PREVIEW':
      case 'CLOSE_PREFLIGHT':
        setOverlayMode(null);
        break;
      case 'CLOSE_SHEET':
        handleCloseSheet();
        break;
      case 'EXIT_TEXT_EDIT':
        exitTextEdit();
        break;
      case 'EXIT_FOCUS_MODE':
        setFocusMode(null);
        break;
      case 'DESELECT_TARGET':
        setSelectedTarget(null);
        setSelectedElementId(null);
        setSelectedTextId(null);
        break;
      case 'PROMPT_UNSAVED':
        setHasUnsavedWarning(true);
        break;
      case 'LEAVE_EDITOR':
        if (!viewport.isFit) {
          setViewport(resetToFit());
          return;
        }
        handleBackToLauncher();
        break;
    }
  }, [
    view,
    templateReturnView,
    hasUnsavedWarning,
    overlayMode,
    activeSheet,
    textEditState,
    exitTextEdit,
    focusMode,
    selectedTarget,
    saveStatus,
    viewport.isFit,
    handleCloseSheet,
    handleBackToLauncher,
  ]);

  // Intercept browser Back (popstate) to match in-app Back hierarchy
  const isTransient = Boolean(
    activeSheet !== null ||
    textEditState !== null ||
    focusMode !== null ||
    overlayMode !== null ||
    selectedTarget !== null ||
    !viewport.isFit ||
    hasUnsavedWarning
  );

  // Intercept browser Back (popstate) to match in-app Back hierarchy


  useEffect(() => {
    if (view !== 'editor') return;
    if (isTransient) {
      window.history.pushState({ customizerTransient: true }, '');
    }
  }, [isTransient, view]);

  useEffect(() => {
    if (view !== 'editor') return;
    const onPopState = () => {
      handleUnifiedBack();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [view, handleUnifiedBack]);

  // Listen to Escape key for unified back
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && view === 'editor') {
        handleUnifiedBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, handleUnifiedBack]);

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

  const handleUploadImage = useCallback(async (file: File) => {
    try {
      const imageState = await processImageUpload(file);
      if (selectedTarget === 'image') {
        dispatch({
          type: 'REPLACE_IMAGE_ASSET',
          id: selectedElementId ?? undefined,
          asset: {
            src: imageState.src,
            name: imageState.name,
            width: imageState.width,
            height: imageState.height,
            size: imageState.size,
          },
        });
        showToast('Đã thay ảnh (giữ nguyên khung thiết kế).');
      } else {
        if (state.image?.src) revokeImageUrl(state.image.src);
        dispatch({ type: 'SET_IMAGE', value: imageState });
        setSelectedTarget('image');
        const elements = state.elements ?? getDefaultElements(state);
        const imgEl = elements.find((e) => e.type === 'image');
        setSelectedElementId(imgEl?.id || 'image-1');
        showToast('Tải ảnh lên thành công.');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Tải ảnh thất bại.');
    }
  }, [dispatch, state.image, state.elements, selectedTarget, selectedElementId, showToast]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadImage(file);
      e.target.value = '';
    }
  };

  const handleOpenImagePicker = (source: ImageSourceType = 'file') => {
    if (!fileInputRef.current) return;
    if (source === 'camera') {
      fileInputRef.current.setAttribute('capture', 'environment');
    } else {
      fileInputRef.current.removeAttribute('capture');
    }
    fileInputRef.current.click();
  };

  const handleInsertText = useCallback(
    (preset: TextStylePreset = 'heading') => {
      const textPreset: TextPreset = preset === 'heading' ? 'heading' : 'body';
      const newId = `text-${Date.now()}`;
      dispatch({
        type: 'ADD_TEXT_ELEMENT',
        preset: textPreset,
        id: newId,
      });
      setSelectedTarget('text');
      setSelectedElementId(newId);
      setSelectedTextId(newId);
      setActiveSheet(null);
      preEditViewportRef.current = viewport;
      const initialText = textPreset === 'heading' ? 'Nhập tiêu đề' : 'Nhập nội dung';
      setTextEditState(startTextEdit(newId, initialText, true));
    },
    [dispatch, viewport]
  );

  const handleInsertShape = (shapeType: ShapePrimitiveType) => {
    const newElement = {
      id: `shape-${Date.now()}`,
      type: 'shape' as const,
      x: 50,
      y: 50,
      width: 40,
      height: 40,
      rotation: 0,
      zIndex: (state.elements?.length || 0) + 1,
      data: { shapeType, fill: '#DCEBF4' },
    };
    dispatch({ type: 'ADD_CANVAS_ELEMENT', element: newElement });
    showToast('Đã thêm hình khối.');
  };
  // Workspace touch / pan / pinch gesture tracking
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialViewport: ViewportState;
    centerStartX: number;
    centerStartY: number;
  } | null>(null);

  const workspaceDragRef = useRef<{
    startX: number;
    startY: number;
    initialViewport: ViewportState;
    hasMoved: boolean;
  } | null>(null);

  const handleWorkspaceTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchStateRef.current = {
        initialDistance: dist,
        initialViewport: viewport,
        centerStartX: (t1.clientX + t2.clientX) / 2,
        centerStartY: (t1.clientY + t2.clientY) / 2,
      };
      workspaceDragRef.current = null;
    }
  };

  const handleWorkspaceTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length === 2 && pinchStateRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const centerCurrX = (t1.clientX + t2.clientX) / 2;
      const centerCurrY = (t1.clientY + t2.clientY) / 2;
      const deltaX = centerCurrX - pinchStateRef.current.centerStartX;
      const deltaY = centerCurrY - pinchStateRef.current.centerStartY;

      setViewport(
        applyPinchZoom(
          pinchStateRef.current.initialViewport,
          pinchStateRef.current.initialDistance,
          dist,
          deltaX,
          deltaY
        )
      );
    }
  };

  const handleWorkspaceTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length < 2) {
      pinchStateRef.current = null;
    }
  };

  const handleWorkspacePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch' && pinchStateRef.current) return;
    if (e.target === e.currentTarget) {
      workspaceDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialViewport: viewport,
        hasMoved: false,
      };
    }
  };

  const handleWorkspacePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = workspaceDragRef.current;
    if (!drag) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.hasMoved && Math.hypot(dx, dy) > TAP_THRESHOLD_PX) {
      drag.hasMoved = true;
    }

    if (drag.hasMoved) {
      const ws = workspaceRef.current;
      const wsBounds = ws ? { width: ws.clientWidth, height: ws.clientHeight } : { width: 400, height: 600 };
      const canPan = canOneFingerPan(viewport, wsBounds, { width: 320, height: 480 });
      if (canPan) {
        setViewport(applyPan(drag.initialViewport, dx, dy, true));
      }
    }
  };

  const handleWorkspacePointerUp = () => {
    const drag = workspaceDragRef.current;
    if (drag) {
      workspaceDragRef.current = null;
      if (!drag.hasMoved) {
        setSelectedTarget(null);
      }
    }
  };

  // Object transform commits (semantic single history action on gesture finish)
  const imageTransform = (state.productOptions.imageTransform as TransformState) || {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
  };

  const textTransform = (state.productOptions.textTransform as TransformState) || {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
  };

  const handleCommitTransform = useCallback(
    (target: 'image' | 'text', transform: TransformState) => {
      dispatch({
        type: 'SET_PRODUCT_OPTION',
        key: target === 'image' ? 'imageTransform' : 'textTransform',
        value: transform,
      });
    },
    [dispatch]
  );
  const handleSelectLayer = useCallback(
    (layerIdOrType: string) => {
      const elements = state.elements ?? getDefaultElements(state);
      const found = elements.find((el) => el.id === layerIdOrType);
      if (found) {
        setSelectedElementId(found.id);
        if (found.type === 'image') {
          setSelectedTarget('image');
        } else if (found.type === 'text') {
          setSelectedTarget('text');
        } else {
          setSelectedTarget(null);
        }
        if (found.locked) {
          showToast('🔒 Thành phần này đã được khóa trong mẫu.');
        }
      } else if (layerIdOrType === 'image') {
        setSelectedTarget('image');
        const imgEl = elements.find((e) => e.type === 'image');
        setSelectedElementId(imgEl?.id || 'image-1');
      } else if (layerIdOrType === 'text') {
        setSelectedTarget('text');
        const txtEl = elements.find((e) => e.type === 'text');
        setSelectedElementId(txtEl?.id || 'text-1');
      } else {
        setSelectedElementId(null);
        setSelectedTarget(null);
      }
    },
    [state, showToast]
  );

  const handleReorderElements = useCallback(
    (orderedIds: string[]) => {
      dispatch({
        type: 'REORDER_ELEMENTS',
        orderedIds,
      });
    },
    [dispatch]
  );

  const handleDuplicateSelected = useCallback(() => {
    if (selectedElementId) {
      dispatch({ type: 'DUPLICATE_ELEMENT', id: selectedElementId });
      showToast('Đã nhân bản đối tượng.');
    } else if (selectedTarget === 'image') {
      const elements = state.elements ?? getDefaultElements(state);
      const imgEl = elements.find((e) => e.type === 'image');
      if (imgEl) dispatch({ type: 'DUPLICATE_ELEMENT', id: imgEl.id });
      showToast('Đã nhân bản ảnh.');
    } else if (selectedTarget === 'text') {
      const elements = state.elements ?? getDefaultElements(state);
      const txtEl = elements.find((e) => e.type === 'text');
      if (txtEl) dispatch({ type: 'DUPLICATE_ELEMENT', id: txtEl.id });
      showToast('Đã nhân bản dòng chữ.');
    }
  }, [selectedElementId, selectedTarget, state, dispatch, showToast]);

  const handleBringForwardSelected = useCallback(() => {
    if (selectedElementId) {
      dispatch({ type: 'BRING_FORWARD', id: selectedElementId });
      showToast('Đã đưa đối tượng lên trên.');
    }
  }, [selectedElementId, dispatch, showToast]);

  const handleSendBackwardSelected = useCallback(() => {
    if (selectedElementId) {
      dispatch({ type: 'SEND_BACKWARD', id: selectedElementId });
      showToast('Đã đưa đối tượng xuống dưới.');
    }
  }, [selectedElementId, dispatch, showToast]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedElementId) {
      dispatch({ type: 'DELETE_ELEMENT', id: selectedElementId });
      setSelectedElementId(null);
      setSelectedTarget(null);
      showToast('Đã xóa đối tượng.');
    } else if (selectedTarget === 'image') {
      if (state.image?.src) revokeImageUrl(state.image.src);
      dispatch({ type: 'SET_IMAGE', value: null });
      setSelectedTarget(null);
      setSelectedElementId(null);
      showToast('Đã xóa ảnh.');
    } else if (selectedTarget === 'text') {
      dispatch({ type: 'SET_TEXT', value: '' });
      setSelectedTarget(null);
      setSelectedElementId(null);
      showToast('Đã xóa dòng chữ.');
    }
  }, [selectedElementId, selectedTarget, state.image?.src, dispatch, showToast]);

  // Contextual actions dispatcher
  const handleToolbarAction = useCallback((actionKey: string) => {
    switch (actionKey) {
      case 'add':
        setActiveSheet('add');
        break;
      case 'templates':
        setActiveSheet('templates');
        break;
      case 'layers':
        setActiveSheet('layers');
        break;
      case 'preview':
        setOverlayMode('preview');
        break;
      case 'finish':
        setOverlayMode('preflight');
        break;
      case 'crop':
        setFocusMode('crop');
        break;
      case 'replace-image':
        fileInputRef.current?.click();
        break;
      case 'remove-bg':
        setFocusMode('remove-bg');
        break;
      case 'opacity':
        opacitySessionBaseStateRef.current = state;
        setActiveSheet('opacity');
        break;
      case 'mask':
        setFocusMode('mask');
        break;
      case 'edit-text': {
        const elements = state.elements ?? getDefaultElements(state);
        const targetId = selectedTextId || elements.find((e) => e.type === 'text')?.id;
        if (targetId) {
          const el = elements.find((e) => e.id === targetId);
          const data = el ? getTextData(el) : null;
          beginTextEdit(targetId, Boolean(data?.placeholder));
        }
        break;
      }
      case 'font':
        fontSessionBaseStateRef.current = state;
        setActiveSheet('font');
        break;
      case 'color':
        setActiveSheet('color');
        break;
      case 'font-size':
        setActiveSheet('font-size');
        break;
      case 'align':
        setActiveSheet('align');
        break;
      case 'more':
        setActiveSheet('more');
        break;
      case 'duplicate':
        handleDuplicateSelected();
        break;
      case 'bring-forward':
        handleBringForwardSelected();
        break;
      case 'send-backward':
        handleSendBackwardSelected();
        break;
      case 'delete':
        handleDeleteSelected();
        break;
      default:
        break;
    }
  }, [state.text, showToast]);

  // Canvas entrance animation
  useGSAP(() => {
    if (view !== 'editor') return;
    gsap.fromTo('#design-canvas', { scale: 0.96, autoAlpha: 0.9 }, {
      scale: 1,
      autoAlpha: 1,
      duration: 0.3,
      ease: 'power2.out',
    });
  }, { dependencies: [state.productId, view], scope: containerRef });

  const summary = getDesignSummary(state);
  const preflight = getPreflight(state);

  // Derive design title for the minimal top bar
  const templateName = state.templateId ? TEMPLATES[state.templateId]?.name : null;
  const productName = PRODUCTS[state.productId]?.name || 'Thiết kế in ấn';
  const designTitle = state.text ? state.text : (templateName || productName);

  const selectedElement = (state.elements ?? getDefaultElements(state)).find(
    (el) => el.id === (selectedTextId || selectedElementId)
  );
  const selectedTextData =
    selectedElement && selectedElement.type === 'text' ? getTextData(selectedElement) : null;
  const isCurrentTargetLocked = Boolean(selectedElement?.locked ?? state.productOptions.isLocked);
  const currentImageOpacity = typeof state.productOptions.imageOpacity === 'number'
    ? state.productOptions.imageOpacity
    : 100;
  const currentFontSize = selectedTextData?.fontSize ??
    (typeof state.productOptions.fontSize === 'number' ? state.productOptions.fontSize : 20);
  const currentFontFamily = selectedTextData?.fontFamily ??
    (typeof state.productOptions.fontFamily === 'string' ? state.productOptions.fontFamily : '"Be Vietnam Pro", system-ui, sans-serif');
  const currentTextAlign = selectedTextData?.align ?? 'center';
  const currentTextColor = selectedTextData?.color ?? state.color;
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
    <div
      ref={containerRef}
      className="min-h-[100dvh] flex flex-col bg-[#F8F3E8] relative overflow-hidden font-sans"
    >
      {/* Hidden file input for uploading images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-3 right-3 z-50 rounded-lg bg-[#2E3338] px-3.5 py-1.5 text-xs font-medium text-white shadow-lg flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5 text-[#C8D8C4]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* FOCUS MODE: Text Editing */}
      {/* FOCUSED MODE: Text Editing Overlay */}
      {textEditState && (
        <TextEditOverlay
          value={textEditState.draft}
          placeholder="Nhập nội dung chữ..."
          selectAllOnFocus={textEditState.selectAll}
          onChange={(newDraft) => {
            setTextEditState((prev) => (prev ? { ...prev, draft: newDraft } : null));
          }}
          onCompositionChange={(isComposing) => {
            setTextEditState((prev) => (prev ? updateComposition(prev, isComposing) : null));
            if (!isComposing && pendingExitOnCompositionEndRef.current) {
              pendingExitOnCompositionEndRef.current = false;
              exitTextEdit();
            }
          }}
          onDone={exitTextEdit}
        />
      )}

      {/* FOCUS MODE: Crop */}
      {focusMode === 'crop' && (
        <div className="fixed inset-0 z-50 bg-[#2E3338] text-white flex flex-col">
          <header className="h-[52px] px-3 border-b border-white/10 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setFocusMode(null)}
              className="text-xs font-medium text-white/80 px-2 py-1"
            >
              Hủy
            </button>
            <span className="text-xs font-semibold">Cắt & Căn chỉnh ảnh</span>
            <button
              type="button"
              onClick={() => {
                setFocusMode(null);
                showToast('Đã áp dụng cắt ảnh.');
              }}
              className="text-xs font-semibold text-white bg-[#315F86] px-3 py-1.5 rounded-lg"
            >
              Xong
            </button>
          </header>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {state.image?.src ? (
              <img
                src={state.image.src}
                alt="Ảnh đang cắt"
                className="max-h-[60%] max-w-[85%] object-contain rounded-md border border-white/20 shadow-xl"
              />
            ) : (
              <p className="text-xs text-white/60">Không có ảnh để cắt</p>
            )}
            <p className="text-xs text-white/70 mt-6">
              Kéo góc để phóng to / thu nhỏ khung ảnh theo ý muốn.
            </p>
          </div>
        </div>
      )}

      {/* FOCUS MODE: Remove Background */}
      {focusMode === 'remove-bg' && (
        <div className="fixed inset-0 z-50 bg-[#2E3338] text-white flex flex-col">
          <header className="h-[52px] px-3 border-b border-white/10 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setFocusMode(null);
                showToast('Đã hủy tách nền.');
              }}
              className="text-xs font-medium text-white/80 px-2 py-1"
            >
              Hủy
            </button>
            <span className="text-xs font-semibold">Tách nền tự động</span>
            <button
              type="button"
              onClick={() => {
                if (state.image?.src) {
                  dispatch({
                    type: 'APPLY_REMOVE_BACKGROUND',
                    id: selectedElementId ?? undefined,
                    derivedSrc: state.image.src,
                  });
                }
                setFocusMode(null);
                showToast('Đã hoàn thiện tách nền ảnh.');
              }}
              className="text-xs font-semibold text-white bg-[#315F86] px-3 py-1.5 rounded-lg"
            >
              Xong
            </button>
          </header>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {state.image?.src ? (
              <div className="relative p-2 rounded-xl bg-[linear-gradient(45deg,#444_25%,transparent_25%),linear-gradient(-45deg,#444_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#444_75%),linear-gradient(-45deg,transparent_75%,#444_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]">
                <img
                  src={state.image.src}
                  alt="Ảnh xem trước tách nền"
                  className="max-h-[60vh] max-w-[80vw] object-contain rounded-md shadow-2xl"
                />
              </div>
            ) : (
              <p className="text-xs text-white/60">Không có ảnh để tách nền</p>
            )}
            <p className="text-xs text-white/70 mt-5">
              Hệ thống đã giữ lại chủ thể chính và loại bỏ phông nền phía sau.
            </p>
          </div>
        </div>
      )}

      {/* FOCUS MODE: Mask */}
      {focusMode === 'mask' && (
        <div className="fixed inset-0 z-50 bg-[#2E3338] text-white flex flex-col">
          <header className="h-[52px] px-3 border-b border-white/10 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setFocusMode(null)}
              className="text-xs font-medium text-white/80 px-2 py-1"
            >
              Hủy
            </button>
            <span className="text-xs font-semibold">Khung mặt nạ (Mask)</span>
            <button
              type="button"
              onClick={() => {
                setFocusMode(null);
                showToast('Đã áp dụng khung mặt nạ.');
              }}
              className="text-xs font-semibold text-white bg-[#315F86] px-3 py-1.5 rounded-lg"
            >
              Xong
            </button>
          </header>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {state.image?.src ? (
              <img
                src={state.image.src}
                alt="Khung mặt nạ"
                className="max-h-[60vh] max-w-[80vw] object-contain rounded-full border-2 border-white shadow-2xl"
              />
            ) : (
              <p className="text-xs text-white/60">Không có ảnh</p>
            )}
            <p className="text-xs text-white/70 mt-5">
              Áp dụng hình dạng mặt nạ (tròn, oval, tim) lên ảnh đang chọn.
            </p>
          </div>
        </div>
      )}

      {/* ZONE 1: Minimal Top Bar */}
      <header className="h-[50px] px-3 border-b border-[#ECE6DC] bg-[#FFFDF8]/95 backdrop-blur-md flex items-center justify-between z-30 shrink-0 select-none">
        <button
          type="button"
          onClick={handleUnifiedBack}
          aria-label="Quay lại"
          title="Quay lại"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
          <ArrowLeft className="w-4 h-4 text-[#2E3338]" />
        </button>

        {/* Project / Design Name with subtle autosave note */}
        <div className="flex flex-col items-center justify-center min-w-0 px-2">
          <span className="text-xs sm:text-sm font-semibold text-[#2E3338] truncate max-w-[150px] sm:max-w-xs text-center leading-tight">
            {designTitle}
          </span>
          <span className="text-xs text-[#666A6D] flex items-center gap-1 font-medium leading-none mt-0.5">
            {saveStatus === 'saving' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#A86E22] animate-pulse" />
                Đang lưu...
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#5F7E67]" />
                Đã lưu
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#B3535D]" />
                <span className="text-[#B3535D]">Lưu lỗi</span>
                <button
                  type="button"
                  onClick={() => executeAutosave(state)}
                  className="underline text-xs text-[#315F86] hover:text-[#244A69] ml-0.5"
                >
                  Thử lại
                </button>
              </>
            )}
          </span>
        </div>

        {/* Undo / Redo controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={past.length === 0}
            onClick={handleUndo}
            aria-label="Hoàn tác"
            title="Hoàn tác"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#2E3338] disabled:opacity-30 disabled:pointer-events-none hover:bg-[#F8F3E8] active:scale-95 transition-all"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={future.length === 0}
            onClick={handleRedo}
            aria-label="Làm lại"
            title="Làm lại"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#2E3338] disabled:opacity-30 disabled:pointer-events-none hover:bg-[#F8F3E8] active:scale-95 transition-all"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ZONE 2: Large Canvas Workspace (~80% height, visually dominant) */}
      <main
        ref={workspaceRef}
        id="app"
        className="flex-1 flex items-center justify-center p-3 sm:p-6 overflow-hidden relative select-none touch-none pb-[calc(env(safe-area-inset-bottom)+70px)]"
        onTouchStart={handleWorkspaceTouchStart}
        onTouchMove={handleWorkspaceTouchMove}
        onTouchEnd={handleWorkspaceTouchEnd}
        onPointerDown={handleWorkspacePointerDown}
        onPointerMove={handleWorkspacePointerMove}
        onPointerUp={handleWorkspacePointerUp}
      >
        <div
          className="w-full h-full max-w-2xl flex items-center justify-center origin-center transition-transform duration-75 ease-out"
          style={{
            transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})`,
          }}
        >
          <DesignCanvas
            productId={state.productId}
            text={state.text}
            color={state.color}
            backgroundColor={state.backgroundColor}
            image={state.image}
            productOptions={state.productOptions}
            selectedTarget={selectedTarget}
            selectedTextId={selectedTextId}
            textElements={state.elements ?? getDefaultElements(state)}
            onSelectTarget={(target) => {
              setSelectedTarget(target);
              if (target === 'image') {
                const elements = state.elements ?? getDefaultElements(state);
                const imgEl = elements.find((e) => e.type === 'image');
                setSelectedElementId(imgEl?.id || 'image-1');
                setSelectedTextId(null);
              } else if (target === 'text') {
                const elements = state.elements ?? getDefaultElements(state);
                const txtEl = elements.find((e) => e.type === 'text');
                setSelectedElementId(txtEl?.id || 'text-1');
                setSelectedTextId(txtEl?.id || 'text-1');
              } else {
                setSelectedElementId(null);
                setSelectedTextId(null);
              }
            }}
            onSelectText={handleSelectTextElement}
            onDoubleTap={(target) => {
              if (target === 'image') {
                setFocusMode('crop');
              }
            }}
            onDoubleTapText={(id) => {
              const elements = state.elements ?? getDefaultElements(state);
              const el = elements.find((e) => e.id === id);
              const data = el ? getTextData(el) : null;
              beginTextEdit(id, Boolean(data?.placeholder));
            }}
            isLocked={isCurrentTargetLocked}
            onLockedFeedback={() => {
              showToast('🔒 Thành phần này đã được khóa trong mẫu.');
            }}
            onQualityExplanation={(msg) => showToast(msg)}
            imageTransform={imageTransform}
            textTransform={textTransform}
            onCommitTransform={(target, transform, elementId) => {
              if (target === 'text' && elementId) {
                dispatch({
                  type: 'UPDATE_ELEMENT',
                  id: elementId,
                  patch: {
                    x: transform.x,
                    y: transform.y,
                    rotation: transform.rotation,
                  },
                });
              }
              handleCommitTransform(target, transform);
            }}
          />

          {/* Empty Canvas State: only on blank project with no content */}
          {(state.templateId === null || state.templateId === 'blank') &&
            !state.image?.src &&
            !state.text &&
            (!state.elements || state.elements.length === 0) && (
              <EmptyEditorState
                onAddImage={() => handleOpenImagePicker('file')}
                onAddText={() => handleInsertText('heading')}
                onChooseTemplate={() => {
                  setTemplateReturnView('editor');
                  setView('template-browser');
                }}
              />
            )}
        </div>
      </main>

      {/* ZONE 3: One Adaptive Bottom Toolbar */}
      <BottomNavigation
        selectedTarget={selectedTarget}
        isLocked={isCurrentTargetLocked}
        isTextEditing={Boolean(textEditState)}
        onDeselect={() => {
          setSelectedTarget(null);
          setSelectedElementId(null);
          setSelectedTextId(null);
        }}
        onAction={handleToolbarAction}
      />

      {/* Unified Bottom Sheet system */}
      <EditorSheets
        activeSheet={activeSheet}
        onClose={handleCloseSheet}
        selectedTarget={selectedTarget}
        selectedElementId={selectedElementId}
        elements={state.elements ?? getDefaultElements(state)}
        surface={String(state.productOptions.surface || 'front')}
        productId={state.productId}
        templateId={state.templateId}
        text={state.text}
        hasImage={Boolean(state.image?.src)}
        imageThumbnailSrc={state.image?.src}
        color={currentTextColor}
        colorValue={activeColorValue}
        onUpdateColorValue={updateColorLive}
        designColors={designColors}
        recentColors={recentColors}
        isGradientSupported={isGradientSupported}
        isLocked={isCurrentTargetLocked}
        imageOpacity={currentImageOpacity}
        fontSize={currentFontSize}
        fontFamily={currentFontFamily}
        textAlign={currentTextAlign}
        onSelectTemplate={(key) => dispatch({ type: 'SET_TEMPLATE', value: key })}
        onOpenTemplateBrowser={() => {
          setTemplateReturnView('editor');
          setView('template-browser');
        }}
        onAddText={(preset) => handleInsertText(preset)}
        onUploadImageClick={(source) => handleOpenImagePicker(source)}
        onAddShape={(shape) => handleInsertShape(shape)}
        onSetColor={handleSetColor}
        onSetFont={handleSetFont}
        onSetFontSize={handleSetFontSize}
        onSetTextAlign={handleSetTextAlign}
        onSetOpacity={(val) => {
          setState((curr) =>
            transitionState(curr, {
              type: 'SET_IMAGE_OPACITY',
              id: selectedElementId ?? undefined,
              opacity: val,
            })
          );
        }}
        onCommitOpacity={(val) => {
          if (opacitySessionBaseStateRef.current) {
            const base = opacitySessionBaseStateRef.current;
            if (base.productOptions.imageOpacity !== val) {
              setPast((prev) => [...prev, base]);
              setFuture([]);
              opacitySessionBaseStateRef.current = state;
            }
          }
        }}
        onMaskClick={() => setFocusMode('mask')}
        onToggleLock={() => {
          if (selectedElementId) {
            dispatch({
              type: 'LOCK_ELEMENT',
              id: selectedElementId,
              locked: !isCurrentTargetLocked,
            });
          }
          dispatch({
            type: 'SET_PRODUCT_OPTION',
            key: 'isLocked',
            value: !isCurrentTargetLocked,
          });
          showToast(isCurrentTargetLocked ? 'Đã mở khóa đối tượng.' : 'Đã khóa đối tượng.');
        }}
        onDuplicate={handleDuplicateSelected}
        onBringForward={handleBringForwardSelected}
        onSendBackward={handleSendBackwardSelected}
        onDeleteTarget={handleDeleteSelected}
        onSelectLayer={handleSelectLayer}
        onReorderElements={handleReorderElements}
        onOpenAddSheet={() => setActiveSheet('add')}
      />

      {/* Editor Overlay: Dedicated full-screen preview */}
      {overlayMode === 'preview' && (
        <EditorPreviewMode
          state={state}
          summary={summary}
          onBackToEdit={() => setOverlayMode(null)}
          onDoneToPreflight={() => setOverlayMode('preflight')}
        />
      )}

      {/* Editor Overlay: Dedicated finish & preflight review */}
      {overlayMode === 'preflight' && (
        <EditorPreflightMode
          state={state}
          summary={summary}
          preflight={preflight}
          onBackToEdit={(target) => {
            setOverlayMode(null);
            if (target) setSelectedTarget(target);
          }}
          onContinueToCheckout={() => {
            router.push('/checkout');
          }}
        />
      )}
      {/* Unsaved Changes Warning Modal (only shown if real risk of data loss) */}
      {hasUnsavedWarning && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="unsaved-title"
          aria-describedby="unsaved-desc"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#DDD6CC] bg-[#FFFDF8] p-5 shadow-xl text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h3 id="unsaved-title" className="font-semibold text-sm text-[#2E3338]">
              {saveStatus === 'error'
                ? 'Không thể lưu thay đổi'
                : 'Thiết kế vẫn đang được lưu'}
            </h3>
            <p id="unsaved-desc" className="text-xs text-[#666A6D]">
              {saveStatus === 'error'
                ? 'Bộ nhớ trình duyệt tạm thời gặp sự cố. Bạn có muốn thử lưu lại trước khi thoát?'
                : 'Hệ thống đang hoàn tất lưu dữ liệu của bạn vào thiết bị. Vui lòng đợi trong giây lát.'}
            </p>
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setHasUnsavedWarning(false);
                  if (saveStatus === 'error') {
                    executeAutosave(state);
                  }
                }}
                className="flex-1 h-9 rounded-lg border border-[#DDD6CC] bg-white text-xs font-semibold text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
              >
                {saveStatus === 'error' ? 'Thử lưu lại' : 'Tiếp tục chỉnh'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setHasUnsavedWarning(false);
                  handleBackToLauncher();
                }}
                className="flex-1 h-9 rounded-lg bg-[#B3535D] text-xs font-semibold text-white hover:bg-[#9E454F] transition-colors"
              >
                Rời ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
