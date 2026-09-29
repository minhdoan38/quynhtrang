import React from 'react';
import {
  Plus,
  LayoutTemplate,
  Layers,
  Eye,
  ArrowRight,
  ChevronLeft,
  Crop,
  ImagePlus,
  Wand2,
  SunMedium,
  CaseSensitive,
  Palette,
  AArrowUp,
  AlignCenter,
  MoreHorizontal,
  RotateCcw,
  Scissors,
  Check,
  Loader2,
  FolderPlus,
  FolderOpen,
  Copy,
  Trash2,
  Grid2x2,
} from 'lucide-react';
export type SelectedTarget = 'image' | 'text' | 'group' | null;

interface BottomNavigationProps {
  selectedTarget: SelectedTarget;
  selectedId?: string | null;
  productId?: string;
  selectionMode?: 'default' | 'multi-select' | 'group-edit';
  selectedCount?: number;
  canGroup?: boolean;
  isLocked?: boolean;
  isTextEditing?: boolean;
  isProcessingBg?: boolean;
  bgRemovalState?: 'idle' | 'processing' | 'result';
  hasRemovedBackground?: boolean;
  isWrappingPatternMode?: boolean;
  onDeselect: () => void;
  onAction: (actionKey: string) => void;
}

export function BottomNavigation({
  selectedTarget,
  selectedId = null,
  productId,
  selectionMode = 'default',
  selectedCount = 0,
  canGroup = false,
  isLocked = false,
  isTextEditing = false,
  isProcessingBg = false,
  bgRemovalState = 'idle',
  hasRemovedBackground = false,
  isWrappingPatternMode = false,
  onDeselect,
  onAction,
}: BottomNavigationProps) {
  if (isTextEditing) return null;

  // Dedicated Multi-select Toolbar
  if (selectionMode === 'multi-select') {
    return (
      <nav
        aria-label="Thanh công cụ chọn nhiều"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFDF8]/95 backdrop-blur-md border-t border-[#ECE6DC] shadow-lg pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-md mx-auto px-3 py-1.5 flex items-center justify-between gap-1.5 min-h-[58px]">
          {/* Item count badge */}
          <div className="flex items-center gap-1 min-w-0 pr-1">
            <span className="text-xs font-semibold text-[#2E3338] whitespace-nowrap">
              {selectedCount} mục đã chọn
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={!canGroup}
              onClick={() => onAction('group')}
              aria-label="Tạo nhóm các mục đã chọn"
              className={`flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1.5 rounded-lg active:scale-95 transition-all ${canGroup
                ? 'text-[#315F86] hover:bg-[#DCEBF4]/40 font-medium'
                : 'text-[#666A6D]/40 cursor-not-allowed'
                }`}
            >
              <FolderPlus className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5">Nhóm</span>
            </button>

            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => onAction('duplicate-multi')}
              aria-label="Nhân bản các mục đã chọn"
              className={`flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1.5 rounded-lg active:scale-95 transition-all ${selectedCount > 0
                ? 'text-[#2E3338] hover:bg-[#F8F3E8]'
                : 'text-[#666A6D]/40 cursor-not-allowed'
                }`}
            >
              <Copy className="w-4 h-4 text-[#315F86]" />
              <span className="text-[10px] font-medium mt-0.5">Nhân bản</span>
            </button>

            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => onAction('delete-multi')}
              aria-label="Xóa các mục đã chọn"
              className={`flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1.5 rounded-lg active:scale-95 transition-all ${selectedCount > 0
                ? 'text-[#B3535D] hover:bg-[#F6DADD]/40'
                : 'text-[#666A6D]/40 cursor-not-allowed'
                }`}
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5">Xóa</span>
            </button>

            <button
              type="button"
              onClick={() => onAction('more')}
              aria-label="Thao tác khác"
              className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
            >
              <MoreHorizontal className="w-4 h-4 text-[#666A6D]" />
              <span className="text-[10px] font-medium mt-0.5">•••</span>
            </button>

            <button
              type="button"
              onClick={onDeselect}
              aria-label="Hoàn tất chọn nhiều"
              className="flex items-center justify-center gap-1 h-[38px] px-3 rounded-lg bg-[#315F86] text-white hover:bg-[#244A69] active:scale-95 transition-all text-xs font-semibold shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Xong</span>
            </button>
          </div>
        </div>
      </nav>
    );
  }
  // If target is selected, render Contextual Toolbar
  if (selectedTarget !== null) {
    return (
      <nav
        aria-label="Thanh công cụ đối tượng"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFDF8]/95 backdrop-blur-md border-t border-[#ECE6DC] shadow-lg pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-md mx-auto px-2 py-1.5 flex items-center justify-between gap-1 min-h-[58px]">
          {/* Back/Close context button */}
          <button
            type="button"
            onClick={onDeselect}
            aria-label="Bỏ chọn và quay lại thanh công cụ chính"
            title="Quay lại"
            className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-2 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight">Xong</span>
          </button>

          {isLocked ? (
            <div className="flex-1 flex items-center justify-center px-2 text-xs text-[#666A6D] font-medium">
              <span>🔒 Thành phần này đã được khóa trong mẫu.</span>
            </div>
          ) : selectedTarget === 'image' ? (
            isProcessingBg || bgRemovalState === 'processing' ? (
              <div className="flex-1 flex items-center justify-center gap-2 py-1 px-3 text-xs font-semibold text-[#315F86]">
                <Loader2 className="w-4 h-4 animate-spin text-[#315F86]" />
                <span>Đang xóa nền...</span>
              </div>
            ) : bgRemovalState === 'result' ? (
              <div className="flex-1 flex items-center justify-around gap-1">
                <button
                  type="button"
                  onClick={() => onAction('restore-bg')}
                  className="flex flex-col items-center justify-center min-w-[50px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
                >
                  <RotateCcw className="w-4 h-4 text-[#666A6D]" />
                  <span className="text-[10px] font-medium mt-0.5">Khôi phục nền</span>
                </button>

                <button
                  type="button"
                  onClick={() => onAction('refine-bg')}
                  className="flex flex-col items-center justify-center min-w-[50px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
                >
                  <Scissors className="w-4 h-4 text-[#315F86]" />
                  <span className="text-[10px] font-medium mt-0.5">Chỉnh vùng cắt</span>
                </button>

                <button
                  type="button"
                  onClick={() => onAction('finish-bg-result')}
                  className="flex items-center justify-center gap-1 h-[38px] px-3.5 rounded-lg bg-[#315F86] text-white hover:bg-[#244A69] active:scale-95 transition-all text-xs font-semibold shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Xong</span>
                </button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-around gap-0.5">
                <button
                  type="button"
                  onClick={() => onAction('crop')}
                  className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
                >
                  <Crop className="w-4 h-4 text-[#315F86]" />
                  <span className="text-[11px] font-medium mt-0.5">Cắt</span>
                </button>

                <button
                  type="button"
                  onClick={() => onAction('replace-image')}
                  className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
                >
                  <ImagePlus className="w-4 h-4 text-[#315F86]" />
                  <span className="text-[11px] font-medium mt-0.5">Thay ảnh</span>
                </button>

                <button
                  type="button"
                  onClick={() => onAction('remove-bg')}
                  className={`flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg active:scale-95 transition-all ${hasRemovedBackground
                    ? 'text-[#315F86] bg-[#DCEBF4]/40 font-semibold'
                    : 'text-[#2E3338] hover:bg-[#F8F3E8]'
                    }`}
                >
                  <Wand2 className="w-4 h-4 text-[#315F86]" />
                  <span className="text-[11px] font-medium mt-0.5">
                    {hasRemovedBackground ? 'Đã tách nền' : 'Xóa nền'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onAction('opacity')}
                  className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
                >
                  <SunMedium className="w-4 h-4 text-[#315F86]" />
                  <span className="text-[11px] font-medium mt-0.5">Độ mờ</span>
                </button>

                <button
                  type="button"
                  onClick={() => onAction('more')}
                  aria-label="Thao tác khác"
                  className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
                >
                  <MoreHorizontal className="w-4 h-4 text-[#666A6D]" />
                  <span className="text-[11px] font-medium mt-0.5">•••</span>
                </button>
              </div>
            )
          ) : selectedTarget === 'group' ? (
            <div className="flex-1 flex items-center justify-around gap-0.5">
              <button
                type="button"
                onClick={() => onAction('group-edit')}
                className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
              >
                <FolderOpen className="w-4 h-4 text-[#315F86]" />
                <span className="text-[11px] font-medium mt-0.5">Chỉnh nhóm</span>
              </button>

              <button
                type="button"
                onClick={() => onAction('duplicate')}
                className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
              >
                <Copy className="w-4 h-4 text-[#315F86]" />
                <span className="text-[11px] font-medium mt-0.5">Nhân bản</span>
              </button>

              <button
                type="button"
                onClick={() => onAction('delete')}
                className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#B3535D] hover:bg-[#F6DADD]/40 active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-[11px] font-medium mt-0.5">Xóa</span>
              </button>

              <button
                type="button"
                onClick={() => onAction('more')}
                aria-label="Thao tác khác"
                className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
              >
                <MoreHorizontal className="w-4 h-4 text-[#666A6D]" />
                <span className="text-[11px] font-medium mt-0.5">•••</span>
              </button>
            </div>
          ) : (
            /* text selected */
            <div className="flex-1 flex items-center justify-around gap-0.5">
              <button
                type="button"
                onClick={() => onAction('font')}
                className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
              >
                <CaseSensitive className="w-4 h-4 text-[#315F86]" />
                <span className="text-[11px] font-medium mt-0.5">Font</span>
              </button>

              <button
                type="button"
                onClick={() => onAction('color')}
                className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
              >
                <Palette className="w-4 h-4 text-[#315F86]" />
                <span className="text-[11px] font-medium mt-0.5">Màu</span>
              </button>

              <button
                type="button"
                onClick={() => onAction('font-size')}
                className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
              >
                <AArrowUp className="w-4 h-4 text-[#315F86]" />
                <span className="text-[11px] font-medium mt-0.5">Cỡ chữ</span>
              </button>

              <button
                type="button"
                onClick={() => onAction('align')}
                className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
              >
                <AlignCenter className="w-4 h-4 text-[#315F86]" />
                <span className="text-[11px] font-medium mt-0.5">Căn chỉnh</span>
              </button>

              <button
                type="button"
                onClick={() => onAction('more')}
                aria-label="Thao tác khác"
                className="flex flex-col items-center justify-center min-w-[44px] h-[48px] px-1 rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all"
              >
                <MoreHorizontal className="w-4 h-4 text-[#666A6D]" />
                <span className="text-[11px] font-medium mt-0.5">•••</span>
              </button>
            </div>
          )}
        </div>
      </nav>
    );
  }

  // Default state: 5 primary actions: Thêm, Mẫu, Lớp, Xem thử, Xong
  return (
    <nav
      aria-label="Thanh công cụ chính"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#FFFDF8]/95 backdrop-blur-md border-t border-[#ECE6DC] shadow-lg pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-md mx-auto px-2 py-1.5 flex items-center justify-between gap-1 min-h-[58px]">
        <button
          type="button"
          onClick={() => onAction('add')}
          className="flex-1 flex flex-col items-center justify-center min-w-[44px] h-[48px] rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
          <Plus className="w-4 h-4 text-[#315F86]" />
          <span className="text-[11px] font-medium mt-0.5">Thêm</span>
        </button>

        <button
          type="button"
          onClick={() => onAction('templates')}
          className="flex-1 flex flex-col items-center justify-center min-w-[44px] h-[48px] rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
          <LayoutTemplate className="w-4 h-4 text-[#315F86]" />
          <span className="text-[11px] font-medium mt-0.5">Mẫu</span>
        </button>

        <button
          type="button"
          onClick={() => onAction('layers')}
          className="flex-1 flex flex-col items-center justify-center min-w-[44px] h-[48px] rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
          <Layers className="w-4 h-4 text-[#315F86]" />
          <span className="text-[11px] font-medium mt-0.5">Lớp</span>
        </button>

        {isWrappingPatternMode && (
          <button
            type="button"
            onClick={() => onAction('pattern')}
            className="flex-1 flex flex-col items-center justify-center min-w-[44px] h-[48px] rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
          >
            <Grid2x2 className="w-4 h-4 text-[#315F86]" />
            <span className="text-[11px] font-medium mt-0.5">Họa tiết</span>
          </button>
        )}

        {productId === 'sticker' && !selectedId && (
          <button
            type="button"
            onClick={() => onAction('sticker-border')}
            className="flex-1 flex flex-col items-center justify-center min-w-[44px] h-[48px] rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
          >
            <Scissors className="w-4 h-4 text-[#315F86]" />
            <span className="text-[11px] font-medium mt-0.5">Viền sticker</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onAction('preview')}
          className="flex-1 flex flex-col items-center justify-center min-w-[44px] h-[48px] rounded-lg text-[#2E3338] hover:bg-[#F8F3E8] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
          <Eye className="w-4 h-4 text-[#315F86]" />
          <span className="text-[11px] font-medium mt-0.5">Xem thử</span>
        </button>
        {/* Xong is the primary forward action */}
        <button
          type="button"
          onClick={() => onAction('finish')}
          className="flex-1 flex items-center justify-center gap-1 min-w-[60px] h-[40px] px-3 rounded-lg bg-[#315F86] hover:bg-[#244A69] text-white shadow-xs active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]"
        >
          <span className="text-xs font-semibold">Xong</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </nav>
  );
}
