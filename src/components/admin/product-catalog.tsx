import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { AdminEmptyState } from './admin-empty-state';
import { formatCurrencyVND } from '@/lib/domain/commercial-config.ts';
import { catalogStartingPrice, CATALOG_STATUS_LABEL, CATALOG_STATUS_BADGE } from '@/lib/admin/product-catalog-ui.ts';
import type { AdminProduct } from '@/lib/repositories/admin-catalog-repository.ts';

export function ProductCatalog({ products, status = 'all' }: { products: AdminProduct[]; status?: AdminProduct['status'] | 'all' }) {
  const tabs = [{ key: 'active', label: 'Đang bán' }, { key: 'draft', label: 'Bản nháp' }, { key: 'archived', label: 'Đã lưu trữ' }, { key: 'all', label: 'Tất cả' }] as const;
  return <div className="flex flex-col gap-5">
    <header><h1 className="text-2xl font-semibold">Sản phẩm</h1><p className="mt-2 text-sm text-muted-foreground">Vòng đời, variants và cấu hình bán hàng. Thông tin kết cấu chỉ đọc.</p></header>
    <nav className="flex flex-wrap gap-2" aria-label="Bộ lọc vòng đời">{tabs.map((tab) => <Link key={tab.key} href={tab.key === 'all' ? '/admin/products' : `/admin/products?status=${tab.key}`} aria-current={status === tab.key ? 'page' : undefined} className="flex min-h-11 items-center rounded-lg border px-3 text-sm hover:bg-muted focus-visible:outline-2 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground">{tab.label}</Link>)}</nav>
    {products.length === 0 ? <AdminEmptyState title="Chưa có sản phẩm" description="Không có sản phẩm trong bộ lọc này. Chọn Tất cả để xem danh mục." /> : <ul className="divide-y rounded-lg border bg-background">{products.map((product) => {
      const price = catalogStartingPrice(product);
      const policy = product.currentConfig?.paymentPolicy;
      return <li key={product.id} className="flex flex-col gap-4 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold"><Link className="flex min-h-11 items-center underline underline-offset-4" href={`/admin/products/${product.id}`}>{product.name}</Link></h2><p className="text-xs text-muted-foreground">{product.productType}</p></div><Badge variant={CATALOG_STATUS_BADGE[product.status]}>{CATALOG_STATUS_LABEL[product.status]}</Badge></div><dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Variants đang bán</dt><dd>{product.variants.filter((variant) => variant.status === 'active').length}</dd></div><div><dt className="text-muted-foreground">Giá từ</dt><dd>{price === null ? 'Chưa có giá đang bán' : formatCurrencyVND(price)}</dd></div><div><dt className="text-muted-foreground">Thanh toán</dt><dd>{policy?.kind === 'fixed_deposit' ? `Cọc ${formatCurrencyVND(policy.depositAmount)}` : policy ? 'Thanh toán toàn bộ' : 'Chưa xuất bản'}</dd></div></dl></li>;
    })}</ul>}
  </div>;
}
