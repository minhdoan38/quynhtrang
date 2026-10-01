'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, Check, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import {
  FONT_REGISTRY,
  type FontItem,
  findFontByFamily,
  getDefaultFont,
  getPublishedFontsAsync,
  searchFonts,
  getRecentFontIds,
  addRecentFontId,
  loadFont,
} from '@/lib/fonts';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export interface FontBrowserContentProps {
  currentFamily: string;
  onPreviewFont: (family: string, fontId: string, faceId?: string) => void;
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
  const [publishedFonts, setPublishedFonts] = useState<FontItem[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const defaultFont = useMemo(() => getDefaultFont(), []);

  const currentFontItem = useMemo(() => {
    return publishedFonts.find((font) => font.family === currentFamily)
      ?? findFontByFamily(currentFamily)
      ?? { ...defaultFont, id: `current-${currentFamily}`, family: currentFamily, name: currentFamily, status: 'archived' as const };
  }, [currentFamily, defaultFont, publishedFonts]);

  // Load recent font IDs on mount
  useEffect(() => {
    setRecentIds(getRecentFontIds());
  }, []);
  useEffect(() => {
    let active = true;
    setIsCatalogLoading(true);
    setCatalogError(false);
    if (!isSupabaseConfigured()) {
      setPublishedFonts(FONT_REGISTRY.filter((font) => font.status === 'published'));
      setIsCatalogLoading(false);
      return () => { active = false; };
    }
    getPublishedFontsAsync()
      .then((fonts) => {
        if (!active) return;
        setPublishedFonts(fonts);
        setIsCatalogLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCatalogError(true);
        setIsCatalogLoading(false);
      });
    return () => { active = false; };
  }, [catalogAttempt]);

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
          onPreviewFont(font.family, font.id, font.faceId);
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
    (font: FontItem) => {
      void handleSelectFont(font);
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
      <div
        key={`${isRecentSection ? 'recent-' : ''}${font.id}`}
        className={`w-full flex items-center rounded-xl border transition-all min-h-[58px] ${isSelected
          ? 'border-[#315F86] bg-[#DCEBF4]/40 shadow-xs'
          : 'border-[#ECE6DC] bg-white hover:bg-[#F8F3E8]'
          }`}
      >
        <button
          ref={isSelected && !isRecentSection ? selectedRowRef : undefined}
          type="button"
          role="option"
          aria-selected={isSelected}
          disabled={font.status === 'archived'}
          onClick={() => handleSelectFont(font)}
          className="min-w-0 flex flex-1 items-center justify-between p-3 text-left active:scale-[0.99] disabled:cursor-default"
        >
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#2E3338] truncate">{font.name}</span>
              {isLoading && <span className="inline-flex items-center gap-1 text-xs text-[#315F86] font-medium animate-pulse"><Loader2 className="w-3 h-3 animate-spin" />Đang tải font...</span>}
              {isFailed && <span className="inline-flex items-center gap-1 text-xs text-[#B3535D] font-medium"><AlertCircle className="w-3 h-3" />Lỗi tải</span>}
              {font.status === 'archived' && <span className="text-[10px] text-[#666A6D]">Đã lưu trữ · không dùng cho chữ mới</span>}
            </div>
            <div className="text-base text-[#2E3338] mt-0.5 truncate tracking-normal" style={{ fontFamily: font.family }}>
              {font.sampleText || 'Cảm ơn Việt Nam'}
            </div>
          </div>
          {isSelected && <span className="w-6 h-6 rounded-full bg-[#315F86] text-white flex items-center justify-center"><Check className="w-3.5 h-3.5" /></span>}
        </button>
        {isFailed && (
          <button
            type="button"
            onClick={() => handleRetryLoad(font)}
            className="mr-2 p-1 rounded text-xs text-[#315F86] hover:bg-[#DCEBF4] inline-flex items-center gap-1 font-semibold"
            title="Thử lại"
          >
            <RotateCcw className="w-3.5 h-3.5" /><span>Thử lại</span>
          </button>
        )}
      </div>
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
        {isCatalogLoading ? (
          <div role="status" className="flex items-center justify-center gap-2 p-8 text-xs text-[#666A6D]">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thư viện font...
          </div>
        ) : catalogError ? (
          <div role="alert" className="p-6 text-center space-y-3 rounded-xl border border-[#F5C7C0] bg-[#FDF0ED]">
            <p className="text-xs font-medium text-[#A63626]">Không thể tải thư viện font.</p>
            <button
              type="button"
              onClick={() => setCatalogAttempt((attempt) => attempt + 1)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#315F86]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Thử lại
            </button>
          </div>
        ) : (
          <>
            {currentFontItem.status === 'archived' && !publishedFonts.some((font) => font.id === currentFontItem.id) && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[#666A6D] uppercase tracking-wider block px-1">Đang dùng</span>
                {renderFontRow(currentFontItem)}
              </div>
            )}
            {recentFontItems.length > 0 && !query.trim() && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[#666A6D] uppercase tracking-wider block px-1">Gần đây</span>
                <div className="space-y-1.5">{recentFontItems.map((font) => renderFontRow(font, true))}</div>
              </div>
            )}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-[#666A6D] uppercase tracking-wider block px-1">
                {query.trim() ? 'Kết quả tìm kiếm' : 'Tất cả font'}
              </span>
              {filteredFonts.length === 0 ? (
                <div className="p-6 text-center space-y-2 rounded-xl border border-dashed border-[#DDD6CC] bg-[#FFFDF8]">
                  <p className="text-xs font-medium text-[#666A6D]">Không tìm thấy font phù hợp.</p>
                  {query.trim() && <button type="button" onClick={() => setQuery('')} className="text-xs font-semibold text-[#315F86] hover:underline">Xóa tìm kiếm</button>}
                </div>
              ) : (
                <div className="space-y-1.5">{filteredFonts.map((font) => renderFontRow(font))}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
