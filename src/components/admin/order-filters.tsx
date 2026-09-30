'use client';

import { Search, X, ChevronDown, Check, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { InboxQueryParams } from '@/lib/admin/inbox-query';
import type { ProductId } from '@/lib/product-state';
import type { PaymentStatus } from '@/lib/domain/order';

export interface OrderFiltersProps {
  query: InboxQueryParams;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onFilterChange: (updates: Partial<InboxQueryParams>) => void;
  onResetFilters: () => void;
  isFiltered: boolean;
  totalResults?: number;
  className?: string;
}

const PRODUCT_OPTIONS: Array<{ value: ProductId | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả sản phẩm' },
  { value: 'wrapping', label: 'Giấy bọc quà' },
  { value: 'card', label: 'Thiệp chúc mừng' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'notebook', label: 'Bìa sổ tay' },
];

const PAYMENT_OPTIONS: Array<{ value: PaymentStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả thanh toán' },
  { value: 'pending_payment', label: 'Chờ thanh toán' },
  { value: 'payment_reported', label: 'Khách báo đã chuyển' },
  { value: 'paid', label: 'Đã thanh toán' },
  { value: 'payment_failed', label: 'Thanh toán lỗi' },
  { value: 'cancelled', label: 'Đã hủy' },
];

const DATE_OPTIONS: Array<{ value: NonNullable<InboxQueryParams['date']> | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả thời gian' },
  { value: 'today', label: 'Hôm nay' },
  { value: '7d', label: '7 ngày qua' },
  { value: '30d', label: '30 ngày qua' },
];

export function OrderFilters({
  query,
  searchInput,
  onSearchChange,
  onSearchClear,
  onFilterChange,
  onResetFilters,
  isFiltered,
  totalResults,
  className,
}: OrderFiltersProps) {
  const activeProduct = PRODUCT_OPTIONS.find((opt) => opt.value === query.product) ?? PRODUCT_OPTIONS[0];
  const activePayment = PAYMENT_OPTIONS.find((opt) => opt.value === query.payment) ?? PAYMENT_OPTIONS[0];
  const activeDate = DATE_OPTIONS.find((opt) => opt.value === query.date) ?? DATE_OPTIONS[0];

  return (
    <div
      className={cn('flex flex-col gap-3 py-3 border-b border-[#DDD6CC]/70 bg-white/60 backdrop-blur-xs', className)}
      data-slot="order-filters"
    >
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666A6D] pointer-events-none" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm mã đơn, tên, SĐT..."
            className="pl-9 pr-9 h-9 text-xs sm:text-sm bg-white border-[#DDD6CC] text-[#2E3338] placeholder:text-[#666A6D]/60 focus-visible:border-[#315F86] focus-visible:ring-1 focus-visible:ring-[#315F86]"
          />
          {searchInput && (
            <button
              type="button"
              onClick={onSearchClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-[#666A6D] hover:text-[#2E3338] hover:bg-[#F8F3E8] transition-colors"
              aria-label="Xóa tìm kiếm"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown Filters Group */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Product Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9 px-2.5 text-xs font-medium border-[#DDD6CC] bg-white text-[#2E3338] hover:bg-[#F8F3E8]',
                    query.product && 'border-[#315F86] bg-[#DCEBF4]/40 text-[#244A69] font-semibold'
                  )}
                >
                  <span className="truncate max-w-[120px]">{activeProduct.label}</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60" />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-44 bg-white border-[#DDD6CC] shadow-md">
              {PRODUCT_OPTIONS.map((opt) => {
                const isSelected = (!query.product && opt.value === 'all') || query.product === opt.value;
                return (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => onFilterChange({ product: opt.value === 'all' ? undefined : opt.value })}
                    className={cn(
                      'text-xs flex items-center justify-between cursor-pointer py-1.5',
                      isSelected ? 'bg-[#DCEBF4]/50 font-semibold text-[#244A69]' : 'text-[#2E3338]'
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#315F86]" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Payment Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9 px-2.5 text-xs font-medium border-[#DDD6CC] bg-white text-[#2E3338] hover:bg-[#F8F3E8]',
                    query.payment && 'border-[#315F86] bg-[#DCEBF4]/40 text-[#244A69] font-semibold'
                  )}
                >
                  <span className="truncate max-w-[130px]">{activePayment.label}</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60" />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-48 bg-white border-[#DDD6CC] shadow-md">
              {PAYMENT_OPTIONS.map((opt) => {
                const isSelected = (!query.payment && opt.value === 'all') || query.payment === opt.value;
                return (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => onFilterChange({ payment: opt.value === 'all' ? undefined : opt.value })}
                    className={cn(
                      'text-xs flex items-center justify-between cursor-pointer py-1.5',
                      isSelected ? 'bg-[#DCEBF4]/50 font-semibold text-[#244A69]' : 'text-[#2E3338]'
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#315F86]" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Date Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9 px-2.5 text-xs font-medium border-[#DDD6CC] bg-white text-[#2E3338] hover:bg-[#F8F3E8]',
                    query.date && 'border-[#315F86] bg-[#DCEBF4]/40 text-[#244A69] font-semibold'
                  )}
                >
                  <span className="truncate max-w-[110px]">{activeDate.label}</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-60" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-40 bg-white border-[#DDD6CC] shadow-md">
              {DATE_OPTIONS.map((opt) => {
                const isSelected = (!query.date && opt.value === 'all') || query.date === opt.value;
                return (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => onFilterChange({ date: opt.value === 'all' ? undefined : opt.value })}
                    className={cn(
                      'text-xs flex items-center justify-between cursor-pointer py-1.5',
                      isSelected ? 'bg-[#DCEBF4]/50 font-semibold text-[#244A69]' : 'text-[#2E3338]'
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#315F86]" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Filters Button */}
          {isFiltered && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              className="h-9 px-2 text-xs font-medium text-[#B86C84] hover:text-[#B3535D] hover:bg-[#F6DADD]/40"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              <span>Xóa bộ lọc</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter summary status line */}
      {isFiltered && typeof totalResults === 'number' && (
        <div className="flex items-center justify-between text-xs text-[#666A6D] px-0.5">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-[#315F86]" />
            <span>Đang lọc: tìm thấy <strong className="text-[#2E3338]">{totalResults}</strong> kết quả</span>
          </div>
        </div>
      )}
    </div>
  );
}
