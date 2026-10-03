'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Edit3,
  Copy,
  Archive,
  RefreshCw,
  Trash2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Layers,
  History,
  Info,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import type {
  TemplateRecord,
  TemplateDraftRecord,
  TemplateVersionSummary,
  TemplateCategoryRecord,
  TemplateAvailabilityBlocker,
} from '@/lib/domain/template';

export interface TemplateDetailProps {
  templateId: string;
  userRole: 'admin' | 'editor';
  currentStaff?: {
    userId: string;
    role: 'admin' | 'editor';
    name?: string;
  };
}

const PRODUCT_LABELS: Record<string, string> = {
  card: 'Thiệp chúc mừng',
  wrapping: 'Giấy gói quà',
  sticker: 'Sticker',
  notebook: 'Sổ tay',
};

const VARIANT_LABELS: Record<string, string> = {
  horizontal: 'Ngang (horizontal)',
  vertical: 'Dọc (vertical)',
  a1: 'Khổ A1 (594 x 841 mm)',
  a2: 'Khổ A2 (420 x 594 mm)',
  'fixed-shape': 'Hình cố định (fixed-shape)',
  'die-cut': 'Cắt viền (die-cut)',
  phone: 'Ốp lưng (phone)',
  standard: 'Tiêu chuẩn (standard)',
};

const SHAPE_LABELS: Record<string, string> = {
  circle: 'Hình tròn',
  square: 'Hình vuông',
  oval: 'Hình bầu dục',
  arch: 'Hình vòm',
  star: 'Ngôi sao',
  heart: 'Trái tim',
  badge: 'Huy hiệu',
};

const MODE_LABELS: Record<string, string> = {
  pattern: 'Lặp họa tiết',
  'full-sheet': 'Toàn tờ',
};

