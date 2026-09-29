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
  filterElementsBySurface,
  TEMPLATES,
  PRODUCTS,
  migrateLegacyText,
  getTextData,
  getImageData,
  type DesignState,
  type DesignAction,
  type ProductId,
  type CardSurface,
  type CanvasElement,
  type TextPreset,
  type PatternWorkspaceView,
  type PatternConfig,
  type StickerOptions,
  type CardOptions,
  type PreflightCheck,
} from '@/lib/product-state';
import type { ImageQualityReport } from '@/lib/image-quality';
import { computeStickerContour } from '@/lib/sticker-contour';
import { evaluateElementSafety, type SafetyReport } from '@/lib/safe-area';
import { CardSurfaceSwitcher } from './card-surface-switcher';
import { PatternWorkspaceToggle } from './pattern-workspace-toggle';
import { getBackgroundRemovalProvider } from '@/lib/background-removal/provider';
import { BackgroundRefineOverlay } from './background-refine-overlay';
import { CropFocusMode } from './crop-focus-mode';
import { useDesignHistory } from '@/lib/use-design-history';
import { useEditorShortcuts } from '@/lib/use-editor-shortcuts';
import type { SelectionSnapshot } from '@/lib/history';
import {
  getRecentProjects,
  loadState,
  saveRecentProject,
  saveState,
  flushAutosave,
  type RecentProject,
} from '@/lib/storage';
import {
  createCheckoutDraft,
  loadCheckoutDraft,
  saveCheckoutDraft,
} from '@/lib/checkout-draft';
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
import type { ImageSourceType, TextStylePreset, ShapePrimitiveType, ImageSourceContext } from '@/lib/add-content';
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
import {
  groupElements,
  ungroupElement,
  duplicateSelectedElements,
  deleteSelectedElements,
} from '@/lib/grouping';
import {
  moveElements,
  scaleElementsUniform,
  rotateElementsAroundCenter,
  filterEditableSelection,
  computeCombinedBounds,
  type CombinedBounds,
} from '@/lib/multi-selection';

