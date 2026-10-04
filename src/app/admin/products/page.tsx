import type { Metadata } from 'next';
import { requireCurrentStaff } from '@/lib/admin/authorization.ts';
import { AdminCatalogRepository } from '@/lib/repositories/admin-catalog-repository.ts';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { ProductCatalog } from '@/components/admin/product-catalog.tsx';

export const metadata: Metadata = { title: 'Sản phẩm — Quản trị Quỳnh Trang Studio' };
export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireCurrentStaff();
  const params = await searchParams;
  const status = params.status === 'active' || params.status === 'draft' || params.status === 'archived' ? params.status : 'all';
  try {
    const repo = new AdminCatalogRepository(await createServerSupabaseClient());
    const products = await repo.listProducts({ status });
    return <ProductCatalog products={products} status={status} />;
  } catch {
    return <section><h1 className="text-2xl font-semibold">Sản phẩm</h1><p role="alert" className="mt-4">Chưa thể tải cấu hình sản phẩm.</p><a href="/admin/products" className="inline-flex min-h-11 items-center underline">Thử lại</a></section>;
  }
}
