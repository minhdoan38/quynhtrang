'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, Check, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import {
  FontItem,
  getPublishedFonts,
  findFontByFamily,
  getDefaultFont,
  searchFonts,
  getRecentFontIds,
  addRecentFontId,
  loadFont,
} from '@/lib/fonts';

export interface FontBrowserContentProps {
  currentFamily: string;
  onPreviewFont: (family: string, fontId: string) => void;
  onClose: () => void;
  onExpandDetent?: () => void;
}

export function FontBrowserContent({
  currentFamily,
  onPreviewFont,
  onClose,
  onExpandDetent,
}: FontBrowserContentProps) {
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const [failedIds, setFailedIds] = useState<Record<string, boolean>>({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const publishedFonts = useMemo(() => getPublishedFonts(), []);
  const defaultFont = useMemo(() => getDefaultFont(), []);

  // Determine current active font item
  const currentFontItem = useMemo(() => {
    return findFontByFamily(currentFamily) || defaultFont;
  }, [currentFamily, defaultFont]);

  // Load recent font IDs on mount
  useEffect(() => {
    setRecentIds(getRecentFontIds());
  }, []);

  // Filtered fonts based on search
  const filteredFonts = useMemo(() => {
    return searchFonts(query, publishedFonts);
  }, [query, publishedFonts]);

  // Recent font items (only when query is empty)
  const recentFontItems = useMemo(() => {
    if (query.trim()) return [];
    return recentIds
      .map((id) => publishedFonts.find((f) => f.id === id))
      .filter((f): f is FontItem => Boolean(f));
  }, [recentIds, publishedFonts, query]);

  // Lazy load the current font immediately
  useEffect(() => {
    if (currentFontItem) {
      loadFont(currentFontItem);
    }
  }, [currentFontItem]);

  // Scroll current selected font into view when browser opens
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedRowRef.current && listContainerRef.current) {
        selectedRowRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Font selection handler
  const handleSelectFont = useCallback(
    async (font: FontItem) => {
      // Set loading state if not loaded
      setLoadingIds((prev) => ({ ...prev, [font.id]: true }));
      setFailedIds((prev) => {
        const next = { ...prev };
        delete next[font.id];
        return next;
      });

      try {
        const success = await loadFont(font);
        setLoadingIds((prev) => {
          const next = { ...prev };
          delete next[font.id];
          return next;
        });

        if (success) {
          // Immediately update canvas preview
          onPreviewFont(font.family, font.id);
          // Update recent fonts
          const nextRecents = addRecentFontId(font.id);
          setRecentIds(nextRecents);
        } else {
          setFailedIds((prev) => ({ ...prev, [font.id]: true }));
        }
      } catch {
        setLoadingIds((prev) => {
          const next = { ...prev };
          delete next[font.id];
          return next;
        });
        setFailedIds((prev) => ({ ...prev, [font.id]: true }));
      }
    },
    [onPreviewFont]
  );

  const handleRetryLoad = useCallback(
    (e: React.MouseEvent, font: FontItem) => {
      e.stopPropagation();
      handleSelectFont(font);
    },
    [handleSelectFont]
  );

  const handleSearchFocus = () => {
    onExpandDetent?.();
  };

  const renderFontRow = (font: FontItem, isRecentSection = false) => {
    const isSelected = currentFontItem.id === font.id;
    const isLoading = Boolean(loadingIds[font.id]);
    const isFailed = Boolean(failedIds[font.id]);

    return (
      <button
        key={`${isRecentSection ? 'recent-' : ''}${font.id}`}
        ref={isSelected && !isRecentSection ? selectedRowRef : undefined}
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={() => handleSelectFont(font)}
        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all min-h-[58px] ${
          isSelected
            ? 'border-[#315F86] bg-[#DCEBF4]/40 shadow-xs'
            : 'border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] active:scale-[0.99]'
        }`}
      >
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#2E3338] truncate">
              {font.name}
            </span>
            {isLoading && (
              <span className="inline-flex items-center gap-1 text-xs text-[#315F86] font-medium animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                Đang tải font...
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-1 text-xs text-[#B3535D] font-medium">
                <AlertCircle className="w-3 h-3" />
                Lỗi tải
              </span>
            )}
          </div>
          {/* Vietnamese sample text rendered in that specific font */}
          <div
            className="text-base text-[#2E3338] mt-0.5 truncate tracking-normal"
            style={{ fontFamily: font.family }}
          >
            {font.sampleText || 'Cảm ơn Việt Nam'}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          {isFailed && (
            <button
              type="button"
              onClick={(e) => handleRetryLoad(e, font)}
              className="p-1 rounded text-xs text-[#315F86] hover:bg-[#DCEBF4] inline-flex items-center gap-1 font-semibold"
              title="Thử lại"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Thử lại</span>
            </button>
          )}
          {isSelected && (
            <div className="w-6 h-6 rounded-full bg-[#315F86] text-white flex items-center justify-center">
              <Check className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full max-h-[82vh] text-[#2E3338] select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 px-1 border-b border-[#ECE6DC] shrink-0">
        <h2 className="text-sm font-bold text-[#2E3338]">Kiểu chữ</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng chọn font"
          className="p-1.5 rounded-lg text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="pt-3 pb-2 px-1 shrink-0">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#666A6D] absolute left-3 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleSearchFocus}
            placeholder="Tìm font..."
            aria-label="Tìm kiểu chữ theo tên"
            className="w-full h-11 pl-9 pr-8 rounded-xl border border-[#DDD6CC] bg-white text-xs text-[#2E3338] placeholder:text-[#666A6D] focus:outline-none focus:border-[#315F86] focus:ring-1 focus:ring-[#315F86] transition-all"
          />
          {query.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                searchInputRef.current?.focus();
              }}
              aria-label="Xóa từ khóa tìm kiếm"
              className="absolute right-2.5 p-1 rounded-md text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Font List */}
      <div
        ref={listContainerRef}
        role="listbox"
        aria-label="Danh sách kiểu chữ khả dụng"
        className="flex-1 overflow-y-auto px-1 py-1 space-y-4 overscroll-contain"
      >
        {/* Section 1: Recent Fonts (only if exists and no search query) */}
        {recentFontItems.length > 0 && !query.trim() && (
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[#666A6D] uppercase tracking-wider block px-1">
              Gần đây
            </span>
            <div className="space-y-1.5">
              {recentFontItems.map((f) => renderFontRow(f, true))}
            </div>
          </div>
        )}

        {/* Section 2: All Fonts / Search Results */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-[#666A6D] uppercase tracking-wider block px-1">
            {query.trim() ? 'Kết quả tìm kiếm' : 'Tất cả font'}
          </span>

          {filteredFonts.length === 0 ? (
            <div className="p-6 text-center space-y-2 rounded-xl border border-dashed border-[#DDD6CC] bg-[#FFFDF8]">
              <p className="text-xs font-medium text-[#666A6D]">
                Không tìm thấy font phù hợp.
              </p>
              {query.trim() && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="inline-flex items-center justify-center text-xs font-semibold text-[#315F86] hover:underline"
                >
                  Xóa tìm kiếm
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredFonts.map((f) => renderFontRow(f, false))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
