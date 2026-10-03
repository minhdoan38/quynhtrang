'use client';

import { Eye, UploadCloud, AlertCircle } from 'lucide-react';
import type { SaveStatus } from '@/lib/draft-autosave';

export interface TemplateAuthorControlsProps {
  saveStatus?: SaveStatus;
  isReadOnly?: boolean;
  conflictDetails?: { code?: string; message?: string } | null;
  onCustomerPreview: () => void;
  onPublish?: () => void;
  isPublishing?: boolean;
  onRetrySave?: () => void;
  className?: string;
}

export function TemplateAuthorControls({
  saveStatus,
  isReadOnly = false,
  conflictDetails,
  onCustomerPreview,
  onPublish,
  isPublishing = false,
  onRetrySave,
  className = '',
}: TemplateAuthorControlsProps) {
  const isSaveBlocked =
    saveStatus === 'saving' || saveStatus === 'dirty' || saveStatus === 'conflict';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Save Status Badge */}
      {saveStatus && (
        <span
          className="inline-flex items-center gap-1.5 rounded text-[11px] font-medium"
          aria-live="polite"
        >
          {(saveStatus === 'saving' || saveStatus === 'dirty') && (
            <span className="inline-flex items-center gap-1 text-[#A86E22] bg-[#A86E22]/10 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A86E22] animate-pulse" />
              <span>Đang lưu...</span>
            </span>
          )}
          {(saveStatus === 'saved' || saveStatus === 'idle') && (
            <span className="inline-flex items-center gap-1 text-[#5F7E67] bg-[#5F7E67]/10 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5F7E67]" />
              <span>Đã lưu</span>
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="inline-flex items-center gap-1 text-[#B3535D] bg-[#B3535D]/10 px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B3535D]" />
              <span>Lỗi lưu</span>
              {onRetrySave && (
                <button
                  type="button"
                  onClick={onRetrySave}
                  className="underline hover:text-[#B3535D] ml-0.5 cursor-pointer min-h-[44px] inline-flex items-center px-1"
                >
                  Thử lại
                </button>
              )}
            </span>
          )}
          {saveStatus === 'conflict' && !conflictDetails && (
            <span className="inline-flex items-center gap-1 text-[#B3535D] bg-[#B3535D]/10 px-2 py-0.5 rounded border border-[#B3535D]/30">
              <AlertCircle className="w-3 h-3 text-[#B3535D]" />
              <span>Xung đột</span>
            </span>
          )}
        </span>
      )}

      {/* Read-only indicator */}
      {isReadOnly && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#ECE6DC] text-[#666A6D]"
          title="Chế độ chỉ đọc (bản nháp đang bị khóa bởi phiên làm việc khác)"
        >
          Chỉ đọc
        </span>
      )}

      {/* Conflict / Lease warning indicator */}
      {conflictDetails && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#B3535D]/10 text-[#B3535D] border border-[#B3535D]/30"
          title={conflictDetails.message || 'Xung đột phiên làm việc'}
        >
          <AlertCircle className="w-3 h-3 text-[#B3535D]" />
          <span>Xung đột</span>
        </span>
      )}

      {/* Customer Preview button */}
      <button
        type="button"
        onClick={onCustomerPreview}
        aria-label="Xem như khách"
        title="Mở môi trường dùng thử độc lập như góc nhìn của khách hàng"
        className="inline-flex items-center gap-1.5 min-h-[44px] h-11 px-3 sm:px-4 rounded-lg text-xs font-semibold bg-[#F8F3E8] text-[#2E3338] border border-[#DDD6CC] hover:bg-[#ECE6DC] active:scale-95 transition-all shadow-2xs cursor-pointer"
      >
        <Eye className="w-3.5 h-3.5 text-[#315F86]" aria-hidden="true" />
        <span className="hidden xs:inline">Xem như khách</span>
      </button>

      {/* Publish button */}
      {onPublish && (
        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishing || isSaveBlocked || isReadOnly}
          aria-label="Đăng mẫu"
          title={
            isReadOnly
              ? 'Chế độ chỉ đọc, không thể đăng mẫu'
              : isSaveBlocked
                ? saveStatus === 'conflict'
                  ? 'Bản nháp đang bị xung đột phiên làm việc'
                  : 'Đang chờ lưu thay đổi trước khi đăng'
                : 'Kiểm duyệt và xuất bản mẫu thiết kế'
          }
          className="inline-flex items-center gap-1.5 min-h-[44px] h-11 px-3.5 sm:px-4 rounded-lg text-xs font-semibold bg-[#315F86] text-white hover:bg-[#244A69] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-2xs cursor-pointer"
        >
          <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isPublishing ? 'Đang đăng...' : 'Đăng mẫu'}</span>
        </button>
      )}
    </div>
  );
}
