'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Send,
  Archive,
  ArrowRight,
  Type,
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
import type { FontCategory, LibraryStatus, StaffRole } from '@/lib/domain/asset-library';

export interface LibraryFontsProps {
  userRole: StaffRole;
}

export function LibraryFonts({ userRole }: LibraryFontsProps) {
  const [families, setFamilies] = useState<FontFamilyRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(40);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create Family dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newId, setNewId] = useState('');
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newCategory, setNewCategory] = useState<FontCategory>('sans');
  const [newDescription, setNewDescription] = useState('');
  const [newSampleText, setNewSampleText] = useState('Cảm ơn Việt Nam');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchFamilies = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await fetch(`/api/admin/content/fonts?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Chưa thể tải danh sách họ phông chữ.');
      }
      const data = await res.json();
      setFamilies(data.items || []);
      setTotal(data.total || 0);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải dữ liệu.');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, statusFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  const handleCreateFamily = async () => {
    if (!newFamilyName.trim()) {
      setCreateError('Tên họ phông chữ không được để trống.');
      return;
    }
    const slugId = (newId.trim() || newFamilyName.trim())
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');

    setIsSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/content/fonts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: slugId,
          familyName: newFamilyName.trim(),
          displayName: newDisplayName.trim() || newFamilyName.trim(),
          category: newCategory,
          description: newDescription.trim(),
          sampleText: newSampleText.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi tạo họ phông chữ.');
      }
      setIsCreateOpen(false);
      setNewId('');
      setNewFamilyName('');
      setNewDisplayName('');
      setNewDescription('');
      fetchFamilies();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Lỗi tạo.');
    } finally {
      setIsSubmitting(false);
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
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder="Tìm phông chữ..."
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
              <option value="draft">Bản nháp</option>
              <option value="published">Đã xuất bản</option>
              <option value="archived">Lưu trữ</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-stone-200 bg-white px-2.5 text-xs text-stone-700 focus:outline-none"
            >
              <option value="all">Tất cả thể loại</option>
              <option value="sans">Sans-serif</option>
              <option value="serif">Serif</option>
              <option value="display">Display</option>
              <option value="handwriting">Handwriting</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="h-9 text-xs bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm họ phông chữ</span>
          </Button>
        </div>
      </div>

      {/* Content List */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-stone-500 text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-stone-700" />
          <span>Đang tải danh sách họ phông chữ...</span>
        </div>
      ) : errorMsg ? (
        <div role="alert" aria-live="polite" className="p-6 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1">{errorMsg}</div>
          <Button variant="outline" size="sm" onClick={fetchFamilies} className="h-8 text-xs">
            Thử lại
          </Button>
        </div>
      ) : families.length === 0 ? (
        <Card className="p-12 text-center text-stone-500 text-xs border-dashed">
          <p className="font-semibold text-stone-700">Chưa có họ phông chữ nào</p>
          <p className="mt-1">Nhấn &quot;Thêm họ phông chữ&quot; để tạo một nhóm kiểu chữ mới.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {families.map((fam) => (
            <Card
              key={fam.id}
              className="p-4 bg-white border-stone-200 hover:border-stone-400 hover:shadow-xs transition flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">{fam.displayName || fam.familyName}</h3>
                    <p className="text-xs text-stone-500 font-mono">ID: {fam.id}</p>
                  </div>
                  <div>{getStatusBadge(fam.status)}</div>
                </div>

                <div className="p-3 rounded-lg bg-stone-50 border border-stone-100">
                  <p className="text-lg text-stone-800 truncate" style={{ fontFamily: fam.familyName }}>
                    {fam.sampleText || 'Cảm ơn Việt Nam'}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {fam.category || 'sans'}
                  </Badge>
                  <span>· Phiên bản #{fam.revision}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 mt-4 flex items-center justify-between">
                <span className="text-xs text-stone-500">Quản lý các kiểu (faces)</span>
                <Link
                  href={`/admin/content/fonts/${encodeURIComponent(fam.id)}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-stone-900 hover:text-stone-700"
                >
                  <span>Chi tiết & tệp</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between border-t border-stone-200 pt-4 text-xs text-stone-500">
          <span>
            Hiển thị {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} trong số {total} họ phông
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

      {/* Create Family Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Thêm họ phông chữ mới</DialogTitle>
            <DialogDescription className="text-xs">
              Tạo họ phông chữ để gom nhóm các biến thể độ đậm nhạt (Regular, Bold, Italic...).
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <div role="alert" aria-live="assertive" className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Tên họ phông (Family Name) *</Label>
              <Input
                placeholder="VD: Be Vietnam Pro, Playfair Display..."
                value={newFamilyName}
                onChange={(e) => setNewFamilyName(e.target.value)}
                className="text-xs h-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Tên hiển thị</Label>
                <Input
                  placeholder="Tên hiển thị cho khách"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Thể loại</Label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as FontCategory)}
                  className="h-8 w-full rounded-md border border-stone-200 bg-white px-2 text-xs"
                >
                  <option value="sans">Sans-serif</option>
                  <option value="serif">Serif</option>
                  <option value="display">Display</option>
                  <option value="handwriting">Handwriting</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Văn bản mẫu hiển thị</Label>
              <Input
                value={newSampleText}
                onChange={(e) => setNewSampleText(e.target.value)}
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mô tả</Label>
              <Textarea
                rows={2}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)} className="text-xs">
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={isSubmitting || !newFamilyName.trim()}
              onClick={handleCreateFamily}
              className="text-xs bg-stone-900 text-white"
            >
              {isSubmitting ? 'Đang tạo...' : 'Tạo họ phông'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
