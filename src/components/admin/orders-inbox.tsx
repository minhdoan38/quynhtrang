'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrderFilters } from './order-filters';
import { OrderRow } from './order-row';
import { AdminEmptyState } from './admin-empty-state';
import { getViewCounts, type InboxQueryParams, type InboxResponse } from '@/lib/admin/inbox-query';
import type { OrderInboxRow, InboxCounts, StaffRole } from '@/lib/domain/order';
import { cn } from '@/lib/utils';

export interface OrdersInboxProps {
  initialData: InboxResponse;
  initialQuery: InboxQueryParams;
  role: StaffRole;
}

export interface OrdersInboxPresentationProps {
  orders: OrderInboxRow[];
  total: number;
  counts: InboxCounts;
  query: InboxQueryParams;
  searchInput: string;
  isFiltered: boolean;
  onViewChange: (view: InboxQueryParams['view']) => void;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onFilterChange: (updates: Partial<InboxQueryParams>) => void;
  onResetFilters: () => void;
  onPageChange: (newPage: number) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

const TABS: Array<{
  key: InboxQueryParams['view'];
  label: string;
  countKey: 'attention' | 'payment' | 'production' | 'all';
}> = [
    { key: 'attention', label: 'Cần xử lý', countKey: 'attention' },
    { key: 'payment', label: 'Chờ tiền', countKey: 'payment' },
    { key: 'production', label: 'Sẵn sàng', countKey: 'production' },
    { key: 'all', label: 'Tất cả', countKey: 'all' },
  ];

export function OrdersInbox({
  orders,
  total,
  counts,
  query,
  searchInput,
  isFiltered,
  onViewChange,
  onSearchChange,
  onSearchClear,
  onFilterChange,
  onResetFilters,
  onPageChange,
  containerRef,
  className,
}: OrdersInboxPresentationProps) {
  const viewCounts = getViewCounts(counts);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const currentPage = query.page;

  return (
    <div className={cn('space-y-4 max-w-6xl mx-auto px-4 sm:px-6 py-6', className)} data-slot="orders-inbox">
      {/* Page Title & Views Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#DDD6CC]/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2E3338]">
            Hộp thư đơn hàng
          </h1>
          <p className="text-xs text-[#666A6D] mt-0.5">
            Theo dõi, xử lý và kiểm soát đơn hàng theo tiến độ in ấn.
          </p>
        </div>

        {/* View Tabs Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none" role="tablist">
          {TABS.map((tab) => {
            const isActive = query.view === tab.key;
            const count = viewCounts[tab.countKey];
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onViewChange(tab.key)}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shrink-0 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#315F86]/30',
                  isActive
                    ? 'border-[#315F86] bg-[#315F86] text-white shadow-xs font-semibold'
                    : 'border-[#DDD6CC] bg-white text-[#2E3338] hover:bg-[#F8F3E8]'
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-xs font-bold',
                    isActive ? 'bg-white/20 text-white' : 'bg-[#F8F3E8] text-[#244A69] border border-[#DDD6CC]/60'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <OrderFilters
        query={query}
        searchInput={searchInput}
        onSearchChange={onSearchChange}
        onSearchClear={onSearchClear}
        onFilterChange={onFilterChange}
        onResetFilters={onResetFilters}
        isFiltered={isFiltered}
        totalResults={total}
      />

      {/* Desktop Column Headings */}
      {orders.length > 0 && (
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#666A6D] bg-[#F8F3E8]/80 border border-[#DDD6CC] rounded-lg">
          <div className="col-span-4">Mã đơn & Ngày tạo</div>
          <div className="col-span-3">Khách hàng</div>
          <div className="col-span-2">Sản phẩm & Tổng tiền</div>
          <div className="col-span-3 text-right pr-6">Trạng thái xử lý</div>
        </div>
      )}

      {/* Orders List Container */}
      <div ref={containerRef} className="space-y-2.5 min-h-[300px]">
        {orders.length > 0 ? (
          orders.map((order) => (
            <OrderRow key={order.id} order={order} currentQuery={query} />
          ))
        ) : isFiltered ? (
          <AdminEmptyState
            title="Không có đơn phù hợp."
            description="Không tìm thấy đơn hàng nào khớp với bộ lọc hoặc từ khóa tìm kiếm."
            actionLabel="Xóa bộ lọc"
            onAction={onResetFilters}
          />
        ) : (
          <AdminEmptyState
            title="Chưa có đơn hàng."
            description="Hiện tại chưa có đơn hàng nào trong danh sách này."
            icon={<Inbox className="w-6 h-6 text-[#315F86]" />}
          />
        )}
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t border-[#DDD6CC]/60 text-xs text-[#666A6D]">
          <div>
            <span>
              Trang <strong className="text-[#2E3338]">{currentPage}</strong> / {totalPages} ({total} đơn)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="h-8 px-2.5 text-xs border-[#DDD6CC] bg-white text-[#2E3338] disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
              <span>Trước</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="h-8 px-2.5 text-xs border-[#DDD6CC] bg-white text-[#2E3338] disabled:opacity-40"
            >
              <span>Sau</span>
              <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
