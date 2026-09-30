'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { OrdersInbox, type OrdersInboxProps } from '@/components/admin/orders-inbox';
import {
  buildInboxUrl,
  getNextViewQuery,
  isFilterActive,
  resetFilterQuery,
  normalizeSearchTerm,
  type InboxQueryParams,
} from '@/lib/admin/inbox-query';

gsap.registerPlugin(useGSAP);

export type { OrdersInboxProps };

export function OrdersInboxClient({
  initialData,
  initialQuery,
  role: _role,
}: OrdersInboxProps) {
  const router = useRouter();
  const pathname = usePathname() || '/admin/orders';
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Local search input state for instant feedback
  const [searchInput, setSearchInput] = React.useState(initialQuery.q ?? '');

  // GSAP animation for row entry/transition with reduced-motion check
  useGSAP(
    () => {
      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }

      const rows = containerRef.current?.querySelectorAll('.order-row-item');
      if (rows && rows.length > 0) {
        gsap.from(rows, {
          opacity: 0,
          y: 8,
          duration: 0.25,
          stagger: 0.03,
          ease: 'power1.out',
        });
      }
    },
    { scope: containerRef, dependencies: [initialData.rows] }
  );

  // Synchronize URL with updated query parameters
  const navigateWithQuery = React.useCallback(
    (updatedParams: Partial<InboxQueryParams>) => {
      const nextQuery: InboxQueryParams = {
        ...initialQuery,
        ...updatedParams,
      };
      const url = buildInboxUrl(pathname, nextQuery);
      router.replace(url, { scroll: false });
    },
    [initialQuery, pathname, router]
  );

  // Debounce search input (300ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const normalized = normalizeSearchTerm(searchInput);
      if (normalized !== (initialQuery.q ?? '')) {
        navigateWithQuery({ q: normalized, page: 1 });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, initialQuery.q, navigateWithQuery]);

  // Keep search input in sync if URL changes via back/forward navigation
  React.useEffect(() => {
    setSearchInput(initialQuery.q ?? '');
  }, [initialQuery.q]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
  };

  const handleSearchClear = () => {
    setSearchInput('');
    if (initialQuery.q) {
      navigateWithQuery({ q: '', page: 1 });
    }
  };

  const handleViewChange = (nextView: InboxQueryParams['view']) => {
    if (nextView === initialQuery.view) return;
    const switched = getNextViewQuery(initialQuery, nextView);
    navigateWithQuery(switched);
  };

  const handleFilterChange = (updates: Partial<InboxQueryParams>) => {
    navigateWithQuery({ ...updates, page: 1 });
  };

  const handleResetFilters = () => {
    setSearchInput('');
    const reset = resetFilterQuery(initialQuery);
    navigateWithQuery(reset);
  };

  const handlePageChange = (newPage: number) => {
    navigateWithQuery({ page: newPage });
  };

  const isFiltered = isFilterActive(initialQuery);

  return (
    <OrdersInbox
      orders={initialData.rows}
      total={initialData.total}
      counts={initialData.counts}
      query={initialQuery}
      searchInput={searchInput}
      isFiltered={isFiltered}
      onViewChange={handleViewChange}
      onSearchChange={handleSearchChange}
      onSearchClear={handleSearchClear}
      onFilterChange={handleFilterChange}
      onResetFilters={handleResetFilters}
      onPageChange={handlePageChange}
      containerRef={containerRef}
    />
  );
}
