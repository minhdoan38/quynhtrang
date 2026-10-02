'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Archive,
  Send,
  Sparkles,
  FileText,
  ShieldCheck,
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
import type { FontFamilyRecord } from '@/lib/repositories/asset-library-repository';
import type { FontFaceRecord, LibraryStatus, StaffRole, ValidationReceipt } from '@/lib/domain/asset-library';

export interface LibraryFontDetailProps {
  familyId: string;
  userRole: StaffRole;
}

export function LibraryFontDetail({ familyId, userRole }: LibraryFontDetailProps) {
  const [family, setFamily] = useState<FontFamilyRecord | null>(null);
  const [faces, setFaces] = useState<FontFaceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Upload Face Dialog
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [licenseSource, setLicenseSource] = useState('Google Fonts / SIL OFL');
  const [licenseName, setLicenseName] = useState('OFL 1.1');
  const [webEmbedding, setWebEmbedding] = useState(true);
  const [commercialPrint, setCommercialPrint] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Validation details dialog
  const [selectedReceipt, setSelectedReceipt] = useState<ValidationReceipt | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Archive face dialog
  const [archiveTargetFace, setArchiveTargetFace] = useState<FontFaceRecord | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [isArchiveFaceOpen, setIsArchiveFaceOpen] = useState(false);

  // Delete draft face confirmation
  const [deleteTargetFace, setDeleteTargetFace] = useState<FontFaceRecord | null>(null);
  const [isDeleteFaceOpen, setIsDeleteFaceOpen] = useState(false);

  // Edit Family Metadata dialog
  const [isEditFamilyOpen, setIsEditFamilyOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSampleText, setEditSampleText] = useState('');

  // General feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const fetchFamilyData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/content/fonts/${encodeURIComponent(familyId)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Chưa thể tải thông tin họ phông chữ.');
      }
      const data = await res.json();
      setFamily(data.family);
      setFaces(data.faces || []);
      if (data.family) {
        setEditDisplayName(data.family.displayName || data.family.familyName);
        setEditDescription(data.family.description || '');
        setEditSampleText(data.family.sampleText || 'Cảm ơn Việt Nam');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải dữ liệu.');
    } finally {
      setIsLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    fetchFamilyData();
  }, [fetchFamilyData]);

  const handleUploadFace = async () => {
    if (!uploadFile) {
      setUploadError('Vui lòng chọn tệp phông chữ (TTF, OTF, WOFF, WOFF2).');
      return;
    }
    if (!webEmbedding || !commercialPrint) {
      setUploadError('Yêu cầu xác nhận bản quyền: Phải cho phép nhúng web và in ấn thương mại.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.set('file', uploadFile);
      formData.set('source', licenseSource.trim());
      formData.set('name', licenseName.trim());
      formData.set('webEmbedding', String(webEmbedding));
      formData.set('commercialPrint', String(commercialPrint));

      const res = await fetch(`/api/admin/content/fonts/${encodeURIComponent(familyId)}/faces`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi tải lên biến thể phông.');
      }
      setIsUploadOpen(false);
      setUploadFile(null);
      setActionSuccess('Đã tải lên biến thể phông chữ thành công.');
      fetchFamilyData();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Lỗi tải lên.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleValidateFace = async (face: FontFaceRecord) => {
    setIsPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/font-faces/${encodeURIComponent(face.ref.id)}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: face.revision }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi kiểm định.');
      }
      const receipt: ValidationReceipt = await res.json();
      setSelectedReceipt(receipt);
      setIsReceiptOpen(true);
      if (receipt.passed) {
        setActionSuccess(`Kiểm định thành công: Biến thể đạt tiêu chuẩn in ấn (Engine: ${receipt.engineFingerprint})`);
      } else {
        setActionError(`Kiểm định không đạt: ${receipt.failures.map((f) => f.detail).join(', ')}`);
      }
      fetchFamilyData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi kiểm định.');
    } finally {
      setIsPending(false);
    }
  };

  const handlePublishFace = async (face: FontFaceRecord) => {
    setIsPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/font-faces/${encodeURIComponent(face.ref.id)}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: face.revision,
          validationId: face.validationId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi xuất bản.');
      }
      setActionSuccess('Đã xuất bản biến thể phông chữ ra thư viện khách hàng.');
      fetchFamilyData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi xuất bản.');
    } finally {
      setIsPending(false);
    }
  };

  const handleArchiveFace = async () => {
    if (!archiveTargetFace || !archiveReason.trim()) return;
    setIsPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/font-faces/${encodeURIComponent(archiveTargetFace.ref.id)}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: archiveTargetFace.revision,
          reason: archiveReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi lưu trữ.');
      }
      setIsArchiveFaceOpen(false);
      setArchiveTargetFace(null);
      setArchiveReason('');
      setActionSuccess('Đã lưu trữ biến thể phông chữ.');
      fetchFamilyData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi lưu trữ.');
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteFace = async () => {
    if (!deleteTargetFace) return;
    setIsPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/font-faces/${encodeURIComponent(deleteTargetFace.ref.id)}?revision=${deleteTargetFace.revision}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi xóa.');
      }
      setIsDeleteFaceOpen(false);
      setDeleteTargetFace(null);
      setActionSuccess('Đã xóa vĩnh viễn bản nháp biến thể phông chữ.');
      fetchFamilyData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi xóa.');
    } finally {
      setIsPending(false);
    }
  };

  const handleSaveFamilyMetadata = async () => {
    if (!family) return;
    setIsPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/fonts/${encodeURIComponent(family.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: family.revision,
          displayName: editDisplayName.trim(),
          description: editDescription.trim(),
          sampleText: editSampleText.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi cập nhật.');
      }
      setIsEditFamilyOpen(false);
      setActionSuccess('Đã cập nhật thông tin họ phông chữ.');
      fetchFamilyData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi cập nhật.');
    } finally {
      setIsPending(false);
    }
  };

  const handleSetFamilyStatus = async (status: LibraryStatus) => {
    if (!family) return;
    setIsPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/content/fonts/${encodeURIComponent(family.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: family.revision,
          status,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi chuyển trạng thái.');
      }
      setActionSuccess(`Đã cập nhật trạng thái họ phông thành: ${status}.`);
      fetchFamilyData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Lỗi trạng thái.');
    } finally {
      setIsPending(false);
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

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-2 text-stone-500 text-xs">
        <Loader2 className="w-6 h-6 animate-spin text-stone-700" />
        <span>Đang tải thông tin họ phông chữ...</span>
      </div>
    );
  }

  if (errorMsg || !family) {
    return (
      <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <div className="flex-1">{errorMsg || 'Không tìm thấy họ phông chữ.'}</div>
        <Link href="/admin/content/fonts">
          <Button variant="outline" size="sm" className="h-8 text-xs">
            Về danh sách
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Link & Header */}
      <div>
        <Link
          href="/admin/content/fonts"
          className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 transition mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Về danh mục họ phông chữ</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-stone-900">{family.displayName || family.familyName}</h1>
              {getStatusBadge(family.status)}
            </div>
            <p className="text-xs text-stone-500 font-mono">
              Mã họ phông: {family.id} · Thể loại: <span className="uppercase">{family.category || 'sans'}</span> · Phiên bản #{family.revision}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditFamilyOpen(true)}
              className="text-xs h-9"
            >
              Chỉnh sửa thông tin
            </Button>
            {family.status !== 'published' && (
              <Button
                size="sm"
                onClick={() => handleSetFamilyStatus('published')}
                disabled={isPending || faces.filter((f) => f.status === 'published').length === 0}
                className="text-xs h-9 bg-emerald-700 hover:bg-emerald-800 text-white"
                title={faces.filter((f) => f.status === 'published').length === 0 ? 'Cần ít nhất 1 face đã xuất bản để xuất bản họ phông' : ''}
              >
                <Send className="w-3.5 h-3.5 mr-1" />
                Xuất bản họ phông
              </Button>
            )}
            {family.status === 'published' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSetFamilyStatus('archived')}
                disabled={isPending}
                className="text-xs h-9 text-amber-800 border-amber-200 hover:bg-amber-50"
              >
                <Archive className="w-3.5 h-3.5 mr-1" />
                Lưu trữ họ phông
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setUploadError(null);
                setIsUploadOpen(true);
              }}
              className="text-xs h-9 bg-stone-900 text-white"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Thêm kiểu (Face)
            </Button>
          </div>
        </div>
      </div>

      {/* Notifications */}
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

      {/* Preview Strip */}
      <Card className="p-5 bg-white border-stone-200">
        <Label className="text-xs text-stone-500 uppercase tracking-wider block mb-2 font-bold">Mẫu hiển thị</Label>
        <p className="text-2xl text-stone-900 leading-relaxed truncate" style={{ fontFamily: family.familyName }}>
          {family.sampleText || 'Cảm ơn Việt Nam'}
        </p>
        {family.description && <p className="text-xs text-stone-600 mt-2">{family.description}</p>}
      </Card>

      {/* Faces List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-stone-900">
            Danh sách các kiểu phông ({faces.length} kiểu)
          </h2>
          <span className="text-xs text-stone-500">Mỗi kiểu là một tệp phông độc lập (Regular, Bold, Italic...)</span>
        </div>

        {faces.length === 0 ? (
          <Card className="p-10 text-center text-stone-500 text-xs border-dashed">
            <p className="font-semibold text-stone-700">Chưa có kiểu phông chữ nào trong họ này</p>
            <p className="mt-1">Nhấn &quot;Thêm kiểu (Face)&quot; để tải lên tệp phông chữ TTF, OTF hoặc WOFF2.</p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {faces.map((face) => (
              <Card key={face.ref.id} className="p-4 bg-white border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-stone-900">{face.internalFamily}</span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {face.format} · W{face.weightMin} · {face.style}
                    </Badge>
                    {getStatusBadge(face.status)}
                    {face.license && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold">
                        <ShieldCheck className="w-3 h-3" />
                        {face.license.name}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-stone-500 truncate">
                    PostScript: {face.postscriptName} · Checksum: {face.binary.checksum.slice(0, 16)}...
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleValidateFace(face)}
                    disabled={isPending}
                    className="h-8 text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    Kiểm định
                  </Button>

                  {face.status !== 'published' && (
                    <Button
                      size="sm"
                      onClick={() => handlePublishFace(face)}
                      disabled={isPending}
                      className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      Xuất bản
                    </Button>
                  )}

                  {face.status === 'published' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setArchiveTargetFace(face);
                        setIsArchiveFaceOpen(true);
                      }}
                      disabled={isPending}
                      className="h-8 text-xs text-amber-800 border-amber-200 hover:bg-amber-50"
                    >
                      <Archive className="w-3.5 h-3.5 mr-1" />
                      Lưu trữ
                    </Button>
                  )}

                  {userRole === 'admin' && face.status === 'draft' && face.everPublishedAt === null && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDeleteTargetFace(face);
                        setIsDeleteFaceOpen(true);
                      }}
                      disabled={isPending}
                      className="h-8 text-xs text-red-600 hover:bg-red-50 border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upload Face Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Thêm kiểu phông (Font Face)</DialogTitle>
            <DialogDescription className="text-xs">
              Tải lên tệp TTF, OTF, WOFF hoặc WOFF2. Hệ thống sẽ tự động trích xuất bảng mã và kiểm tra độ phủ ký tự tiếng Việt.
            </DialogDescription>
          </DialogHeader>

          {uploadError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Tệp phông chữ *</Label>
              <Input
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setUploadFile(e.target.files[0]);
                  }
                }}
                className="text-xs h-9 cursor-pointer"
              />
            </div>

            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-2 text-xs">
              <Label className="text-xs font-bold text-stone-800">Xác nhận quyền sở hữu & giấy phép</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={licenseSource}
                  onChange={(e) => setLicenseSource(e.target.value)}
                  placeholder="Nguồn (Google Fonts, Adobe...)"
                  className="text-xs h-8"
                />
                <Input
                  value={licenseName}
                  onChange={(e) => setLicenseName(e.target.value)}
                  placeholder="Tên giấy phép (OFL, Commercial...)"
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={webEmbedding}
                    onChange={(e) => setWebEmbedding(e.target.checked)}
                    className="rounded border-stone-300 text-stone-900"
                  />
                  <span>Cho phép nhúng web (Web Embedding)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={commercialPrint}
                    onChange={(e) => setCommercialPrint(e.target.checked)}
                    className="rounded border-stone-300 text-stone-900"
                  />
                  <span>Cho phép in ấn thương mại (Commercial Print)</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(false)} className="text-xs">
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={isUploading || !uploadFile}
              onClick={handleUploadFace}
              className="text-xs bg-stone-900 text-white"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  Đang xử lý & phân tích...
                </>
              ) : (
                'Tải lên & kiểm tra'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Receipt Dialog */}
      <Dialog open={isReceiptOpen} onOpenChange={setIsReceiptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-stone-700" />
              <span>Kết quả kiểm định phông chữ</span>
            </DialogTitle>
          </DialogHeader>
          {selectedReceipt && (
            <div className="space-y-3 py-2 text-xs">
              <div className={`p-3 rounded-lg border flex items-center gap-2 ${selectedReceipt.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {selectedReceipt.passed ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span className="font-semibold">{selectedReceipt.passed ? 'Đạt tiêu chuẩn xuất bản' : 'Không đạt tiêu chuẩn xuất bản'}</span>
              </div>
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 font-mono space-y-1 text-[11px] text-stone-700">
                <p>Engine: {selectedReceipt.engineFingerprint}</p>
                <p>Thiếu ký tự tiếng Việt: {selectedReceipt.missingCodepoints.length === 0 ? 'Không (Đủ 100%)' : `${selectedReceipt.missingCodepoints.length} ký tự`}</p>
                <p>Browser Proof Hash: {selectedReceipt.browserProofHash?.slice(0, 24) || 'N/A'}...</p>
              </div>
              {selectedReceipt.failures.length > 0 && (
                <div className="space-y-1 text-red-600">
                  <p className="font-bold">Lỗi phát hiện:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {selectedReceipt.failures.map((f, i) => (
                      <li key={i}>{f.detail}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button size="sm" onClick={() => setIsReceiptOpen(false)} className="text-xs">
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Family Dialog */}
      <Dialog open={isEditFamilyOpen} onOpenChange={setIsEditFamilyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Chỉnh sửa thông tin họ phông</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Tên hiển thị</Label>
              <Input
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Văn bản mẫu</Label>
              <Input
                value={editSampleText}
                onChange={(e) => setEditSampleText(e.target.value)}
                className="text-xs h-8"
              />
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
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsEditFamilyOpen(false)} className="text-xs">
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={isPending}
              onClick={handleSaveFamilyMetadata}
              className="text-xs bg-stone-900 text-white"
            >
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Face Dialog */}
      <Dialog open={isArchiveFaceOpen} onOpenChange={setIsArchiveFaceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-amber-900">Xác nhận lưu trữ kiểu phông</DialogTitle>
            <DialogDescription className="text-xs text-stone-600">
              Kiểu phông này sẽ không còn hiển thị để khách chọn cho văn bản mới. Các thiết kế cũ đã lưu vẫn giữ nguyên vẹn liên kết.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Lý do lưu trữ (bắt buộc 3–500 ký tự)</Label>
            <Textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Ví dụ: Thay thế biến thể nét mảnh tối ưu hơn..."
              className="text-xs"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsArchiveFaceOpen(false)} className="text-xs">
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={archiveReason.trim().length < 3 || isPending}
              onClick={handleArchiveFace}
              className="text-xs bg-amber-700 hover:bg-amber-800 text-white"
            >
              Xác nhận lưu trữ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Draft Face Dialog */}
      <Dialog open={isDeleteFaceOpen} onOpenChange={setIsDeleteFaceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-red-900">Xóa bản nháp kiểu phông</DialogTitle>
            <DialogDescription className="text-xs text-stone-600">
              Thao tác này xóa vĩnh viễn tệp phông nháp khỏi bộ lưu trữ riêng tư. Thao tác không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsDeleteFaceOpen(false)} className="text-xs">
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={isPending}
              onClick={handleDeleteFace}
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
