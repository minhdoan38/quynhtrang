import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation.js';
import { requireCurrentStaff } from '@/lib/admin/authorization.ts';
import { AdminCatalogRepository, type AdminProduct } from '@/lib/repositories/admin-catalog-repository.ts';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { ProductDetail } from '@/components/admin/product-detail.tsx';

export const metadata: Metadata = { title: 'Chi tiết sản phẩm — Quản trị Quỳnh Trang Studio' };
export default async function AdminProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireCurrentStaff();
  const { id } = await params;
  let product: AdminProduct | null;
  let repo: AdminCatalogRepository;
  try {
    repo = new AdminCatalogRepository(await createServerSupabaseClient());
    product = await repo.getProductById(id);
  } catch {
    return <section><h1 className="text-2xl font-semibold">Chi tiết sản phẩm</h1><p role="alert" className="mt-4">Chưa thể tải cấu hình sản phẩm.</p><Link href="/admin/products" className="inline-flex min-h-11 items-center underline">Về danh mục</Link></section>;
  }
  if (!product) notFound();
  return <ProductDetail key={String(product.id)} product={product} draft={repo.getCommercialDraft(id)} availableDefinitions={repo.getAvailableDefinitions(id)} canMutate={staff.role === 'admin'} />;
}
