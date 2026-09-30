'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Edit3, Lock, AlertTriangle, Play, Trash2, ShieldAlert } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StaffDraftSummary, DesignVersionListItem } from '@/lib/domain/design-revision.ts';
import type { DesignState } from '@/lib/product-state.ts';
import { CustomizerShell } from '@/components/customizer/customizer-shell.tsx';

export interface DesignReviewViewProps {
  orderId: string;
  publicOrderCode: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  designStatus: string;
  currentUserId: string;
  currentUserRole: string;
  customerVersionNumber: number;
  selectedVersionNumber: number;
  productionVersionNumber: number;
  isCustomerEqualProduction: boolean;
  activeDraft: StaffDraftSummary | null;
  versions: DesignVersionListItem[];
  selectedDocument: DesignState;
  onSelectVersion: (versionId: string) => void;
  onApproveAsIs: () => void;
  onStartEditing: () => void;
  onResumeDraft: () => void;
  onDiscardDraft: () => void;
  onTakeoverDraft: () => void;
}

export function DesignReviewView({
  orderId,
  publicOrderCode,
  fulfillmentStatus,
  currentUserId,
  currentUserRole,
  selectedVersionNumber,
  productionVersionNumber,
  isCustomerEqualProduction,
  activeDraft,
  versions,
  selectedDocument,
  onSelectVersion,
  onApproveAsIs,
  onStartEditing,
  onResumeDraft,
  onDiscardDraft,
  onTakeoverDraft,
}: DesignReviewViewProps) {
  const isMutationEligible = fulfillmentStatus === 'unprocessed' || fulfillmentStatus === 'ready_for_production';
  const isOwner = activeDraft ? activeDraft.editorUserId === currentUserId : false;
  const isLeaseExpired = activeDraft?.leaseExpiresAt
    ? new Date(activeDraft.leaseExpiresAt).getTime() < Date.now()
    : false;

  return (
    <div className="flex flex-col h-screen w-full bg-[#FFFDF8] overflow-hidden select-none">
      {/* Top Header */}
      <header className="h-[54px] px-3 sm:px-4 border-b border-[#ECE6DC] bg-[#FFFDF8]/95 backdrop-blur-md flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/admin/orders/${orderId}`}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'h-9 px-2 text-xs font-semibold text-[#666A6D] hover:text-[#2E3338] inline-flex items-center gap-1.5'
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Về đơn hàng</span>
          </Link>

          <div className="h-4 w-px bg-[#ECE6DC] hidden sm:block" />

          <div className="flex items-center gap-1.5 truncate">
            <span className="text-xs font-bold text-[#2E3338]">#{publicOrderCode}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F8F3E8] border border-[#ECE6DC] text-[#666A6D] font-medium">
              Khách duyệt v1
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#EBF3ED] border border-[#D5E6D9] text-[#4A7251] font-semibold">
              Sản xuất v{productionVersionNumber}
            </span>
          </div>
        </div>

        {/* Version Selector & Actions */}
        <div className="flex items-center gap-2">
          {versions.length > 1 && (
            <select
              value={versions.find((v) => v.versionNumber === selectedVersionNumber)?.id || ''}
              onChange={(e) => onSelectVersion(e.target.value)}
              className="h-9 rounded-lg border border-[#DDD6CC] bg-white px-2.5 text-xs font-semibold text-[#2E3338] focus:border-[#315F86] focus:outline-none"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} {v.isProduction ? '• Bản sản xuất' : v.isCustomer ? '• Bản khách' : ''}
                </option>
              ))}
            </select>
          )}

          {isMutationEligible && !activeDraft && isCustomerEqualProduction && (
            <Button
              type="button"
              variant="outline"
              onClick={onApproveAsIs}
              className="h-9 px-3 text-xs font-semibold border-[#4A7251] text-[#4A7251] hover:bg-[#EBF3ED] gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Duyệt không cần sửa</span>
              <span className="sm:hidden">Duyệt v1</span>
            </Button>
          )}

          {isMutationEligible && !activeDraft && (
            <Button
              type="button"
              onClick={onStartEditing}
              className="h-9 px-3.5 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Tạo bản chỉnh sửa</span>
            </Button>
          )}
        </div>
      </header>

      {/* Notice Banner */}
      {!isMutationEligible && (
        <div className="bg-neutral-100 border-b border-neutral-200 px-4 py-2 flex items-center justify-between text-xs text-neutral-700">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-neutral-500 shrink-0" />
            <span>Sản xuất đã bắt đầu hoặc đơn hàng đã đóng. Thiết kế hiện được khóa chỉ đọc.</span>
          </div>
        </div>
      )}

      {isMutationEligible && activeDraft && isOwner && (
        <div className="bg-amber-50/90 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-900 z-20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Bạn có bản chỉnh sửa chưa hoàn tất (lý do: &quot;{activeDraft.reason}&quot;).</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDiscardDraft}
              className="h-7 text-xs border-amber-300 text-amber-900 hover:bg-amber-100 gap-1"
            >
              <Trash2 className="w-3 h-3 text-amber-700" />
              <span>Hủy bản nháp</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onResumeDraft}
              className="h-7 bg-[#315F86] hover:bg-[#244A69] text-white text-xs gap-1"
            >
              <Play className="w-3 h-3" />
              <span>Tiếp tục chỉnh</span>
            </Button>
          </div>
        </div>
      )}

      {isMutationEligible && activeDraft && !isOwner && (
        <div className="bg-neutral-100 border-b border-neutral-200 px-4 py-2 flex items-center justify-between text-xs text-neutral-800 z-20">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-neutral-500 shrink-0" />
            <span>
              {activeDraft.editorDisplayName || 'Nhân viên khác'} đang chỉnh sửa bản nháp này. Bạn đang xem ở chế độ chỉ đọc.
            </span>
          </div>
          {currentUserRole === 'admin' && isLeaseExpired && (
            <Button
              type="button"
              size="sm"
              onClick={onTakeoverDraft}
              className="h-7 bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1"
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Tiếp quản bản nháp</span>
            </Button>
          )}
        </div>
      )}

      {/* Main Review Canvas: reuses CustomizerShell with staff review context */}
      <div className="flex-1 w-full relative overflow-hidden">
        <CustomizerShell
          context={{
            type: 'staff',
            mode: 'review',
            orderId,
            orderCode: publicOrderCode,
            initialDocument: selectedDocument,
            sessionId: 'review-session',
            readOnly: true,
          }}
        />
      </div>
    </div>
  );
}
