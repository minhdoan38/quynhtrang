'use client';

import React from 'react';
import {
  Image as ImageIcon,
  Camera,
  FolderOpen,
  X,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import type { ImageSourceType, ImageSourceContext } from '@/lib/add-content';

export interface ImageSourceChooserProps {
  context: ImageSourceContext;
  onSelectSource: (source: ImageSourceType, context: ImageSourceContext) => void;
  onClose: () => void;
  onBack?: () => void;
  showBack?: boolean;
}

export function ImageSourceChooser({
  context,
  onSelectSource,
  onClose,
  onBack,
  showBack = false,
}: ImageSourceChooserProps) {
  const isReplace = context.mode === 'replace';

  const sources: Array<{
    id: ImageSourceType;
    title: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'gallery',
      title: 'Thư viện ảnh',
      description: 'Chọn ảnh từ album hoặc thư viện trên thiết bị',
      icon: <ImageIcon className="w-5 h-5 text-[#315F86]" />,
    },
    {
      id: 'camera',
      title: 'Chụp ảnh',
      description: 'Chụp ảnh mới trực tiếp bằng máy ảnh',
      icon: <Camera className="w-5 h-5 text-[#315F86]" />,
    },
    {
      id: 'file',
      title: 'Chọn tệp',
      description: 'Tải tệp PNG, JPG hoặc WebP từ thư mục máy',
      icon: <FolderOpen className="w-5 h-5 text-[#315F86]" />,
    },
  ];

  return (
    <div className="space-y-3.5 py-1 text-[#2E3338]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ECE6DC] pb-3">
        <div className="flex items-center gap-2">
          {showBack && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#2E3338] hover:text-[#315F86] p-1 -ml-1 rounded-md"
              aria-label="Quay lại"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại</span>
            </button>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-[#2E3338]">
                {isReplace ? 'Thay ảnh' : 'Thêm ảnh'}
              </h3>
              {isReplace && (
                <p className="text-xs text-[#666A6D] flex items-center gap-1 mt-0.5">
                  <Sparkles className="w-3 h-3 text-[#315F86]" />
                  <span>Giữ nguyên vị trí và khung thiết kế</span>
                </p>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338] transition-colors"
          aria-label={isReplace ? 'Hủy và đóng bảng thay ảnh' : 'Đóng bảng thêm ảnh'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Source Buttons List */}
      <div className="space-y-2 pt-0.5">
        {sources.map((src) => (
          <button
            key={src.id}
            type="button"
            onClick={() => onSelectSource(src.id, context)}
            className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-[#ECE6DC] bg-white hover:border-[#315F86]/50 hover:bg-[#F8F3E8]/40 active:scale-[0.99] transition-all text-left group shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-[#DCEBF4]/80 flex items-center justify-center shrink-0 group-hover:bg-[#DCEBF4] transition-colors">
              {src.icon}
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-xs font-semibold text-[#2E3338] group-hover:text-[#315F86] transition-colors">
                {src.title}
              </span>
              <span className="block text-xs text-[#666A6D] truncate mt-0.5">
                {src.description}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
