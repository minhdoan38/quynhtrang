'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface LifecycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}

export function PublishProductDialog({ open, onOpenChange, onConfirm, pending }: LifecycleDialogProps) {
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}><DialogContent><DialogHeader><DialogTitle>Xuất bản cấu hình giá?</DialogTitle><DialogDescription>Báo giá Checkout mới sẽ dùng cấu hình đã xuất bản. Orders hiện có không thay đổi.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" className="min-h-11" disabled={pending} onClick={() => onOpenChange(false)}>Hủy</Button><Button className="min-h-11" disabled={pending} onClick={onConfirm}>{pending ? 'Đang xuất bản…' : 'Xuất bản'}</Button></DialogFooter></DialogContent></Dialog>;
}

export function ArchiveProductDialog({ open, onOpenChange, onConfirm, pending }: LifecycleDialogProps) {
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}><DialogContent><DialogHeader><DialogTitle>Lưu trữ sản phẩm hoặc variant?</DialogTitle><DialogDescription>Chặn Orders mới của khách hàng cho mục này. Thiết kế và Orders cũ vẫn được giữ nguyên.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" className="min-h-11" disabled={pending} onClick={() => onOpenChange(false)}>Hủy</Button><Button className="min-h-11" disabled={pending} onClick={onConfirm}>{pending ? 'Đang lưu trữ…' : 'Lưu trữ'}</Button></DialogFooter></DialogContent></Dialog>;
}
