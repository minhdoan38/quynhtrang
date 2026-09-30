'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, FileDown, ShieldAlert } from 'lucide-react';
import { validateRevisionReason } from '@/lib/domain/design-revision.ts';

interface CreateRevisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseVersionNumber: number;
  isSubmitting?: boolean;
  onSubmit: (reason: string) => Promise<void>;
}

export function CreateRevisionDialog({
  open,
  onOpenChange,
  baseVersionNumber,
  isSubmitting = false,
  onSubmit,
}: CreateRevisionDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const charCount = Array.from(reason.trim()).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateRevisionReason(reason);
    if (!validation.valid) {
      setError(validation.reason || 'Lý do không hợp lệ');
      return;
    }
    setError(null);
    await onSubmit(reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#FFFDF8] border-[#ECE6DC] p-6">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#2E3338]">
              Tạo bản chỉnh sửa thiết kế
            </DialogTitle>
            <DialogDescription className="text-sm text-[#666A6D] mt-1">
              Bắt đầu chỉnh sửa từ phiên bản v{baseVersionNumber}. Phiên bản khách duyệt ban đầu sẽ luôn được giữ nguyên.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-2">
            <label htmlFor="revision-reason" className="block text-xs font-semibold text-[#2E3338]">
              Lý do chỉnh sửa <span className="text-red-500">*</span>
            </label>
            <textarea
              id="revision-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="VD: Căn chỉnh viền cắt sticker, tăng độ phân giải chữ..."
              className="w-full rounded-lg border border-[#DDD6CC] bg-white p-2.5 text-sm text-[#2E3338] placeholder:text-[#9EA2A6] focus:border-[#315F86] focus:outline-none focus:ring-1 focus:ring-[#315F86]"
            />
            <div className="flex items-center justify-between text-xs">
              <span className={error ? 'text-red-600 font-medium' : 'text-[#666A6D]'}>
                {error || 'Tối thiểu 3 ký tự, tối đa 500 ký tự'}
              </span>
              <span className={`font-mono ${charCount > 500 ? 'text-red-600' : 'text-[#9EA2A6]'}`}>
                {charCount}/500
              </span>
            </div>

            <div className="rounded-lg bg-[#F8F3E8] p-3 text-xs text-[#666A6D] border border-[#ECE6DC] mt-2">
              <p className="font-medium text-[#2E3338] mb-0.5">Lưu ý nghiệp vụ:</p>
              Nếu nội dung thay đổi ý định của khách hàng (chữ, hình ảnh chính), vui lòng xác nhận với khách và sử dụng quy trình Tạm giữ (Hold) nếu cần.
            </div>
          </div>

          <DialogFooter className="flex sm:justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-11 px-4 text-xs font-semibold"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || charCount < 3 || charCount > 500}
              className="h-11 px-5 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold"
            >
              {isSubmitting ? 'Đang tạo...' : 'Bắt đầu chỉnh sửa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DiscardDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting?: boolean;
  onConfirm: () => Promise<void>;
}

export function DiscardDraftDialog({
  open,
  onOpenChange,
  isSubmitting = false,
  onConfirm,
}: DiscardDraftDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#FFFDF8] border-[#ECE6DC] p-6">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-2">
            <AlertCircle className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-[#2E3338]">
            Hủy bản chỉnh sửa nháp?
          </DialogTitle>
          <DialogDescription className="text-sm text-[#666A6D] mt-1">
            Bản nháp đang chỉnh sửa sẽ bị hủy và không thể khôi phục. Các phiên bản đã được duyệt trước đó vẫn an toàn.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex sm:justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-11 px-4 text-xs font-semibold"
          >
            Giữ lại bản nháp
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="h-11 px-5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
          >
            {isSubmitting ? 'Đang hủy...' : 'Hủy bản nháp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TakeoverDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previousEditorName?: string;
  isSubmitting?: boolean;
  onConfirm: () => Promise<void>;
}

export function TakeoverDraftDialog({
  open,
  onOpenChange,
  previousEditorName = 'nhân viên khác',
  isSubmitting = false,
  onConfirm,
}: TakeoverDraftDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#FFFDF8] border-[#ECE6DC] p-6">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-2">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-[#2E3338]">
            Tiếp quản bản nháp?
          </DialogTitle>
          <DialogDescription className="text-sm text-[#666A6D] mt-1">
            Phiên làm việc của {previousEditorName} đã hết hạn. Bạn có muốn tiếp quản bản nháp này để tiếp tục chỉnh sửa không?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex sm:justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="h-11 px-4 text-xs font-semibold"
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="h-11 px-5 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold"
          >
            {isSubmitting ? 'Đang tiếp quản...' : 'Tiếp quản bản nháp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConflictDialogProps {
  open: boolean;
  title?: string;
  message?: string;
  recoveryJson?: string | null;
  onReload: () => void;
}

export function ConflictDialog({
  open,
  title = 'Xung đột phiên làm việc',
  message = 'Bản nháp đã có phiên bản chỉnh sửa mới hơn hoặc quyền chỉnh sửa đã bị chuyển.',
  recoveryJson = null,
  onReload,
}: ConflictDialogProps) {
  const handleDownloadBackup = () => {
    if (!recoveryJson) return;
    const blob = new Blob([recoveryJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-recovery-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md bg-[#FFFDF8] border-red-200 p-6">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-2">
            <AlertCircle className="w-5 h-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-[#2E3338]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#666A6D] mt-1">
            {message}
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 rounded-lg bg-red-50/60 p-3 text-xs text-red-800 border border-red-200">
          Các thay đổi chưa lưu trên thiết bị của bạn sẽ không ghi đè máy chủ. Bạn có thể tải về bản sao cứu hộ trước khi tải lại.
        </div>

        <DialogFooter className="flex sm:justify-end gap-2 mt-4">
          {recoveryJson && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadBackup}
              className="h-11 px-4 text-xs font-semibold gap-1.5"
            >
              <FileDown className="w-4 h-4" />
              <span>Tải bản sao</span>
            </Button>
          )}
          <Button
            type="button"
            onClick={onReload}
            className="h-11 px-5 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold"
          >
            Tải lại bản mới nhất
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
