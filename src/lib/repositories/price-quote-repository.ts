import type { PriceQuote } from '../services/price-quote-service.ts';
import type { AdminCatalogRepository } from './admin-catalog-repository.ts';

export interface PriceQuoteRepository {
  saveQuote(quote: PriceQuote): Promise<PriceQuote>;
  getPriceQuote(id: string): Promise<PriceQuote | null> | PriceQuote | null;
  consumeQuote?(quoteId: string, orderId: string): Promise<PriceQuote | null> | PriceQuote | null;
}

let sharedTestRepo: AdminCatalogRepository | null = null;

export function setSharedCatalogRepositoryForTest(repo: AdminCatalogRepository | null): void {
  sharedTestRepo = repo;
}

export function getSharedCatalogRepositoryForTest(): AdminCatalogRepository | null {
  return sharedTestRepo;
}
