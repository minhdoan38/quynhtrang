'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FixedStickerShape, ProductId } from './product-state.ts';
import type { TemplateCard } from './domain/template.ts';

export interface UseTemplateCatalogOptions {
  productId?: ProductId;
  variantId?: string;
  mode?: 'pattern' | 'full-sheet' | null;
  shape?: FixedStickerShape | null;
  categoryId?: string;
  query?: string;
  limit?: number;
  initialItems?: TemplateCard[];
  fetchFn?: typeof fetch;
}

export interface UseTemplateCatalogResult {
  items: TemplateCard[];
  nextCursor: string | null;
  isLoading: boolean;
  isFetchingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useTemplateCatalog({
  productId,
  variantId,
  mode,
  shape,
  categoryId,
  query,
  limit = 24,
  initialItems = [],
  fetchFn = typeof fetch !== 'undefined' ? fetch : undefined,
}: UseTemplateCatalogOptions = {}): UseTemplateCatalogResult {
  const [items, setItems] = useState<TemplateCard[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const activeAbortRef = useRef<AbortController | null>(null);
  const reloadCountRef = useRef<number>(0);
  const [, setReloadCounter] = useState<number>(0);

  const buildUrl = useCallback(
    (cursor?: string | null): string => {
      const params = new URLSearchParams();
      if (productId) params.set('productId', productId);
      if (variantId && variantId !== 'all') params.set('variantId', variantId);
      if (mode) params.set('mode', mode);
      if (shape) params.set('shape', shape);
      if (categoryId && categoryId !== 'all') params.set('categoryId', categoryId);
      if (query && query.trim()) params.set('query', query.trim());
      if (limit) params.set('limit', String(limit));
      if (cursor) params.set('cursor', cursor);
      return `/api/templates?${params.toString()}`;
    },
    [productId, variantId, mode, shape, categoryId, query, limit],
  );

  useEffect(() => {
    if (!fetchFn) return;

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }

    const controller = new AbortController();
    activeAbortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const url = buildUrl(null);

    fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message || `Lỗi tải danh sách mẫu (${res.status})`);
        }
        return res.json() as Promise<{ items: TemplateCard[]; nextCursor: string | null }>;
      })
      .then((data) => {
        setItems(data.items ?? []);
        setNextCursor(data.nextCursor ?? null);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [buildUrl, fetchFn, reloadCountRef.current]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading || isFetchingMore || !fetchFn) return;

    setIsFetchingMore(true);
    try {
      const url = buildUrl(nextCursor);
      const res = await fetchFn(url, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message || `Lỗi tải trang tiếp theo (${res.status})`);
      }
      const data = (await res.json()) as { items: TemplateCard[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsFetchingMore(false);
    }
  }, [nextCursor, isLoading, isFetchingMore, fetchFn, buildUrl]);

  const reload = useCallback(async () => {
    reloadCountRef.current += 1;
    setReloadCounter((c) => c + 1);
  }, []);

  return {
    items,
    nextCursor,
    isLoading,
    isFetchingMore,
    error,
    hasMore: Boolean(nextCursor),
    loadMore,
    reload,
  };
}

// ponytail: basic client-side catalog state → skipped: offline persistence/optimistic cache, add when catalog offline caching is needed.
