'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Filter,
  AlertCircle,
  AlertTriangle,
  Loader2,
  FileBox,
  Layers,
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

import type { TemplateRecord, TemplateCategoryRecord, EligibleSourceProject } from '@/lib/domain/template';
import type { FixedStickerShape, ProductId } from '@/lib/product-state';

export interface TemplateLibraryProps {
  userRole: 'admin' | 'editor';
  currentStaff?: {
    userId: string;
    role: 'admin' | 'editor';
    name?: string;
  };
}

type TabStatus = 'all' | 'draft' | 'published' | 'needs_update' | 'archived';

const PRODUCT_LABELS: Record<string, string> = {
  card: 'Thiệp',
  wrapping: 'Giấy gói quà',
  sticker: 'Sticker',
  notebook: 'Sổ tay',
};

const VARIANT_LABELS: Record<string, string> = {
  horizontal: 'Ngang',
  vertical: 'Dọc',
  a1: 'Khổ A1',
  a2: 'Khổ A2',
  'fixed-shape': 'Hình cố định',
  'die-cut': 'Cắt viền',
  phone: 'Ốp lưng',
  standard: 'Tiêu chuẩn',
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

export function TemplateLibrary({ userRole: _userRole }: TemplateLibraryProps) {
  const router = useRouter();

  // 1. Filter States
  const [activeTab, setActiveTab] = useState<TabStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 24;

  // 2. Data States
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState<TemplateCategoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 3. Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'new' | 'from_project'>('new');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form: Tạo mới
  const [newTitle, setNewTitle] = useState('');
  const [newProduct, setNewProduct] = useState<ProductId>('card');
  const [newVariant, setNewVariant] = useState<string>('horizontal');
  const [newMode, setNewMode] = useState<'pattern' | 'full-sheet'>('pattern');
  const [newShape, setNewShape] = useState<FixedStickerShape>('circle');
  const [newCategory, setNewCategory] = useState<string>('');
  const [newTags, setNewTags] = useState<string>('');

  // Form: Tạo từ thiết kế
  const [eligibleProjects, setEligibleProjects] = useState<EligibleSourceProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [rightsAcknowledged, setRightsAcknowledged] = useState(false);
  const [isLoadingSources, setIsLoadingSources] = useState(false);

  // Load categories on mount
  useEffect(() => {
    let mounted = true;
    async function loadCategories() {
      try {
        const res = await fetch('/api/admin/content/templates/categories');
        if (res.ok) {
          const data = await res.json();
          if (mounted && Array.isArray(data.categories)) {
            setCategories(data.categories);
          }
        }
      } catch {
        // Fallback to static if request fails
      }
    }
    loadCategories();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch templates list
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      if (activeTab === 'needs_update') {
        params.set('status', 'needs_update');
      } else if (activeTab !== 'all') {
        params.set('status', activeTab);
      }

      if (productFilter !== 'all') params.set('productId', productFilter);
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/admin/content/templates?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Không thể tải danh sách mẫu thiết kế. Vui lòng thử lại.');
      }
      const data = await res.json();
      setTemplates(data.items || []);
      setTotalCount(data.total || 0);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi kết nối máy chủ');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, productFilter, categoryFilter, searchQuery, page, pageSize]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Handle Product change in Create New to update default variants
  const handleProductChange = (prod: ProductId) => {
    setNewProduct(prod);
    if (prod === 'card') {
      setNewVariant('horizontal');
    } else if (prod === 'wrapping') {
      setNewVariant('a1');
      setNewMode('pattern');
    } else if (prod === 'sticker') {
      setNewVariant('fixed-shape');
      setNewShape('circle');
    } else if (prod === 'notebook') {
      setNewVariant('standard');
    }
  };

  // Load eligible projects when switching to "from_project"
  const loadEligibleSources = async () => {
    setIsLoadingSources(true);
    try {
      const res = await fetch('/api/admin/content/templates/sources');
      if (res.ok) {
        const data = await res.json();
        const items: EligibleSourceProject[] = data.items || [];
        setEligibleProjects(items);
        if (items.length > 0 && !selectedProjectId) {
          setSelectedProjectId(items[0].id);
          setNewTitle(`Mẫu từ ${PRODUCT_LABELS[items[0].productId] || items[0].productId}`);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingSources(false);
    }
  };

  // Create Submit handler
  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCreateError(null);

    try {
      if (createMode === 'new') {
        const titleTrimmed = newTitle.trim();
        if (!titleTrimmed) {
          throw new Error('Vui lòng nhập tên mẫu thiết kế');
        }

        const targetPayload: {
          productId: ProductId;
          variantId: string;
          mode: 'pattern' | 'full-sheet' | null;
          shape: FixedStickerShape | null;
        } = {
          productId: newProduct,
          variantId: newVariant,
          mode: newProduct === 'wrapping' ? newMode : null,
          shape: newProduct === 'sticker' && newVariant === 'fixed-shape' ? newShape : null,
        };

        const tagsList = newTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        const res = await fetch('/api/admin/content/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: titleTrimmed,
            target: targetPayload,
            categoryId: newCategory || null,
            tags: tagsList,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || 'Tạo mẫu thất bại');
        }

        setIsCreateOpen(false);
        router.push(`/admin/content/templates/${data.template.id}/edit`);
      } else {
        // Create from project
        const project = eligibleProjects.find((p) => p.id === selectedProjectId);
        if (!project) {
          throw new Error('Vui lòng chọn thiết kế nguồn');
        }
        if (!rightsAcknowledged) {
          throw new Error('Vui lòng xác nhận quyền sở hữu thiết kế');
        }
        const titleTrimmed = newTitle.trim() || `Mẫu từ ${project.id.slice(0, 8)}`;

        const targetPayload: {
          productId: ProductId;
          variantId: string;
          mode: 'pattern' | 'full-sheet' | null;
          shape: FixedStickerShape | null;
        } = {
          productId: (project.productId as ProductId) || 'card',
          variantId: project.variantId || (project.productId === 'wrapping' ? 'a1' : 'horizontal'),
          mode: project.productId === 'wrapping' ? 'pattern' : null,
          shape: project.productId === 'sticker' && project.variantId === 'fixed-shape' ? 'circle' : null,
        };

        const res = await fetch('/api/admin/content/templates/from-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceProjectId: project.id,
            expectedSourceRevision: project.currentWorkingRevision,
            name: titleTrimmed,
            rightsAcknowledged: true,
            requestId: crypto.randomUUID(),
            target: targetPayload,
            categoryId: newCategory || null,
            tags: newTags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message || 'Tạo mẫu từ thiết kế thất bại');
        }

        setIsCreateOpen(false);
        router.push(`/admin/content/templates/${data.template.id}/edit`);
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getExactTargetLabel = (t: TemplateRecord) => {
    const prod = PRODUCT_LABELS[t.productId] || t.productId;
    const variant = VARIANT_LABELS[t.variantId] || t.variantId;
    let extra = '';
    if (t.productId === 'wrapping' && t.mode) {
      extra = ` · ${MODE_LABELS[t.mode] || t.mode}`;
    } else if (t.productId === 'sticker' && t.shape) {
      extra = ` · ${SHAPE_LABELS[t.shape] || t.shape}`;
    }
    return `${prod} · ${variant}${extra}`;
  };

  const getStatusBadge = (t: TemplateRecord) => {
    if (t.status === 'archived') {
      return (
        <Badge variant="outline" className="bg-stone-100 text-stone-600 border-stone-300">
          Đã lưu trữ
        </Badge>
      );
    }
    if (t.status === 'published') {
      if (t.blockers && t.blockers.length > 0) {
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>Cần cập nhật</span>
          </Badge>
        );
      }
      return (
        <Badge className="bg-[#5F7E67]/15 text-[#3b5341] border-[#5F7E67]/30">
          Đã xuất bản
        </Badge>
      );
    }
    return (
      <Badge className="bg-[#A86E22]/15 text-[#734b17] border-[#A86E22]/30">
        Bản nháp
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900 tracking-tight">Thư viện mẫu thiết kế</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Quản lý và xuất bản các mẫu thiết kế sẵn cho xưởng in và khách hàng
          </p>
        </div>

        <Button
          onClick={() => {
            setCreateError(null);
            setNewTitle('');
            handleProductChange('card');
            setIsCreateOpen(true);
          }}
          className="min-h-[44px] h-11 text-xs bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-2 px-4 rounded-lg font-semibold shadow-xs shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Tạo mẫu</span>
        </Button>
      </div>

      {/* View Tabs */}
      <nav aria-label="Lọc theo trạng thái" className="flex items-center gap-1 border-b border-stone-200 overflow-x-auto pb-px">
        {[
          { id: 'all', label: 'Tất cả' },
          { id: 'draft', label: 'Bản nháp' },
          { id: 'published', label: 'Đã đăng' },
          { id: 'needs_update', label: 'Cần cập nhật' },
          { id: 'archived', label: 'Đã lưu trữ' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id as TabStatus);
                setPage(1);
              }}
              aria-pressed={isActive}
              className={`min-h-[44px] inline-flex items-center px-3.5 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition -mb-px cursor-pointer ${isActive
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300'
                }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Search name or tags */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Tìm theo tên hoặc nhãn..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9 min-h-[44px] h-11 text-xs bg-white border-stone-200"
            />
          </div>

          {/* Product Filter */}
          <div className="flex items-center gap-1.5 shrink-0 text-xs">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={productFilter}
              onChange={(e) => {
                setProductFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo sản phẩm"
              className="min-h-[44px] h-11 rounded-md border border-stone-200 bg-white px-3 text-xs text-stone-700 focus:outline-none"
            >
              <option value="all">Tất cả sản phẩm</option>
              <option value="card">Thiệp</option>
              <option value="wrapping">Giấy gói quà</option>
              <option value="sticker">Sticker</option>
              <option value="notebook">Sổ tay</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo danh mục"
              className="min-h-[44px] h-11 rounded-md border border-stone-200 bg-white px-3 text-xs text-stone-700 focus:outline-none"
            >
              <option value="all">Tất cả danh mục</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filters Button if any active */}
        {(searchQuery || productFilter !== 'all' || categoryFilter !== 'all' || activeTab !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setProductFilter('all');
              setCategoryFilter('all');
              setActiveTab('all');
              setPage(1);
            }}
            className="min-h-[44px] h-11 px-3 text-xs text-stone-600 hover:text-stone-900 cursor-pointer"
          >
            Xóa bộ lọc
          </Button>
        )}
      </div>

      {/* Grid Content */}
      {isLoading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-2 text-stone-500 text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-stone-700" />
          <span>Đang tải danh sách mẫu thiết kế...</span>
        </div>
      ) : errorMsg ? (
        <div
          role="alert"
          aria-live="polite"
          className="p-6 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTemplates} className="min-h-[44px] h-11 px-3.5 text-xs shrink-0 cursor-pointer">
            Thử lại
          </Button>
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-12 text-center text-stone-500 text-xs border-dashed bg-white">
          <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3 text-stone-400">
            <FileBox className="w-6 h-6" />
          </div>
          <p className="font-semibold text-stone-800 text-sm">Chưa tìm thấy mẫu thiết kế nào</p>
          <p className="mt-1 text-stone-500">
            {searchQuery || productFilter !== 'all' || categoryFilter !== 'all' || activeTab !== 'all'
              ? 'Không có mẫu nào phù hợp với bộ lọc hiện tại. Nhấn "Xóa bộ lọc" để xem toàn bộ.'
              : 'Chưa có mẫu nào trong hệ thống. Nhấn "+ Tạo mẫu" để bắt đầu soạn mẫu mới.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                setCreateError(null);
                setIsCreateOpen(true);
              }}
              className="min-h-[44px] h-11 px-4 text-xs bg-stone-900 text-white cursor-pointer"
            >
              + Tạo mẫu
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {templates.map((tmpl) => (
            <Card
              key={tmpl.id}
              onClick={() => router.push(`/admin/content/templates/${tmpl.id}`)}
              className="group cursor-pointer overflow-hidden border-stone-200 bg-white hover:border-stone-400 hover:shadow-xs transition flex flex-col justify-between"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-4/3 bg-[#F8F3E8] border-b border-stone-200 overflow-hidden flex items-center justify-center">
                {tmpl.thumbnailUrl ? (
                  <img
                    src={tmpl.thumbnailUrl}
                    alt={tmpl.name}
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-102"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                    <Layers className="w-8 h-8 text-[#A86E22]/60" />
                    <span className="text-[11px] font-medium text-stone-600 line-clamp-1">{tmpl.name}</span>
                    <span className="text-[10px] text-stone-400 font-mono">
                      {PRODUCT_LABELS[tmpl.productId] || tmpl.productId}
                    </span>
                  </div>
                )}

                {/* Status Badge in thumbnail corner */}
                <div className="absolute top-2 right-2">{getStatusBadge(tmpl)}</div>
              </div>

              {/* Card Meta Content */}
              <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-stone-900 line-clamp-1 group-hover:text-[#315F86] transition-colors">
                    {tmpl.name}
                  </h3>
                  <p className="text-[11px] text-stone-500 mt-0.5">{getExactTargetLabel(tmpl)}</p>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400">
                  <span>Phiên bản #{tmpl.revision}</span>
                  {tmpl.tags && tmpl.tags.length > 0 && (
                    <span className="truncate max-w-[120px]">#{tmpl.tags[0]}</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalCount > pageSize && (
        <div className="flex items-center justify-between pt-4 border-t border-stone-200 text-xs text-stone-500">
          <span>
            Hiển thị {templates.length} / {totalCount} mẫu
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="min-h-[44px] h-11 px-3.5 text-xs cursor-pointer"
            >
              Trang trước
            </Button>
            <span className="px-2 font-medium">Trang {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= totalCount}
              onClick={() => setPage((p) => p + 1)}
              className="min-h-[44px] h-11 px-3.5 text-xs cursor-pointer"
            >
              Trang sau
            </Button>
          </div>
        </div>
      )}

      {/* + Tạo mẫu Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md bg-[#FFFDF8] border-stone-200 text-stone-900">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-stone-900">Tạo mẫu thiết kế mới</DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Chọn phương thức tạo mẫu: bắt đầu mẫu mới hoặc nhân bản từ thiết kế đã duyệt.
            </DialogDescription>
          </DialogHeader>

          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-lg text-xs font-semibold mt-2">
            <button
              type="button"
              onClick={() => setCreateMode('new')}
              className={`min-h-[44px] inline-flex items-center justify-center py-2 px-3 rounded-md transition text-center cursor-pointer ${createMode === 'new'
                ? 'bg-white text-stone-900 shadow-2xs'
                : 'text-stone-500 hover:text-stone-900'
                }`}
            >
              Tạo mới
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateMode('from_project');
                loadEligibleSources();
              }}
              className={`min-h-[44px] inline-flex items-center justify-center py-2 px-3 rounded-md transition text-center cursor-pointer ${createMode === 'from_project'
                ? 'bg-white text-stone-900 shadow-2xs'
                : 'text-stone-500 hover:text-stone-900'
                }`}
            >
              Tạo từ thiết kế
            </button>
          </div>

          {createError && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-center gap-2 mt-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="space-y-4 mt-3">
            {createMode === 'new' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="template-name" className="text-xs font-medium text-stone-700">
                    Tên mẫu
                  </Label>
                  <Input
                    id="template-name"
                    required
                    placeholder="VD: Thiệp lớp học, Giấy gói hoa nhí..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="text-xs min-h-[44px] h-11 bg-white"
                  />
                </div>

                {/* Product Select */}
                <div className="space-y-1.5">
                  <Label htmlFor="template-product" className="text-xs font-medium text-stone-700">
                    Sản phẩm
                  </Label>
                  <select
                    id="template-product"
                    value={newProduct}
                    onChange={(e) => handleProductChange(e.target.value as ProductId)}
                    className="w-full min-h-[44px] h-11 rounded-md border border-stone-200 bg-white px-3 text-xs text-stone-800 focus:outline-none"
                  >
                    <option value="card">Thiệp chúc mừng (card)</option>
                    <option value="wrapping">Giấy gói quà (wrapping)</option>
                    <option value="sticker">Sticker (sticker)</option>
                    <option value="notebook">Sổ tay (notebook)</option>
                  </select>
                </div>

                {/* Variant Select */}
                <div className="space-y-1.5">
                  <Label htmlFor="template-variant" className="text-xs font-medium text-stone-700">
                    Biến thể
                  </Label>
                  <select
                    id="template-variant"
                    value={newVariant}
                    onChange={(e) => setNewVariant(e.target.value)}
                    className="w-full min-h-[44px] h-11 rounded-md border border-stone-200 bg-white px-3 text-xs text-stone-800 focus:outline-none"
                  >
                    {newProduct === 'card' && (
                      <>
                        <option value="horizontal">Ngang (horizontal)</option>
                        <option value="vertical">Dọc (vertical)</option>
                      </>
                    )}
                    {newProduct === 'wrapping' && (
                      <>
                        <option value="a1">Khổ A1 (594 x 841 mm)</option>
                        <option value="a2">Khổ A2 (420 x 594 mm)</option>
                      </>
                    )}
                    {newProduct === 'sticker' && (
                      <>
                        <option value="fixed-shape">Hình cố định (fixed-shape)</option>
                        <option value="die-cut">Cắt viền (die-cut)</option>
                        <option value="phone">Ốp lưng (phone)</option>
                      </>
                    )}
                    {newProduct === 'notebook' && (
                      <option value="standard">Tiêu chuẩn (standard)</option>
                    )}
                  </select>
                </div>

                {/* Wrapping Mode option */}
                {newProduct === 'wrapping' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="template-mode" className="text-xs font-medium text-stone-700">
                      Chế độ
                    </Label>
                    <select
                      id="template-mode"
                      value={newMode}
                      onChange={(e) => setNewMode(e.target.value as 'pattern' | 'full-sheet')}
                      className="w-full min-h-[44px] h-11 rounded-md border border-stone-200 bg-white px-3 text-xs text-stone-800 focus:outline-none"
                    >
                      <option value="pattern">Lặp họa tiết (pattern)</option>
                      <option value="full-sheet">Toàn tờ (full-sheet)</option>
                    </select>
                  </div>
                )}

                {/* Fixed Sticker Shape option */}
                {newProduct === 'sticker' && newVariant === 'fixed-shape' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="template-shape" className="text-xs font-medium text-stone-700">
                      Hình dạng
                    </Label>
                    <select
                      id="template-shape"
                      value={newShape}
                      onChange={(e) => setNewShape(e.target.value as FixedStickerShape)}
                      className="w-full min-h-[44px] h-11 rounded-md border border-stone-200 bg-white px-3 text-xs text-stone-800 focus:outline-none"
                    >
                      <option value="circle">Hình tròn (circle)</option>
                      <option value="square">Hình vuông (square)</option>
                      <option value="oval">Hình bầu dục (oval)</option>
                      <option value="arch">Hình vòm (arch)</option>
                      <option value="star">Ngôi sao (star)</option>
                      <option value="heart">Trái tim (heart)</option>
                      <option value="badge">Huy hiệu (badge)</option>
                    </select>
                  </div>
                )}

                {/* Category & Tags */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="template-category" className="text-xs font-medium text-stone-700">
                      Danh mục
                    </Label>
                    <select
                      id="template-category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
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
                    <Label htmlFor="template-tags" className="text-xs font-medium text-stone-700">
                      Thẻ (tags)
                    </Label>
                    <Input
                      id="template-tags"
                      placeholder="cute, vintage, lop-hoc"
                      value={newTags}
                      onChange={(e) => setNewTags(e.target.value)}
                      className="text-xs min-h-[44px] h-11 bg-white"
                    />
                  </div>
                </div>
              </>
            ) : (
              /* Create from project mode */
              <>
                {isLoadingSources ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-stone-500 text-xs">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang tìm kiếm thiết kế đủ điều kiện...</span>
                  </div>
                ) : eligibleProjects.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs">
                    Không tìm thấy thiết kế đủ điều kiện do bạn sở hữu. Hãy tạo một thiết kế mới trong xưởng trước.
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="template-source-project" className="text-xs font-medium text-stone-700">
                        Thiết kế nguồn
                      </Label>
                      <select
                        id="template-source-project"
                        value={selectedProjectId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedProjectId(id);
                          const p = eligibleProjects.find((x) => x.id === id);
                          if (p) setNewTitle(`Mẫu từ ${PRODUCT_LABELS[p.productId] || p.productId}`);
                        }}
                        className="w-full min-h-[44px] h-11 rounded-md border border-stone-200 bg-white px-3 text-xs text-stone-800 focus:outline-none"
                      >
                        {eligibleProjects.map((proj) => (
                          <option key={proj.id} value={proj.id}>
                            {PRODUCT_LABELS[proj.productId] || proj.productId} ({proj.id.slice(0, 8)}) - Phiên bản #{proj.currentWorkingRevision}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="template-source-name" className="text-xs font-medium text-stone-700">
                        Tên mẫu
                      </Label>
                      <Input
                        id="template-source-name"
                        required
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="text-xs min-h-[44px] h-11 bg-white"
                      />
                    </div>

                    <div className="pt-2">
                      <label className="flex items-start gap-2.5 cursor-pointer text-xs text-stone-700">
                        <input
                          type="checkbox"
                          checked={rightsAcknowledged}
                          onChange={(e) => setRightsAcknowledged(e.target.checked)}
                          className="mt-0.5 rounded border-stone-300 text-stone-900 focus:ring-stone-900 cursor-pointer"
                        />
                        <span>
                          Tôi xác nhận có toàn quyền sở hữu hoặc quyền sử dụng hợp pháp đối với thiết kế này để xuất bản làm mẫu.
                        </span>
                      </label>
                    </div>
                  </>
                )}
              </>
            )}

            <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                className="min-h-[44px] h-11 px-4 text-xs cursor-pointer"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || (createMode === 'from_project' && (!rightsAcknowledged || eligibleProjects.length === 0))}
                className="min-h-[44px] h-11 px-4 text-xs bg-stone-900 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang khởi tạo...</span>
                  </>
                ) : (
                  <span>Tạo bản nháp</span>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
