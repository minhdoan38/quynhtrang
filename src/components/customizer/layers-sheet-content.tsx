'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  GripVertical,
  Type,
  Image as ImageIcon,
  Smile,
  Square,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Lock,
  Plus,
  X,
} from 'lucide-react';
import type { CanvasElement } from '@/lib/product-state';
import {
  getLayerDisplayName,
  getSurfaceLayers,
} from '@/lib/layers';

interface LayersSheetContentProps {
  elements: CanvasElement[];
  selectedId: string | null;
  surface?: string;
  onSelect: (id: string | null) => void;
  onReorder: (orderedIds: string[]) => void;
  onAddClick: () => void;
  onClose: () => void;
  imageThumbnailSrc?: string;
  onLockedFeedback?: () => void;
}

export function LayersSheetContent({
  elements,
  selectedId,
  surface = 'front',
  onSelect,
  onReorder,
  onAddClick,
  onClose,
  imageThumbnailSrc,
  onLockedFeedback,
}: LayersSheetContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Filter elements by active surface (Card front vs inside)
  const surfaceElements = getSurfaceLayers(elements, surface);

  // Stacking order: top row in list = visually in front (highest zIndex first)
  const sortedLayers = [...surfaceElements].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

  const toggleGroup = useCallback((groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Drag-to-reorder handlers exclusively initiated via dedicated drag handle
  const handleDragStart = (id: string, index: number, e: React.PointerEvent) => {
    e.stopPropagation();
    const el = surfaceElements.find((item) => item.id === id);
    if (el?.locked) {
      onLockedFeedback?.();
      return;
    }
    setDraggedId(id);
    setDragOverIndex(index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggedId || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const clientY = e.clientY;

    // Auto-scroll near top/bottom edges
    const scrollEdge = 48;
    if (clientY < rect.top + scrollEdge) {
      container.scrollTop -= 6;
    } else if (clientY > rect.bottom - scrollEdge) {
      container.scrollTop += 6;
    }

    // Determine target index from pointer Y position
    const rowElements = Array.from(container.querySelectorAll<HTMLElement>('[data-layer-id]'));
    let targetIndex = rowElements.length - 1;

    for (let i = 0; i < rowElements.length; i++) {
      const row = rowElements[i];
      if (!row) continue;
      const rowRect = row.getBoundingClientRect();
      const midY = rowRect.top + rowRect.height / 2;
      if (clientY < midY) {
        targetIndex = i;
        break;
      }
    }

    setDragOverIndex(targetIndex);
  };

  const handlePointerUp = () => {
    if (draggedId && dragOverIndex !== null) {
      const currentIndex = sortedLayers.findIndex((l) => l.id === draggedId);
      if (currentIndex !== -1 && currentIndex !== dragOverIndex) {
        const ids = sortedLayers.map((l) => l.id);
        const [moved] = ids.splice(currentIndex, 1);
        if (moved) {
          ids.splice(dragOverIndex, 0, moved);
          onReorder(ids);
        }
      }
    }
    setDraggedId(null);
    setDragOverIndex(null);
  };

  const renderTypeIndicator = (el: CanvasElement) => {
    if (el.type === 'image') {
      const src = (el.data?.src as string) || imageThumbnailSrc;
      if (src) {
        return (
          <img
            src={src}
            alt=""
            className="w-6 h-6 object-cover rounded bg-[#ECE6DC] shrink-0 border border-[#DDD6CC]/60"
          />
        );
      }
      return (
        <div className="w-6 h-6 rounded bg-[#DCEBF4] flex items-center justify-center text-[#315F86] shrink-0">
          <ImageIcon className="w-3.5 h-3.5" />
        </div>
      );
    }

    if (el.type === 'text') {
      return (
        <div className="w-6 h-6 rounded bg-[#F7E8C6] flex items-center justify-center text-[#A86E22] shrink-0">
          <Type className="w-3.5 h-3.5 font-bold" />
        </div>
      );
    }

    if (el.type === 'sticker') {
      return (
        <div className="w-6 h-6 rounded bg-[#E8BCC9]/40 flex items-center justify-center text-[#B86C84] shrink-0">
          <Smile className="w-3.5 h-3.5" />
        </div>
      );
    }

    if (el.type === 'group') {
      const isExpanded = expandedGroupIds.has(el.id);
      return (
        <div className="w-6 h-6 rounded bg-[#ECE6DC] flex items-center justify-center text-[#666A6D] shrink-0">
          {isExpanded ? <FolderOpen className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
        </div>
      );
    }

    return (
      <div className="w-6 h-6 rounded bg-[#E8EAE6] flex items-center justify-center text-[#5F7E67] shrink-0">
        <Square className="w-3.5 h-3.5" />
      </div>
    );
  };

  return (
    <div
      className="flex flex-col h-full max-h-[75vh] select-none"
      onPointerMove={draggedId ? handlePointerMove : undefined}
      onPointerUp={draggedId ? handlePointerUp : undefined}
      onPointerCancel={handlePointerUp}
    >
      {/* Header with Title and Close Button */}
      <div className="flex items-center justify-between px-1 pb-3 pt-1 border-b border-[#ECE6DC] shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[#2E3338]">Lớp thiết kế</h2>
          <span className="text-[11px] text-[#666A6D] bg-[#F8F3E8] px-2 py-0.5 rounded-full font-medium">
            {surfaceElements.length} lớp
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng quản lý lớp"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#666A6D] hover:bg-[#F8F3E8] active:scale-95 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Layer List or Empty State */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto py-2 space-y-1.5 min-h-[160px] touch-pan-y"
      >
        {sortedLayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4">
            <p className="text-xs text-[#666A6D] mb-3">Chưa có thành phần nào trên bề mặt này.</p>
            <button
              type="button"
              onClick={onAddClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#315F86] text-white text-xs font-medium hover:bg-[#244A69] transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm vào thiết kế</span>
            </button>
          </div>
        ) : (
          sortedLayers.map((el, index) => {
            const isSelected = selectedId === el.id;
            const isDragging = draggedId === el.id;
            const isDropTarget = dragOverIndex === index && draggedId !== null && draggedId !== el.id;
            const isGroup = el.type === 'group';
            const isExpanded = expandedGroupIds.has(el.id);

            return (
              <div
                key={el.id}
                data-layer-id={el.id}
                onClick={() => {
                  if (el.locked) {
                    onLockedFeedback?.();
                  }
                  onSelect(el.id);
                }}
                className={`relative flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${isSelected
                    ? 'border-[#315F86] bg-[#DCEBF4]/40 font-medium shadow-xs'
                    : 'border-[#ECE6DC] bg-white hover:bg-[#F8F3E8]/80'
                  } ${isDragging ? 'opacity-40 scale-[0.98]' : ''} ${isDropTarget ? 'border-t-2 border-t-[#315F86]' : ''
                  }`}
              >
                {/* Left section: Drag handle + Group expander + Icon + Name */}
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                  {/* Dedicated Drag Handle */}
                  {!el.locked ? (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Kéo để sắp xếp thứ tự lớp"
                      onPointerDown={(e) => handleDragStart(el.id, index, e)}
                      className="touch-none p-1 -ml-1 text-[#666A6D] hover:text-[#2E3338] active:text-[#315F86] cursor-grab active:cursor-grabbing shrink-0"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-4 h-4 shrink-0 text-transparent select-none">-</div>
                  )}

                  {/* Group Expander if Group */}
                  {isGroup && (
                    <button
                      type="button"
                      onClick={(e) => toggleGroup(el.id, e)}
                      aria-label={isExpanded ? 'Thu gọn nhóm' : 'Mở rộng nhóm'}
                      className="p-0.5 text-[#666A6D] hover:text-[#2E3338] shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  {/* Type / Thumbnail Indicator */}
                  {renderTypeIndicator(el)}

                  {/* Layer Name */}
                  <span className="text-xs text-[#2E3338] truncate flex-1">
                    {getLayerDisplayName(el)}
                  </span>
                </div>

                {/* Right section: Lock indicator or Selection Check */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {el.locked && (
                    <span
                      title="Thành phần đã được khóa trong mẫu"
                      className="flex items-center gap-0.5 text-[10px] text-[#666A6D] bg-[#F8F3E8] px-1.5 py-0.5 rounded font-medium border border-[#ECE6DC]"
                    >
                      <Lock className="w-3 h-3 text-[#A86E22]" />
                      <span>Khóa</span>
                    </span>
                  )}
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-[#315F86]" />
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Fixed Non-draggable Background Row (always at bottom) */}
        <div className="flex items-center justify-between p-2.5 rounded-xl border border-[#ECE6DC] bg-[#F8F3E8]/50 text-[#666A6D]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 shrink-0" />
            <div className="w-6 h-6 rounded bg-white flex items-center justify-center border border-[#DDD6CC] shrink-0">
              <Square className="w-3.5 h-3.5 fill-[#ECE6DC] text-[#ECE6DC]" />
            </div>
            <span className="text-xs font-medium text-[#666A6D]">Nền sản phẩm</span>
          </div>
          <span className="text-[10px] bg-white/80 border border-[#ECE6DC] px-1.5 py-0.5 rounded text-[#666A6D]">
            Cố định
          </span>
        </div>
      </div>
    </div>
  );
}
