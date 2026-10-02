'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import {
  Search,
  Plus,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Archive,
  Send,
  RotateCcw,
  Sparkles,
  Layers,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { StickerRecord } from '@/lib/repositories/asset-library-repository';
import type { LibraryStatus, StaffRole, BulkItemResult } from '@/lib/domain/asset-library';

export interface LibraryStickersProps {
  userRole: StaffRole;
}

export function LibraryStickers({ userRole }: LibraryStickersProps) {
  const [items, setItems] = useState<StickerRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(40);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Detail / edit dialog
  const [selectedSticker, setSelectedSticker] = useState<StickerRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isActionPending, setIsActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Archive dialog
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');

  // Delete confirmation
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Upload dialog (single or bulk)
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState('chung');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadResults, setUploadResults] = useState<BulkItemResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Multi-selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchStickers = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await fetch(`/api/admin/content/stickers?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Chưa thể tải danh sách sticker.');
      }
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải dữ liệu.');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, statusFilter, searchQuery]);

  useEffect(() => {
    fetchStickers();
  }, [fetchStickers]);

  const handleOpenDetail = (sticker: StickerRecord) => {
    setSelectedSticker(sticker);
    setEditTitle(sticker.displayName || '');
    setEditCategory(sticker.category || '');
    setEditTags(sticker.tags.join(', '));
    setEditDescription(sticker.description || '');
    setActionError(null);
    setActionSuccess(null);
    setIsDetailOpen(true);
  };

  const handleSaveMetadata = async () => {
    if (!selectedSticker) return;
    setIsActionPending(true);
    setActionError(null);
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch(`/api/admin/content/stickers/${encodeURIComponent(selectedSticker.ref.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: selectedSticker.revision,
          displayName: editTitle.trim(),
          category: editCategory.trim(),
          tags,
          description: editDescription.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi cập nhật thông tin.');
      }
      const updated = await res.json();
      setSelectedSticker(updated);
      setActionSuccess('Đã cập nhật thông tin thành công.');
      fetchStickers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi cập nhật.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleValidate = async () => {
    if (!selectedSticker) return;
    setIsActionPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/stickers/${encodeURIComponent(selectedSticker.ref.id)}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: selectedSticker.revision,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi kiểm định sticker.');
      }
      const receipt = await res.json();
      if (receipt.passed) {
        setActionSuccess('Kiểm định thành công: Sticker đạt tiêu chuẩn in ấn.');
      } else {
        setActionError(`Kiểm định thất bại: ${receipt.failures?.map((f: { detail: string }) => f.detail).join(', ') || 'Không đạt'}`);
      }
      fetchStickers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi kiểm định.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedSticker) return;
    setIsActionPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/stickers/${encodeURIComponent(selectedSticker.ref.id)}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: selectedSticker.revision,
          validationId: selectedSticker.validationId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi xuất bản sticker.');
      }
      const updated = await res.json();
      setSelectedSticker(updated);
      setActionSuccess('Đã xuất bản sticker ra thư viện khách hàng.');
      fetchStickers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi xuất bản.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedSticker || !archiveReason.trim()) return;
    setIsActionPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/stickers/${encodeURIComponent(selectedSticker.ref.id)}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: selectedSticker.revision,
          reason: archiveReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi lưu trữ sticker.');
      }
      const updated = await res.json();
      setSelectedSticker(updated);
      setIsArchiveOpen(false);
      setArchiveReason('');
      setActionSuccess('Đã đưa sticker vào trạng thái lưu trữ.');
      fetchStickers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi lưu trữ.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSticker) return;
    setIsActionPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/stickers/${encodeURIComponent(selectedSticker.ref.id)}?revision=${selectedSticker.revision}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi xóa bản nháp.');
      }
      setIsDeleteOpen(false);
      setIsDetailOpen(false);
      setSelectedSticker(null);
      fetchStickers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi xóa.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleUploadSubmit = async () => {
    if (uploadFiles.length === 0) return;
    setIsUploading(true);
    setUploadResults([]);
    try {
      if (uploadFiles.length === 1) {
        const file = uploadFiles[0];
        const formData = new FormData();
        formData.set('file', file);
        formData.set('id', file.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
        formData.set('displayName', file.name.replace(/\.[^/.]+$/, ''));
        formData.set('category', uploadCategory.trim() || 'chung');
        formData.set('tags', uploadTags);

        const res = await fetch('/api/admin/content/stickers', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Tải lên thất bại.');
        }
        setIsUploadOpen(false);
        setUploadFiles([]);
        fetchStickers();
      } else {
        // Bulk upload: send in batch
        const items = await Promise.all(
          uploadFiles.slice(0, 50).map(async (file) => {
            const buffer = await file.arrayBuffer();
            const bytes = Array.from(new Uint8Array(buffer));
            const id = file.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            return {
              id,
              bytes,
              filename: file.name,
              metadata: {
                displayName: file.name.replace(/\.[^/.]+$/, ''),
                category: uploadCategory.trim() || 'chung',
                tags: uploadTags.split(',').map((t) => t.trim()).filter(Boolean),
              },
            };
          })
        );

        const res = await fetch('/api/admin/content/stickers/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'upload',
            items,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Lỗi tải lên hàng loạt.');
        }
        const data = await res.json();
        setUploadResults(data.results || []);
        fetchStickers();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi tải lên.');
    } finally {
      setIsUploading(false);
    }
  };

  const getStatusBadge = (status: LibraryStatus) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Đã xuất bản</Badge>;
      case 'archived':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Lưu trữ</Badge>;
      case 'draft':
      default:
        return <Badge className="bg-stone-100 text-stone-700 border-stone-200">Bản nháp</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Bar: Search, Filter, Action */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder="Tìm theo tên, thẻ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9 bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0 text-xs">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-stone-200 bg-white px-2.5 text-xs text-stone-700 focus:outline-none"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="draft">Bản nháp (Draft)</option>
              <option value="published">Đã xuất bản (Published)</option>
              <option value="archived">Lưu trữ (Archived)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setUploadFiles([]);
              setUploadResults([]);
              setIsUploadOpen(true);
            }}
            className="h-9 text-xs bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tải lên sticker</span>
          </Button>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-stone-500 text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-stone-700" />
          <span>Đang tải danh sách sticker...</span>
        </div>
      ) : errorMsg ? (
        <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1">{errorMsg}</div>
          <Button variant="outline" size="sm" onClick={fetchStickers} className="h-8 text-xs">
            Thử lại
          </Button>
        </div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center text-stone-500 text-xs border-dashed">
          <p className="font-semibold text-stone-700">Chưa có sticker nào phù hợp</p>
          <p className="mt-1">Nhấn &quot;Tải lên sticker&quot; để thêm sticker SVG hoặc hình ảnh mới.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-3">
          {items.map((item) => {
            const isDraft = item.status === 'draft';
            const previewUrl = isDraft
              ? `/api/admin/content/preview/sticker/${encodeURIComponent(item.ref.id)}`
              : `/api/library/sticker/${encodeURIComponent(item.ref.id)}`;

            return (
              <Card
                key={item.ref.id}
                onClick={() => handleOpenDetail(item)}
                className="group p-2.5 bg-white border-stone-200 hover:border-stone-400 hover:shadow-xs transition cursor-pointer flex flex-col justify-between"
              >
                <div className="aspect-square w-full rounded-md bg-stone-50 flex items-center justify-center overflow-hidden border border-stone-100 mb-2 relative">
                  <img
                    src={previewUrl}
                    alt={item.displayName || item.ref.id}
                    className="max-w-[85%] max-h-[85%] object-contain"
                    loading="lazy"
                  />
                  <div className="absolute top-1 right-1">{getStatusBadge(item.status)}</div>
                </div>

                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-stone-900 truncate" title={item.displayName || item.ref.id}>
                    {item.displayName || item.ref.id}
                  </p>
                  <p className="text-[10px] text-stone-500 truncate">{item.category || 'Chung'}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between border-t border-stone-200 pt-4 text-xs text-stone-500">
          <span>
            Hiển thị {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} trong số {total} sticker
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 text-xs"
            >
              Trang trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 text-xs"
            >
              Trang sau
            </Button>
          </div>
        </div>
      )}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {selectedSticker && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <span>Chi tiết sticker</span>
                  {getStatusBadge(selectedSticker.status)}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Mã tài nguyên: <span className="font-mono">{selectedSticker.ref.id}</span> · Phiên bản: #{selectedSticker.revision}
                </DialogDescription>
              </DialogHeader>

              {/* Status and Feedback Messages */}
              {actionError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}
              {actionSuccess && (
                <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* Preview & Metadata Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1 aspect-square rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center p-3">
                  <img
                    src={
                      selectedSticker.status === 'draft'
                        ? `/api/admin/content/preview/sticker/${encodeURIComponent(selectedSticker.ref.id)}`
                        : `/api/library/sticker/${encodeURIComponent(selectedSticker.ref.id)}`
                    }
                    alt={selectedSticker.displayName}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>

                <div className="sm:col-span-2 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tên hiển thị</Label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Danh mục</Label>
                      <Input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Thẻ (ngăn cách dấu phẩy)</Label>
                      <Input
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mô tả</Label>
                    <Textarea
                      rows={2}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="text-xs resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Technical readout */}
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-[11px] font-mono space-y-1 text-stone-600">
                <p>Checksum: {selectedSticker.ref.checksum || 'N/A'}</p>
                <p>Kích thước: {selectedSticker.width && selectedSticker.height ? `${selectedSticker.width}x${selectedSticker.height}px` : 'SVG vector'}</p>
                <p>Đường dẫn lưu trữ: {selectedSticker.binary.key}</p>
              </div>

              {/* Action Buttons */}
              <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200">
                <div className="flex items-center gap-1.5">
                  {userRole === 'admin' && selectedSticker.status === 'draft' && selectedSticker.everPublishedAt === null && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsDeleteOpen(true)}
                      disabled={isActionPending}
                      className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Xóa nháp
                    </Button>
                  )}
                  {selectedSticker.status === 'published' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsArchiveOpen(true)}
                      disabled={isActionPending}
                      className="text-xs text-amber-700 hover:bg-amber-50 border-amber-200"
                    >
                      <Archive className="w-3.5 h-3.5 mr-1" />
                      Lưu trữ
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleValidate}
                    disabled={isActionPending}
                    className="text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    Kiểm định in
                  </Button>
                  {selectedSticker.status !== 'published' && (
                    <Button
                      size="sm"
                      onClick={handlePublish}
                      disabled={isActionPending}
                      className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      Xuất bản
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSaveMetadata}
                    disabled={isActionPending}
                    className="text-xs bg-stone-900 text-white"
                  >
                    Lưu thông tin
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Archive Reason Dialog */}
      <Dialog open={isArchiveOpen} onOpenChange={setIsArchiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-amber-900">Xác nhận lưu trữ sticker</DialogTitle>
            <DialogDescription className="text-xs text-stone-600">
              Sticker lưu trữ sẽ không còn hiển thị cho khách tạo thiết kế mới, nhưng các thiết kế cũ đã sử dụng vẫn duy trì nguyên vẹn hình ảnh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Lý do lưu trữ (bắt buộc 3–500 ký tự)</Label>
            <Textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Ví dụ: Thay thế bộ sưu tập mới mùa lễ hội..."
              className="text-xs"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsArchiveOpen(false)} className="text-xs">
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={archiveReason.trim().length < 3 || isActionPending}
              onClick={handleArchive}
              className="text-xs bg-amber-700 hover:bg-amber-800 text-white"
            >
              Xác nhận lưu trữ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Draft Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-red-900">Xóa vĩnh viễn bản nháp</DialogTitle>
            <DialogDescription className="text-xs text-stone-600">
              Thao tác này sẽ xóa vĩnh viễn tệp tải lên khỏi bộ lưu trữ riêng tư. Thao tác không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsDeleteOpen(false)} className="text-xs">
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={isActionPending}
              onClick={handleDelete}
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Tải lên sticker mới</DialogTitle>
            <DialogDescription className="text-xs">
              Hỗ trợ tệp SVG, PNG, WebP, JPEG. Tối đa 50 tệp mỗi lượt tải lên hàng loạt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Chọn tệp hình ảnh</Label>
              <Input
                type="file"
                multiple
                accept=".svg,.png,.webp,.jpg,.jpeg"
                onChange={(e) => {
                  if (e.target.files) {
                    setUploadFiles(Array.from(e.target.files).slice(0, 50));
                  }
                }}
                className="text-xs h-9 cursor-pointer"
              />
              <p className="text-[11px] text-stone-500">
                {uploadFiles.length > 0 ? `Đã chọn ${uploadFiles.length} tệp.` : 'Chưa chọn tệp nào.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Danh mục mặc định</Label>
                <Input
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="text-xs h-8"
                  placeholder="cute, vintage, hoa..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Thẻ mặc định</Label>
                <Input
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  className="text-xs h-8"
                  placeholder="mèo, mùa hè, tình yêu"
                />
              </div>
            </div>

            {uploadResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 p-2 rounded-lg bg-stone-50 border border-stone-200 text-xs">
                {uploadResults.map((r) => (
                  <div key={r.ref.id} className="flex items-center justify-between">
                    <span className="font-mono truncate">{r.ref.id}</span>
                    {r.ok ? (
                      <span className="text-emerald-700 font-semibold">Thành công</span>
                    ) : (
                      <span className="text-red-600 font-semibold">{r.message || r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(false)} className="text-xs">
              Đóng
            </Button>
            <Button
              size="sm"
              disabled={uploadFiles.length === 0 || isUploading}
              onClick={handleUploadSubmit}
              className="text-xs bg-stone-900 text-white"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  Đang tải lên...
                </>
              ) : (
                'Bắt đầu tải lên'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
