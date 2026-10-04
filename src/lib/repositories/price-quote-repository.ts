import type { PriceQuote } from '../services/price-quote-service.ts';
import type { AdminCatalogRepository } from './admin-catalog-repository.ts';

export interface PriceQuoteRepository {
  saveQuote(quote: PriceQuote): Promise<PriceQuote>;
  getPriceQuote(id: string): PriceQuote | null;
}

let sharedTestRepo: AdminCatalogRepository | null = null;

export function setSharedCatalogRepositoryForTest(repo: AdminCatalogRepository | null): void {
  sharedTestRepo = repo;
}

export function getSharedCatalogRepositoryForTest(): AdminCatalogRepository | null {
  return sharedTestRepo;
}
