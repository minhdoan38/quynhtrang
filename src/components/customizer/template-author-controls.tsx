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
  return (
    <div className={`flex items-center gap-2 ${className}`}>
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
        className="inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-lg text-xs font-semibold bg-[#F8F3E8] text-[#2E3338] border border-[#DDD6CC] hover:bg-[#ECE6DC] active:scale-95 transition-all shadow-2xs"
      >
        <Eye className="w-3.5 h-3.5 text-[#315F86]" aria-hidden="true" />
        <span className="hidden xs:inline">Xem như khách</span>
      </button>

      {/* Publish button */}
      {onPublish && !isReadOnly && (
        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishing || saveStatus === 'saving'}
          aria-label="Đăng mẫu"
          title="Kiểm duyệt và xuất bản mẫu thiết kế"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-lg text-xs font-semibold bg-[#315F86] text-white hover:bg-[#244A69] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-2xs"
        >
          <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isPublishing ? 'Đang đăng...' : 'Đăng mẫu'}</span>
        </button>
      )}
    </div>
  );
}