export function TemplateDetail({ templateId, userRole }: TemplateDetailProps) {
  const router = useRouter();

  // 1. Data States
  const [template, setTemplate] = useState<TemplateRecord | null>(null);
  const [draft, setDraft] = useState<TemplateDraftRecord | null>(null);
  const [versions, setVersions] = useState<TemplateVersionSummary[]>([]);
  const [categories, setCategories] = useState<TemplateCategoryRecord[]>([]);
  const [blockers, setBlockers] = useState<TemplateAvailabilityBlocker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 2. Metadata Form State
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [metaSaveSuccess, setMetaSaveSuccess] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  // 3. Action Modals State
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);

  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const [isRepublishConfirmOpen, setIsRepublishConfirmOpen] = useState(false);
  const [isRepublishing, setIsRepublishing] = useState(false);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load detail and categories
  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [detailRes, catRes] = await Promise.all([
        fetch(`/api/admin/content/templates/${encodeURIComponent(templateId)}`),
        fetch('/api/admin/content/templates/categories'),
      ]);

      if (!detailRes.ok) {
        throw new Error('Không thể tải thông tin mẫu thiết kế');
      }

      const detailData = await detailRes.json();
      setTemplate(detailData.template);
      setDraft(detailData.draft);
      setVersions(detailData.versions || []);
      setBlockers(detailData.template?.blockers || []);

      // Populate metadata form
      if (detailData.template) {
        setEditName(detailData.template.name || '');
        setEditCategory(detailData.template.categoryId || '');
        setEditTags((detailData.template.tags || []).join(', '));
        setEditSortOrder(Number(detailData.template.sortOrder || 0));
      }

      if (catRes.ok) {
        const catData = await catRes.json();
        if (Array.isArray(catData.categories)) {
          setCategories(catData.categories);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ');
    } finally {
      setIsLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Handle Save Metadata PATCH
  const handleSaveMetadata = async (e: FormEvent) => {
    e.preventDefault();
    if (!template) return;
    setIsSavingMeta(true);
    setMetaError(null);
    setMetaSaveSuccess(false);

    try {
      const tagsList = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch(`/api/admin/content/templates/${encodeURIComponent(templateId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          categoryId: editCategory || null,
          tags: tagsList,
          sortOrder: editSortOrder,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Lưu thông tin thất bại');
      }

      setTemplate(data.template);
      setMetaSaveSuccess(true);
      setTimeout(() => setMetaSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setMetaError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsSavingMeta(false);
    }
  };

  // Handle Duplicate POST
  const handleDuplicate = async () => {
    if (!template) return;
    setIsDuplicating(true);
    setActionError(null);

    try {
      const res = await fetch(
        `/api/admin/content/templates/${encodeURIComponent(templateId)}/duplicate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newName: duplicateName.trim() || undefined,
            requestId: crypto.randomUUID(),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Nhân bản mẫu thất bại');
      }

      setIsDuplicateOpen(false);
      router.push(`/admin/content/templates/${data.template.id}`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsDuplicating(false);
    }
  };

  // Handle Archive POST
  const handleArchive = async () => {
    if (!template) return;
    setIsArchiving(true);
    setActionError(null);

    try {
      const res = await fetch(
        `/api/admin/content/templates/${encodeURIComponent(templateId)}/archive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedCatalogRevision: template.revision,
            requestId: crypto.randomUUID(),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Lưu trữ mẫu thất bại');
      }

      setIsArchiveConfirmOpen(false);
      await fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsArchiving(false);
    }
  };

  // Handle Republish POST
  const handleRepublish = async () => {
    if (!template) return;
    setIsRepublishing(true);
    setActionError(null);

    try {
      const res = await fetch(
        `/api/admin/content/templates/${encodeURIComponent(templateId)}/republish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedCatalogRevision: template.revision,
            requestId: crypto.randomUUID(),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Đăng lại mẫu thất bại');
      }

      setIsRepublishConfirmOpen(false);
      await fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsRepublishing(false);
    }
  };

  // Handle Delete Draft DELETE (Admin only)
  const handleDeleteDraft = async () => {
    if (!template) return;
    setIsDeleting(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/admin/content/templates/${encodeURIComponent(templateId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Xóa bản nháp thất bại');
      }

      setIsDeleteConfirmOpen(false);
      router.push('/admin/content/templates');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-2 text-stone-500 text-xs">
        <Loader2 className="w-6 h-6 animate-spin text-stone-700" />
        <span>Đang tải thông tin chi tiết mẫu...</span>
      </div>
    );
  }

  if (errorMsg || !template) {
    return (
      <div className="p-8 space-y-4">
        <div
          role="alert"
          aria-live="polite"
          className="p-6 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-3"
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1">{errorMsg || 'Không tìm thấy mẫu thiết kế'}</div>
          <Button variant="outline" size="sm" onClick={fetchDetail} className="min-h-[44px] h-11 px-3.5 text-xs cursor-pointer">
            Thử lại
          </Button>
        </div>
        <Link
          href="/admin/content/templates"
          className="inline-flex items-center gap-2 text-xs text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại danh sách mẫu</span>
        </Link>
      </div>
    );
  }

  const isDraft = template.status === 'draft';
  const isPublished = template.status === 'published';
  const isArchived = template.status === 'archived';
  const canDelete = userRole === 'admin' && isDraft && !template.everPublishedAt;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Navigation & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/content/templates"
            className="flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg border border-stone-200 bg-white text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition"
            aria-label="Quay lại danh sách mẫu"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-stone-900 tracking-tight">{template.name}</h2>
              {/* Status Badge */}
              {isArchived ? (
                <Badge variant="outline" className="bg-stone-100 text-stone-600 border-stone-300">
                  Đã lưu trữ
                </Badge>
              ) : isPublished ? (
                <Badge className="bg-[#5F7E67]/15 text-[#3b5341] border-[#5F7E67]/30">
                  Đã xuất bản
                </Badge>
              ) : (
                <Badge className="bg-[#A86E22]/15 text-[#734b17] border-[#A86E22]/30">
                  Bản nháp
                </Badge>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Mã mẫu: <span className="font-mono text-stone-600">{template.id}</span> · Phiên bản #{template.revision}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Chỉnh sửa mẫu */}
          {!isArchived && (
            <Button
              onClick={() => router.push(`/admin/content/templates/${template.id}/edit`)}
              className="min-h-[44px] h-11 px-3.5 text-xs bg-[#315F86] hover:bg-[#254b6b] text-white flex items-center gap-1.5 font-semibold cursor-pointer shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Chỉnh sửa mẫu</span>
            </Button>
          )}

          {/* Nhân bản */}
          <Button
            variant="outline"
            onClick={() => {
              setDuplicateName(`${template.name} (Bản sao)`);
              setActionError(null);
              setIsDuplicateOpen(true);
            }}
            className="min-h-[44px] h-11 px-3.5 text-xs border-stone-200 bg-white text-stone-700 hover:bg-stone-50 flex items-center gap-1.5 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-stone-500" />
            <span>Nhân bản</span>
          </Button>

          {/* Lưu trữ (khi đã xuất bản) */}
          {isPublished && (
            <Button
              variant="outline"
              onClick={() => {
                setActionError(null);
                setIsArchiveConfirmOpen(true);
              }}
              className="min-h-[44px] h-11 px-3.5 text-xs border-stone-200 bg-white text-stone-700 hover:bg-stone-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5 text-stone-500" />
              <span>Lưu trữ</span>
            </Button>
          )}

          {/* Đăng lại (khi đã lưu trữ) */}
          {isArchived && (
            <Button
              variant="outline"
              onClick={() => {
                setActionError(null);
                setIsRepublishConfirmOpen(true);
              }}
              className="min-h-[44px] h-11 px-3.5 text-xs border-stone-200 bg-white text-stone-700 hover:bg-stone-50 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
              <span>Đăng lại</span>
            </Button>
          )}

          {/* Xóa bản nháp (Admin only, khi chưa từng xuất bản) */}
          {canDelete && (
            <Button
              variant="outline"
              onClick={() => {
                setActionError(null);
                setIsDeleteConfirmOpen(true);
              }}
              className="min-h-[44px] h-11 px-3.5 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa bản nháp</span>
            </Button>
          )}
        </div >
      </div >

      {/* Blockers alert if template has issues */}
      {
        blockers.length > 0 && (
          <div
            role="alert"
            aria-live="polite"
            className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-3"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900">Mẫu thiết kế đang có vấn đề cần khắc phục:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                {blockers.map((b, idx) => (
                  <li key={idx}>{b.message || b.code}</li>
                ))}
              </ul>
            </div>
          </div>
        )
      }

      {/* Main Grid: Left preview & specs, Right metadata & versions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Artwork Preview & Target Specifications */}
        <div className="space-y-6 lg:col-span-1">
          {/* Artwork Preview Card */}
          <Card className="overflow-hidden border-stone-200 bg-white">
            <div className="aspect-4/3 bg-[#F8F3E8] border-b border-stone-200 relative flex items-center justify-center overflow-hidden">
              {template.thumbnailUrl ? (
                <img
                  src={template.thumbnailUrl}
                  alt={template.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-stone-500">
                  <Layers className="w-12 h-12 text-[#A86E22]/50" />
                  <span className="text-xs font-medium text-stone-700">{template.name}</span>
                  <span className="text-[11px] text-stone-400">
                    {PRODUCT_LABELS[template.productId] || template.productId}
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 text-xs text-stone-500 space-y-2">
              <div className="flex items-center justify-between">
                <span>Trạng thái:</span>
                <span className="font-medium text-stone-800 capitalize">
                  {template.status === 'published' ? 'Đã xuất bản' : template.status === 'archived' ? 'Đã lưu trữ' : 'Bản nháp'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Phiên bản hiện hành:</span>
                <span className="font-mono text-stone-800">#{template.revision}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Bản nháp đang sửa:</span>
                <span className="font-mono text-stone-800">
                  {draft ? `#${draft.draftRevision}` : 'Không có'}
                </span>
              </div>
              {template.everPublishedAt && (
                <div className="flex items-center justify-between">
                  <span>Xuất bản lần đầu:</span>
                  <span className="text-stone-800">{new Date(template.everPublishedAt).toLocaleDateString('vi-VN')}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>Cập nhật lần cuối:</span>
                <span className="text-stone-800">{new Date(template.updatedAt).toLocaleDateString('vi-VN')}</span>
              </div>
            </div>
          </Card>

          {/* Exact Target Specifications Card */}
          <Card className="p-4 border-stone-200 bg-white space-y-3">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
              <Info className="w-4 h-4 text-stone-500" />
              <h3 className="text-xs font-bold text-stone-900">Quy cách kỹ thuật (Cố định)</h3>
            </div>

            <div className="space-y-2 text-xs text-stone-600">
              <div className="flex justify-between">
                <span className="text-stone-400">Sản phẩm:</span>
                <span className="font-semibold text-stone-800">
                  {PRODUCT_LABELS[template.productId] || template.productId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Biến thể:</span>
                <span className="font-semibold text-stone-800">
                  {VARIANT_LABELS[template.variantId] || template.variantId}
                </span>
              </div>
              {template.productId === 'wrapping' && template.mode && (
                <div className="flex justify-between">
                  <span className="text-stone-400">Chế độ gói:</span>
                  <span className="font-semibold text-stone-800">
                    {MODE_LABELS[template.mode] || template.mode}
                  </span>
                </div>
              )}
              {template.productId === 'sticker' && template.shape && (
                <div className="flex justify-between">
                  <span className="text-stone-400">Hình dạng:</span>
                  <span className="font-semibold text-stone-800">
                    {SHAPE_LABELS[template.shape] || template.shape}
                  </span>
                </div>
              )}

              {/* Surfaces */}
              {template.target && template.target.surfaces && template.target.surfaces.length > 0 && (
                <div className="pt-2 border-t border-stone-100 space-y-1">
                  <span className="text-stone-400 text-[11px] block mb-1">Kích thước bề mặt (mm):</span>
                  {template.target.surfaces.map((s) => (
                    <div key={s.id} className="flex justify-between font-mono text-[11px] bg-stone-50 px-2 py-1 rounded">
                      <span className="capitalize">{s.id}:</span>
                      <span>
                        {s.widthMm} × {s.heightMm} mm
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Metadata Editor & Versions History */}
        <div className="space-y-6 lg:col-span-2">
          {/* Metadata Editor Card */}
          <Card className="p-5 border-stone-200 bg-white space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-xs font-bold text-stone-900">Thông tin xuất bản & Danh mục</h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Chỉnh sửa tên hiển thị, danh mục và từ khóa tìm kiếm (lưu độc lập với bản vẽ)
                </p>
              </div>

              {metaSaveSuccess && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Đã lưu thông tin</span>
                </span>
              )}
            </div>

            {metaError && (
              <div
                role="alert"
                aria-live="polite"
                className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{metaError}</span>
              </div>
            )}

            <form onSubmit={handleSaveMetadata} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="detail-name" className="text-xs font-medium text-stone-700">
                  Tên mẫu
                </Label>
                <Input
                  id="detail-name"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-xs min-h-[44px] h-11 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="detail-category" className="text-xs font-medium text-stone-700">
                    Danh mục
                  </Label>
                  <select
                    id="detail-category"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full min-h-[44px] h-11 rounded-md border border-stone-200 bg-white px-3 text-xs text-stone-800 focus:outline-none"
                  >
                    <option value="">Không phân loại</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="detail-sort-order" className="text-xs font-medium text-stone-700">
                    Thứ tự sắp xếp
                  </Label>
                  <Input
                    id="detail-sort-order"
                    type="number"
                    value={editSortOrder}
                    onChange={(e) => setEditSortOrder(parseInt(e.target.value, 10) || 0)}
                    className="text-xs min-h-[44px] h-11 bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="detail-tags" className="text-xs font-medium text-stone-700">
                  Thẻ tìm kiếm (phân cách bằng dấu phẩy)
                </Label>
                <Input
                  id="detail-tags"
                  placeholder="cute, vintage, lop-hoc..."
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="text-xs min-h-[44px] h-11 bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={isSavingMeta}
                  className="min-h-[44px] h-11 px-4 text-xs bg-stone-900 text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isSavingMeta ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu thông tin</span>
                  )}
                </Button>
              </div>
            </form>
          </Card>

          {/* Versions History Card */}
          <Card className="p-5 border-stone-200 bg-white space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <History className="w-4 h-4 text-stone-500" />
              <div>
                <h3 className="text-xs font-bold text-stone-900">Lịch sử phiên bản xuất bản</h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Các phiên bản bất biến đã xuất bản của mẫu này
                </p>
              </div>
            </div>

            {versions.length === 0 ? (
              <div className="py-6 text-center text-stone-400 text-xs">
                Chưa có phiên bản xuất bản nào. Mẫu đang ở dạng bản nháp đầu tiên.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {versions.map((ver) => {
                  const isCurrent = ver.id === template.currentPublishedVersionId;
                  return (
                    <div key={ver.id} className="py-3 flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-stone-900">Phiên bản #{ver.version}</span>
                          {isCurrent && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                              Đang áp dụng
                            </Badge>
                          )}
                        </div>
                        {ver.revisionNote && (
                          <p className="text-xs text-stone-600 italic">&ldquo;{ver.revisionNote}&rdquo;</p>
                        )}
                        <p className="text-[10px] text-stone-400">
                          Xuất bản: {new Date(ver.publishedAt).toLocaleString('vi-VN')}
                          {ver.publishedBy ? ` · Bởi: ${ver.publishedBy.slice(0, 8)}...` : ''}
                        </p>
                      </div>

                      <span className="font-mono text-[10px] text-stone-400 shrink-0">
                        {ver.id.slice(0, 8)}...
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Duplicate Dialog */}
      <Dialog open={isDuplicateOpen} onOpenChange={setIsDuplicateOpen}>
        <DialogContent className="max-w-md bg-[#FFFDF8] border-stone-200 text-stone-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-stone-900">Nhân bản mẫu thiết kế</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Tạo một bản sao độc lập của mẫu này với toàn bộ nội dung và tài nguyên hiện tại.
            </DialogDescription>
          </DialogHeader>

          {actionError && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="dup-name" className="text-xs font-medium text-stone-700">
                Tên mẫu mới
              </Label>
              <Input
                id="dup-name"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                className="text-xs min-h-[44px] h-11 bg-white"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDuplicateOpen(false)}
                className="min-h-[44px] h-11 px-4 text-xs cursor-pointer"
              >
                Hủy
              </Button>
              <Button
                type="button"
                disabled={isDuplicating || !duplicateName.trim()}
                onClick={handleDuplicate}
                className="min-h-[44px] h-11 px-4 text-xs bg-stone-900 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {isDuplicating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang nhân bản...</span>
                  </>
                ) : (
                  <span>Tạo bản sao</span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Confirm Dialog */}
      <Dialog open={isArchiveConfirmOpen} onOpenChange={setIsArchiveConfirmOpen}>
        <DialogContent className="max-w-sm bg-[#FFFDF8] border-stone-200 text-stone-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-stone-900">Lưu trữ mẫu thiết kế?</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Mẫu sẽ bị ẩn khỏi danh mục khách hàng. Các dự án và đơn hàng đã dùng mẫu này vẫn được giữ nguyên.
            </DialogDescription>
          </DialogHeader>

          {actionError && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsArchiveConfirmOpen(false)}
              className="min-h-[44px] h-11 px-4 text-xs cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={isArchiving}
              onClick={handleArchive}
              className="min-h-[44px] h-11 px-4 text-xs bg-amber-700 hover:bg-amber-800 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {isArchiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Xác nhận lưu trữ</span>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Republish Confirm Dialog */}
      <Dialog open={isRepublishConfirmOpen} onOpenChange={setIsRepublishConfirmOpen}>
        <DialogContent className="max-w-sm bg-[#FFFDF8] border-stone-200 text-stone-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-stone-900">Đăng lại mẫu thiết kế?</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Khôi phục mẫu từ trạng thái lưu trữ để hiển thị lại trên danh mục khách hàng.
            </DialogDescription>
          </DialogHeader>

          {actionError && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRepublishConfirmOpen(false)}
              className="min-h-[44px] h-11 px-4 text-xs cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={isRepublishing}
              onClick={handleRepublish}
              className="min-h-[44px] h-11 px-4 text-xs bg-[#5F7E67] hover:bg-[#4d6653] text-white font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {isRepublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Đăng lại</span>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Draft Confirm Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-sm bg-[#FFFDF8] border-stone-200 text-stone-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-red-700">Xóa mẫu nháp?</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Hành động này không thể hoàn tác. Mẫu nháp và toàn bộ bản vẽ chưa xuất bản sẽ bị xóa vĩnh viễn.
            </DialogDescription>
          </DialogHeader>

          {actionError && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(false)}
              className="min-h-[44px] h-11 px-4 text-xs cursor-pointer"
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteDraft}
              className="min-h-[44px] h-11 px-4 text-xs bg-red-700 hover:bg-red-800 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Xóa vĩnh viễn</span>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}