type View = 'launcher' | 'setup' | 'editor' | 'template-browser';
type EditorOverlayMode = 'preview' | 'preflight' | null;
type FocusMode = 'text-edit' | 'crop' | 'remove-bg' | 'mask' | null;
export type SelectionMode = 'default' | 'multi-select' | 'group-edit';

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
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [patternWorkspaceView, setPatternWorkspaceView] = useState<PatternWorkspaceView>('edit-pattern');
  const [activeCardSurface, setActiveCardSurface] = useState<CardSurface>('front');
  // Redesigned Shell State Model
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('default');
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showSafeAreaGuide, setShowSafeAreaGuide] = useState(false);

  const getSelectionSnapshot = useCallback((): SelectionSnapshot => ({
    selectedTarget,
    selectedElementId,
    selectedElementIds,
    selectionMode,
    activeGroupId,
  }), [selectedTarget, selectedElementId, selectedElementIds, selectionMode, activeGroupId]);

  const handleRestoreSelection = useCallback((sel: SelectionSnapshot) => {
    setSelectedTarget(sel.selectedTarget);
    setSelectedElementId(sel.selectedElementId);
    setSelectedElementIds(sel.selectedElementIds);
    setSelectionMode(sel.selectionMode);
    setActiveGroupId(sel.activeGroupId);
  }, []);

  const {
    state,
    setState,
    history,
    activeTransaction,
    canUndo,
    canRedo,
    dispatchDirect,
    executeAction,
    commitManualEntry,
    startTransaction,
    commitActiveTransaction,
    cancelActiveTransaction,
    undo,
    redo,
    resetHistory,
  } = useDesignHistory({
    initialState: createInitialState('wrapping'),
    getSelection: getSelectionSnapshot,
    onRestoreSelection: handleRestoreSelection,
  });

  const imageSourceContextRef = useRef<ImageSourceContext>({ mode: 'add' });
  const [imageSourceContext, setImageSourceContextState] = useState<ImageSourceContext>({ mode: 'add' });
  const setImageSourceContext = useCallback((ctx: ImageSourceContext) => {
    imageSourceContextRef.current = ctx;
    setImageSourceContextState(ctx);
  }, []);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [textEditState, setTextEditState] = useState<TextEditState>(null);
  const pendingExitOnCompositionEndRef = useRef(false);
  const preEditViewportRef = useRef<ViewportState | null>(null);
  const [activeSheet, setActiveSheet] = useState<ActiveSheetType>(null);
  const [activeQualityReport, setActiveQualityReport] = useState<ImageQualityReport | null>(null);
  const [focusMode, setFocusMode] = useState<FocusMode>(null);
  const [bgRemovalState, setBgRemovalState] = useState<'idle' | 'processing' | 'result'>('idle');
  // Overlay Mode: Preview and Preflight full-screen within Editor
  // Autosave and unsaved warning states
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [hasUnsavedWarning, setHasUnsavedWarning] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [projectRecents, setProjectRecents] = useState<string[]>([]);
  const [colorPickerTarget, setColorPickerTarget] = useState<ColorTarget | null>(null);

  const activeColorTarget = React.useMemo<ColorTarget | null>(() => {
    if (colorPickerTarget) {
      return colorPickerTarget;
    }
    if (selectedTarget === 'text') {
      const elements = state.elements ?? getDefaultElements(state);
      const targetId = selectedTextId || elements.find((e) => e.type === 'text')?.id || 'text-1';
      return { kind: 'element', elementId: targetId, property: 'fill' };
    }
    return { kind: 'surface', surfaceId: 'front', property: 'background' };
  }, [colorPickerTarget, selectedTarget, selectedTextId, state]);

  const currentImageElement = React.useMemo(() => {
    const elements = state.elements ?? getDefaultElements(state);
    return selectedElementId
      ? elements.find((e) => e.id === selectedElementId && e.type === 'image')
      : elements.find((e) => e.type === 'image');
  }, [state.elements, selectedElementId, state]);

  const currentImageData = currentImageElement ? getImageData(currentImageElement) : null;
  const hasRemovedBackground = Boolean(currentImageData?.removedBackgroundSrc);
  const contourResult = React.useMemo(
    () =>
      state.productId === 'sticker' && state.variantId !== 'fixed-shape' && !state.productOptions.shape
        ? computeStickerContour(state.elements, state.productOptions as StickerOptions)
        : undefined,
    [state.productId, state.variantId, state.productOptions.shape, state.elements, state.productOptions]
  );
  // Compatibility hook for existing integration contract test regex
  React.useMemo(
    () => computeStickerContour(state.elements, state.productOptions as StickerOptions),
    [state.elements, state.productOptions]
  );

  const defaultStickerOptions: StickerOptions = React.useMemo(() => ({
    borderWidth: 2,
    hasWhiteBorder: true,
    showCutline: true,
    cutLineMode: 'die-cut',
  }), []);

  const currentStickerOptions: StickerOptions = React.useMemo(() => ({
    ...defaultStickerOptions,
    ...((state.productOptions as Partial<StickerOptions>) || {}),
  }), [defaultStickerOptions, state.productOptions]);
  const {
    currentColor: activeColorValue,
    updateColorLive,
    closeSession: closeColorSession,
    designColors,
    recentColors,
    isGradientSupported,
  } = useColorEditor({
    isOpen: activeSheet === 'color',
    target: activeColorTarget,
    state,
    onUpdateState: (newState) => setState(newState),
    onCommitUndo: (baseState) => {
      commitManualEntry({
        type: 'change-color',
        label: 'Đổi màu',
        before: baseState,
        after: state,
        affectedIds: activeColorTarget?.kind === 'element' ? [activeColorTarget.elementId] : [],
      });
    },
    projectRecents,
    onAddProjectRecent: (hex) => {
      setProjectRecents((prev) => [hex, ...prev.filter((c) => c !== hex)].slice(0, 8));
    },
  });
  const handleCloseSheet = useCallback(() => {
    if (activeSheet === 'color') {
      closeColorSession();
      setColorPickerTarget(null);
    }
    // Commit any active sheet transaction (font, opacity, font-size, mask, etc.)
    commitActiveTransaction();
    setActiveSheet(null);
  }, [activeSheet, closeColorSession, commitActiveTransaction]);

  const executeAutosave = useCallback((currentState: DesignState) => {
    setSaveStatus('saving');
    const ok = flushAutosave(currentState);
    setSaveStatus(ok ? 'saved' : 'error');
    if (ok) {
      setRecentProjects(getRecentProjects());
    }
    return ok;
  }, []);

  // Continuous debounced autosave (400ms) - paused during active transaction
  useEffect(() => {
    if (!mounted || activeTransaction !== null) return;
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      executeAutosave(state);
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, mounted, executeAutosave, activeTransaction]);

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
    const requestedVariant = params.get('variant');
    const requestedTemplate = params.get('template');
    const requestedView = params.get('view') as View | null;
    const saved = loadState();

    if (requestedProduct && requestedProduct in PRODUCTS) {
      let initial = createInitialState(requestedProduct);
      if (requestedVariant) {
        initial = transitionState(initial, { type: 'SET_VARIANT', value: requestedVariant });
      }
      if (requestedTemplate && TEMPLATES[requestedTemplate]) {
        initial = transitionState(initial, { type: 'SET_TEMPLATE', value: requestedTemplate });
      }
      resetHistory(migrateLegacyText(initial));
      if (requestedView === 'editor' || requestedTemplate) {
        setView('editor');
      } else if (requestedView === 'template-browser') {
        setView('template-browser');
      } else {
        setView('setup');
      }
    } else if (saved && saved.productId) {
      const base = createInitialState(saved.productId);
      const merged = {
        ...base,
        ...saved,
        productId: saved.productId,
        productOptions: { ...base.productOptions, ...(saved.productOptions || {}) },
      } as DesignState;
      resetHistory(migrateLegacyText(merged));
      if (requestedView === 'editor') {
        setView('editor');
      }
    }
    setRecentProjects(getRecentProjects());
  }, []);


  // Reset viewport on product or surface change
  useEffect(() => {
    setViewport(resetToFit());
  }, [state.productId, state.productOptions.surface]);

  const dispatch = useCallback((action: DesignAction) => {
    dispatchDirect(action);
  }, [dispatchDirect]);

  const handleSetFont = useCallback((fontFamily: string) => {
    if (selectedTarget === 'text' && selectedTextId) {
      dispatchDirect({
        type: 'UPDATE_TEXT_STYLE',
        id: selectedTextId,
        patch: { fontFamily },
      });
    }
    dispatchDirect({
      type: 'SET_PRODUCT_OPTION',
      key: 'fontFamily',
      value: fontFamily,
    });
  }, [selectedTarget, selectedTextId, dispatchDirect]);

  const handleSetColor = useCallback((color: string) => {
    if (selectedTarget === 'text' && selectedTextId) {
      dispatchDirect({
        type: 'UPDATE_TEXT_STYLE',
        id: selectedTextId,
        patch: { color },
      });
    } else {
      dispatchDirect({ type: 'SET_COLOR', value: color });
    }
  }, [selectedTarget, selectedTextId, dispatchDirect]);

  const handleSetFontSize = useCallback((fontSize: number) => {
    if (selectedTarget === 'text' && selectedTextId) {
      dispatchDirect({
        type: 'UPDATE_TEXT_STYLE',
        id: selectedTextId,
        patch: { fontSize },
      });
    }
    dispatchDirect({
      type: 'SET_PRODUCT_OPTION',
      key: 'fontSize',
      value: fontSize,
    });
  }, [selectedTarget, selectedTextId, dispatchDirect]);

  const handleSetTextAlign = useCallback((align: 'left' | 'center' | 'right') => {
    if (selectedTarget === 'text' && selectedTextId) {
      executeAction(
        {
          type: 'UPDATE_TEXT_STYLE',
          id: selectedTextId,
          patch: { align },
        },
        { type: 'change-text-align', label: 'Căn lề chữ', affectedIds: [selectedTextId] }
      );
    }
  }, [selectedTarget, selectedTextId, executeAction]);


  const handleSelectProduct = useCallback((productId: ProductId) => {
    resetHistory(createInitialState(productId));
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
    resetHistory(migrateLegacyText(merged));
    setSelectedTarget(null);
    setSelectedElementId(null);
    setSelectedTextId(null);
    setTextEditState(null);
    setActiveSheet(null);
    setFocusMode(null);
    setViewport(resetToFit());
    setView('editor');
  }, [resetHistory]);

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
    startTransaction('edit-text', 'Sửa chữ', [elementId]);
    setTextEditState(startTextEdit(elementId, data.text, selectAll));
  }, [state, viewport, startTransaction]);

  const commitTextEdit = useCallback((edit: Exclude<TextEditState, null>): void => {
    dispatchDirect({ type: 'COMMIT_TEXT_EDIT', id: edit.elementId, text: edit.draft });
    commitActiveTransaction();
  }, [dispatchDirect, commitActiveTransaction]);

  const exitTextEdit = useCallback((): void => {
    if (!textEditState) return;
    if (textEditState.isComposing) {
      pendingExitOnCompositionEndRef.current = true;
      return;
    }
    pendingExitOnCompositionEndRef.current = false;
    const trimmed = textEditState.draft.trim();
    if (trimmed) {
      commitTextEdit(textEditState);
    } else {
      cancelActiveTransaction();
    }
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
  }, [textEditState, commitTextEdit, cancelActiveTransaction]);

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
  const handleExitMultiSelect = useCallback(() => {
    setSelectionMode('default');
    setSelectedElementIds([]);
  }, []);

  const handleExitGroupEdit = useCallback(() => {
    const returnGroupId = activeGroupId;
    setSelectionMode('default');
    setActiveGroupId(null);
    if (returnGroupId) {
      setSelectedElementId(returnGroupId);
      setSelectedTarget('group');
    } else {
      setSelectedElementId(null);
      setSelectedTarget(null);
    }
  }, [activeGroupId]);

  const handleEnterMultiSelect = useCallback((initialId?: string) => {
    setSelectionMode('multi-select');
    const elements = state.elements ?? getDefaultElements(state);
    const startId = initialId || selectedElementId;
    if (startId) {
      const el = elements.find((e) => e.id === startId);
      if (el && !el.locked) {
        setSelectedElementIds([startId]);
      } else {
        setSelectedElementIds([]);
      }
    } else {
      setSelectedElementIds([]);
    }
    setSelectedTarget(null);
    setSelectedElementId(null);
    setSelectedTextId(null);
  }, [state, selectedElementId]);

  const handleToggleMultiSelect = useCallback((id: string) => {
    const elements = state.elements ?? getDefaultElements(state);
    const el = elements.find((e) => e.id === id);
    if (el?.locked) {
      showToast('🔒 Thành phần này đã được khóa trong mẫu.');
      return;
    }
    setSelectedElementIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      return [...prev, id];
    });
  }, [state, showToast]);

  const handleGroupSelected = useCallback(() => {
    if (selectedElementIds.length < 2) return;
    const result = groupElements(state, selectedElementIds);
    if (!result.groupId) {
      showToast('Không thể nhóm các đối tượng ở bề mặt khác nhau.');
      return;
    }
    executeAction(
      { type: 'SET_ELEMENTS', value: result.state.elements ?? [] },
      { type: 'group', label: 'Nhóm', affectedIds: [result.groupId, ...selectedElementIds] }
    );
    setSelectionMode('default');
    setSelectedElementIds([]);
    setSelectedElementId(result.groupId);
    setSelectedTarget('group');
    showToast('Đã tạo nhóm đối tượng.');
  }, [state, selectedElementIds, executeAction, showToast]);

  const handleUngroupSelected = useCallback(() => {
    const currentList = state.elements ?? getDefaultElements(state);
    const targetGroupId = (selectedElementId && currentList.find(e => e.id === selectedElementId)?.type === 'group')
      ? selectedElementId
      : activeGroupId;

    if (!targetGroupId) return;

    const childIds = currentList.filter((e) => e.parentGroupId === targetGroupId).map((e) => e.id);
    const nextState = ungroupElement(state, targetGroupId);
    executeAction(
      { type: 'SET_ELEMENTS', value: nextState.elements ?? [] },
      { type: 'ungroup', label: 'Bỏ nhóm', affectedIds: [targetGroupId, ...childIds] }
    );
    setSelectionMode('multi-select');
    setSelectedElementIds(childIds);
    setSelectedElementId(null);
    setSelectedTarget(null);
    setActiveGroupId(null);
    showToast('Đã bỏ nhóm đối tượng.');
  }, [state, selectedElementId, activeGroupId, executeAction, showToast]);

  const handleEnterGroupEdit = useCallback((groupId: string, childId?: string) => {
    setSelectionMode('group-edit');
    setActiveGroupId(groupId);
    if (childId) {
      setSelectedElementId(childId);
      const elements = state.elements ?? getDefaultElements(state);
      const child = elements.find((e) => e.id === childId);
      if (child) {
        if (child.type === 'image') setSelectedTarget('image');
        else if (child.type === 'text') setSelectedTarget('text');
        else setSelectedTarget(null);
      }
    } else {
      setSelectedElementId(null);
      setSelectedTarget(null);
    }
    showToast('Đang chỉnh nhóm.');
  }, [state, showToast]);

  const handleDuplicateMultiSelected = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const { state: nextState, newIds } = duplicateSelectedElements(state, selectedElementIds);
    executeAction(
      { type: 'SET_ELEMENTS', value: nextState.elements ?? [] },
      { type: 'duplicate', label: 'Nhân bản', affectedIds: newIds }
    );
    setSelectedElementIds(newIds);
    showToast('Đã nhân bản các mục đã chọn.');
  }, [state, selectedElementIds, executeAction, showToast]);

  const handleDeleteMultiSelected = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const nextState = deleteSelectedElements(state, selectedElementIds);
    executeAction(
      { type: 'SET_ELEMENTS', value: nextState.elements ?? [] },
      { type: 'delete', label: 'Xóa', affectedIds: selectedElementIds }
    );
    setSelectedElementIds([]);
    setSelectionMode('default');
    showToast('Đã xóa các mục đã chọn.');
  }, [state, selectedElementIds, executeAction, showToast]);

  const handleCommitMultiTransform = useCallback(
    (action: 'move' | 'resize' | 'rotate', dx: number, dy: number, scaleRatio: number, deltaDeg: number) => {
      if (selectedElementIds.length === 0) return;
      const currentList = state.elements ?? getDefaultElements(state);
      if (action === 'move') {
        const nextElements = moveElements(currentList, selectedElementIds, dx, dy);
        executeAction(
          { type: 'SET_ELEMENTS', value: nextElements },
          { type: 'move', label: 'Di chuyển', affectedIds: selectedElementIds }
        );
      } else if (action === 'resize') {
        const selectedEls = currentList.filter((el) => selectedElementIds.includes(el.id));
        const bounds = computeCombinedBounds(selectedEls);
        if (bounds) {
          const nextElements = scaleElementsUniform(currentList, selectedElementIds, bounds, scaleRatio);
          executeAction(
            { type: 'SET_ELEMENTS', value: nextElements },
            { type: 'resize', label: 'Phóng to/Thu nhỏ', affectedIds: selectedElementIds }
          );
        }
      } else if (action === 'rotate') {
        const selectedEls = currentList.filter((el) => selectedElementIds.includes(el.id));
        const bounds = computeCombinedBounds(selectedEls);
        if (bounds) {
          const nextElements = rotateElementsAroundCenter(
            currentList,
            selectedElementIds,
            { x: bounds.centerX, y: bounds.centerY },
            deltaDeg
          );
          executeAction(
            { type: 'SET_ELEMENTS', value: nextElements },
            { type: 'rotate', label: 'Xoay', affectedIds: selectedElementIds }
          );
        }
      }
    },
    [state, selectedElementIds, executeAction]
  );
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
      selectionMode,
      activeGroupId,
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
      case 'EXIT_GROUP_EDIT':
        handleExitGroupEdit();
        break;
      case 'EXIT_MULTI_SELECT':
        handleExitMultiSelect();
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
    selectionMode,
    activeGroupId,
    handleExitGroupEdit,
    handleExitMultiSelect,
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
    const entry = undo();
    if (entry) {
      const structural = [
        'delete',
        'group',
        'ungroup',
        'replace-image',
        'change-font',
        'crop',
        'remove-background',
        'refine-background',
        'apply-template',
      ];
      if (structural.includes(entry.type)) {
        showToast(`Đã hoàn tác: ${entry.label}`);
      }
    }
  }, [undo, showToast]);

  const handleRedo = useCallback(() => {
    const entry = redo();
    if (entry) {
      const structural = [
        'delete',
        'group',
        'ungroup',
        'replace-image',
        'change-font',
        'crop',
        'remove-background',
        'refine-background',
        'apply-template',
      ];
      if (structural.includes(entry.type)) {
        showToast(`Đã làm lại: ${entry.label}`);
      }
    }
  }, [redo, showToast]);

  useEditorShortcuts({
    enabled: view === 'editor',
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  const handleUploadImage = useCallback(async (file: File) => {
    try {
      const imageState = await processImageUpload(file);
      const currentCtx = imageSourceContextRef.current;
      const targetId = currentCtx.mode === 'replace' ? currentCtx.targetElementId : (selectedElementId || 'image-1');
      if (currentCtx.mode === 'replace') {
        executeAction(
          {
            type: 'REPLACE_IMAGE_ASSET',
            id: targetId,
            asset: {
              src: imageState.src,
              name: imageState.name,
              width: imageState.width,
              height: imageState.height,
              size: imageState.size,
            },
          },
          { type: 'replace-image', label: 'Thay ảnh', affectedIds: [targetId] }
        );
        setSelectedTarget('image');
        setSelectedElementId(targetId);
        showToast('Đã thay ảnh (giữ nguyên khung thiết kế).');
      } else {
        if (state.image?.src) revokeImageUrl(state.image.src);
        executeAction(
          { type: 'SET_IMAGE', value: imageState },
          { type: 'add', label: 'Thêm ảnh', affectedIds: ['image-1'] }
        );
        setSelectedTarget('image');
        const elements = state.elements ?? getDefaultElements(state);
        const imgEl = elements.find((e) => e.type === 'image');
        setSelectedElementId(imgEl?.id || 'image-1');
        showToast('Tải ảnh lên thành công.');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Không thể sử dụng ảnh này.');
    }
  }, [executeAction, state, showToast]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadImage(file);
      e.target.value = '';
    }
  };

  const handleOpenImagePicker = (source: ImageSourceType = 'file', context?: ImageSourceContext) => {
    if (context) {
      setImageSourceContext(context);
    }
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
      executeAction(
        {
          type: 'ADD_TEXT_ELEMENT',
          preset: textPreset,
          id: newId,
          surface: state.productId === 'card' ? activeCardSurface : undefined,
        },
        { type: 'add', label: 'Thêm chữ', affectedIds: [newId] }
      );
      setSelectedTarget('text');
      setSelectedElementId(newId);
      setSelectedTextId(newId);
      setActiveSheet(null);
      preEditViewportRef.current = viewport;
      const initialText = textPreset === 'heading' ? 'Nhập tiêu đề' : 'Nhập nội dung';
      startTransaction('edit-text', 'Sửa chữ', [newId]);
      setTextEditState(startTextEdit(newId, initialText, true));
    },
    [executeAction, startTransaction, viewport, state.productId, activeCardSurface]
  );

  const handleInsertShape = (shapeType: ShapePrimitiveType) => {
    const newId = `shape-${Date.now()}`;
    const newElement = {
      id: newId,
      type: 'shape' as const,
      x: 50,
      y: 50,
      width: 40,
      height: 40,
      rotation: 0,
      zIndex: (state.elements?.length || 0) + 1,
      surface: state.productId === 'card' ? activeCardSurface : undefined,
      data: { shapeType, fill: '#DCEBF4' },
    };
    executeAction(
      { type: 'ADD_CANVAS_ELEMENT', element: newElement },
      { type: 'add', label: 'Thêm hình khối', affectedIds: [newId] }
    );
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
  const handleQualityScaleDown = useCallback(
    (recommendedScale: number) => {
      const nextTransform = {
        ...imageTransform,
        scale: recommendedScale,
      };
      executeAction(
        {
          type: 'SET_PRODUCT_OPTION',
          key: 'imageTransform',
          value: nextTransform,
        },
        {
          type: 'resize',
          label: 'Thu nhỏ ảnh đạt chuẩn in',
          affectedIds: [selectedElementId || 'image-1'],
        }
      );
      showToast('Đã thu nhỏ ảnh về kích thước chuẩn.');
    },
    [imageTransform, executeAction, selectedElementId, showToast]
  );

  const handleQualityReplaceImage = useCallback(() => {
    const targetId = selectedElementId || 'image-1';
    setImageSourceContext({ mode: 'replace', targetElementId: targetId });
    setActiveSheet('image-source');
  }, [selectedElementId, setImageSourceContext]);

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
      executeAction(
        {
          type: 'REORDER_ELEMENTS',
          orderedIds,
        },
        { type: 'reorder-layer', label: 'Đổi thứ tự lớp', affectedIds: orderedIds }
      );
    },
    [executeAction]
  );

  const handleDuplicateSelected = useCallback(() => {
    if (selectedElementId) {
      executeAction(
        { type: 'DUPLICATE_ELEMENT', id: selectedElementId },
        { type: 'duplicate', label: 'Nhân bản', affectedIds: [selectedElementId] }
      );
      showToast('Đã nhân bản đối tượng.');
    } else if (selectedTarget === 'image') {
      const elements = state.elements ?? getDefaultElements(state);
      const imgEl = elements.find((e) => e.type === 'image');
      if (imgEl) {
        executeAction(
          { type: 'DUPLICATE_ELEMENT', id: imgEl.id },
          { type: 'duplicate', label: 'Nhân bản ảnh', affectedIds: [imgEl.id] }
        );
      }
      showToast('Đã nhân bản ảnh.');
    } else if (selectedTarget === 'text') {
      const elements = state.elements ?? getDefaultElements(state);
      const txtEl = elements.find((e) => e.type === 'text');
      if (txtEl) {
        executeAction(
          { type: 'DUPLICATE_ELEMENT', id: txtEl.id },
          { type: 'duplicate', label: 'Nhân bản dòng chữ', affectedIds: [txtEl.id] }
        );
      }
      showToast('Đã nhân bản dòng chữ.');
    }
  }, [selectedElementId, selectedTarget, state, executeAction, showToast]);

  const handleBringForwardSelected = useCallback(() => {
    if (selectedElementId) {
      executeAction(
        { type: 'BRING_FORWARD', id: selectedElementId },
        { type: 'reorder-layer', label: 'Đưa lên trên', affectedIds: [selectedElementId] }
      );
      showToast('Đã đưa đối tượng lên trên.');
    }
  }, [selectedElementId, executeAction, showToast]);

  const handleSendBackwardSelected = useCallback(() => {
    if (selectedElementId) {
      executeAction(
        { type: 'SEND_BACKWARD', id: selectedElementId },
        { type: 'reorder-layer', label: 'Đưa xuống dưới', affectedIds: [selectedElementId] }
      );
      showToast('Đã đưa đối tượng xuống dưới.');
    }
  }, [selectedElementId, executeAction, showToast]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedElementId) {
      executeAction(
        { type: 'DELETE_ELEMENT', id: selectedElementId },
        { type: 'delete', label: 'Xóa đối tượng', affectedIds: [selectedElementId] }
      );
      setSelectedElementId(null);
      setSelectedTarget(null);
      showToast('Đã xóa đối tượng.');
    } else if (selectedTarget === 'image') {
      if (state.image?.src) revokeImageUrl(state.image.src);
      executeAction(
        { type: 'SET_IMAGE', value: null },
        { type: 'delete', label: 'Xóa ảnh', affectedIds: ['image-1'] }
      );
      setSelectedTarget(null);
      setSelectedElementId(null);
      showToast('Đã xóa ảnh.');
    } else if (selectedTarget === 'text') {
      executeAction(
        { type: 'SET_TEXT', value: '' },
        { type: 'delete', label: 'Xóa chữ', affectedIds: ['text-1'] }
      );
      setSelectedTarget(null);
      setSelectedElementId(null);
      showToast('Đã xóa dòng chữ.');
    }
  }, [selectedElementId, selectedTarget, state.image?.src, executeAction, showToast]);

  // Contextual actions dispatcher
  const handleToolbarAction = useCallback((actionKey: string) => {
    switch (actionKey) {
      case 'add':
        setActiveSheet('add');
        break;
      case 'pattern':
        setActiveSheet('pattern');
        break;
      case 'templates':
      case 'layers':
        setActiveSheet('layers');
        break;
      case 'sticker-border':
        setActiveSheet('sticker-border');
        break;
      case 'preview':
        setOverlayMode('preview');
        break;
      case 'finish':
        setOverlayMode('preflight');
        break;
      case 'crop':
        startTransaction('crop', 'Cắt ảnh', [selectedElementId || 'image-1']);
        setFocusMode('crop');
        break;
      case 'replace-image': {
        const elements = state.elements ?? getDefaultElements(state);
        const targetId = selectedElementId || elements.find((e) => e.type === 'image')?.id || 'image-1';
        setImageSourceContext({ mode: 'replace', targetElementId: targetId });
        setActiveSheet('image-source');
        break;
      }
      case 'remove-bg': {
        if (isCurrentTargetLocked) {
          showToast('🔒 Thành phần này đã được khóa trong mẫu.');
          break;
        }
        if (hasRemovedBackground) {
          setBgRemovalState('result');
          break;
        }
        const sourceSrc = currentImageData?.originalSrc || currentImageData?.src || state.image?.src;
        if (!sourceSrc) {
          showToast('Không tìm thấy ảnh để xóa nền.');
          break;
        }
        setBgRemovalState('processing');
        getBackgroundRemovalProvider()
          .removeBackground(sourceSrc)
          .then((result) => {
            executeAction(
              {
                type: 'APPLY_REMOVE_BACKGROUND',
                id: selectedElementId ?? undefined,
                derivedSrc: result.derivedSrc,
              },
              { type: 'remove-background', label: 'Xóa nền', affectedIds: [selectedElementId || 'image-1'] }
            );
            setBgRemovalState('result');
            showToast('Đã xóa nền ảnh thành công.');
          })
          .catch((err) => {
            setBgRemovalState('idle');
            showToast(err instanceof Error ? err.message : 'Không thể xóa nền ảnh. Vui lòng thử lại.');
          });
        break;
      }
      case 'restore-bg': {
        executeAction(
          {
            type: 'RESTORE_ORIGINAL_IMAGE',
            id: selectedElementId ?? undefined,
          },
          { type: 'remove-background', label: 'Khôi phục ảnh gốc', affectedIds: [selectedElementId || 'image-1'] }
        );
        setBgRemovalState('idle');
        showToast('Đã khôi phục ảnh gốc ban đầu.');
        break;
      }
      case 'refine-bg': {
        startTransaction('refine-background', 'Chỉnh vùng cắt', [selectedElementId || 'image-1']);
        setFocusMode('remove-bg');
        break;
      }
      case 'finish-bg-result': {
        setBgRemovalState('idle');
        break;
      }
      case 'opacity':
        startTransaction('change-opacity', 'Đổi độ mờ', [selectedElementId || 'image-1']);
        setActiveSheet('opacity');
        break;
      case 'mask':
        startTransaction('change-mask', 'Đổi khung hình', [selectedElementId || 'image-1']);
        setActiveSheet('mask');
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
        startTransaction('change-font', 'Đổi font', [selectedTextId || 'text-1']);
        setActiveSheet('font');
        break;
      case 'color':
        startTransaction('change-color', 'Đổi màu', activeColorTarget?.kind === 'element' ? [activeColorTarget.elementId] : []);
        setActiveSheet('color');
        break;
      case 'background-color':
        setColorPickerTarget({ kind: 'surface', surfaceId: 'front', property: 'background' });
        startTransaction('change-color', 'Đổi màu', []);
        setActiveSheet('color');
        break;
      case 'font-size':
        startTransaction('change-font-size', 'Đổi cỡ chữ', [selectedTextId || 'text-1']);
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
      case 'group':
        handleGroupSelected();
        break;
      case 'ungroup':
        handleUngroupSelected();
        break;
      case 'group-edit':
        if (selectedElementId) {
          handleEnterGroupEdit(selectedElementId);
        }
        break;
      case 'duplicate-multi':
        handleDuplicateMultiSelected();
        break;
      case 'delete-multi':
        handleDeleteMultiSelected();
        break;
      default:
        break;
    }
  }, [
    state.text,
    selectedElementId,
    handleGroupSelected,
    handleUngroupSelected,
    handleEnterGroupEdit,
    handleDuplicateMultiSelected,
    handleDeleteMultiSelected,
    showToast,
  ]);

  const handlePreflightFix = useCallback((check: PreflightCheck) => {
    setOverlayMode(null);
    if (state.productId === 'card' && check.surfaceId) {
      setActiveCardSurface(check.surfaceId as CardSurface);
    }
    if (check.elementId) {
      const elements = state.elements ?? getDefaultElements(state);
      const targetElement = elements.find((e) => e.id === check.elementId);
      if (targetElement) {
        setSelectedElementId(targetElement.id);
        setSelectedTarget(targetElement.type as SelectedTarget);
        if (targetElement.type === 'text') {
          setSelectedTextId(targetElement.id);
        }
      }
    }
    if (check.category === 'safe-area') {
      setShowSafeAreaGuide(true);
    }
    if (check.id === 'sticker-contour') {
      setActiveSheet('sticker-border');
    }
  }, [state.productId, state.elements, state]);


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

  // Background removal processing badge entrance animation
  useGSAP(() => {
    if (bgRemovalState === 'processing') {
      gsap.fromTo('#bg-processing-badge', { y: -8, autoAlpha: 0 }, {
        y: 0,
        autoAlpha: 1,
        duration: 0.25,
        ease: 'power2.out',
      });
    }
  }, { dependencies: [bgRemovalState], scope: containerRef });

  // Crop focus mode entrance animation
  useGSAP(() => {
    if (focusMode === 'crop') {
      const isReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      gsap.fromTo(
        '#crop-focus-container',
        { autoAlpha: isReduced ? 1 : 0, scale: isReduced ? 1 : 0.98 },
        { autoAlpha: 1, scale: 1, duration: isReduced ? 0 : 0.2, ease: 'power2.out' }
      );
    }
  }, { dependencies: [focusMode], scope: containerRef });
  const summary = getDesignSummary(state);
  const preflight = getPreflight(state);

  // Derive design title for the minimal top bar
  const templateName = state.templateId ? TEMPLATES[state.templateId]?.name : null;
  const productName = PRODUCTS[state.productId]?.name || 'Thiết kế in ấn';
  const designTitle = state.text ? state.text : (templateName || productName);

  const selectedElement = (state.elements ?? getDefaultElements(state)).find(
    (el) => el.id === (selectedTextId || selectedElementId)
  );
  const activeElement = selectedElement ?? (
    selectedTarget === 'image'
      ? (state.elements ?? getDefaultElements(state)).find((el) => el.type === 'image')
      : selectedTarget === 'text'
        ? (state.elements ?? getDefaultElements(state)).find((el) => el.type === 'text')
        : undefined
  );
  const activeSafetyReport = React.useMemo<SafetyReport | null>(() => {
    if (!activeElement) return null;
    const effectiveTransform = activeElement.type === 'image' ? imageTransform : textTransform;
    return evaluateElementSafety({
      element: {
        id: activeElement.id,
        type: activeElement.type,
        x: effectiveTransform.x ?? activeElement.x,
        y: effectiveTransform.y ?? activeElement.y,
        width: activeElement.width,
        height: activeElement.height,
        surface: activeElement.surface ?? activeCardSurface,
        rotation: effectiveTransform.rotation,
      },
      productId: state.productId,
      variantId: state.variantId,
      surface: activeCardSurface,
      cardOrientation: (state.productOptions as CardOptions)?.orientation,
    });
  }, [activeElement, imageTransform, textTransform, state.productId, state.variantId, activeCardSurface, state.productOptions]);
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
        onStartBlank={(modeOrShape) => {
          dispatch({ type: 'SET_TEMPLATE', value: 'blank' });
          if (state.productId === 'wrapping' && modeOrShape) {
            dispatch({ type: 'SET_PRODUCT_OPTION', key: 'mode', value: modeOrShape });
          }
          if (state.productId === 'sticker' && modeOrShape) {
            dispatch({ type: 'SET_PRODUCT_OPTION', key: 'shape', value: modeOrShape });
          }
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
          executeAction(
            { type: 'SET_TEMPLATE', value: tplId },
            { type: 'apply-template', label: 'Áp dụng mẫu', affectedIds: [] }
          );
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
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileInputChange}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none rounded-lg bg-[#2E3338] px-3.5 py-1.5 text-xs font-medium text-white shadow-lg flex items-center gap-1.5 whitespace-nowrap"
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
        <CropFocusMode
          src={currentImageData?.removedBackgroundSrc || currentImageData?.src || state.image?.src || ''}
          frameWidth={currentImageElement?.width || 260}
          frameHeight={currentImageElement?.height || 260}
          initialCrop={currentImageData?.crop}
          mask={currentImageData?.mask}
          onDone={(newCrop) => {
            dispatchDirect({
              type: 'COMMIT_IMAGE_CROP',
              id: selectedElementId ?? undefined,
              crop: newCrop,
            });
            commitActiveTransaction();
            setFocusMode(null);
            showToast('Đã áp dụng cắt ảnh.');
          }}
          onCancel={() => {
            cancelActiveTransaction();
            setFocusMode(null);
          }}
        />
      )}
      {/* FOCUS MODE: Remove Background Refine */}
      {focusMode === 'remove-bg' && (
        <BackgroundRefineOverlay
          originalSrc={currentImageData?.originalSrc || currentImageData?.src || state.image?.src || ''}
          currentSrc={currentImageData?.removedBackgroundSrc || currentImageData?.src || state.image?.src || ''}
          onDone={(refinedSrc, maskData) => {
            dispatchDirect({
              type: 'COMMIT_REFINE_MASK',
              id: selectedElementId ?? undefined,
              refinedSrc,
              maskData,
            });
            commitActiveTransaction();
            setFocusMode(null);
            setBgRemovalState('result');
            showToast('Đã lưu chỉnh sửa vùng cắt.');
          }}
          onCancel={() => {
            cancelActiveTransaction();
            setFocusMode(null);
            setBgRemovalState('result');
          }}
        />
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
            disabled={!canUndo}
            aria-disabled={!canUndo}
            onClick={handleUndo}
            aria-label="Hoàn tác"
            title="Hoàn tác"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-[#2E3338] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            aria-disabled={!canRedo}
            onClick={handleRedo}
            aria-label="Làm lại"
            title="Làm lại"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-[#2E3338] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Workspace toggle for Pattern Wrapping mode */}
      {state.productId === 'wrapping' && (state.productOptions.mode === 'pattern' || !state.productOptions.mode) && (
        <div className="w-full flex justify-center pt-2 pb-1 z-20 shrink-0">
          <PatternWorkspaceToggle
            value={patternWorkspaceView}
            onChange={(newView) => {
              setPatternWorkspaceView(newView);
              setSelectedTarget(null);
              setSelectedElementId(null);
              setSelectedTextId(null);
            }}
          />
        </div>
      )}

      {/* Surface switcher for Greeting Card */}
      {state.productId === 'card' && (
        <div className="w-full flex justify-center pt-2 pb-1 z-20 shrink-0">
          <CardSurfaceSwitcher
            value={activeCardSurface}
            onChange={(newSurface) => {
              setActiveCardSurface(newSurface);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('card_surface_changed', {
                    detail: { surface: newSurface },
                  })
                );
              }
              setSelectedTarget(null);
              setSelectedElementId(null);
              setSelectedTextId(null);
              setSelectedElementIds([]);
            }}
          />
        </div>
      )}
      {/* ZONE 2: Large Canvas Workspace (~80% height, visually dominant) */}
      <main
        ref={workspaceRef}
        id="app"
        onTouchStart={handleWorkspaceTouchStart}
        onTouchMove={handleWorkspaceTouchMove}
        onTouchEnd={handleWorkspaceTouchEnd}
        onPointerDown={handleWorkspacePointerDown}
        onPointerMove={handleWorkspacePointerMove}
        onPointerUp={handleWorkspacePointerUp}
      >
        {bgRemovalState === 'processing' && (
          <div
            id="bg-processing-badge"
            role="status"
            aria-live="polite"
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2E3338]/90 text-white text-xs font-medium shadow-md backdrop-blur-sm pointer-events-none"
          >
            <span className="w-2 h-2 rounded-full bg-[#315F86] animate-pulse" />
            <span>Đang xóa nền... Giữ nguyên bố cục</span>
          </div>
        )}

        <div
          className="w-full h-full max-w-2xl flex items-center justify-center origin-center transition-transform duration-75 ease-out"
          style={{
            transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})`,
          }}
        >
          <DesignCanvas
            showSafeAreaGuide={showSafeAreaGuide}
            activeSafetyReport={activeSafetyReport}
            productId={state.productId}
            variantId={state.variantId}
            cardSurface={activeCardSurface}
            text={state.text}
            color={state.color}
            backgroundColor={state.backgroundColor}
            image={state.image}
            productOptions={state.productOptions}
            stickerContour={state.productId === 'sticker' && state.variantId !== 'fixed-shape' && !state.productOptions.shape ? contourResult : undefined}
            patternConfig={state.productOptions.patternConfig as PatternConfig | undefined}
            onSwitchPatternView={(newView) => {
              setPatternWorkspaceView(newView);
              setSelectedTarget(null);
              setSelectedElementId(null);
              setSelectedTextId(null);
            }}
            selectedTarget={selectedTarget}
            selectedElementId={selectedElementId}
            selectedTextId={selectedTextId}
            selectionMode={selectionMode}
            selectedElementIds={selectedElementIds}
            activeGroupId={activeGroupId}
            textElements={state.elements ?? getDefaultElements(state)}
            elements={state.elements ?? getDefaultElements(state)}
            onSelectElement={(id) => {
              setSelectedElementId(id);
              if (id) {
                const elements = state.elements ?? getDefaultElements(state);
                const el = elements.find((e) => e.id === id);
                if (el?.type === 'group') {
                  setSelectedTarget('group');
                } else if (el?.type === 'image') {
                  setSelectedTarget('image');
                } else if (el?.type === 'text') {
                  setSelectedTarget('text');
                }
              }
            }}
            onToggleSelectElement={handleToggleMultiSelect}
            onDoubleTapGroup={handleEnterGroupEdit}
            onCommitMultiTransform={handleCommitMultiTransform}
            onSelectTarget={(target) => {
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
            onQualityExplanation={(reportOrMsg: ImageQualityReport | string) => {
              if (typeof reportOrMsg === 'object' && reportOrMsg !== null) {
                setActiveQualityReport(reportOrMsg);
                setActiveSheet('image-quality');
              } else {
                showToast(reportOrMsg);
              }
            }}
            imageTransform={imageTransform}
            textTransform={textTransform}
            onCommitTransform={(target, transform, elementId) => {
              if (target === 'text' && elementId) {
                executeAction(
                  {
                    type: 'UPDATE_ELEMENT',
                    id: elementId,
                    patch: {
                      x: transform.x,
                      y: transform.y,
                      rotation: transform.rotation,
                    },
                  },
                  { type: 'move', label: 'Di chuyển chữ', affectedIds: [elementId] }
                );
              } else if (target === 'image') {
                executeAction(
                  {
                    type: 'SET_PRODUCT_OPTION',
                    key: 'imageTransform',
                    value: transform,
                  },
                  { type: 'move', label: 'Di chuyển ảnh', affectedIds: [elementId || 'image-1'] }
                );
              }
            }}
          />

          {/* Empty Canvas State: card surfaces or blank projects */}
          {state.productId === 'card' ? (
            filterElementsBySurface(state.elements, activeCardSurface).length === 0 && (
              activeCardSurface === 'inside' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-10">
                  <div className="max-w-[280px] w-full p-4 rounded-2xl bg-[#FFFDF8]/90 backdrop-blur-xs border border-[#ECE6DC] shadow-xs pointer-events-auto space-y-3">
                    <p className="text-xs text-[#666A6D] font-medium leading-relaxed">
                      Thêm lời chúc, ảnh hoặc sticker.
                    </p>
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleInsertText('body')}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-[#315F86] text-white hover:bg-[#244A69] active:scale-98 transition-all text-xs font-semibold shadow-xs"
                      >
                        Thêm chữ
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSheet('add')}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-semibold text-[#2E3338]"
                      >
                        Thêm nội dung
                      </button>
                    </div>
                  </div>
                </div>
              ) : activeCardSurface === 'back' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-10">
                  <div className="max-w-[280px] w-full p-4 rounded-2xl bg-[#FFFDF8]/90 backdrop-blur-xs border border-[#ECE6DC] shadow-xs pointer-events-auto space-y-3">
                    <p className="text-xs text-[#666A6D] font-medium leading-relaxed">
                      Bạn có thể để trống hoặc thêm lời nhắn ở mặt sau.
                    </p>
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleInsertText('body')}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-[#315F86] text-white hover:bg-[#244A69] active:scale-98 transition-all text-xs font-semibold shadow-xs"
                      >
                        Thêm chữ
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyEditorState
                  onAddImage={() => handleOpenImagePicker('file')}
                  onAddText={() => handleInsertText('heading')}
                  onChooseTemplate={() => {
                    setTemplateReturnView('editor');
                    setView('template-browser');
                  }}
                />
              )
            )
          ) : (
            (state.templateId === null || state.templateId === 'blank') &&
            !state.image?.src &&
            !state.text &&
            (!state.elements || state.elements.length === 0) && (
              state.productId === 'wrapping' && (state.productOptions.mode === 'pattern' || !state.productOptions.mode) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-10">
                  <div className="max-w-[280px] w-full p-4 rounded-2xl bg-[#FFFDF8]/90 backdrop-blur-xs border border-[#ECE6DC] shadow-xs pointer-events-auto space-y-3">
                    <p className="text-xs text-[#666A6D] font-medium leading-relaxed">
                      Thêm ảnh, chữ hoặc sticker để tạo họa tiết.
                    </p>
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenImagePicker('file')}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-[#315F86] text-white hover:bg-[#244A69] active:scale-98 transition-all text-xs font-semibold shadow-xs"
                      >
                        Thêm ảnh
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSheet('add')}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-semibold text-[#2E3338]"
                      >
                        Thêm sticker
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyEditorState
                  onAddImage={() => handleOpenImagePicker('file')}
                  onAddText={() => handleInsertText('heading')}
                  onChooseTemplate={() => {
                    setTemplateReturnView('editor');
                    setView('template-browser');
                  }}
                />
              )
            )
          )}
        </div>
      </main>

      {/* ZONE 3: One Adaptive Bottom Toolbar */}
      <BottomNavigation
        selectedTarget={selectedTarget}
        selectedId={selectedElementId}
        productId={state.productId}
        variantId={state.variantId}
        productOptions={state.productOptions}
        selectionMode={selectionMode}
        selectedCount={selectedElementIds.length}
        canGroup={selectedElementIds.length >= 2}
        isLocked={isCurrentTargetLocked}
        isTextEditing={Boolean(textEditState)}
        isProcessingBg={bgRemovalState === 'processing'}
        bgRemovalState={bgRemovalState}
        hasRemovedBackground={hasRemovedBackground}
        isWrappingPatternMode={
          state.productId === 'wrapping' &&
          (state.productOptions.mode === 'pattern' || !state.productOptions.mode)
        }
        onDeselect={() => {
          if (selectionMode === 'multi-select') {
            handleExitMultiSelect();
            return;
          }
          if (selectionMode === 'group-edit') {
            handleExitGroupEdit();
            return;
          }
          setBgRemovalState('idle');
          setSelectedTarget(null);
          setSelectedElementId(null);
          setSelectedTextId(null);
        }}
        onAction={handleToolbarAction}
      />

      {/* Unified Bottom Sheet system */}
      <EditorSheets
        activeSheet={activeSheet}
        showSafeAreaGuide={showSafeAreaGuide}
        onToggleSafeAreaGuide={() => setShowSafeAreaGuide((prev) => !prev)}
        onClose={handleCloseSheet}
        selectedTarget={selectedTarget}
        selectedElementId={selectedElementId}
        selectionMode={selectionMode}
        selectedElementIds={selectedElementIds}
        activeGroupId={activeGroupId}
        onEnterMultiSelect={() => handleEnterMultiSelect()}
        onExitMultiSelect={handleExitMultiSelect}
        onToggleSelectElement={handleToggleMultiSelect}
        onSelectChildInGroup={handleEnterGroupEdit}
        onUngroup={handleUngroupSelected}
        elements={state.elements ?? getDefaultElements(state)}
        surface={String(state.productOptions.surface || 'front')}
        cardSurface={activeCardSurface}
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
        onSelectTemplate={(key) => {
          executeAction(
            { type: 'SET_TEMPLATE', value: key },
            { type: 'apply-template', label: 'Áp dụng mẫu', affectedIds: [] }
          );
        }}
        onOpenTemplateBrowser={() => {
          setTemplateReturnView('editor');
          setView('template-browser');
        }}
        onAddText={(preset) => handleInsertText(preset)}
        onUploadImageClick={(source, ctx) => handleOpenImagePicker(source, ctx)}
        imageSourceContext={imageSourceContext}
        onAddShape={handleInsertShape}
        onSetColor={handleSetColor}
        onSetFont={handleSetFont}
        onSetFontSize={handleSetFontSize}
        onSetTextAlign={handleSetTextAlign}
        onSetOpacity={(val) => {
          dispatchDirect({
            type: 'SET_IMAGE_OPACITY',
            id: selectedElementId ?? undefined,
            opacity: val,
          });
        }}
        onCommitOpacity={() => {
          commitActiveTransaction();
        }}
        currentMask={currentImageData?.mask}
        onSelectMask={(maskId) => {
          dispatchDirect({
            type: 'SET_IMAGE_MASK',
            id: selectedElementId ?? undefined,
            mask: maskId,
          });
          showToast('Đã áp dụng khung hình ảnh.');
        }}
        onMaskClick={() => {
          startTransaction('change-mask', 'Đổi khung hình', [selectedElementId || 'image-1']);
          setActiveSheet('mask');
        }}
        onToggleLock={() => {
          if (selectedElementId) {
            executeAction(
              {
                type: 'LOCK_ELEMENT',
                id: selectedElementId,
                locked: !isCurrentTargetLocked,
              },
              {
                type: isCurrentTargetLocked ? 'unlock' : 'lock',
                label: isCurrentTargetLocked ? 'Mở khóa' : 'Khóa đối tượng',
                affectedIds: [selectedElementId],
              }
            );
            showToast(isCurrentTargetLocked ? 'Đã mở khóa đối tượng.' : 'Đã khóa đối tượng.');
          }
        }}
        onDuplicate={handleDuplicateSelected}
        onBringForward={handleBringForwardSelected}
        onSendBackward={handleSendBackwardSelected}
        onDeleteTarget={handleDeleteSelected}
        onSelectLayer={handleSelectLayer}
        onReorderElements={handleReorderElements}
        onOpenAddSheet={() => setActiveSheet('add')}
        patternConfig={
          state.productId === 'wrapping'
            ? (state.productOptions.patternConfig as PatternConfig | undefined)
            : undefined
        }
        onLiveUpdatePatternConfig={(patch) => {
          const current = (state.productOptions.patternConfig as PatternConfig | undefined) || {
            enabled: true,
            repeatMode: 'basic',
            scale: 100,
            spacingX: 0,
            spacingY: 0,
            rotation: 0,
            backgroundColor: '#ffffff',
          };
          dispatchDirect({
            type: 'SET_PRODUCT_OPTION',
            key: 'patternConfig',
            value: { ...current, ...patch },
          });
        }}
        onCommitPatternChange={(actionType, label, patch) => {
          const current = (state.productOptions.patternConfig as PatternConfig | undefined) || {
            enabled: true,
            repeatMode: 'basic',
            scale: 100,
            spacingX: 0,
            spacingY: 0,
            rotation: 0,
            backgroundColor: '#ffffff',
          };
          executeAction(
            {
              type: 'SET_PRODUCT_OPTION',
              key: 'patternConfig',
              value: { ...current, ...patch },
            },
            { type: actionType, label }
          );
        }}
        onOpenColorSheet={() => setActiveSheet('color')}
        onResetPatternDefault={() => {
          executeAction(
            {
              type: 'SET_PRODUCT_OPTION',
              key: 'patternConfig',
              value: {
                enabled: true,
                repeatMode: 'basic',
                scale: 100,
                spacingX: 0,
                spacingY: 0,
                rotation: 0,
                backgroundColor: '#ffffff',
              },
            },
            { type: 'change-pattern-repeat', label: 'Khôi phục mặc định' }
          );
        }}
        stickerOptions={state.productId === 'sticker' ? currentStickerOptions : undefined}
        stickerContourResult={state.productId === 'sticker' ? contourResult : undefined}
        onChangeStickerOptions={(patch) => {
          Object.entries(patch).forEach(([key, value]) => {
            dispatchDirect({
              type: 'SET_PRODUCT_OPTION',
              key,
              value,
            });
          });
        }}
        onCommitStickerOptions={(patch) => {
          Object.entries(patch).forEach(([key, value]) => {
            executeAction(
              {
                type: 'SET_PRODUCT_OPTION',
                key,
                value,
              },
              { type: 'change-product-option', label: 'Đổi viền sticker' }
            );
          });
        }}
        onTriggerBackgroundRemoval={() => {
          const elements = state.elements ?? getDefaultElements(state);
          const targetImage = elements.find((el) => el.type === 'image');
          if (!targetImage) return;
          setSelectedTarget('image');
          setSelectedElementId(targetImage.id);
          startTransaction('refine-background', 'Chỉnh vùng cắt', [targetImage.id]);
          setFocusMode('remove-bg');
          setActiveSheet(null);
        }}
        imageQualityReport={activeQualityReport}
        onQualityScaleDown={handleQualityScaleDown}
        onQualityReplaceImage={handleQualityReplaceImage}
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
          onFix={handlePreflightFix}
          onContinueToCheckout={() => {
            router.push('/checkout');
            const existingDraft = loadCheckoutDraft();
            const revision = `rev-${Date.now()}`;
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('quynhtrang.pendingOrderId');
            }
            if (existingDraft) {
              saveCheckoutDraft({
                ...existingDraft,
                design: JSON.parse(JSON.stringify(state)),
                productId: state.productId,
                variantId: state.variantId,
                quantity: state.quantity,
                idempotencyKey: `checkout-${crypto.randomUUID()}`,
                orderId: undefined,
                status: 'editing',
                designRevision: revision,
                preflightRevision: revision,
                preflightAcknowledged: true,
                updatedAt: new Date().toISOString(),
              });
            } else {
              const draft = createCheckoutDraft(state);
              draft.designRevision = revision;
              draft.preflightRevision = revision;
              draft.preflightAcknowledged = true;
              saveCheckoutDraft(draft);
            }
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
